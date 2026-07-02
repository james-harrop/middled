/**
 * Swing detection — find P1 (address), P4 (top), P7 (impact), P10 (finish)
 * from a pose-landmark time series, entirely from the wrist-midpoint
 * trajectory plus hip/shoulder reference lines.
 *
 * Pure functions, no DOM — unit-testable with recorded/synthetic fixtures.
 */

import { LM, type FrameSample, type Point, type SwingDetectionResult } from './types'

/** Wrist-midpoint speed below this (normalized units/second) counts as still. */
const S_STILL = 0.08
/** A stillness window must last at least this long. */
const STILL_MS = 250
/** Minimum fraction of frames with decent wrist visibility. */
const MIN_TRACKED_FRACTION = 0.6
const MIN_VISIBILITY = 0.5
/** Plausible P1→P7 duration bounds (ms). */
const MIN_SWING_MS = 400
const MAX_SWING_MS = 2500
/** Plausible tempo ratio bounds (backswing/downswing). */
const MIN_TEMPO = 1.2
const MAX_TEMPO = 8

const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  v: Math.min(a.v, b.v),
})

export function wristMid(f: FrameSample): Point {
  return mid(f.lm[LM.leftWrist], f.lm[LM.rightWrist])
}
const shoulderY = (f: FrameSample) => (f.lm[LM.leftShoulder].y + f.lm[LM.rightShoulder].y) / 2
const hipY = (f: FrameSample) => (f.lm[LM.leftHip].y + f.lm[LM.rightHip].y) / 2

/** Centered moving average over the wrist midpoint, window 5. */
export function smoothWrist(frames: FrameSample[]): Point[] {
  const raw = frames.map(wristMid)
  const HALF = 2
  return raw.map((_, i) => {
    let sx = 0, sy = 0, sv = 0, n = 0
    for (let j = Math.max(0, i - HALF); j <= Math.min(raw.length - 1, i + HALF); j++) {
      sx += raw[j].x; sy += raw[j].y; sv += raw[j].v; n++
    }
    return { x: sx / n, y: sy / n, v: sv / n }
  })
}

/** Wrist speed in normalized units per SECOND (fps-independent). */
function speeds(frames: FrameSample[], w: Point[]): number[] {
  return w.map((p, i) => {
    if (i === 0) return 0
    const dt = (frames[i].t - frames[i - 1].t) / 1000
    if (dt <= 0) return 0
    return Math.hypot(p.x - w[i - 1].x, p.y - w[i - 1].y) / dt
  })
}

/**
 * Is frame i inside a stillness run of ≥ STILL_MS ending at or after i?
 * Helper: find the last index ≤ `end` that terminates a still window
 * satisfying `extra` on the window's terminal frame.
 */
function lastStillBefore(
  frames: FrameSample[],
  spd: number[],
  end: number,
  extra: (i: number) => boolean,
): number {
  let runEnd = -1
  for (let i = end; i >= 1; i--) {
    if (spd[i] < S_STILL) {
      if (runEnd === -1) runEnd = i
      const runMs = frames[runEnd].t - frames[i].t
      if (runMs >= STILL_MS && extra(runEnd)) return runEnd
    } else {
      runEnd = -1
    }
  }
  return -1
}

/** First index ≥ `start` beginning a still window satisfying `extra`. */
function firstStillAfter(
  frames: FrameSample[],
  spd: number[],
  start: number,
  extra: (i: number) => boolean,
): number {
  let runStart = -1
  for (let i = start; i < frames.length; i++) {
    if (spd[i] < S_STILL) {
      if (runStart === -1) runStart = i
      const runMs = frames[i].t - frames[runStart].t
      if (runMs >= STILL_MS && extra(runStart)) return runStart
    } else {
      runStart = -1
    }
  }
  return -1
}

export function detectSwing(frames: FrameSample[]): SwingDetectionResult {
  if (frames.length < 20) {
    return { ok: false, reason: 'no_pose', message: 'Too little video with a person in frame.' }
  }

  // Tracking quality: wrists + shoulders + hips must be visible most of the time.
  const KEY_LMS = [LM.leftWrist, LM.rightWrist, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]
  const perFrameVis = frames.map(f => KEY_LMS.reduce((s, k) => s + f.lm[k].v, 0) / KEY_LMS.length)
  const trackedFraction = perFrameVis.filter(v => v > MIN_VISIBILITY).length / frames.length
  if (trackedFraction < MIN_TRACKED_FRACTION) {
    return {
      ok: false,
      reason: 'poor_tracking',
      message: 'Could not track the body reliably — make sure your whole body is in frame, face-on, in decent light.',
    }
  }

  const w = smoothWrist(frames)
  const spd = speeds(frames, w)

  // The downswing is always the fastest motion in the clip — anchor on it.
  let vmax = 0
  for (let i = 1; i < frames.length; i++) if (spd[i] > spd[vmax]) vmax = i

  // P4: highest wrist point above the shoulder line in the second before the
  // speed peak. (A held finish can be higher than the top; anchoring on the
  // peak keeps us on the backswing side of the swing.)
  let p4 = -1
  for (let i = 0; i <= vmax; i++) {
    if (frames[vmax].t - frames[i].t > 1000) continue
    if (w[i].y < shoulderY(frames[i]) - 0.05 && (p4 === -1 || w[i].y < w[p4].y)) p4 = i
  }
  if (p4 === -1) {
    return {
      ok: false,
      reason: 'no_swing_found',
      message: 'No swing found — the hands never got above shoulder height. Film a full swing, face-on.',
    }
  }

  // P1: last stillness window before the top with hands low (below mid-torso).
  const handsLow = (i: number) => w[i].y > (hipY(frames[i]) + shoulderY(frames[i])) / 2
  const p1 = lastStillBefore(frames, spd, p4 - 1, handsLow)
  if (p1 === -1) {
    return {
      ok: false,
      reason: 'no_swing_found',
      message: 'Could not find a still address position before the swing. Pause for a beat at address before you swing.',
    }
  }
  const addressY = w[p1].y

  // P7: first frame after the top where the wrists cross back down to address
  // height. The 0.05 tolerance absorbs smoothing erosion of the sharp
  // impact-point crossing at 30fps.
  let p7 = -1
  for (let i = p4 + 1; i < frames.length; i++) {
    if (w[i].y >= addressY - 0.05) { p7 = i; break }
  }
  if (p7 === -1) {
    // Fallback: fastest frame within 600ms after the top.
    let best = -1
    for (let i = p4 + 1; i < frames.length && frames[i].t - frames[p4].t <= 600; i++) {
      if (best === -1 || spd[i] > spd[best]) best = i
    }
    p7 = best
  }
  if (p7 === -1) {
    return {
      ok: false,
      reason: 'no_swing_found',
      message: 'Found a backswing but no downswing — make sure the full swing is in the clip.',
    }
  }

  // P10: first stillness after impact with hands high; fallback last frame.
  let p10 = firstStillAfter(frames, spd, p7 + 1, i => w[i].y < shoulderY(frames[i]))
  if (p10 === -1) p10 = frames.length - 1

  // Sanity: timing.
  const backswingMs = frames[p4].t - frames[p1].t
  const downswingMs = frames[p7].t - frames[p4].t
  const swingMs = frames[p7].t - frames[p1].t
  if (swingMs < MIN_SWING_MS || swingMs > MAX_SWING_MS || downswingMs <= 0) {
    return {
      ok: false,
      reason: 'implausible_timing',
      message: 'That did not look like a single golf swing — try a clip with one full swing in it.',
    }
  }
  const tempoRatio = backswingMs / downswingMs
  if (tempoRatio < MIN_TEMPO || tempoRatio > MAX_TEMPO) {
    return {
      ok: false,
      reason: 'implausible_timing',
      message: 'Swing timing looked wrong (very slow-mo or cut footage?). Use a normal-speed clip of one swing.',
    }
  }

  // Handedness: at the top, hands sit over the trail shoulder. Face-on,
  // a right-hander's trail side is image-left of the nose.
  const handedness = w[p4].x < frames[p4].lm[LM.nose].x ? 'right' : 'left'

  const swingVis = perFrameVis.slice(p1, p10 + 1)
  const trackingQuality = swingVis.reduce((a, b) => a + b, 0) / swingVis.length

  return { ok: true, positions: { p1, p4, p7, p10 }, handedness, tempoRatio, trackingQuality }
}

/**
 * Metrics computation — turn landmarks at the four key positions into the
 * compact, measured JSON that gets sent to the coach model as ground truth.
 *
 * All signed lateral values are expressed "toward target" via a direction
 * multiplier: right-handed face-on golfer → target is image-right (+x).
 * Pure functions, unit-testable.
 */

import {
  LM,
  type FrameSample,
  type Handedness,
  type KeyPositions,
  type Point,
  type PositionMetrics,
  type SwingMetrics,
} from './types'

const deg = (rad: number) => (rad * 180) / Math.PI

const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  v: Math.min(a.v, b.v),
})

/** Interior angle at vertex b of the triangle a-b-c, in degrees. */
export function angleAt(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)
  if (m === 0) return 0
  return deg(Math.acos(Math.min(1, Math.max(-1, dot / m))))
}

function positionMetrics(
  f: FrameSample,
  p1: FrameSample,
  dir: 1 | -1,
  shoulderWidth: number,
  handedness: Handedness,
): PositionMetrics {
  const lm = f.lm
  const midShoulder = mid(lm[LM.leftShoulder], lm[LM.rightShoulder])
  const midHip = mid(lm[LM.leftHip], lm[LM.rightHip])
  const midAnkle = mid(lm[LM.leftAnkle], lm[LM.rightAnkle])
  const midHipP1 = mid(p1.lm[LM.leftHip], p1.lm[LM.rightHip])

  // Spine lean from vertical; y is down, so "up" = -dy.
  const spineTiltDeg = deg(Math.atan2((midShoulder.x - midHip.x) * dir, midHip.y - midShoulder.y))

  // Lead side: left limbs for a right-hander, right limbs for a left-hander.
  const [ls, le, lw, lh, lk, la] =
    handedness === 'right'
      ? [LM.leftShoulder, LM.leftElbow, LM.leftWrist, LM.leftHip, LM.leftKnee, LM.leftAnkle]
      : [LM.rightShoulder, LM.rightElbow, LM.rightWrist, LM.rightHip, LM.rightKnee, LM.rightAnkle]
  const trailShoulder = handedness === 'right' ? LM.rightShoulder : LM.leftShoulder

  const shoulderLineDeg = deg(
    Math.atan2(
      lm[trailShoulder].y - lm[ls].y, // + when lead shoulder is higher (y down)
      Math.abs(lm[ls].x - lm[trailShoulder].x) || 1e-6,
    ),
  )

  const used = [lm[LM.nose], midShoulder, midHip, lm[ls], lm[le], lm[lw], lm[lk], lm[la]]

  return {
    spineTiltDeg: round1(spineTiltDeg),
    headDx: round2(((lm[LM.nose].x - p1.lm[LM.nose].x) * dir) / shoulderWidth),
    headDy: round2((lm[LM.nose].y - p1.lm[LM.nose].y) / shoulderWidth),
    hipSwayDx: round2(((midHip.x - midHipP1.x) * dir) / shoulderWidth),
    weightShift: round2(((midHip.x - midAnkle.x) * dir) / shoulderWidth),
    leadArmDeg: round1(angleAt(lm[ls], lm[le], lm[lw])),
    shoulderLineDeg: round1(shoulderLineDeg),
    kneeFlexDeg: round1(angleAt(lm[lh], lm[lk], lm[la])),
    confidence: round2(used.reduce((s, p) => s + p.v, 0) / used.length),
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function computeMetrics(
  frames: FrameSample[],
  positions: KeyPositions,
  handedness: Handedness,
  tempoRatio: number,
  trackingQuality: number,
): SwingMetrics {
  const p1f = frames[positions.p1]
  // Right-hander face-on: target = image-right (+x). Left-hander: image-left.
  const dir: 1 | -1 = handedness === 'right' ? 1 : -1
  const shoulderWidth =
    Math.abs(p1f.lm[LM.leftShoulder].x - p1f.lm[LM.rightShoulder].x) || 0.15

  const at = (i: number) => ({
    ...positionMetrics(frames[i], p1f, dir, shoulderWidth, handedness),
    tMs: Math.round(frames[i].t),
  })

  const durationMs = frames[frames.length - 1].t - frames[0].t
  const fps = durationMs > 0 ? Math.round(((frames.length - 1) / durationMs) * 1000) : 0

  return {
    handedness,
    tempoRatio: round2(tempoRatio),
    fps,
    trackingQuality: round2(trackingQuality),
    positions: {
      p1: at(positions.p1),
      p4: at(positions.p4),
      p7: at(positions.p7),
      p10: at(positions.p10),
    },
  }
}

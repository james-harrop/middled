import { describe, expect, it } from 'vitest'
import { detectSwing } from './swing-detect'
import { computeMetrics, angleAt } from './metrics'
import { LM, type FrameSample, type Point } from './types'

/**
 * Synthetic face-on swing generator, 30fps.
 * Geometry: subject faces camera, so the golfer's LEFT side is image-RIGHT.
 * Right-handed swing: top of backswing over the trail (right) shoulder =
 * image-LEFT of the nose; finish over the lead shoulder = image-RIGHT.
 */

const FPS = 30
const pt = (x: number, y: number, v = 0.95): Point => ({ x, y, v })

function baseBody(): Point[] {
  const lm: Point[] = Array.from({ length: 33 }, () => pt(0.5, 0.5))
  lm[LM.nose] = pt(0.5, 0.25)
  lm[LM.leftShoulder] = pt(0.58, 0.35) // golfer's left = image-right
  lm[LM.rightShoulder] = pt(0.42, 0.35)
  lm[LM.leftElbow] = pt(0.56, 0.47)
  lm[LM.rightElbow] = pt(0.44, 0.47)
  lm[LM.leftHip] = pt(0.55, 0.55)
  lm[LM.rightHip] = pt(0.45, 0.55)
  lm[LM.leftKnee] = pt(0.55, 0.72)
  lm[LM.rightKnee] = pt(0.45, 0.72)
  lm[LM.leftAnkle] = pt(0.55, 0.9)
  lm[LM.rightAnkle] = pt(0.45, 0.9)
  return lm
}

/** Set both wrists at a shared point (hands together on the grip). */
function withWrists(lm: Point[], x: number, y: number): Point[] {
  const out = lm.map(p => ({ ...p }))
  out[LM.leftWrist] = pt(x, y)
  out[LM.rightWrist] = pt(x, y)
  return out
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f

interface Phase {
  seconds: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

function synthSwing(phases: Phase[], visibility = 0.95): FrameSample[] {
  const frames: FrameSample[] = []
  let t = 0
  for (const ph of phases) {
    const n = Math.round(ph.seconds * FPS)
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 1 : i / (n - 1)
      const lm = withWrists(baseBody(), lerp(ph.from.x, ph.to.x, f), lerp(ph.from.y, ph.to.y, f))
      for (const p of lm) p.v = visibility
      frames.push({ t, lm })
      t += 1000 / FPS
    }
  }
  return frames
}

const ADDRESS = { x: 0.5, y: 0.68 }
const TOP_RH = { x: 0.38, y: 0.18 } // image-left of nose → right-handed
const IMPACT = { x: 0.5, y: 0.69 }
const FINISH_RH = { x: 0.62, y: 0.2 }

function standardSwing(): FrameSample[] {
  return synthSwing([
    { seconds: 1.0, from: ADDRESS, to: ADDRESS }, // still address
    { seconds: 0.8, from: ADDRESS, to: TOP_RH }, // backswing
    { seconds: 0.27, from: TOP_RH, to: IMPACT }, // downswing (~3:1 tempo)
    { seconds: 0.4, from: IMPACT, to: FINISH_RH }, // follow-through
    { seconds: 0.8, from: FINISH_RH, to: FINISH_RH }, // held finish
  ])
}

describe('detectSwing', () => {
  it('detects a standard right-handed swing with ordered positions', () => {
    const frames = standardSwing()
    const r = detectSwing(frames)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { p1, p4, p7, p10 } = r.positions
    expect(p1).toBeLessThan(p4)
    expect(p4).toBeLessThan(p7)
    expect(p7).toBeLessThanOrEqual(p10)
    expect(r.handedness).toBe('right')
    // P4 should be near the end of the backswing phase (~1.8s in)
    expect(frames[p4].t).toBeGreaterThan(1500)
    expect(frames[p4].t).toBeLessThan(2100)
    // Tempo close to the synthetic 0.8/0.27 ≈ 3
    expect(r.tempoRatio).toBeGreaterThan(2)
    expect(r.tempoRatio).toBeLessThan(4.5)
  })

  it('detects a left-handed swing (mirrored)', () => {
    const frames = standardSwing().map(f => ({
      t: f.t,
      lm: f.lm.map(p => ({ ...p, x: 1 - p.x })),
    }))
    const r = detectSwing(frames)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.handedness).toBe('left')
  })

  it('fails cleanly when the hands never rise (no swing in clip)', () => {
    const frames = synthSwing([{ seconds: 4, from: ADDRESS, to: ADDRESS }])
    const r = detectSwing(frames)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('no_swing_found')
  })

  it('fails cleanly on poor tracking', () => {
    const frames = synthSwing(
      [
        { seconds: 1, from: ADDRESS, to: ADDRESS },
        { seconds: 0.8, from: ADDRESS, to: TOP_RH },
        { seconds: 0.27, from: TOP_RH, to: IMPACT },
        { seconds: 1, from: IMPACT, to: IMPACT },
      ],
      0.2, // visibility below threshold
    )
    const r = detectSwing(frames)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('poor_tracking')
  })

  it('rejects implausible timing (slow-mo footage)', () => {
    // 5x slow motion: backswing takes 4s
    const frames = synthSwing([
      { seconds: 1, from: ADDRESS, to: ADDRESS },
      { seconds: 4.0, from: ADDRESS, to: TOP_RH },
      { seconds: 1.35, from: TOP_RH, to: IMPACT },
      { seconds: 1, from: IMPACT, to: IMPACT },
    ])
    const r = detectSwing(frames)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('implausible_timing')
  })
})

describe('computeMetrics', () => {
  it('produces sane values for the standard swing', () => {
    const frames = standardSwing()
    const r = detectSwing(frames)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const m = computeMetrics(frames, r.positions, r.handedness, r.tempoRatio, r.trackingQuality)
    expect(m.handedness).toBe('right')
    expect(m.fps).toBeGreaterThan(25)
    // Body is static in the fixture: no head or hip drift at address.
    expect(Math.abs(m.positions.p1.headDx)).toBeLessThan(0.05)
    expect(Math.abs(m.positions.p1.spineTiltDeg)).toBeLessThan(2)
    expect(Math.abs(m.positions.p4.hipSwayDx)).toBeLessThan(0.05)
    // Knee flex is a plausible angle
    expect(m.positions.p1.kneeFlexDeg).toBeGreaterThan(150)
    expect(m.positions.p1.kneeFlexDeg).toBeLessThanOrEqual(180)
    expect(m.positions.p1.confidence).toBeGreaterThan(0.9)
  })

  it('angleAt returns 180 for a straight line and 90 for a right angle', () => {
    const a = { x: 0, y: 0, v: 1 }
    const b = { x: 1, y: 0, v: 1 }
    const c = { x: 2, y: 0, v: 1 }
    expect(angleAt(a, b, c)).toBeCloseTo(180, 1)
    const d = { x: 1, y: 1, v: 1 }
    expect(angleAt(a, b, d)).toBeCloseTo(90, 1)
  })
})

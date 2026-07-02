/**
 * Shared types for the on-device pose pipeline.
 *
 * Coordinate convention: MediaPipe normalized image coords — x right, y DOWN,
 * both 0..1 relative to the video frame. Signed lateral metrics are converted
 * to "toward target" using a direction multiplier from detected handedness
 * (right-handed face-on: target = image-right). Lengths are normalized by
 * shoulder width at address so metrics are camera-distance invariant.
 */

/** MediaPipe pose landmark indices we use. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

export interface Point {
  x: number
  y: number
  /** landmark visibility score 0..1 */
  v: number
}

/** One video frame's worth of pose data. */
export interface FrameSample {
  /** video timestamp in ms */
  t: number
  /** 33 landmarks, normalized coords */
  lm: Point[]
}

/** Frame indices of the four key swing positions (P-system). */
export interface KeyPositions {
  /** address — still, hands low */
  p1: number
  /** top of backswing — wrists at their highest */
  p4: number
  /** impact — wrists back at address height at speed */
  p7: number
  /** finish — still again, hands high */
  p10: number
}

export type Handedness = 'right' | 'left'

export interface SwingDetection {
  ok: true
  positions: KeyPositions
  handedness: Handedness
  /** backswing duration / downswing duration (~3.0 for tour players) */
  tempoRatio: number
  /** mean landmark visibility across the swing 0..1 */
  trackingQuality: number
}

export interface SwingDetectionFailure {
  ok: false
  reason: 'no_pose' | 'no_swing_found' | 'implausible_timing' | 'poor_tracking'
  message: string
}

export type SwingDetectionResult = SwingDetection | SwingDetectionFailure

/** Angles/distances measured at one key position. */
export interface PositionMetrics {
  /** degrees the mid-hip→mid-shoulder line leans from vertical (+ = toward target) */
  spineTiltDeg: number
  /** nose movement since P1 in shoulder-widths (+x = toward target, +y = down) */
  headDx: number
  headDy: number
  /** mid-hip lateral movement since P1, shoulder-widths (+ = toward target) */
  hipSwayDx: number
  /** mid-hip vs ankle midpoint, shoulder-widths (+ = toward target) */
  weightShift: number
  /** lead-arm shoulder–elbow–wrist angle, degrees (180 = dead straight) */
  leadArmDeg: number
  /** shoulder line tilt from horizontal, degrees (+ = lead shoulder higher) */
  shoulderLineDeg: number
  /** lead-knee hip–knee–ankle angle, degrees (180 = straight) */
  kneeFlexDeg: number
  /** mean visibility of the landmarks used, 0..1 */
  confidence: number
}

export interface SwingMetrics {
  handedness: Handedness
  tempoRatio: number
  fps: number
  positions: Record<'p1' | 'p4' | 'p7' | 'p10', PositionMetrics & { tMs: number }>
  trackingQuality: number
}

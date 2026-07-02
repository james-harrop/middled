/**
 * Pose extractor — runs MediaPipe PoseLandmarker over a recorded video file
 * entirely in the browser. The video never leaves the device; the output is
 * a landmark time series handed to swing-detect/metrics.
 *
 * Primary path: play the (muted) video at 1× and sample every frame via
 * requestVideoFrameCallback. Fallback for browsers without rVFC: a seek loop
 * at 15fps.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { FrameSample } from './types'

export const MAX_VIDEO_SECONDS = 45

let landmarkerPromise: Promise<PoseLandmarker> | null = null

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: '/models/pose_landmarker_full.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

/** Idempotent, lazy init. Call early (e.g. on page mount) to hide the ~2-4s cold start. */
export function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker('GPU').catch(err => {
      console.warn('GPU delegate failed, falling back to CPU:', err)
      return createLandmarker('CPU')
    })
  }
  return landmarkerPromise
}

export interface ExtractResult {
  frames: FrameSample[]
  videoWidth: number
  videoHeight: number
  durationMs: number
}

function toSample(tMs: number, result: ReturnType<PoseLandmarker['detectForVideo']>): FrameSample | null {
  const lms = result.landmarks?.[0]
  if (!lms || lms.length < 33) return null
  return {
    t: tMs,
    lm: lms.map(l => ({
      x: l.x,
      y: l.y,
      v: l.visibility ?? 1,
    })),
  }
}

/**
 * Run pose detection across the whole video element.
 * The element must have metadata loaded; we control playback ourselves.
 */
export async function extractPoses(
  video: HTMLVideoElement,
  onProgress?: (fraction: number) => void,
): Promise<ExtractResult> {
  if (video.duration > MAX_VIDEO_SECONDS) {
    throw new Error(`Video too long — keep it under ${MAX_VIDEO_SECONDS} seconds (one swing is plenty).`)
  }
  const landmarker = await getLandmarker()
  const durationMs = video.duration * 1000
  const frames: FrameSample[] = []
  let lastT = -1

  const supportsRvfc =
    typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'

  if (supportsRvfc) {
    await new Promise<void>((resolve, reject) => {
      video.muted = true
      video.playsInline = true
      video.currentTime = 0

      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        const tMs = meta.mediaTime * 1000
        // detectForVideo requires monotonically increasing timestamps.
        if (tMs > lastT) {
          lastT = tMs
          try {
            const sample = toSample(tMs, landmarker.detectForVideo(video, tMs))
            if (sample) frames.push(sample)
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
            return
          }
          onProgress?.(Math.min(1, meta.mediaTime / video.duration))
        }
        if (!video.ended) video.requestVideoFrameCallback(onFrame)
      }

      video.addEventListener('ended', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Video decode failed — try H.264/“Most Compatible” format.')), { once: true })
      video.requestVideoFrameCallback(onFrame)
      video.play().catch(reject)
    })
    video.pause()
  } else {
    // Seek loop at 15fps.
    const STEP = 1 / 15
    for (let t = 0; t < video.duration; t += STEP) {
      await seekTo(video, t)
      const tMs = t * 1000
      if (tMs > lastT) {
        lastT = tMs
        const sample = toSample(tMs, landmarker.detectForVideo(video, tMs))
        if (sample) frames.push(sample)
      }
      onProgress?.(Math.min(1, t / video.duration))
    }
  }

  onProgress?.(1)
  return { frames, videoWidth: video.videoWidth, videoHeight: video.videoHeight, durationMs }
}

export function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Video seek failed')) }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = seconds
  })
}

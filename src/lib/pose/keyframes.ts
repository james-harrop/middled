/**
 * Keyframe capture — grab JPEG stills of the four key positions from the
 * video element. 768px long edge / q0.75 keeps each frame ~50-80KB, which is
 * cheap for vision tokens and small enough to store inline in the report.
 */

import { seekTo } from './extractor'

const LONG_EDGE = 768
const QUALITY = 0.75

export interface Keyframe {
  position: 'p1' | 'p4' | 'p7' | 'p10'
  tMs: number
  /** data:image/jpeg;base64,... */
  dataUrl: string
}

export async function captureKeyframes(
  video: HTMLVideoElement,
  timestamps: Record<'p1' | 'p4' | 'p7' | 'p10', number>,
): Promise<Keyframe[]> {
  const scale = LONG_EDGE / Math.max(video.videoWidth, video.videoHeight)
  const w = Math.round(video.videoWidth * Math.min(1, scale))
  const h = Math.round(video.videoHeight * Math.min(1, scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const out: Keyframe[] = []
  for (const position of ['p1', 'p4', 'p7', 'p10'] as const) {
    const tMs = timestamps[position]
    await seekTo(video, tMs / 1000)
    ctx.drawImage(video, 0, 0, w, h)
    out.push({ position, tMs, dataUrl: canvas.toDataURL('image/jpeg', QUALITY) })
  }
  return out
}

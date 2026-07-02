'use client'

/**
 * The whole analysis flow, client-side:
 * pick video → on-device pose extraction → swing detection → frame-confirm
 * scrubber (the safety net when detection is off) → email gate → streamed
 * coaching report → redirect to the shareable /r/[slug] page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { extractPoses, getLandmarker, MAX_VIDEO_SECONDS } from '@/lib/pose/extractor'
import { detectSwing } from '@/lib/pose/swing-detect'
import { computeMetrics } from '@/lib/pose/metrics'
import { captureKeyframes } from '@/lib/pose/keyframes'
import { consumeSSE } from '@/lib/sse'
import { LM, type FrameSample, type Handedness } from '@/lib/pose/types'
import type { CoachReport } from '@/lib/report-schema'

type Stage = 'idle' | 'extracting' | 'confirm' | 'analyzing' | 'report' | 'error'

const POSITIONS = [
  { key: 'p1', label: 'Address' },
  { key: 'p4', label: 'Top' },
  { key: 'p7', label: 'Impact' },
  { key: 'p10', label: 'Finish' },
] as const
type PosKey = (typeof POSITIONS)[number]['key']

interface PackInfo {
  id: string
  name: string
  price: string
  credits: number
}
const PACKS: PackInfo[] = [
  { id: 'single', name: 'One swing', price: '£5', credits: 1 },
  { id: 'range', name: 'Range session', price: '£12', credits: 3 },
  { id: 'season', name: 'Season ticket', price: '£30', credits: 10 },
]

export default function SwingAnalyzer() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const framesRef = useRef<FrameSample[]>([])

  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [detectNote, setDetectNote] = useState('')
  const [timestamps, setTimestamps] = useState<Record<PosKey, number>>({ p1: 0, p4: 0, p7: 0, p10: 0 })
  const [thumbs, setThumbs] = useState<Record<PosKey, string>>({ p1: '', p4: '', p7: '', p10: '' })
  const [adjusting, setAdjusting] = useState<PosKey | null>(null)
  const [email, setEmail] = useState('')
  const [duration, setDuration] = useState(0)
  const [needCredits, setNeedCredits] = useState(false)
  const [topupNote, setTopupNote] = useState('')
  const [inlineReport, setInlineReport] = useState<CoachReport | null>(null)

  useEffect(() => {
    // Warm the ~9MB pose model while the user reads the filming tips.
    getLandmarker().catch(() => {})
    setEmail(localStorage.getItem('middled_email') ?? '')
    const params = new URLSearchParams(window.location.search)
    if (params.get('topup') === 'done') {
      setTopupNote('Credits added — upload your swing and go again.')
    }
  }, [])

  const fail = (msg: string) => {
    setErrorMsg(msg)
    setStage('error')
  }

  const refreshThumbs = useCallback(async (ts: Record<PosKey, number>) => {
    const video = videoRef.current
    if (!video) return
    const frames = await captureKeyframes(video, ts)
    setThumbs(Object.fromEntries(frames.map(f => [f.position, f.dataUrl])) as Record<PosKey, string>)
  }, [])

  async function onFile(file: File) {
    const video = videoRef.current
    if (!video) return
    setStage('extracting')
    setProgress(0)
    try {
      video.src = URL.createObjectURL(file)
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error('Could not read that video. If you are on iPhone, set Camera → Formats → Most Compatible, or use Safari.')), { once: true })
        setTimeout(() => reject(new Error('Video took too long to load — try a shorter clip.')), 15000)
      })
      if (video.duration > MAX_VIDEO_SECONDS) {
        throw new Error(`Keep the clip under ${MAX_VIDEO_SECONDS} seconds — one swing is plenty.`)
      }
      setDuration(video.duration)

      const { frames } = await extractPoses(video, f => setProgress(f))
      framesRef.current = frames
      if (frames.length < 20) {
        throw new Error('We could not see a person in that clip. Film face-on with your whole body in frame.')
      }

      const result = detectSwing(frames)
      let ts: Record<PosKey, number>
      if (result.ok) {
        ts = {
          p1: frames[result.positions.p1].t,
          p4: frames[result.positions.p4].t,
          p7: frames[result.positions.p7].t,
          p10: frames[result.positions.p10].t,
        }
        setDetectNote('We found your swing — check the four frames look right, then continue.')
      } else if (result.reason === 'poor_tracking' || result.reason === 'no_pose') {
        throw new Error(result.message)
      } else {
        // Detection missed but tracking is fine — degrade to manual placement.
        const d = video.duration * 1000
        ts = { p1: d * 0.1, p4: d * 0.45, p7: d * 0.55, p10: d * 0.8 }
        setDetectNote('We could not pin down the swing automatically — drag each frame to the right moment.')
      }
      setTimestamps(ts)
      await refreshThumbs(ts)
      setStage('confirm')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Something went wrong reading the video.')
    }
  }

  async function onAdjust(pos: PosKey, tMs: number) {
    setTimestamps(prev => {
      const next = { ...prev, [pos]: tMs }
      return next
    })
  }

  async function onAdjustDone(pos: PosKey) {
    await refreshThumbs({ ...timestamps })
    setAdjusting(prev => (prev === pos ? null : prev))
  }

  function nearestFrame(tMs: number): number {
    const frames = framesRef.current
    let best = 0
    for (let i = 1; i < frames.length; i++) {
      if (Math.abs(frames[i].t - tMs) < Math.abs(frames[best].t - tMs)) best = i
    }
    return best
  }

  async function analyze() {
    const video = videoRef.current
    if (!video) return
    const cleanEmail = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setStatusMsg('Enter a valid email — your report link lands there too.')
      return
    }
    localStorage.setItem('middled_email', cleanEmail)
    setStage('analyzing')
    setNeedCredits(false)
    setStatusMsg('Measuring your positions…')

    try {
      const frames = framesRef.current
      const positions = {
        p1: nearestFrame(timestamps.p1),
        p4: nearestFrame(timestamps.p4),
        p7: nearestFrame(timestamps.p7),
        p10: nearestFrame(timestamps.p10),
      }
      if (!(positions.p1 < positions.p4 && positions.p4 < positions.p7 && positions.p7 <= positions.p10)) {
        setStage('confirm')
        setDetectNote('Frames must be in order: address → top → impact → finish. Adjust and try again.')
        return
      }

      // Handedness from the top-of-backswing frame: hands over the trail
      // shoulder, which face-on sits image-left of the nose for a right-hander.
      const p4f = frames[positions.p4]
      const wristX = (p4f.lm[LM.leftWrist].x + p4f.lm[LM.rightWrist].x) / 2
      const handedness: Handedness = wristX < p4f.lm[LM.nose].x ? 'right' : 'left'

      const backswingMs = frames[positions.p4].t - frames[positions.p1].t
      const downswingMs = Math.max(1, frames[positions.p7].t - frames[positions.p4].t)
      const tempoRatio = backswingMs / downswingMs

      const KEY_LMS = [LM.leftWrist, LM.rightWrist, LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]
      const swingFrames = frames.slice(positions.p1, positions.p10 + 1)
      const trackingQuality =
        swingFrames.reduce((s, f) => s + KEY_LMS.reduce((a, k) => a + f.lm[k].v, 0) / KEY_LMS.length, 0) /
        Math.max(1, swingFrames.length)

      const metrics = computeMetrics(frames, positions, handedness, tempoRatio, trackingQuality)
      const keyframes = await captureKeyframes(video, timestamps)
      const keyframeMap = Object.fromEntries(keyframes.map(f => [f.position, f.dataUrl]))

      setStatusMsg('Sending your numbers to the coach…')
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, metrics, keyframes: keyframeMap }),
      })

      if (res.status === 402) {
        setStage('confirm')
        setNeedCredits(true)
        return
      }
      if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Analysis failed — try again.')
      }

      await consumeSSE(res, {
        status: d => setStatusMsg(String(d.message ?? 'Working…')),
        report: d => {
          if (d.slug) router.push(`/r/${d.slug}`)
          else {
            // No persistence configured — render the report right here.
            setInlineReport(d.report as CoachReport)
            setStage('report')
          }
        },
        error: d => fail(String(d.message ?? 'Analysis failed.')),
      })
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Analysis failed.')
    }
  }

  async function buy(packId: string) {
    const res = await fetch('/api/stripe-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId, email: email.trim().toLowerCase() }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) window.location.href = data.url as string
    else setStatusMsg((data as { error?: string }).error ?? 'Payments are not available yet.')
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* The working video element — hidden except during confirm-adjust */}
      <video ref={videoRef} muted playsInline preload="metadata" className={adjusting ? 'w-full rounded-xl mb-4' : 'hidden'} />

      {stage === 'idle' && (
        <div>
          <h1 className="display text-4xl mb-4">Film it face-on.</h1>
          <ul className="dim space-y-2 mb-8 text-sm leading-relaxed">
            <li>· Camera at chest height, pointing at you, phone upright</li>
            <li>· Whole body in frame, decent light</li>
            <li>· Pause for a beat at address, then swing — one swing, normal speed</li>
          </ul>
          {topupNote && <p className="text-[var(--brass)] font-bold mb-4">{topupNote}</p>}
          <label className="btn-brass text-lg cursor-pointer">
            Choose your swing video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="dim text-sm mt-4">Analysed on your phone. The video is never uploaded.</p>
        </div>
      )}

      {stage === 'extracting' && (
        <div>
          <h1 className="display text-3xl mb-6 pulse">Reading your swing…</h1>
          <div className="progress-track mb-3">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="dim text-sm">Tracking 33 body points, frame by frame — all on this device.</p>
        </div>
      )}

      {stage === 'confirm' && (
        <div>
          <h1 className="display text-3xl mb-3">Check the four frames.</h1>
          <p className="dim text-sm mb-6">{detectNote}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {POSITIONS.map(p => (
              <div key={p.key} className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold text-sm">{p.label}</span>
                  <button
                    className="text-xs text-[var(--brass)] font-bold cursor-pointer"
                    onClick={async () => {
                      if (adjusting === p.key) await onAdjustDone(p.key)
                      else {
                        setAdjusting(p.key)
                        const v = videoRef.current
                        if (v) v.currentTime = timestamps[p.key] / 1000
                      }
                    }}
                  >
                    {adjusting === p.key ? 'Done' : 'Adjust'}
                  </button>
                </div>
                {thumbs[p.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[p.key]} alt={p.label} className="rounded-lg w-full" />
                ) : (
                  <div className="aspect-video bg-[var(--pine-3)] rounded-lg" />
                )}
                {adjusting === p.key && (
                  <input
                    type="range"
                    className="scrub mt-2"
                    min={0}
                    max={Math.round(duration * 1000)}
                    step={16}
                    value={timestamps[p.key]}
                    onChange={e => {
                      const t = Number(e.target.value)
                      onAdjust(p.key, t)
                      const v = videoRef.current
                      if (v) v.currentTime = t / 1000
                    }}
                    onMouseUp={() => refreshThumbs({ ...timestamps })}
                    onTouchEnd={() => refreshThumbs({ ...timestamps })}
                  />
                )}
              </div>
            ))}
          </div>

          {needCredits ? (
            <div className="card p-6 mb-6">
              <h2 className="font-extrabold text-lg mb-1">You’ve used your free swing.</h2>
              <p className="dim text-sm mb-4">Grab a pack to keep going — credits stay with your email.</p>
              <div className="grid grid-cols-3 gap-3">
                {PACKS.map(p => (
                  <button key={p.id} className="btn-ghost text-sm !px-2" onClick={() => buy(p.id)}>
                    <span className="block font-extrabold">{p.price}</span>
                    <span className="block dim text-xs">{p.name}</span>
                  </button>
                ))}
              </div>
              {statusMsg && <p className="text-[var(--error)] text-sm mt-3">{statusMsg}</p>}
            </div>
          ) : (
            <div className="mb-6">
              <label className="block font-bold text-sm mb-2">Where should your report link go?</label>
              <input
                type="email"
                className="field"
                placeholder="you@club.golf"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              {statusMsg && <p className="text-[var(--error)] text-sm mt-2">{statusMsg}</p>}
            </div>
          )}

          {!needCredits && (
            <button className="btn-brass text-lg w-full" onClick={analyze}>
              Get my fix
            </button>
          )}
        </div>
      )}

      {stage === 'analyzing' && (
        <div className="text-center py-20">
          <h1 className="display text-3xl mb-6 pulse">{statusMsg || 'Analysing…'}</h1>
          <p className="dim text-sm">This takes up to a minute. The coach reads your measured numbers, not just the pictures.</p>
        </div>
      )}

      {stage === 'report' && inlineReport && (
        <div>
          <p className="wordmark text-xs text-[var(--brass)] mb-4">Your swing report</p>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {POSITIONS.map(p =>
              thumbs[p.key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.key} src={thumbs[p.key]} alt={p.label} className="rounded-lg w-full" />
              ) : null,
            )}
          </div>
          <p className="text-[var(--brass)] font-bold mb-4">{inlineReport.whats_good}</p>
          <div className="brass-rule mb-3" />
          <h1 className="display text-3xl mb-4">{inlineReport.one_fix}</h1>
          <p className="dim leading-relaxed mb-6">{inlineReport.why}</p>
          <div className="card p-6 mb-4">
            <p className="wordmark text-xs text-[var(--brass)] mb-2">Your drill</p>
            <h2 className="font-extrabold text-lg mb-2">{inlineReport.drill.name}</h2>
            <p className="dim text-sm mb-2">{inlineReport.drill.how_to}</p>
            <p className="font-bold text-sm">{inlineReport.drill.reps}</p>
          </div>
          <div className="card p-6 mb-6">
            <p className="wordmark text-xs text-[var(--brass)] mb-3">Next swing, check</p>
            <ol className="space-y-2">
              {inlineReport.checkpoints.map((c, i) => (
                <li key={i} className="text-sm">
                  <span className="wordmark text-[var(--brass)] mr-2">{i + 1}</span>
                  {c}
                </li>
              ))}
            </ol>
          </div>
          <button className="btn-brass" onClick={() => window.location.assign('/analyze')}>
            Analyse another swing
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div>
          <h1 className="display text-3xl mb-4">That didn’t work.</h1>
          <p className="dim mb-8">{errorMsg}</p>
          <button
            className="btn-brass"
            onClick={() => {
              setStage('idle')
              setErrorMsg('')
              setStatusMsg('')
            }}
          >
            Try another clip
          </button>
        </div>
      )}
    </div>
  )
}

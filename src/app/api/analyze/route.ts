/**
 * /api/analyze — the one server-side job: metrics + 4 keyframes in,
 * streamed coaching report out (SSE), persisted to a shareable slug.
 *
 * Gate: first report per email is free; after that a credit is debited.
 * Without ANTHROPIC_API_KEY the route returns a clearly-marked demo report
 * so the full product flow can be exercised before keys are pasted in.
 */

import Anthropic from '@anthropic-ai/sdk'
import { COACH_SYSTEM_PROMPT } from '@/lib/coach-prompt'
import { REPORT_JSON_SCHEMA, type CoachReport } from '@/lib/report-schema'
import { countReportsByEmail, saveReport } from '@/lib/reports'
import { creditsConfigured, getBalance, refund, tryDebit } from '@/lib/credits'
import type { SwingMetrics } from '@/lib/pose/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const MODEL = 'claude-fable-5'
const FALLBACK_MODEL = 'claude-opus-4-8'
const MAX_FRAME_BYTES = 400_000 // base64 length guard per frame
const POSITIONS = ['p1', 'p4', 'p7', 'p10'] as const

interface AnalyzeBody {
  email?: string
  metrics?: SwingMetrics
  keyframes?: Record<string, string>
}

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

const DEMO_REPORT: CoachReport = {
  status: 'ok',
  one_fix:
    'DEMO MODE — this is a canned example report (no ANTHROPIC_API_KEY configured). Shift your weight onto your lead side by impact instead of hanging back on your trail foot.',
  why: 'Your measured weight shift at impact was behind centre — solid ball-strikers are 0.15–0.45 shoulder-widths into their lead side by impact. Hanging back is the single most common cause of thin and fat strikes.',
  drill: {
    name: 'Step-through drill',
    how_to: 'Hit half-speed shots and let your trail foot step through toward the target after impact, like a baseball pitcher. It is impossible to do while hanging back.',
    reps: '2 sets of 10 balls at the range, half speed',
  },
  checkpoints: [
    'Belt buckle over your lead foot at the finish',
    'Trail heel fully released off the ground after impact',
    'Hold the finish for a count of three, balanced',
  ],
  confidence: 0.9,
  caveats: ['Demo report — numbers are illustrative only'],
  bad_input_reason: null,
  whats_good: 'Lovely tempo — your backswing-to-downswing ratio is right in the tour window.',
}

export async function POST(request: Request) {
  let body: AnalyzeBody
  try {
    body = (await request.json()) as AnalyzeBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const { metrics, keyframes } = body
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: 'A valid email is required to view your report.' }, { status: 400 })
  }
  if (!metrics?.positions?.p1 || !metrics.positions.p7) {
    return Response.json({ error: 'Missing swing metrics.' }, { status: 400 })
  }
  if (!keyframes || POSITIONS.some(p => typeof keyframes[p] !== 'string')) {
    return Response.json({ error: 'Missing keyframes.' }, { status: 400 })
  }
  for (const p of POSITIONS) {
    if (!keyframes[p].startsWith('data:image/jpeg;base64,') || keyframes[p].length > MAX_FRAME_BYTES) {
      return Response.json({ error: 'Keyframes must be JPEG data URLs under 300KB.' }, { status: 400 })
    }
  }

  // First swing free; after that, a credit.
  const priorReports = await countReportsByEmail(email)
  let debited = false
  if (priorReports >= 1) {
    if (!creditsConfigured()) {
      return Response.json(
        { error: 'free_limit', message: 'Payments are not configured yet — one free swing per email for now.' },
        { status: 402 },
      )
    }
    debited = await tryDebit(email, 'analysis')
    if (!debited) {
      const balance = await getBalance(email)
      return Response.json(
        { error: 'no_credits', message: 'You have used your free swing.', balance },
        { status: 402 },
      )
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  const demoMode = !apiKey

  const stream = new ReadableStream({
    async start(controller) {
      try {
        sse(controller, 'status', { stage: 'thinking', message: 'The coach is looking at your swing…' })

        let report: CoachReport
        let modelUsed = 'demo'

        if (demoMode) {
          await new Promise(r => setTimeout(r, 1500))
          report = DEMO_REPORT
        } else {
          const anthropic = new Anthropic({ apiKey })
          const msgStream = anthropic.beta.messages.stream({
            model: MODEL,
            max_tokens: 32000,
            betas: ['server-side-fallback-2026-06-01'],
            fallbacks: [{ model: FALLBACK_MODEL }],
            output_config: {
              effort: 'medium',
              format: { type: 'json_schema', schema: REPORT_JSON_SCHEMA },
            },
            system: [
              { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            ],
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Measured swing metrics (ground truth):\n${JSON.stringify(metrics, null, 2)}\n\nThe four frames follow in order: address (p1), top of backswing (p4), impact (p7), finish (p10).`,
                  },
                  ...POSITIONS.map(p => ({
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: 'image/jpeg' as const,
                      data: keyframes[p].replace('data:image/jpeg;base64,', ''),
                    },
                  })),
                ],
              },
            ],
          })

          // Heartbeats keep the SSE connection (and serverless function) alive
          // while the model thinks.
          let lastBeat = Date.now()
          msgStream.on('streamEvent', () => {
            if (Date.now() - lastBeat > 3000) {
              lastBeat = Date.now()
              sse(controller, 'status', { stage: 'thinking', message: 'Working through the numbers…' })
            }
          })

          const finalMessage = await msgStream.finalMessage()
          modelUsed = finalMessage.model

          if (finalMessage.stop_reason === 'refusal') {
            throw new Error('The analysis was declined. Please try a different clip.')
          }
          const textBlock = finalMessage.content.find(b => b.type === 'text')
          if (!textBlock || textBlock.type !== 'text') {
            throw new Error('No report was generated. Please try again.')
          }
          report = JSON.parse(textBlock.text) as CoachReport
        }

        sse(controller, 'status', { stage: 'saving', message: 'Writing up your report…' })

        const { slug } = await saveReport({
          email,
          status: demoMode ? 'demo' : report.status,
          metrics,
          report,
          keyframes: Object.fromEntries(POSITIONS.map(p => [p, keyframes[p]])),
          model: modelUsed,
        })

        sse(controller, 'report', { slug, report, demo: demoMode })
        sse(controller, 'done', {})
      } catch (err) {
        if (debited) await refund(email).catch(() => {})
        const message = err instanceof Error ? err.message : 'Analysis failed'
        console.error('analyze failed:', message)
        sse(controller, 'error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

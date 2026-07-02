import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReport } from '@/lib/reports'
import ShareButton from '@/components/ShareButton'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const row = await getReport(slug)
  return {
    title: row ? 'Swing report — Middled' : 'Report not found — Middled',
    description: row?.report.one_fix?.slice(0, 140),
    robots: { index: false },
  }
}

const POSITION_LABELS: Record<string, string> = {
  p1: 'Address',
  p4: 'Top',
  p7: 'Impact',
  p10: 'Finish',
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const row = await getReport(slug)
  if (!row) notFound()

  const { report, metrics } = row
  const date = new Date(row.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (report.status === 'bad_input') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="display text-3xl mb-4">We couldn’t read that swing.</h1>
        <p className="dim mb-8">{report.bad_input_reason}</p>
        <Link href="/analyze" className="btn-brass">Film it again</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <p className="wordmark text-xs text-[var(--brass)] mb-2">
        Swing report · {date}
        {row.status === 'demo' && ' · demo'}
      </p>

      {/* Keyframes */}
      <div className="grid grid-cols-4 gap-2 mb-8">
        {(['p1', 'p4', 'p7', 'p10'] as const).map(p =>
          row.keyframes[p] ? (
            <div key={p}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.keyframes[p]} alt={POSITION_LABELS[p]} className="rounded-lg w-full" />
              <p className="dim text-xs mt-1 text-center">{POSITION_LABELS[p]}</p>
            </div>
          ) : null,
        )}
      </div>

      {/* What's good */}
      <p className="text-[var(--brass)] font-bold mb-6">{report.whats_good}</p>

      {/* The fix */}
      <div className="brass-rule mb-3" />
      <h1 className="display text-3xl sm:text-4xl mb-4">{report.one_fix}</h1>
      <p className="dim leading-relaxed mb-8">{report.why}</p>

      {/* Drill */}
      <div className="card p-6 mb-6">
        <p className="wordmark text-xs text-[var(--brass)] mb-2">Your drill</p>
        <h2 className="font-extrabold text-xl mb-2">{report.drill.name}</h2>
        <p className="dim text-sm leading-relaxed mb-3">{report.drill.how_to}</p>
        <p className="font-bold text-sm">{report.drill.reps}</p>
      </div>

      {/* Checkpoints */}
      <div className="card p-6 mb-6">
        <p className="wordmark text-xs text-[var(--brass)] mb-3">Next swing, check</p>
        <ol className="space-y-3">
          {report.checkpoints.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span className="wordmark text-[var(--brass)]">{i + 1}</span>
              <span className="text-sm leading-relaxed">{c}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Numbers */}
      <details className="card p-6 mb-6">
        <summary className="font-extrabold cursor-pointer">Your measured numbers</summary>
        <div className="dim text-sm mt-4 space-y-1">
          <p>Tempo ratio (backswing : downswing): {metrics.tempoRatio} : 1</p>
          <p>Weight shift at impact: {metrics.positions.p7.weightShift} shoulder-widths toward target</p>
          <p>Hip sway at the top: {metrics.positions.p4.hipSwayDx} shoulder-widths</p>
          <p>Lead arm at the top: {metrics.positions.p4.leadArmDeg}°</p>
          <p>Head movement at impact: {metrics.positions.p7.headDx} across, {metrics.positions.p7.headDy} down</p>
          <p>Handedness: {metrics.handedness} · Tracking quality: {Math.round(metrics.trackingQuality * 100)}%</p>
        </div>
      </details>

      {report.caveats.length > 0 && (
        <p className="dim text-xs mb-8">Caveats: {report.caveats.join(' · ')}</p>
      )}

      <div className="flex gap-3 flex-col sm:flex-row">
        <Link href="/analyze" className="btn-brass text-center">Analyse another swing</Link>
        <ShareButton />
      </div>
    </div>
  )
}

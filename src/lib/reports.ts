/**
 * Report persistence. Supabase when configured; otherwise a local JSON-file
 * store (dev/demo only — on serverless it lands in /tmp and won't survive
 * instance recycling). The slug is an unguessable capability URL.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { customAlphabet } from 'nanoid'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { SwingMetrics } from './pose/types'
import type { CoachReport } from './report-schema'

const slugAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

export interface ReportRow {
  slug: string
  created_at: string
  email: string | null
  status: 'ok' | 'bad_input' | 'demo'
  metrics: SwingMetrics
  report: CoachReport
  /** base64 data URLs for p1/p4/p7/p10 (proto: stored inline; v2: Cloudinary) */
  keyframes: Record<string, string>
  model: string
}

function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const localDir = () =>
  process.env.VERCEL ? path.join(os.tmpdir(), 'middled-reports') : path.join(process.cwd(), '.middled-data', 'reports')

export async function saveReport(
  row: Omit<ReportRow, 'slug' | 'created_at'>,
): Promise<{ slug: string }> {
  const slug = slugAlphabet()
  const full: ReportRow = { ...row, slug, created_at: new Date().toISOString() }

  const db = supabase()
  if (db) {
    const { error } = await db.from('reports').insert({
      slug: full.slug,
      email: full.email,
      status: full.status,
      metrics: full.metrics,
      report: full.report,
      keyframes: full.keyframes,
      model: full.model,
    })
    if (error) throw new Error(`Failed to save report: ${error.message}`)
    return { slug }
  }

  const dir = localDir()
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${slug}.json`), JSON.stringify(full))
  return { slug }
}

export async function getReport(slug: string): Promise<ReportRow | null> {
  if (!/^[a-z0-9]{16}$/.test(slug)) return null

  const db = supabase()
  if (db) {
    const { data, error } = await db.from('reports').select('*').eq('slug', slug).maybeSingle()
    if (error || !data) return null
    return data as ReportRow
  }

  try {
    const raw = await fs.readFile(path.join(localDir(), `${slug}.json`), 'utf8')
    return JSON.parse(raw) as ReportRow
  } catch {
    return null
  }
}

/** Count of reports for an email — used for the first-swing-free gate. */
export async function countReportsByEmail(email: string): Promise<number> {
  const db = supabase()
  if (db) {
    const { count } = await db
      .from('reports')
      .select('slug', { count: 'exact', head: true })
      .eq('email', email)
    return count ?? 0
  }
  try {
    const files = await fs.readdir(localDir())
    let n = 0
    for (const f of files) {
      const raw = await fs.readFile(path.join(localDir(), f), 'utf8')
      if ((JSON.parse(raw) as ReportRow).email === email) n++
    }
    return n
  } catch {
    return 0
  }
}

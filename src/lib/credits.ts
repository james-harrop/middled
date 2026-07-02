/**
 * Credits — append-only ledger keyed by email (no accounts in v1; the trade-off
 * is documented in the README handover). Balance = SUM(delta).
 * Adapted from the adhouse-saas credit-ledger pattern.
 *
 * Supabase-only: without Supabase configured, buying is disabled and only the
 * first-swing-free path works.
 */

import { createClient } from '@supabase/supabase-js'

export const CREDIT_PACKS = {
  single: { name: 'One swing', credits: 1, priceGbp: 5 },
  range: { name: 'Range session', credits: 3, priceGbp: 12 },
  season: { name: 'Season ticket', credits: 10, priceGbp: 30 },
} as const

export type CreditPackId = keyof typeof CREDIT_PACKS

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export const creditsConfigured = () => db() !== null

export async function getBalance(email: string): Promise<number> {
  const client = db()
  if (!client) return 0
  const { data, error } = await client
    .from('credit_ledger')
    .select('delta')
    .eq('email', email.toLowerCase())
  if (error || !data) return 0
  return data.reduce((s, r) => s + (r.delta as number), 0)
}

export async function tryDebit(email: string, reason: string): Promise<boolean> {
  const client = db()
  if (!client) return false
  // Check-then-write; fine at launch volumes (same trade-off as adhouse).
  const balance = await getBalance(email)
  if (balance < 1) return false
  const { error } = await client.from('credit_ledger').insert({
    email: email.toLowerCase(),
    delta: -1,
    reason,
  })
  return !error
}

/** Compensating entry when an analysis fails after the debit. */
export async function refund(email: string): Promise<void> {
  const client = db()
  if (!client) return
  await client.from('credit_ledger').insert({
    email: email.toLowerCase(),
    delta: 1,
    reason: 'refund',
  })
}

/** Idempotent on stripe_session_id — Stripe retries webhooks. */
export async function creditPackPurchase(opts: {
  email: string
  packId: CreditPackId
  stripeSessionId: string
}): Promise<void> {
  const client = db()
  if (!client) throw new Error('Supabase not configured')
  const { data: existing } = await client
    .from('credit_ledger')
    .select('id')
    .eq('stripe_session_id', opts.stripeSessionId)
    .maybeSingle()
  if (existing) return

  const pack = CREDIT_PACKS[opts.packId]
  const { error } = await client.from('credit_ledger').insert({
    email: opts.email.toLowerCase(),
    delta: pack.credits,
    reason: 'pack_purchase',
    stripe_session_id: opts.stripeSessionId,
    metadata: { pack_id: opts.packId, price_gbp: pack.priceGbp },
  })
  if (error) throw new Error(`Failed to credit purchase: ${error.message}`)
}

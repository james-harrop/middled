/**
 * /api/stripe-checkout — create a Checkout session for a credit pack.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY, NEXT_PUBLIC_SITE_URL
 *   STRIPE_PRICE_SINGLE (£5 → 1), STRIPE_PRICE_RANGE (£12 → 3), STRIPE_PRICE_SEASON (£30 → 10)
 *
 * Returns a clear 503 until configured so the UI can say "payments coming soon".
 */

import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { CREDIT_PACKS, type CreditPackId } from '@/lib/credits'

export const runtime = 'nodejs'

const PRICE_ENV: Record<CreditPackId, string> = {
  single: 'STRIPE_PRICE_SINGLE',
  range: 'STRIPE_PRICE_RANGE',
  season: 'STRIPE_PRICE_SEASON',
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json(
      { error: 'Payments are not configured yet — your first swing is free.' },
      { status: 503 },
    )
  }

  let body: { packId?: CreditPackId; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const packId = body.packId
  const email = body.email?.trim().toLowerCase()
  if (!packId || !(packId in CREDIT_PACKS)) {
    return NextResponse.json({ error: 'Unknown pack' }, { status: 400 })
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required — credits are tied to it.' }, { status: 400 })
  }
  const priceId = process.env[PRICE_ENV[packId]]
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price not configured for "${packId}".` },
      { status: 503 },
    )
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  const stripe = new Stripe(secretKey)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/analyze?topup=done`,
      cancel_url: `${origin}/analyze?topup=cancelled`,
      customer_email: email,
      metadata: { email, pack_id: packId },
    })
    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a session URL' }, { status: 502 })
    }
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe checkout failed:', message)
    return NextResponse.json({ error: `Stripe error: ${message}` }, { status: 502 })
  }
}

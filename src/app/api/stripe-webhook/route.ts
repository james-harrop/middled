/**
 * /api/stripe-webhook — credit the ledger on checkout.session.completed.
 * Signature is verified against the RAW body; idempotent on session id.
 *
 * Stripe Dashboard: point a webhook at https://<domain>/api/stripe-webhook,
 * subscribe to checkout.session.completed, set STRIPE_WEBHOOK_SECRET.
 */

import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { CREDIT_PACKS, creditPackPurchase, type CreditPackId } from '@/lib/credits'

export const runtime = 'nodejs'

const isPackId = (v: unknown): v is CreditPackId => typeof v === 'string' && v in CREDIT_PACKS

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await request.text()
  const stripe = new Stripe(secretKey)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const email = session.metadata?.email ?? session.customer_email ?? undefined
    const packId = session.metadata?.pack_id

    if (!email) return NextResponse.json({ received: true, warning: 'no email' })
    if (!isPackId(packId)) return NextResponse.json({ received: true, warning: 'unknown pack_id' })
    if (session.payment_status !== 'paid') return NextResponse.json({ received: true, warning: 'not paid yet' })

    try {
      await creditPackPurchase({ email, packId, stripeSessionId: session.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('creditPackPurchase failed:', message)
      // 500 so Stripe retries
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}

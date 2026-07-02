# Middled — One swing. One fix.

Browser-based AI golf swing analysis. Film one face-on swing on your phone; the pose
analysis runs **on-device** (MediaPipe in the browser — the video never uploads), then
four keyframes + measured joint angles go to Claude for a coaching report: one fix,
why, one drill, three checkpoints. Shareable report URL. First swing free, then
credit packs via Stripe.

## How it works

```
phone video ──(stays in browser)──▶ MediaPipe pose (33 landmarks, ~30fps)
    ▶ swing detection (P1 address / P4 top / P7 impact / P10 finish,
      anchored on the downswing speed peak; user-adjustable scrubber as fallback)
    ▶ metrics (spine tilt, hip sway, weight shift, lead arm, tempo ratio …)
    ▶ POST /api/analyze: 4 JPEG keyframes + metrics JSON
        ▶ claude-fable-5 (structured output, Opus 4.8 server-side fallback)
        ▶ report persisted to Supabase, unguessable slug
    ▶ /r/[slug] — the shareable report
```

- **Demo mode**: without `ANTHROPIC_API_KEY` the flow returns a canned, clearly-badged
  report so the product can be exercised end-to-end.
- **Credits**: first report per email free; then an append-only `credit_ledger`
  (email-keyed, no accounts in v1) debited per analysis, topped up by the Stripe
  webhook. KNOWN TRADE-OFF: anyone who knows an email could spend its credits —
  acceptable at launch volume; add magic-link auth in v2.

## Run locally

```sh
npm install
npm run dev       # demo mode works with zero env vars
npm test          # swing-detection unit tests (synthetic fixtures)
```

## Go-live checklist (~20 minutes)

1. **Anthropic key** — new key named `middled` in the personal console → `ANTHROPIC_API_KEY`.
2. **Supabase** — new free project → run `supabase/migrations/001_init.sql` in the SQL
   editor → paste `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. **Stripe** — product "Middled", three one-off GBP prices (£5/£12/£30) → paste the
   price IDs + secret key; add webhook `https://middled.golf/api/stripe-webhook` for
   `checkout.session.completed` → paste `STRIPE_WEBHOOK_SECRET`.
4. **Domain** — point middled.golf at Vercel (project → Settings → Domains); check
   Deployment Protection is OFF so the site and the Stripe webhook are publicly reachable.
5. **Real-device pass** — film 3–4 face-on swings on an iPhone, run them through, and
   tune `S_STILL` / thresholds in `src/lib/pose/swing-detect.ts` if detection misses.

All env vars go in Vercel → Project → Settings → Environment Variables, then redeploy.

## Engineering notes

- `src/lib/pose/` is pure and unit-tested — landmark series in, positions/metrics out.
  Test fixtures are synthetic; add recorded landmark JSONs from real clips as they come.
- Detection anchors on the downswing speed peak (the most reliable signal in any swing)
  — a held finish can sit "higher" than the top, so never argmin wrist-Y globally.
- Impact-frame joint angles are the noisiest at 30fps (fast hands + motion blur). The
  coach model receives per-position confidence and is instructed to hedge accordingly.
- Playwright e2e (manual, documented): real face-on clip auto-detected all four
  positions; second analysis on the same email correctly 402s.
- MediaPipe wasm + the 9MB pose model are self-hosted in `public/` (no CDN dependency).
- Keyframes are stored inline (base64) in the report row for v1; move to Cloudinary
  when size matters.

## v2 candidates (deliberately out of scope)

Down-the-line camera angle · swing history/compare · magic-link auth · subscriptions ·
Cloudinary keyframes · coach marketplace.

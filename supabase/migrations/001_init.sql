-- Middled initial schema. Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  created_at timestamptz not null default now(),
  email text,
  status text not null,
  metrics jsonb not null,
  report jsonb not null,
  keyframes jsonb not null,
  model text
);
create index if not exists reports_email_idx on public.reports (email);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  delta integer not null,
  reason text not null,
  stripe_session_id text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists credit_ledger_email_idx on public.credit_ledger (email);
create unique index if not exists credit_ledger_stripe_session_idx
  on public.credit_ledger (stripe_session_id) where stripe_session_id is not null;

-- No client-side access: everything goes through the service-role key in API
-- routes. RLS on with no policies = deny-all for anon/authenticated.
alter table public.reports enable row level security;
alter table public.credit_ledger enable row level security;

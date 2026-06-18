-- Persisted AI portal digests. One row per (period, period_key, scope_key) so
-- the daily/weekly/monthly digest is generated once and shared across the team
-- (and across page loads) instead of being re-run on every view.
--   period      = 'daily' | 'weekly' | 'monthly'
--   period_key  = '2026-06-18' (daily) | '2026-W25' (weekly) | '2026-06' (monthly)
--   scope_key   = 'all' for admins, else the sorted accessible-section list, so
--                 a partial-access user gets their own scoped digest.
create table if not exists public.portal_digests (
  id          uuid primary key default gen_random_uuid(),
  period      text not null,
  period_key  text not null,
  scope_key   text not null default 'all',
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (period, period_key, scope_key)
);

-- Only the service role (the ai-insights edge function) reads/writes this; the
-- browser always goes through that function, never queries the table directly.
-- RLS on with no policies = locked to service-role only.
alter table public.portal_digests enable row level security;

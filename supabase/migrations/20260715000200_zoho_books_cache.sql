-- Shared server-side cache for the Zoho Books P&L result.
--
-- Before this, the Finance page recomputed the P&L LIVE against Zoho on every
-- browser + every reload (zoho-books had no DB persistence). Consequences the
-- team hit: different people saw different numbers (each browser had its own
-- independently-timed result), the figures "flashed" as stale snapshots were
-- replaced by fresh fetches, and concurrent viewers tripped Zoho's OAuth
-- token-generation throttle.
--
-- Now the zoho-books edge function (service role) computes ONCE per date range,
-- stores it here with a synced_at stamp, and serves it to everyone for ~15 min;
-- a pg_cron job (see the companion migration) keeps the common ranges warm.
--
-- SERVER-WRITE / no client access: the dashboard never reads this table
-- directly — it gets the payload (incl. synced_at) from the function response.
-- So we lock it to the service role only, like zoho_tokens.

create table if not exists public.zoho_books_cache (
  range_key  text primary key,                 -- "<from>_<to>", e.g. "2026-01-01_2026-07-15"
  data       jsonb        not null,            -- the ZohoBooksData payload
  synced_at  timestamptz  not null default now()
);

alter table public.zoho_books_cache enable row level security;
revoke all on public.zoho_books_cache from anon, authenticated;

drop policy if exists "service role full zoho_books_cache" on public.zoho_books_cache;
create policy "service role full zoho_books_cache"
  on public.zoho_books_cache for all to service_role using (true) with check (true);

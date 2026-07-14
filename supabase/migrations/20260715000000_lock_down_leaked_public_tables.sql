-- SECURITY: lock down tables/views that were created OUTSIDE migrations and
-- never had row-level security enabled, leaving them readable by the PUBLIC
-- `anon` role. The anon key ships in the client bundle, so "anon-readable"
-- means "readable by anyone on the internet".
--
-- Confirmed anon-readable before this migration (probed via the REST API):
--   zoho_tokens          1 row   — Zoho OAuth refresh + access token (CREDENTIALS)
--   zoho_cache           2 rows  — Zoho CRM lead/DOB cache (PII)
--   call_log            ~11k     — call history (PII)
--   meta_leads_pipeline ~16k     — Meta ad-lead pipeline (PII)
--   google_oauth_status  1 row   — redacted Google-connect view (low sensitivity)
--
-- Edge functions use the SERVICE ROLE (bypasses RLS), so server-side sync is
-- unaffected. The dashboard reads these while LOGGED IN (the `authenticated`
-- role), so we grant authenticated exactly what the client needs and block anon.
-- The client's actual usage (verified in src/):
--   zoho_cache          — read + update       → authenticated select/insert/update
--   call_log            — read only           → authenticated select
--   meta_leads_pipeline — read only           → authenticated select
--   zoho_tokens         — NOT used client-side → service role only

-- ── 1. zoho_tokens — server-only OAuth credentials ────────────────────────────
do $$
begin
  if to_regclass('public.zoho_tokens') is not null then
    execute 'revoke all on public.zoho_tokens from anon, authenticated';
    execute 'alter table public.zoho_tokens enable row level security';
    execute 'drop policy if exists "service role full zoho_tokens" on public.zoho_tokens';
    execute 'create policy "service role full zoho_tokens" on public.zoho_tokens for all to service_role using (true) with check (true)';
    -- refresh_token is sourced from an env var (ZOHO_REFRESH_TOKEN); the
    -- access-token cache upserts never set it, so a fresh insert (id=1 missing)
    -- hit a NOT NULL violation. Make it nullable — it's a vestigial cache column.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'zoho_tokens'
        and column_name = 'refresh_token' and is_nullable = 'NO'
    ) then
      execute 'alter table public.zoho_tokens alter column refresh_token drop not null';
    end if;
  end if;
end $$;

-- ── 2. zoho_cache — CRM PII; dashboard reads + FollowUps updates (logged in) ──
do $$
begin
  if to_regclass('public.zoho_cache') is not null
     and (select relkind from pg_class where oid = 'public.zoho_cache'::regclass) = 'r' then
    execute 'revoke all on public.zoho_cache from anon';
    execute 'grant select, insert, update on public.zoho_cache to authenticated';
    execute 'alter table public.zoho_cache enable row level security';
    execute 'drop policy if exists "auth rw zoho_cache" on public.zoho_cache';
    execute 'create policy "auth rw zoho_cache" on public.zoho_cache for all to authenticated using (true) with check (true)';
    execute 'drop policy if exists "service role full zoho_cache" on public.zoho_cache';
    execute 'create policy "service role full zoho_cache" on public.zoho_cache for all to service_role using (true) with check (true)';
  end if;
end $$;

-- ── 3. call_log + meta_leads_pipeline — PII, READ-ONLY for the dashboard ──────
--       (synced server-side by edge functions via the service role).
do $$
declare t text;
begin
  foreach t in array array['call_log','meta_leads_pipeline'] loop
    if to_regclass('public.'||t) is not null
       and (select relkind from pg_class where oid = ('public.'||t)::regclass) = 'r' then
      execute format('revoke all on public.%I from anon', t);
      execute format('grant select on public.%I to authenticated', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "auth read %s" on public.%I', t, t);
      execute format('create policy "auth read %s" on public.%I for select to authenticated using (true)', t, t);
      execute format('drop policy if exists "service role full %s" on public.%I', t, t);
      execute format('create policy "service role full %s" on public.%I for all to service_role using (true) with check (true)', t, t);
    end if;
  end loop;
end $$;

-- ── 5. google_oauth_status — redacted view; just remove the public/anon grant.
do $$
begin
  if to_regclass('public.google_oauth_status') is not null then
    execute 'revoke all on public.google_oauth_status from anon, public';
    execute 'grant select on public.google_oauth_status to authenticated';
  end if;
end $$;

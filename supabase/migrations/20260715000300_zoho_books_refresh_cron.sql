-- Keep the shared Zoho Books P&L cache (zoho_books_cache) warm.
--
-- Every 15 minutes we force-recompute the three date ranges the Finance page
-- actually uses (This Year — the default — plus This Month and Last 3 Months)
-- and store each in zoho_books_cache. So whenever anyone opens Finance they read
-- a fresh shared result instantly, instead of each browser recomputing live
-- against Zoho (which diverged between people and tripped Zoho's token throttle).
--
-- Dates are computed in Asia/Dubai (the team's timezone, AED base) so the
-- range_key ("<from>_<to>") matches exactly what the browser sends for those
-- presets — otherwise a UTC/local date mismatch would miss the warmed cache.
--
-- NOTE: zoho-books must be deployed with --no-verify-jwt for this to work — the
-- cron sends the service-role key as the bearer, which the JWT gate rejects.
-- The browser still calls it with the anon JWT, which works either way. (Same
-- constraint as zoho-sync, see 20260619000000.) `force:true` bypasses the
-- 15-min cache-serve and recomputes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'zoho-books-refresh') then
    perform cron.unschedule('zoho-books-refresh');
  end if;
end$$;

select cron.schedule(
  'zoho-books-refresh',
  '*/15 * * * *',
  $cron$
  with cfg as (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')      as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')  as key,
      (now() at time zone 'Asia/Dubai')                                                       as dxb
  )
  select
    -- This Year (the Finance default)
    net.http_post(
      url     := cfg.url || '/functions/v1/zoho-books',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cfg.key),
      body    := jsonb_build_object('from', to_char(date_trunc('year',  cfg.dxb), 'YYYY-MM-DD'), 'to', to_char(cfg.dxb, 'YYYY-MM-DD'), 'force', true)
    ),
    -- This Month
    net.http_post(
      url     := cfg.url || '/functions/v1/zoho-books',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cfg.key),
      body    := jsonb_build_object('from', to_char(date_trunc('month', cfg.dxb), 'YYYY-MM-DD'), 'to', to_char(cfg.dxb, 'YYYY-MM-DD'), 'force', true)
    ),
    -- Last 3 Months (start of the calendar month two months back → today)
    net.http_post(
      url     := cfg.url || '/functions/v1/zoho-books',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cfg.key),
      body    := jsonb_build_object('from', to_char(date_trunc('month', cfg.dxb) - interval '2 months', 'YYYY-MM-DD'), 'to', to_char(cfg.dxb, 'YYYY-MM-DD'), 'force', true)
    )
  from cfg;
  $cron$
);

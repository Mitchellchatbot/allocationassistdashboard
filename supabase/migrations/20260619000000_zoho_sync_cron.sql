-- Keep the Zoho CRM cache fresh server-side.
--
-- Before this, zoho_cache only refreshed when someone opened the dashboard
-- while the cache was already stale (a lazy stale-read) or clicked "Sync now".
-- With no traffic the dataset (leads, conversions, revenue, sales/team metrics)
-- aged unbounded, and the first viewer after a gap always saw old data.
--
-- This schedules zoho-sync every 20 minutes so the cache is current regardless
-- of traffic. Reuses the same Vault secrets (project_url, service_role_key) the
-- tick-scheduler cron already relies on (see 20260524000009).
--
-- NOTE: zoho-sync must be deployed with --no-verify-jwt for this to work — the
-- cron sends the service-role key as the bearer, and the JWT gate rejects the
-- non-JWT service-role key format. The browser still calls it with the anon JWT,
-- which works either way.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'zoho-sync') then
    perform cron.unschedule('zoho-sync');
  end if;
end$$;

select cron.schedule(
  'zoho-sync',
  '*/20 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/zoho-sync',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

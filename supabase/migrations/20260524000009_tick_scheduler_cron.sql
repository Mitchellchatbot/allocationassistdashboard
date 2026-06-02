-- Schedule the tick-scheduler edge function to fire every 5 minutes.
--
-- The function walks all active automation_flow_runs and advances any whose
-- current_stage is a time-based gate that is now due:
--   - Onboarding `wait_for_form`         → 3 days
--   - Second Payment `trigger_15_days`   → 15 days post joining_date
--   - Second Payment `reminder_25_working` / `reminder_day_before` / `reminder_weekly`
--
-- Requires pg_cron + pg_net + the supabase_vault extension (already enabled
-- on hosted Supabase projects). If you self-host or have these disabled, you
-- can skip this migration and call the function manually from the
-- "Run scheduler" button on the Automations page.
--
-- The project URL and service-role key are pulled from Vault so we don't
-- store secrets in migration source. To set them up once:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-jwt>',                'service_role_key');
--
-- (Run those in the SQL editor before applying this migration in prod.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guard against re-applying: unschedule any prior tick job first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tick-scheduler') then
    perform cron.unschedule('tick-scheduler');
  end if;
end$$;

select cron.schedule(
  'tick-scheduler',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/tick-scheduler',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

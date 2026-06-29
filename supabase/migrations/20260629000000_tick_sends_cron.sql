-- Schedule the dedicated tick-sends edge function every 5 minutes (Amir #5).
--
-- tick-sends fires due scheduled batch sends + scheduled Send-Profile campaigns.
-- It's split out from tick-scheduler (which runs many heavy sweeps and can hit
-- the edge worker resource limit) so email firing stays reliable and honours the
-- per-row Gulf-time send slots. Reuses the same Vault secrets the tick-scheduler
-- cron already relies on (project_url + service_role_key, see 20260524000009).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tick-sends') then
    perform cron.unschedule('tick-sends');
  end if;
end$$;

select cron.schedule(
  'tick-sends',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/tick-sends',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

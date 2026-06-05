-- Schedule the wordpress-candidates-sync edge function to fire every
-- 15 minutes. The mirror table (wordpress_candidates) drifts whenever
-- someone edits a candidate directly in WP admin (Parini and Emilie
-- do this) — without periodic sync the dashboard says "not in WP"
-- for candidates that ARE in WP, and the team can't trust the badges.
--
-- This complements (doesn't replace) the per-row mirror updates done
-- inline by wordpress-candidate-upsert when the dashboard creates/
-- edits a candidate. Those handle our writes; the cron handles
-- direct-in-WP writes.
--
-- Same pg_cron + vault pattern as the tick-scheduler migration.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wordpress-candidates-sync') then
    perform cron.unschedule('wordpress-candidates-sync');
  end if;
end$$;

select cron.schedule(
  'wordpress-candidates-sync',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/wordpress-candidates-sync',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
               ),
    body    := '{}'::jsonb
  );
  $cron$
);

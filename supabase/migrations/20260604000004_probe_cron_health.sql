-- Probe: is tick-scheduler actually firing on the prod project?
-- Logs the cron job's most recent run details so we can confirm it's
-- healthy + the vault secrets were configured correctly.

do $$
declare r record;
begin
  raise notice '── cron jobs ──';
  for r in select jobid, jobname, schedule, active from cron.job where jobname like '%tick%' or jobname like '%scheduler%' order by jobid
  loop
    raise notice '[cron] job % name=% schedule=% active=%', r.jobid, r.jobname, r.schedule, r.active;
  end loop;

  raise notice '── recent runs (last 5) ──';
  for r in
    select start_time, status, return_message from cron.job_run_details
    where jobid in (select jobid from cron.job where jobname like '%tick%' or jobname like '%scheduler%')
    order by start_time desc limit 5
  loop
    raise notice '[cron run] % status=% msg=%', r.start_time, r.status, substring(coalesce(r.return_message, ''), 1, 100);
  end loop;

  raise notice '── vault secrets present? ──';
  for r in select name from vault.decrypted_secrets where name in ('project_url', 'service_role_key')
  loop
    raise notice '[vault] % present', r.name;
  end loop;
end $$;

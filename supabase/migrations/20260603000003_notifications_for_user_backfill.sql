-- ── Backfill notifications.for_user from the related run's assignee ────
-- Legacy notifications (vacancy_match, interview_followup, etc.) were
-- written without for_user set, so every team member sees every
-- notification. Backfill from the related run's assigned_to where we
-- have one, so the per-user filter introduced in use-notifications
-- has data to scope.
--
-- Future inserts: tick-scheduler + classify-hospital-reply edge functions
-- now stamp for_user at insert time (see code changes in the same PR).

update public.notifications n
   set for_user = r.assigned_to
  from public.automation_flow_runs r
 where n.related_run_id = r.id
   and n.for_user is null
   and r.assigned_to is not null;

-- Vacancy-match notifications reference the vacancy, not a run. Backfill
-- those from the vacancy's hospital owner so the right person sees them.
update public.notifications n
   set for_user = h.owner_email
  from public.vacancies v
  join public.hospitals h on lower(h.name) = lower(v.hospital_name)
 where n.related_vacancy_id = v.id
   and n.for_user is null
   and h.owner_email is not null;

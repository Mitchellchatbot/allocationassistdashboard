-- Phase 3 — Notifications surface.
--
-- A single generic table to back every "thing-the-team-should-know-about"
-- nudge. Currently used by:
--   - tick-scheduler (vacancy_match)        — new doctor onboarded that strongly matches an open vacancy
--   - tick-scheduler (interview_followup)   — 72 hours since interview, chase the hospital
--
-- Surfaced via PendingActionsCard on the main dashboard. Dedupes keyed on
-- (kind, related_vacancy_id, related_doctor_id, related_run_id) so the same
-- nudge doesn't reappear every tick — see the partial unique indices below.

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,                          -- vacancy_match | interview_followup | ...
  title               text not null,
  body                text,
  link_path           text,                                   -- e.g. /vacancies?id=xxx  or /automations?flow=interview
  related_vacancy_id  uuid references public.vacancies(id) on delete cascade,
  related_doctor_id   text,                                   -- prefixed lead:/dob: id
  related_run_id      uuid references public.automation_flow_runs(id) on delete cascade,
  for_user            text,                                   -- email of the specific recipient; null = team-wide
  read_at             timestamptz,
  dismissed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists notifications_kind_idx          on public.notifications (kind);
create index if not exists notifications_created_idx       on public.notifications (created_at desc);
create index if not exists notifications_unread_idx        on public.notifications (read_at) where read_at is null and dismissed_at is null;
create index if not exists notifications_vacancy_idx       on public.notifications (related_vacancy_id);
create index if not exists notifications_run_idx           on public.notifications (related_run_id);

-- Dedupe: at most one vacancy_match notification per (vacancy, doctor) pair.
-- The team can dismiss; we won't re-create the same pairing.
create unique index if not exists notifications_vacancy_match_unique
  on public.notifications (related_vacancy_id, related_doctor_id)
  where kind = 'vacancy_match' and related_vacancy_id is not null and related_doctor_id is not null;

-- Dedupe: at most one interview_followup per flow run.
create unique index if not exists notifications_interview_followup_unique
  on public.notifications (related_run_id)
  where kind = 'interview_followup' and related_run_id is not null;

alter table public.notifications enable row level security;

drop policy if exists "service role full notifications" on public.notifications;
drop policy if exists "auth read notifications"         on public.notifications;
drop policy if exists "auth write notifications"        on public.notifications;

create policy "service role full notifications" on public.notifications for all to service_role using (true) with check (true);
create policy "auth read notifications"  on public.notifications for select to authenticated using (true);
create policy "auth write notifications" on public.notifications for all    to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.notifications;

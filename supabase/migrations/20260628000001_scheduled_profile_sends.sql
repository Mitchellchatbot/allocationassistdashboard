-- Amir #5 — schedule a Send-Profile campaign (hospital intro + doctor "working
-- opportunity" emails) for a future date+time instead of sending immediately.
-- The row captures exactly what SendProfileDialog.handleConfirm assembles today;
-- a deployed scheduler later expands it into the same automation_flow_runs +
-- send-flow-email calls. Until then the row is visible + manageable in the UI
-- (Send now / Reschedule / Cancel).

create table if not exists public.scheduled_profile_sends (
  id                 uuid primary key default gen_random_uuid(),
  doctor_id          text not null,
  doctor_name        text not null,
  doctor_email       text,
  doctor_phone       text,
  doctor_speciality  text,
  hospital_ids       text[] not null default '{}',
  custom_message     text,
  bcc_override       text[],
  cc_override        text[],
  stage_overrides    jsonb,
  template_overrides jsonb,
  attachments        jsonb not null default '[]'::jsonb,
  scheduled_for      date not null,
  scheduled_at_time  time,
  timezone           text not null default 'Asia/Dubai',
  recurrence         jsonb not null default '{"freq":"none"}'::jsonb,
  next_run_at        timestamptz,
  status             text not null default 'draft'
                       check (status in ('draft','scheduled','sent','cancelled','failed')),
  created_by         text,
  sent_at            timestamptz,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists scheduled_profile_sends_status_idx on public.scheduled_profile_sends (status);
create index if not exists scheduled_profile_sends_next_run_idx on public.scheduled_profile_sends (next_run_at) where status = 'draft';

alter table public.scheduled_profile_sends enable row level security;

drop policy if exists "service role full scheduled_profile_sends" on public.scheduled_profile_sends;
drop policy if exists "auth read scheduled_profile_sends"        on public.scheduled_profile_sends;
drop policy if exists "auth write scheduled_profile_sends"       on public.scheduled_profile_sends;

create policy "service role full scheduled_profile_sends" on public.scheduled_profile_sends for all to service_role using (true) with check (true);
create policy "auth read scheduled_profile_sends"  on public.scheduled_profile_sends for select to authenticated using (true);
create policy "auth write scheduled_profile_sends" on public.scheduled_profile_sends for all to authenticated using (true) with check (true);

-- Live updates in the Scheduled queue.
alter publication supabase_realtime add table public.scheduled_profile_sends;

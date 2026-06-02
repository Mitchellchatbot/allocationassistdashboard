-- Phase 1 (Hospital Introduction Dept) email automation flows.
-- Three tables:
--   automation_flow_configs — editable per-flow defaults (subject, delay, on/off per step)
--   automation_flow_runs    — one row per doctor in a specific flow
--   automation_flow_events  — per-stage timestamps + freeform notes for the n8n-style timeline

create table if not exists public.automation_flow_configs (
  flow_key      text primary key,           -- e.g. 'onboarding', 'profile_sent', etc.
  name          text not null,
  description   text,
  enabled       boolean not null default true,
  -- JSON keyed by stage_key — per-step overrides (subject line, delay days, enabled bool).
  -- Shape: { stageKey: { subject?: string, delayDays?: number, enabled?: boolean, notes?: string } }
  stage_overrides jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create table if not exists public.automation_flow_runs (
  id              uuid primary key default gen_random_uuid(),
  flow_key        text not null references public.automation_flow_configs(flow_key) on delete cascade,
  doctor_id       text,                            -- zoho lead/contact id when available
  doctor_name     text not null,
  doctor_email    text,
  doctor_phone    text,
  current_stage   text not null,                   -- stage_key from the flow definition
  status          text not null default 'active',  -- active | completed | paused | failed
  hospital        text,                            -- relevant for profile_sent / shortlist / interview
  started_at      timestamptz not null default now(),
  last_event_at   timestamptz not null default now(),
  completed_at    timestamptz,
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists automation_flow_runs_flow_idx    on public.automation_flow_runs (flow_key);
create index if not exists automation_flow_runs_doctor_idx  on public.automation_flow_runs (doctor_id);
create index if not exists automation_flow_runs_status_idx  on public.automation_flow_runs (status);

create table if not exists public.automation_flow_events (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.automation_flow_runs(id) on delete cascade,
  stage_key    text not null,
  event_type   text not null,                      -- entered | email_sent | email_opened | reminder_sent | note | error | completed
  message      text,                               -- freeform note shown in the timeline
  payload      jsonb not null default '{}'::jsonb, -- arbitrary structured data (e.g. email subject, recipient list)
  occurred_at  timestamptz not null default now()
);

create index if not exists automation_flow_events_run_idx  on public.automation_flow_events (run_id, occurred_at);

alter table public.automation_flow_configs enable row level security;
alter table public.automation_flow_runs    enable row level security;
alter table public.automation_flow_events  enable row level security;

create policy "service role full configs"  on public.automation_flow_configs for all to service_role using (true) with check (true);
create policy "service role full runs"     on public.automation_flow_runs    for all to service_role using (true) with check (true);
create policy "service role full events"   on public.automation_flow_events  for all to service_role using (true) with check (true);

-- Dashboard reads everything; authenticated users can also edit the default-flow
-- configs (so Hospital Intro team can tweak copy/delays without engineering).
create policy "authenticated read configs" on public.automation_flow_configs for select to authenticated using (true);
create policy "authenticated read runs"    on public.automation_flow_runs    for select to authenticated using (true);
create policy "authenticated read events"  on public.automation_flow_events  for select to authenticated using (true);
create policy "authenticated update configs" on public.automation_flow_configs for update to authenticated using (true) with check (true);
create policy "authenticated insert events"  on public.automation_flow_events  for insert to authenticated with check (true);

-- Realtime so the Automations page updates as the (future) sender pushes events.
alter publication supabase_realtime add table public.automation_flow_runs;
alter publication supabase_realtime add table public.automation_flow_events;

-- Seed the 6 Phase 1 flows so the configs table is queryable from day one.
-- Sender wiring lands later; the dashboard reads these as the source of truth
-- for which flows exist and what their default copy/delays are.
insert into public.automation_flow_configs (flow_key, name, description) values
  ('onboarding',        'New Doctor Onboarding',         'Triggered when finance confirms first payment. Sends qualification form + document upload request.'),
  ('profile_sent',      'Profile Sent to Hospital',      'Triggered when team clicks "send" on a doctor profile. Emails hospital(s) via BCC + notifies the doctor of the introduction.'),
  ('shortlist',         'Shortlist Confirmation',        'Triggered when hospital confirms a doctor is shortlisted. Notifies the doctor.'),
  ('interview',         'Interview Tips + Confirmation', 'Triggered when team marks interview confirmed. Sends interview tips + confirmation to the doctor.'),
  ('relocation',        'Relocation Guide + Attestation','Triggered when doctor signs offer. Sends city-specific relocation guide + attestation info.'),
  ('second_payment',    'Second Payment Invoice',        'Triggered 15 days after joining date. Sends payment link, then escalating reminders until paid.')
on conflict (flow_key) do nothing;

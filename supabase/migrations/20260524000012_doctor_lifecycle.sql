-- Phase 4 — Doctor Status Lifecycle.
--
-- One row per doctor capturing:
--   - Milestone timestamps along the pipeline (signed → joined → approved → paid)
--   - Sending eligibility (auto-flipped off on 'signed' per Saif's spec)
--   - Availability state (paused / pinging the team on a check-in date)
--
-- The DERIVED status (lead → shortlisted → interviewed → offered → contracted
-- → joined → paid) is computed in src/lib/doctor-status.ts by layering this
-- table over the automation_flow_runs. So this table doesn't store a status
-- string — it stores the FACTS the derivation reads. That keeps the source
-- of truth single (flow runs + lifecycle facts) and avoids drift.

create table if not exists public.doctor_lifecycle (
  doctor_id                 text primary key,           -- prefixed: lead:<id> or dob:<id>
  doctor_name               text,
  -- Milestone timestamps. Set explicitly by the team; "shortlisted_at" and
  -- "interviewed_at" are inferred from flow runs and not stored here.
  signed_at                 timestamptz,                -- contract signed (also written by boldsign-webhook)
  joined_at                 timestamptz,                -- hospital-confirmed joining date — fires 15d payment timer
  approved_at               timestamptz,                -- "joined + approved" — Slack channel can be archived
  paid_at                   timestamptz,                -- finance marked second payment received
  -- Sending eligibility: when a doctor is signed they shouldn't appear in
  -- the next profile batch. This is the auth flag the SendProfileDialog +
  -- PipelinePicker filter on.
  eligible_for_sending      boolean not null default true,
  -- Availability — "paused / silent" doctors that need re-confirming.
  unavailable               boolean not null default false,
  unavailable_reason        text,
  available_check_in_at     timestamptz,                -- system pings the team on this date
  last_availability_ping_at timestamptz,                -- last notification written by tick-scheduler
  notes                     text,
  updated_by                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists doctor_lifecycle_unavailable_idx
  on public.doctor_lifecycle (available_check_in_at)
  where unavailable = true;

create index if not exists doctor_lifecycle_eligible_idx
  on public.doctor_lifecycle (eligible_for_sending);

create index if not exists doctor_lifecycle_joined_idx
  on public.doctor_lifecycle (joined_at)
  where joined_at is not null;

create index if not exists doctor_lifecycle_pending_approval_idx
  on public.doctor_lifecycle (joined_at)
  where joined_at is not null and approved_at is null;

alter table public.doctor_lifecycle enable row level security;

drop policy if exists "service role full doctor_lifecycle" on public.doctor_lifecycle;
drop policy if exists "auth read doctor_lifecycle"         on public.doctor_lifecycle;
drop policy if exists "auth write doctor_lifecycle"        on public.doctor_lifecycle;

create policy "service role full doctor_lifecycle" on public.doctor_lifecycle for all to service_role using (true) with check (true);
create policy "auth read doctor_lifecycle"  on public.doctor_lifecycle for select to authenticated using (true);
create policy "auth write doctor_lifecycle" on public.doctor_lifecycle for all    to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.doctor_lifecycle;

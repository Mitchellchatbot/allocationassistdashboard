-- Placement attempts — one row per (doctor, hospital) pair.
--
-- Replaces the per-doctor `doctor_lifecycle` placement columns as the
-- source of truth for "where is this doctor in the pipeline at this
-- hospital?". The Hammad sheet has the same doctor appearing at
-- multiple hospitals (e.g. Anas Saleh shortlisted at Aman + MNGHA Taif
-- + Medcare + AH for orthopedics) and the per-doctor model couldn't
-- represent that.
--
-- Stored entirely in our portal — not connected to Zoho. Zoho is the
-- source for doctor + hospital identities (lead:<id> / dob:<id> /
-- hospitals row); placement_attempts is the per-pair journey.
--
-- doctor_lifecycle.* placement columns stay around for back-compat
-- (doctor-status badges, the 'Doctors on the way' card, etc.) and are
-- kept in sync via a forward trigger: when ANY attempt logs joined_at
-- the doctor's lifecycle gets the EARLIEST join date.

create table if not exists public.placement_attempts (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         text not null,                              -- lead:<id> / dob:<id> / csv:<slug> for imports
  doctor_name       text not null,
  doctor_specialty  text,                                       -- denormalised for fast listing
  hospital_id       uuid references public.hospitals(id) on delete set null,
  hospital_name     text not null,                              -- free text — CSV uses abbrevs like "AH", "STMC"

  -- Milestone dates (all nullable; team fills as the placement
  -- progresses). Same shape the Hammad sheet uses.
  shortlisted_at    timestamptz,
  interviewed_at    timestamptz,
  offered_at        timestamptz,
  signed_at         timestamptz,
  start_date        timestamptz,
  joined_at         timestamptz,
  paid_at           timestamptz,

  notes             text,
  -- Source: 'manual' / 'csv_import' / 'flow_run' so we can trace
  -- where a row came from.
  source            text not null default 'manual',
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One attempt per (doctor, hospital) pair. If the team somehow
  -- needs to track two separate attempts at the same hospital
  -- (e.g. role A in Feb then role B in Sep), they can edit notes
  -- — multi-attempt at the same hospital isn't a real pattern yet.
  unique (doctor_id, hospital_name)
);

create index if not exists placement_attempts_doctor_idx
  on public.placement_attempts (doctor_id);

create index if not exists placement_attempts_hospital_idx
  on public.placement_attempts (hospital_name);

create index if not exists placement_attempts_joined_idx
  on public.placement_attempts (joined_at)
  where joined_at is not null;

create index if not exists placement_attempts_invoice_due_idx
  on public.placement_attempts (joined_at)
  where joined_at is not null and paid_at is null;

alter table public.placement_attempts enable row level security;

drop policy if exists "service role full placement_attempts" on public.placement_attempts;
create policy "service role full placement_attempts"
  on public.placement_attempts for all to service_role using (true) with check (true);

drop policy if exists "auth read placement_attempts" on public.placement_attempts;
create policy "auth read placement_attempts"
  on public.placement_attempts for select to authenticated using (true);

drop policy if exists "auth write placement_attempts" on public.placement_attempts;
create policy "auth write placement_attempts"
  on public.placement_attempts for all to authenticated using (true) with check (true);

-- ── Sync forward to doctor_lifecycle ──────────────────────────────────
-- When a placement_attempt joins/signs/pays, propagate the EARLIEST
-- date among that doctor's attempts to doctor_lifecycle. This keeps
-- existing code (doctor-status, useDoctorLifecycleMap, Second Payment
-- flow trigger) working unchanged.

create or replace function public.sync_lifecycle_from_placement()
returns trigger
language plpgsql
as $$
declare
  earliest_joined  timestamptz;
  earliest_signed  timestamptz;
  earliest_paid    timestamptz;
  placement_hosp   text;
  placement_hosp_id uuid;
begin
  select min(joined_at), min(signed_at), min(paid_at)
    into earliest_joined, earliest_signed, earliest_paid
    from public.placement_attempts
   where doctor_id = new.doctor_id;

  -- Use the hospital from the row that holds the join date — that's
  -- the placement hospital. If no join yet, use the signed one. If
  -- neither, leave the placement hospital alone.
  select hospital_name, hospital_id
    into placement_hosp, placement_hosp_id
    from public.placement_attempts
   where doctor_id = new.doctor_id
     and (joined_at is not null or signed_at is not null)
   order by joined_at nulls last, signed_at nulls last
   limit 1;

  insert into public.doctor_lifecycle (doctor_id, doctor_name, joined_at, signed_at, paid_at,
                                       placement_hospital_id, placement_hospital_name,
                                       updated_at, updated_by)
  values (new.doctor_id, new.doctor_name, earliest_joined, earliest_signed, earliest_paid,
          placement_hosp_id, placement_hosp, now(), 'placement_attempts_trigger')
  on conflict (doctor_id) do update set
    joined_at                = coalesce(excluded.joined_at, doctor_lifecycle.joined_at),
    signed_at                = coalesce(excluded.signed_at, doctor_lifecycle.signed_at),
    paid_at                  = coalesce(excluded.paid_at,   doctor_lifecycle.paid_at),
    placement_hospital_id    = coalesce(excluded.placement_hospital_id,   doctor_lifecycle.placement_hospital_id),
    placement_hospital_name  = coalesce(excluded.placement_hospital_name, doctor_lifecycle.placement_hospital_name),
    -- mark_signed had a side effect: eligible_for_sending=false. Keep it.
    eligible_for_sending = case when excluded.signed_at is not null
                                then false
                                else doctor_lifecycle.eligible_for_sending end,
    updated_at = now();

  return new;
end $$;

drop trigger if exists trg_sync_lifecycle_from_placement on public.placement_attempts;
create trigger trg_sync_lifecycle_from_placement
after insert or update on public.placement_attempts
for each row execute function public.sync_lifecycle_from_placement();

comment on table public.placement_attempts is
  'Per-(doctor, hospital) placement journey. Each row is one attempt: shortlisted at hospital X, interviewed, offered, signed, joined, paid. Replaces Ammar Hammad sheet. Forward-trigger keeps doctor_lifecycle in sync (earliest join wins).';

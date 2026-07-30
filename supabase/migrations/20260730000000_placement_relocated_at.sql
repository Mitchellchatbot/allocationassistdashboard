-- Add `relocated_at` as a first-class placement milestone.
--
-- "Relocated" (the doctor has physically moved to the country and started)
-- was not recorded ANYWHERE: the relocation email flow reaching
-- `relocation_complete` wrote no date, so leadership reporting had no way
-- to count relocations. The Email Chain now gets an explicit "Mark
-- relocated" button (mirroring "Mark signed") that upserts
-- placement_attempts.relocated_at; the existing forward-trigger then
-- propagates the EARLIEST relocated date per doctor to doctor_lifecycle,
-- so reporting reads ONE source for both the imported sheet history and
-- new markings.

alter table public.placement_attempts
  add column if not exists relocated_at timestamptz;

alter table public.doctor_lifecycle
  add column if not exists relocated_at timestamptz;

create index if not exists placement_attempts_relocated_idx
  on public.placement_attempts (relocated_at)
  where relocated_at is not null;

-- Re-create the sync trigger function with relocated_at threaded through
-- alongside the existing 7 milestones (earliest non-null per doctor,
-- coalesced on conflict). The trigger itself (trg_sync_lifecycle_from_
-- placement, created in 20260603000013) keeps pointing at this function.
create or replace function public.sync_lifecycle_from_placement()
returns trigger
language plpgsql
as $$
declare
  earliest_shortlisted timestamptz;
  earliest_interviewed timestamptz;
  earliest_offered     timestamptz;
  earliest_signed      timestamptz;
  earliest_start       timestamptz;
  earliest_joined      timestamptz;
  earliest_relocated   timestamptz;
  earliest_paid        timestamptz;
  placement_hosp       text;
  placement_hosp_id    uuid;
begin
  select min(shortlisted_at), min(interviewed_at), min(offered_at),
         min(signed_at), min(start_date), min(joined_at), min(relocated_at), min(paid_at)
    into earliest_shortlisted, earliest_interviewed, earliest_offered,
         earliest_signed, earliest_start, earliest_joined, earliest_relocated, earliest_paid
    from public.placement_attempts
   where doctor_id = new.doctor_id;

  -- Placement hospital: row with the most-progressed milestone wins
  -- (joined > signed > offered > shortlisted).
  select hospital_name, hospital_id
    into placement_hosp, placement_hosp_id
    from public.placement_attempts
   where doctor_id = new.doctor_id
     and (joined_at is not null or signed_at is not null or offered_at is not null)
   order by joined_at nulls last, signed_at nulls last, offered_at nulls last
   limit 1;

  insert into public.doctor_lifecycle (
    doctor_id, doctor_name,
    shortlisted_at, interviewed_at, offered_at, signed_at,
    start_date, joined_at, relocated_at, paid_at,
    placement_hospital_id, placement_hospital_name,
    updated_at, updated_by
  )
  values (
    new.doctor_id, new.doctor_name,
    earliest_shortlisted, earliest_interviewed, earliest_offered, earliest_signed,
    earliest_start, earliest_joined, earliest_relocated, earliest_paid,
    placement_hosp_id, placement_hosp,
    now(), 'placement_attempts_trigger'
  )
  on conflict (doctor_id) do update set
    shortlisted_at           = coalesce(excluded.shortlisted_at, doctor_lifecycle.shortlisted_at),
    interviewed_at           = coalesce(excluded.interviewed_at, doctor_lifecycle.interviewed_at),
    offered_at               = coalesce(excluded.offered_at,     doctor_lifecycle.offered_at),
    signed_at                = coalesce(excluded.signed_at,      doctor_lifecycle.signed_at),
    start_date               = coalesce(excluded.start_date,     doctor_lifecycle.start_date),
    joined_at                = coalesce(excluded.joined_at,      doctor_lifecycle.joined_at),
    relocated_at             = coalesce(excluded.relocated_at,   doctor_lifecycle.relocated_at),
    paid_at                  = coalesce(excluded.paid_at,        doctor_lifecycle.paid_at),
    placement_hospital_id    = coalesce(excluded.placement_hospital_id,   doctor_lifecycle.placement_hospital_id),
    placement_hospital_name  = coalesce(excluded.placement_hospital_name, doctor_lifecycle.placement_hospital_name),
    eligible_for_sending     = case when excluded.signed_at is not null
                                    then false
                                    else doctor_lifecycle.eligible_for_sending end,
    updated_at = now();
  return new;
end $$;

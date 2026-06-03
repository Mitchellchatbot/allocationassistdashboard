-- Expand the placement_attempts → doctor_lifecycle sync trigger to
-- cover ALL milestone columns. The original only copied joined / signed
-- / paid; that left lifecycle.shortlisted_at / interviewed_at /
-- offered_at / start_date null for the 322 CSV-seeded rows, so:
--
--   - DoctorStatusBadge couldn't surface "Offered" status from
--     placement_attempts
--   - The 'Track placement' deep-link from the run sheet had no
--     existing data to show
--
-- This re-creates the trigger function with all 7 milestone columns
-- coalesced from the earliest non-null date across attempts.

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
  earliest_paid        timestamptz;
  placement_hosp       text;
  placement_hosp_id    uuid;
begin
  select min(shortlisted_at), min(interviewed_at), min(offered_at),
         min(signed_at), min(start_date), min(joined_at), min(paid_at)
    into earliest_shortlisted, earliest_interviewed, earliest_offered,
         earliest_signed, earliest_start, earliest_joined, earliest_paid
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
    start_date, joined_at, paid_at,
    placement_hospital_id, placement_hospital_name,
    updated_at, updated_by
  )
  values (
    new.doctor_id, new.doctor_name,
    earliest_shortlisted, earliest_interviewed, earliest_offered, earliest_signed,
    earliest_start, earliest_joined, earliest_paid,
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
    paid_at                  = coalesce(excluded.paid_at,        doctor_lifecycle.paid_at),
    placement_hospital_id    = coalesce(excluded.placement_hospital_id,   doctor_lifecycle.placement_hospital_id),
    placement_hospital_name  = coalesce(excluded.placement_hospital_name, doctor_lifecycle.placement_hospital_name),
    eligible_for_sending     = case when excluded.signed_at is not null
                                    then false
                                    else doctor_lifecycle.eligible_for_sending end,
    updated_at = now();
  return new;
end $$;

-- Backfill: re-run the trigger logic once for every distinct doctor
-- so the seeded rows propagate their dates into doctor_lifecycle.
-- We touch the FIRST attempt id per doctor (Postgres UPDATE doesn't
-- allow LIMIT, but a subquery does).
do $$
declare r record;
begin
  for r in
    select doctor_id, min(id::text) as min_id from public.placement_attempts group by doctor_id
  loop
    update public.placement_attempts
       set updated_at = now()
     where id = r.min_id::uuid;
  end loop;
end $$;

do $$
declare lifecycle_rows int;
begin
  select count(*) into lifecycle_rows from public.doctor_lifecycle
    where shortlisted_at is not null
       or interviewed_at is not null
       or offered_at is not null
       or signed_at is not null
       or joined_at is not null;
  raise notice '[trigger backfill] doctor_lifecycle rows with at least one milestone: %', lifecycle_rows;
end $$;

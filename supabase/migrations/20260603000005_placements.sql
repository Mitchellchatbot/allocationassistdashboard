-- Placements milestone tracking (Ammar 2026-06-03)
--
-- Replaces Ammar's external 'Hammad' Google sheet, which manually
-- tracked each placement through the milestones:
--
--   shortlisted → interviewed → offered → offer signed → start date
--   agreed → joined → paid
--
-- doctor_lifecycle already had signed_at / joined_at / approved_at /
-- paid_at. This migration adds the earlier milestones the team also
-- needs to track + the placement hospital (a doctor signs with ONE
-- hospital eventually; multiple flow runs may exist but only one
-- becomes a placement).
--
-- 45-day payment clock: starts on joined_at, target is joined_at + 45d.
-- paid_at closes it. The 'Placements due soon' KPI on Reports reads
-- (joined_at IS NOT NULL AND paid_at IS NULL AND joined_at < now() - 30d).

alter table public.doctor_lifecycle
  add column if not exists shortlisted_at        timestamptz,
  add column if not exists interviewed_at        timestamptz,
  add column if not exists offered_at            timestamptz,
  add column if not exists start_date            timestamptz,
  add column if not exists placement_hospital_id uuid references public.hospitals(id) on delete set null,
  add column if not exists placement_hospital_name text;

create index if not exists doctor_lifecycle_shortlisted_idx
  on public.doctor_lifecycle (shortlisted_at)
  where shortlisted_at is not null;

create index if not exists doctor_lifecycle_offered_idx
  on public.doctor_lifecycle (offered_at)
  where offered_at is not null;

create index if not exists doctor_lifecycle_placement_hospital_idx
  on public.doctor_lifecycle (placement_hospital_id)
  where placement_hospital_id is not null;

comment on column public.doctor_lifecycle.shortlisted_at         is 'Hospital confirmed shortlist (often by phone). Team logs date when confirmed.';
comment on column public.doctor_lifecycle.interviewed_at         is 'Interview happened. Distinct from the interview-run scheduled date.';
comment on column public.doctor_lifecycle.offered_at             is 'Hospital sent the offer letter to the doctor.';
comment on column public.doctor_lifecycle.start_date             is 'Agreed first-day at the hospital (planned). joined_at is the ACTUAL first day.';
comment on column public.doctor_lifecycle.placement_hospital_id  is 'The hospital this doctor placed with. Drives the per-hospital placement count.';
comment on column public.doctor_lifecycle.placement_hospital_name is 'Denormalised hospital name for cases where the placement hospital isn''t in the hospitals table yet.';

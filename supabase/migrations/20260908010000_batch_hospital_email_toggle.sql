-- Batches can now go to the hospitals, to the doctors (working-opportunity
-- note), or to both. include_doctor_email already existed; this is its
-- counterpart. Defaults to true so every existing row keeps sending the
-- hospital email exactly as it does today.
alter table public.scheduled_batch_sends
  add column if not exists include_hospital_email boolean not null default true;

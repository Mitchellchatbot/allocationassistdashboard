-- Hospital website URL. Used as the per-hospital link in the doctor
-- "working opportunity" email (the hospital name becomes a link to its site),
-- and editable in the Hospitals admin.
alter table public.hospitals
  add column if not exists website text;

comment on column public.hospitals.website is
  'Hospital website URL. Rendered as the hospital''s link in the doctor working-opportunity email (buildDoctorHospitalsHtml). Optional.';

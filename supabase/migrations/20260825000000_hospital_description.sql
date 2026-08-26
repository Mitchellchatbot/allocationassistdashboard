-- Hospital description / "About Us" blurb. Rendered per-hospital in the doctor
-- "working opportunity" email (buildDoctorHospitalsHtml) beneath the hospital
-- name + About Us link, above its photo. Editable in the Hospitals admin tab.
-- Team feedback: "for each working opportunity, provide detailed information,
-- including: Hospital description, About Us link, Hospital photo."
alter table public.hospitals
  add column if not exists description text;

comment on column public.hospitals.description is
  'Short hospital description / "About Us" blurb shown in the doctor working-opportunity email (buildDoctorHospitalsHtml). Optional.';

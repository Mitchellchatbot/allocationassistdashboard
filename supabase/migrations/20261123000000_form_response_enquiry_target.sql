-- Who a Doctors Finder enquiry was actually about.
--
-- The doctorsfinder.com forms never ask. A patient opens a doctor's profile,
-- the enquiry form sits on that page, and the only trace of WHICH doctor is
-- the page the form was submitted from:
--
--   https://doctorsfinder.com/doctor/dr-vera-korol/      -> doctor
--   https://doctorsfinder.com/hospital/clemenceau-.../   -> hospital
--
-- So the target is parsed out of that URL at write time (webhook and CSV
-- backfill both, via enquiry-target.ts) and stored here rather than re-parsed
-- on every render. Deliberately NOT folded into the existing doctor_id column:
-- that holds AA's own `lead:<id>` / `dob:<id>` namespace and answers "which of
-- our doctors SENT this", a different question about a different population.
-- A Doctors Finder profile is a public website listing that usually has no AA
-- record at all.
--
-- Nullable on purpose. A third of the older form's submissions arrived from a
-- blog post or with no referrer at all, and the team decided against adding a
-- hidden field to the forms - so "we don't know" is a real, permanent answer
-- and the dashboard has to show it as one rather than guess.

alter table public.form_responses
  add column if not exists target_kind text,
  add column if not exists target_slug text,
  add column if not exists target_name text;

comment on column public.form_responses.target_kind is
  'What the enquiry was about: ''doctor'' | ''hospital''. Null when the submission carried no identifying page URL.';
comment on column public.form_responses.target_slug is
  'Stable identity of that profile, from the URL path (e.g. ''dr-vera-korol''). Group by this, never by target_name.';
comment on column public.form_responses.target_name is
  'Display name derived from the slug (e.g. ''Dr Vera Korol''). Presentation only - a hyphenated surname does not survive the round trip.';

-- The per-doctor roll-up is the whole point of the section, so it gets the
-- index. Partial: most form_responses rows are not Doctors Finder enquiries.
create index if not exists form_responses_target_slug_idx
  on public.form_responses (target_slug, submitted_at desc)
  where target_slug is not null;

-- Denormalise form_id onto staged_doctor_profiles so the staging-area
-- preview dialog can build a /jotform-file-proxy URL for the picture
-- without a second round-trip to form_responses. Was hitting raw
-- JotForm /widget-uploads/imagepreview/ URLs which return an HTML
-- wrapper page when fetched without APIKEY auth — the browser <img>
-- tag was rendering the wrapper, not the JPG.

alter table public.staged_doctor_profiles
  add column if not exists form_id uuid references public.forms(id) on delete set null;

create index if not exists staged_doctor_profiles_form_id_idx
  on public.staged_doctor_profiles (form_id);

-- Backfill: pull form_id from each row's source_response_id.
update public.staged_doctor_profiles s
   set form_id = fr.form_id
  from public.form_responses fr
 where s.form_id is null
   and s.source_response_id = fr.id;

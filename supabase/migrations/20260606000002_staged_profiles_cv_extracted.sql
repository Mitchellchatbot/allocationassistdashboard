-- Track CV-extracted fields directly on staged profiles so the
-- Publish action can merge them into the WP upsert without having to
-- re-query cv_uploads. Filled by cv-extract when the cv_uploads row's
-- doctor_id starts with `staged:<id>` — see cv-extract handler.
--
-- jsonb so the shape stays flexible as we add more extraction fields.
-- Null until the CV finishes processing; the StagedRow Publish handler
-- merges (staged.acf ⊕ staged.extracted_cv_data) when it fires.

alter table public.staged_doctor_profiles
  add column if not exists extracted_cv_data jsonb,
  add column if not exists cv_upload_id      uuid references public.cv_uploads(id) on delete set null;

create index if not exists staged_doctor_profiles_cv_upload_idx
  on public.staged_doctor_profiles(cv_upload_id);

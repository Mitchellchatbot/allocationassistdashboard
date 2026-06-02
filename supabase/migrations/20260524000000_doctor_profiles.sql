-- Phase 2 — Doctor Profiles.
-- Stores the per-doctor fields Saif's profile_sent_hospital template needs
-- that don't exist in Zoho (title, bio, area of interest, years experience,
-- license/status, salary expectation, notice period, marital + family status,
-- etc.). Keyed by `doctor_id` so it links to whichever Zoho record (DoB or
-- Lead) the doctor lives under — same id format used by DoctorPicker
-- (`dob:<id>` or `lead:<id>`).

create table if not exists public.doctor_profiles (
  doctor_id           text primary key,
  -- Denormalised so the profile list can be searched without round-tripping
  -- through Zoho. Kept in sync via the editor whenever a profile is saved.
  doctor_name         text,
  -- Title and Specialty per the UAE license — e.g. "Consultant Pediatrician"
  title               text,
  -- Long-form bio paragraph that appears above the table in Saif's template.
  bio                 text,
  -- Comma-separated areas of interest, e.g. "Endourology, Robotic Surgery"
  area_of_interest    text,
  country_training    text,                  -- e.g. "German Board", "UK Trained"
  years_experience    int,
  nationality         text,
  age                 int,
  marital_status      text,                  -- "Married", "Single", "Divorced"
  family_status       text,                  -- "2 Children", "—", etc.
  license             text,                  -- "DHA Registration", "SCFHS in process"
  salary_expectation  text,                  -- "Market Range" or "80,000 AED"
  notice_period       text,                  -- "2 months", "Immediate"
  languages           text,                  -- comma-separated, e.g. "English, Arabic"
  cv_url              text,                  -- future: link to uploaded CV
  reg_docs_url        text,                  -- future: link to registration docs
  notes               text,                  -- internal notes, not used in emails
  completed           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          text
);

create index if not exists doctor_profiles_name_idx     on public.doctor_profiles (doctor_name);
create index if not exists doctor_profiles_complete_idx on public.doctor_profiles (completed);

alter table public.doctor_profiles enable row level security;

-- Idempotent policy creation (Postgres <16 has no `create policy if not exists`).
drop policy if exists "service role full doctor_profiles" on public.doctor_profiles;
drop policy if exists "auth read doctor_profiles"        on public.doctor_profiles;
drop policy if exists "auth write doctor_profiles"       on public.doctor_profiles;
drop policy if exists "auth update doctor_profiles"      on public.doctor_profiles;
drop policy if exists "auth delete doctor_profiles"      on public.doctor_profiles;

create policy "service role full doctor_profiles" on public.doctor_profiles for all to service_role using (true) with check (true);
create policy "auth read doctor_profiles"        on public.doctor_profiles for select to authenticated using (true);
create policy "auth write doctor_profiles"       on public.doctor_profiles for insert to authenticated with check (true);
create policy "auth update doctor_profiles"      on public.doctor_profiles for update to authenticated using (true) with check (true);
create policy "auth delete doctor_profiles"      on public.doctor_profiles for delete to authenticated using (true);

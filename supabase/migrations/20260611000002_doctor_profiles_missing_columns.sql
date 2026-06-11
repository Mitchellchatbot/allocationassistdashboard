-- doctor_profiles was missing several columns that cv-extract's
-- `fieldsToCopy` writes: specialty, subspecialty, current_location and
-- english_level. PostgREST rejects a write to an unknown column (42703)
-- and fails the WHOLE upsert — so any CV that yielded a specialty (i.e.
-- almost every doctor CV) silently lost its entire doctor_profiles mirror
-- write. That left the batch email's profile fallback empty for doctors
-- without a Zoho match or matching WP email. Add the columns so the mirror
-- populates and can be used as a fallback source.
alter table public.doctor_profiles
  add column if not exists specialty        text,
  add column if not exists subspecialty     text,
  add column if not exists current_location text,
  add column if not exists english_level    text;

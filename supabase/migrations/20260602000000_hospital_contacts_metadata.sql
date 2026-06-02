-- Richer recipient metadata per hospital, from Saif's master list 2026-06-02.
--
-- A single primary_recruiter_email column wasn't enough — the real list has:
--   * CC recipients (often 3–10 per hospital)
--   * "Stop sending" flags (relationship paused)
--   * Specialty restrictions ("only Ophthalmology", "don't send Nephrology")
--   * Per-hospital owner on the HI team (Rodaina/Mohamed/Sohaila/Ishak)
--   * Custom greeting line ("Hello Ms. Sandra and the team!")
--
-- We extend `hospitals` rather than adding a side table because the values
-- are 1:1 with hospital rows. For hospitals with multiple recipient *groups*
-- (e.g. NMC Dubai vs NMC AUH, Mediclinic separate emails per branch), we
-- create separate hospital rows.

alter table public.hospitals
  add column if not exists cc_emails         text[]   not null default '{}',
  add column if not exists active            boolean  not null default true,
  add column if not exists owner_email       text,                       -- HI team member who owns this relationship
  add column if not exists greeting          text,                       -- "Hello Mr. Hari!" — used in the email template
  add column if not exists specialty_only    text[]   not null default '{}',  -- if non-empty, ONLY send these specialties
  add column if not exists specialty_skip    text[]   not null default '{}'; -- never send these specialties

-- Indexes for the common query patterns: active filter + owner filter.
create index if not exists hospitals_active_idx on public.hospitals (active) where active = true;
create index if not exists hospitals_owner_idx  on public.hospitals (owner_email);

-- Staging area for doctor profiles that aren't ready to live on WordPress
-- yet. The JotForm "Create WP profile" flow used to write straight to
-- wordpress_candidates via the upsert edge function; now it lands here
-- first so the team can review/edit/discard before anything goes public.
--
-- Flow:
--   1. Form submission comes in → "Create WP profile" inserts a row here.
--   2. HI team reviews on the Profiles tab — edits any field.
--   3. Click "Save as WP draft" → wordpress-candidate-upsert with
--      status="draft", row removed from this table.
--   4. Click "Publish to WP" → wordpress-candidate-upsert with
--      status="publish", row removed.
--   5. Click "Delete" → row removed, nothing touches WP.
create table if not exists public.staged_doctor_profiles (
  id                  uuid primary key default gen_random_uuid(),
  -- Where it came from. 'jotform' = filled in from a form_response;
  -- 'manual' = team typed it from scratch (future use).
  source              text not null default 'jotform',
  source_response_id  uuid references public.form_responses(id) on delete set null,
  -- The flattened "easy" fields for list rendering + search.
  full_name           text,
  email               text,
  phone               text,
  specialty           text,
  subspecialty        text,
  nationality         text,
  job_title           text,
  current_location    text,
  country_of_training text,
  years_experience    text,
  -- The full WP-ACF payload — same shape the upsert edge function
  -- consumes — so publishing is a one-shot pass-through.
  acf                 jsonb not null default '{}'::jsonb,
  -- Who staged it + who's reviewing.
  created_by          text,
  -- Audit trail.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Tiny indexes for the list view + dedupe-on-email lookups.
create index if not exists idx_staged_doctor_profiles_email
  on public.staged_doctor_profiles(lower(email));
create index if not exists idx_staged_doctor_profiles_response
  on public.staged_doctor_profiles(source_response_id);
create index if not exists idx_staged_doctor_profiles_created_at
  on public.staged_doctor_profiles(created_at desc);

alter table public.staged_doctor_profiles enable row level security;

-- Anyone authenticated can manage staged profiles — same level of
-- access as the WP candidates table itself (HI team are admins/sales
-- here; locked down further if we ever expose this to outside roles).
create policy "staged profiles: authenticated read"
  on public.staged_doctor_profiles for select
  to authenticated using (true);

create policy "staged profiles: authenticated write"
  on public.staged_doctor_profiles for all
  to authenticated using (true) with check (true);

-- Realtime so the staging section flips live when a new submission
-- lands or a teammate publishes one.
alter publication supabase_realtime add table public.staged_doctor_profiles;

-- Touch updated_at on edit so the list can sort by recency naturally.
create or replace function public.touch_staged_doctor_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_staged_doctor_profiles_updated_at on public.staged_doctor_profiles;
create trigger trg_staged_doctor_profiles_updated_at
before update on public.staged_doctor_profiles
for each row execute function public.touch_staged_doctor_profiles_updated_at();

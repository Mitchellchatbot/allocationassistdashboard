-- Mirror of the WordPress "candidate" custom post type from
-- allocationassist.com. Pulled via the WP REST API + ACF fields by the
-- wordpress-candidates-sync edge function.
--
-- The CPT holds AA's curated doctor profiles (~1,243 rows) — login-
-- gated on the public site so only hospitals/AA staff can read them.
-- Mirroring them into our portal lets HI search + cross-reference
-- without bouncing between dashboards.
--
-- Identity: the WP post ID is the primary key. doctor_id (optional)
-- links each candidate to an existing AA lead / DoB once name-matched.

create table if not exists public.wordpress_candidates (
  id                  integer primary key,
  wp_slug             text not null,
  wp_link             text not null,
  status              text,
  title               text,

  -- Flattened ACF fields most relevant for HI search + matching.
  full_name           text,
  job_title           text,
  email               text,
  phone               text,
  date_of_birth       text,
  nationality         text,
  specialty           text,
  subspecialty        text,
  area_of_interest    text,
  years_experience    integer,
  license_status      text,
  license_types       text[],
  family_status       text,
  has_dependents      boolean,
  country_of_training text,
  current_location    text,
  rank                text,                          -- specialist / consultant
  languages           text,
  english_level       text,
  current_salary      text,
  expected_salary     text,
  notice_period       text,
  targeted_locations  text[],
  cv_url              text,

  -- Linkage to existing AA roster — set manually or by the periodic
  -- name-matcher. Prefixed lead:<id> / dob:<id> like everywhere else.
  doctor_id           text,

  -- Full ACF blob in case we need a field later that's not flattened above.
  raw_acf             jsonb,

  -- Sync metadata
  wp_date             timestamptz,
  wp_modified         timestamptz,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists wordpress_candidates_specialty_idx on public.wordpress_candidates (specialty);
create index if not exists wordpress_candidates_status_idx    on public.wordpress_candidates (status);
create index if not exists wordpress_candidates_doctor_idx    on public.wordpress_candidates (doctor_id)
  where doctor_id is not null;
create index if not exists wordpress_candidates_email_idx     on public.wordpress_candidates (email)
  where email is not null;

alter table public.wordpress_candidates enable row level security;

drop policy if exists "service role full wordpress_candidates" on public.wordpress_candidates;
drop policy if exists "auth read wordpress_candidates"         on public.wordpress_candidates;
drop policy if exists "auth write wordpress_candidates"        on public.wordpress_candidates;

create policy "service role full wordpress_candidates" on public.wordpress_candidates for all to service_role using (true) with check (true);
create policy "auth read wordpress_candidates"         on public.wordpress_candidates for select to authenticated using (true);
create policy "auth write wordpress_candidates"        on public.wordpress_candidates for all to authenticated using (true) with check (true);

comment on table public.wordpress_candidates is 'Mirror of the AA WordPress "candidate" CPT. Synced via wordpress-candidates-sync edge function on demand.';

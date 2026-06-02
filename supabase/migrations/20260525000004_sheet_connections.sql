-- Sheet connections: paste a Google Sheets URL, system fetches it on a
-- schedule and parses into the right table. Lets the team keep editing in
-- Google Sheets (which they're used to) without ever touching the dashboard
-- importer manually.
--
-- target_kind decides which parser runs:
--   hospitals            → hospitals table (upsert by name)
--   vacancies            → vacancies table (insert)
--   unavailable_doctors  → doctor_lifecycle with fuzzy Zoho name match
--   placements           → doctor_lifecycle milestones (signed/joined/paid)
--   source_overrides     → lead_source_overrides
--   hospital_templates   → email_templates + hospitals.template_key

create table if not exists public.sheet_connections (
  id                uuid primary key default gen_random_uuid(),
  label             text not null,
  sheet_url         text not null,                        -- raw URL the user pastes
  csv_url           text not null,                        -- normalised CSV export URL
  target_kind       text not null check (target_kind in (
    'hospitals', 'vacancies', 'unavailable_doctors',
    'placements', 'source_overrides', 'hospital_templates'
  )),
  active            boolean not null default true,
  schedule_minutes  int not null default 60,              -- how often the auto-sync sweep should refresh
  last_synced_at    timestamptz,
  last_error        text,
  last_summary      jsonb,                                -- { created, updated, skipped, unmatched }
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sheet_connections_active_idx on public.sheet_connections (active);
create index if not exists sheet_connections_kind_idx   on public.sheet_connections (target_kind);

alter table public.sheet_connections enable row level security;

drop policy if exists "service role full sheet_connections" on public.sheet_connections;
drop policy if exists "auth read sheet_connections"         on public.sheet_connections;
drop policy if exists "auth write sheet_connections"        on public.sheet_connections;

create policy "service role full sheet_connections" on public.sheet_connections for all to service_role using (true) with check (true);
create policy "auth read sheet_connections"  on public.sheet_connections for select to authenticated using (true);
create policy "auth write sheet_connections" on public.sheet_connections for all    to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.sheet_connections;

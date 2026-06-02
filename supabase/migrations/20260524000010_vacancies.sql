-- Phase 3 — Vacancy Management.
--
-- A vacancy is "this hospital is actively looking to hire X specialty within N
-- days". The Hospital Introduction Team logs them; the Sales team needs to
-- see them when talking to incoming doctors; and the system auto-matches
-- newly onboarded doctors against open vacancies.
--
-- Source: meeting with Saif Ullah, May 20 2026, Phase 3 of the spec.

create table if not exists public.vacancies (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid references public.hospitals(id) on delete set null,
  hospital_name   text not null,                              -- denormalised so list views don't N+1
  specialty       text not null,
  priority        text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  -- "needs filled within N days". Combined with opened_at to compute days
  -- remaining in the UI. Optional — a vacancy can stay open indefinitely.
  target_fill_days int,
  status          text not null default 'open' check (status in ('open', 'filled', 'closed')),
  -- When status flips to 'filled', record which doctor took the slot so the
  -- vacancy view can show "filled by Dr. X".
  filled_by_doctor_id   text,
  filled_by_doctor_name text,
  notes           text,
  opened_by       text,                                       -- user email or display name
  opened_at       timestamptz not null default now(),
  filled_at       timestamptz,
  closed_at       timestamptz,
  -- Track the last time the system pinged the opener to follow up. The
  -- tick-scheduler uses this to fire a 3-day reminder after opened_at and
  -- skip vacancies that have already been chased.
  last_followup_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists vacancies_status_idx    on public.vacancies (status);
create index if not exists vacancies_specialty_idx on public.vacancies (specialty);
create index if not exists vacancies_hospital_idx  on public.vacancies (hospital_id);
create index if not exists vacancies_opened_idx    on public.vacancies (opened_at desc);

-- Lead ↔ vacancy linking. A single doctor lead can be considered for multiple
-- vacancies, and the same vacancy can be in-flight with multiple candidates.
create table if not exists public.vacancy_lead_links (
  id           uuid primary key default gen_random_uuid(),
  vacancy_id   uuid not null references public.vacancies(id) on delete cascade,
  doctor_id    text not null,                                 -- zoho lead id
  doctor_name  text not null,
  doctor_speciality text,
  linked_by    text,
  linked_at    timestamptz not null default now(),
  -- Optional: which flow run advanced the doctor against this vacancy.
  run_id       uuid references public.automation_flow_runs(id) on delete set null,
  unique (vacancy_id, doctor_id)
);

create index if not exists vacancy_links_doctor_idx   on public.vacancy_lead_links (doctor_id);
create index if not exists vacancy_links_vacancy_idx  on public.vacancy_lead_links (vacancy_id);

alter table public.vacancies          enable row level security;
alter table public.vacancy_lead_links enable row level security;

drop policy if exists "service role full vacancies"          on public.vacancies;
drop policy if exists "auth read vacancies"                  on public.vacancies;
drop policy if exists "auth write vacancies"                 on public.vacancies;
drop policy if exists "service role full vacancy_lead_links" on public.vacancy_lead_links;
drop policy if exists "auth read vacancy_lead_links"         on public.vacancy_lead_links;
drop policy if exists "auth write vacancy_lead_links"        on public.vacancy_lead_links;

-- Service role: full access (edge functions).
create policy "service role full vacancies"          on public.vacancies          for all to service_role using (true) with check (true);
create policy "service role full vacancy_lead_links" on public.vacancy_lead_links for all to service_role using (true) with check (true);
-- Authenticated users: full read + write for now. Same posture as the rest of
-- the dashboard tables — we don't have per-team RBAC yet.
create policy "auth read vacancies"   on public.vacancies for select to authenticated using (true);
create policy "auth write vacancies"  on public.vacancies for all    to authenticated using (true) with check (true);
create policy "auth read vacancy_lead_links"  on public.vacancy_lead_links for select to authenticated using (true);
create policy "auth write vacancy_lead_links" on public.vacancy_lead_links for all    to authenticated using (true) with check (true);

-- Realtime: list views auto-refresh when a teammate opens a vacancy.
alter publication supabase_realtime add table public.vacancies;
alter publication supabase_realtime add table public.vacancy_lead_links;

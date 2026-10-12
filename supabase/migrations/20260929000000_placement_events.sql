-- One row per logged line, so a repeat event stops being lost.
--
-- placement_attempts holds a journey: one row per doctor+hospital, with a
-- single date per stage. The weekly report counts every line the team logs,
-- and a doctor is regularly put forward at the same hospital more than once
-- (Aamer Alhamwi interviewed at AHD four times, Judit Konya at AH three
-- times). The journey row can only keep one interviewed_at, so the rest were
-- dropped on import: 811 interview lines in the 2026 workbook against 671
-- distinct doctor+hospital pairs — 140 lines with nowhere to go. That is the
-- whole of the ~137-interview shortfall between the sheets and the dashboard.
--
-- placement_events keeps every line. placement_attempts keeps doing its job
-- (the journey, behind the doctor and hospital views); reporting counts events.
--
-- Two things the reports need that a journey row cannot carry:
--
--   rep      Each block in the sheet is one rep's weekly submission, and the
--            hospital name alone cannot say whose: "Saudi German Hospital" is
--            on both Sohaila's and Ishak's lists, and SKMC / NMC / Mediclinic /
--            KCH / FUH each sit under two reps. hospitals.owner_email (see
--            20260911000000_hospital_rep_assignment.sql) answers it for a
--            hospital, but not for those shared names — so the rep belongs to
--            the line. The same doctor+hospital logged by two reps is
--            deliberately two events, which is the rule the team confirmed.
--
--   week_ending
--            The team's week runs Sunday–Saturday and is named after the
--            Saturday. Reporting groups by that, never by the calendar month
--            of the date: checked against the tracker across nine months,
--            Sunday–Saturday scored a total error of 149 where every
--            alternative scored 240–264.

create table if not exists public.placement_events (
  id           uuid        primary key default gen_random_uuid(),
  attempt_id   uuid        not null references public.placement_attempts(id) on delete cascade,
  stage        text        not null check (stage in ('shortlisted','interviewed','offered','signed','joined')),
  occurred_at  date        not null,
  -- The Saturday ending the Sunday–Saturday week that holds occurred_at.
  week_ending  date        generated always as
                 ((occurred_at + ((6 - extract(dow from occurred_at))::int))::date) stored,
  -- Whose weekly block the line came from. 'unknown' rather than null, so the
  -- uniqueness rule below still tells two reps' lines apart.
  rep          text        not null default 'unknown',
  country      text,                       -- 'UAE' | 'KSA/Qatar'
  source_file  text,
  source_line  int,
  batch        uuid,                       -- the import that wrote it; null if hand-made
  created_at   timestamptz not null default now()
);

-- Re-importing a sheet must not double-count, so one line is one
-- (journey, stage, date, rep). Two reps logging the same doctor+hospital on
-- the same day stay two events on purpose.
create unique index if not exists placement_events_line_idx
  on public.placement_events (attempt_id, stage, occurred_at, rep);

create index if not exists placement_events_week_idx    on public.placement_events (week_ending, stage);
create index if not exists placement_events_attempt_idx on public.placement_events (attempt_id);
create index if not exists placement_events_batch_idx   on public.placement_events (batch);

alter table public.placement_events enable row level security;

drop policy if exists "service role full placement_events" on public.placement_events;
create policy "service role full placement_events"
  on public.placement_events for all to service_role using (true) with check (true);

drop policy if exists "auth read placement_events" on public.placement_events;
create policy "auth read placement_events"
  on public.placement_events for select to authenticated using (true);

drop policy if exists "auth write placement_events" on public.placement_events;
create policy "auth write placement_events"
  on public.placement_events for all to authenticated using (true) with check (true);

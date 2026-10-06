-- The reporting calendar changes on 1 September 2026.
--
-- Until then the team counted a Sunday–Saturday week, named after its
-- Saturday, and a month made of whole such weeks. From September they count
-- calendar months, 1st to last day, and a Monday–Sunday week that never
-- crosses a month end: when the 1st is a Tuesday that month's first week runs
-- Tue 1 → Sun 6, and the last week stops on the last day of the month.
--
-- History keeps the old rule, so every figure the team has already published
-- stays as published. That makes week_ending a two-regime expression rather
-- than one formula.
--
-- A generated column's expression cannot be altered in place, so the column is
-- dropped and re-added; re-adding a STORED generated column recomputes it for
-- every existing row. placement_events_week_idx depends on the column and is
-- dropped with it, so it is recreated here too.
--
-- Mirrors weekEndingOf() in src/lib/placement-reporting.ts — change both or
-- neither.

alter table public.placement_events drop column if exists week_ending;

alter table public.placement_events
  add column week_ending date generated always as (
    case
      when occurred_at < date '2026-09-01'
        -- Saturday closing the Sunday–Saturday week (dow: 0 = Sunday), but
        -- never past the seam: the week opening Sunday 30 August 2026 used to
        -- close on Saturday 5 September, and those days are now September's.
        then least(
          (occurred_at + ((6 - extract(dow from occurred_at))::int))::date,
          date '2026-08-31'
        )
      else
        -- The following Sunday, or the month end, whichever comes first.
        -- isodow: 1 = Monday … 7 = Sunday, so a Sunday stays where it is.
        least(
          (occurred_at + ((7 - extract(isodow from occurred_at))::int))::date,
          (date_trunc('month', occurred_at::timestamp) + interval '1 month' - interval '1 day')::date
        )
    end
  ) stored;

create index if not exists placement_events_week_idx
  on public.placement_events (week_ending, stage);

comment on column public.placement_events.week_ending is
  'Last day of the week holding occurred_at: the Saturday of a Sunday-Saturday week before 2026-09-01, otherwise the following Sunday capped at the month end.';

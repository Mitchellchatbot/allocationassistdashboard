-- Back to a Sunday–Saturday week, cut at the month end.
--
-- 20261006000000 made the post-September week run Monday–Sunday. The team
-- counts Sunday–Saturday, as they always have; what changed on 1 September
-- 2026 is only that a week is no longer allowed to carry one month's days into
-- another. So October 2026, which opens on a Thursday, starts with the short
-- week Thu 1 – Sat 3, and the next is the whole Sun 4 – Sat 10.
--
-- Both branches now close a week on its Saturday. They differ only in the cap:
-- before the switch a week could run past the month end (that is the whole
-- weeks rule the team's published figures use) and is held back only at the
-- seam; from the switch it stops at the last day of its own month.
--
-- Mirrors weekEndingOf() in src/lib/placement-reporting.ts — change both or
-- neither.

alter table public.placement_events drop column if exists week_ending;

alter table public.placement_events
  add column week_ending date generated always as (
    -- The Saturday closing the week. dow: 0 = Sunday, 6 = Saturday.
    least(
      (occurred_at + ((6 - extract(dow from occurred_at))::int))::date,
      case
        -- Before the switch, only the seam holds a week back: the week opening
        -- Sunday 30 August 2026 used to close on Saturday 5 September, and
        -- those days are now September's.
        when occurred_at < date '2026-09-01' then date '2026-08-31'
        -- From it, a week stops at the end of its own month.
        else (date_trunc('month', occurred_at::timestamp) + interval '1 month' - interval '1 day')::date
      end
    )
  ) stored;

create index if not exists placement_events_week_idx
  on public.placement_events (week_ending, stage);

comment on column public.placement_events.week_ending is
  'Saturday closing the Sunday-Saturday week holding occurred_at, capped at the month end from 2026-09-01 (and at 2026-08-31 for the seam week).';

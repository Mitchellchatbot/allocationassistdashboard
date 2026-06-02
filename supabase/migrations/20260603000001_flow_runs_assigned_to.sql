-- ── Assignment columns for automation_flow_runs ─────────────────────────
-- `created_by` records who triggered a run. `assigned_to` records who's
-- responsible for taking the NEXT action — the two diverge once a run is
-- handed between teammates (e.g. Rodaina starts a profile_sent run, hands
-- off to Mohamed when the hospital's owner picks it up).
--
-- Queue queries (Approval Queues tab, My Workspace) index on
-- (assigned_to, status, current_stage) to filter "rows waiting on me".

alter table public.automation_flow_runs
  add column if not exists assigned_to    text,
  add column if not exists reassigned_at  timestamptz,
  add column if not exists reassigned_by  text;

create index if not exists automation_flow_runs_assigned_to_idx
  on public.automation_flow_runs (assigned_to)
  where assigned_to is not null;

create index if not exists automation_flow_runs_assigned_status_stage_idx
  on public.automation_flow_runs (assigned_to, status, current_stage);

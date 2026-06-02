-- Phase 5 — Reporting needs to attribute each flow action to the Hospital
-- Introduction Team member who triggered it (so the dashboard can show
-- "Rodina shortlisted 12 doctors this week"). Adding created_by + indexing
-- it; backfilling nulls is fine — pre-existing runs just don't roll up to
-- a specific person.

alter table public.automation_flow_runs
  add column if not exists created_by text;

create index if not exists automation_flow_runs_created_by_idx
  on public.automation_flow_runs (created_by)
  where created_by is not null;

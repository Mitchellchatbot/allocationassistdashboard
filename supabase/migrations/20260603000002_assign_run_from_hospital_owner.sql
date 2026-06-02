-- ── Auto-assign new flow runs to the hospital's owner ──────────────────
-- When a row is inserted with assigned_to NULL, the trigger looks up the
-- hospital (matched by name, case-insensitive) and stamps the owner. If
-- the hospital has no owner_email, falls back to created_by so runs
-- always have someone to point at.

create or replace function public.assign_run_from_hospital_owner()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_to is not null then
    return new;
  end if;

  if new.hospital is not null and length(trim(new.hospital)) > 0 then
    select h.owner_email into new.assigned_to
    from public.hospitals h
    where lower(h.name) = lower(new.hospital)
    order by h.updated_at desc
    limit 1;
  end if;

  if new.assigned_to is null then
    new.assigned_to := new.created_by;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_run_from_hospital_owner on public.automation_flow_runs;

create trigger trg_assign_run_from_hospital_owner
  before insert on public.automation_flow_runs
  for each row
  execute function public.assign_run_from_hospital_owner();

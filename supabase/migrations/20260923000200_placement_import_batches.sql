-- Apply a sheet import in one step, and be able to undo it.
--
-- The importer wrote from the browser in 500-row chunks: a failure halfway
-- left half an import behind, with no record of what had changed and no way
-- back. apply_placement_import does the whole thing inside one function call
-- (so one transaction) and copies every row it is about to change into
-- placement_import_log first. undo_placement_import puts them back.
--
-- The doctor_lifecycle sync trigger is off for the duration. An import is
-- months of history: it must not push old signed/joined dates onto a doctor's
-- summary row, where the scheduler would read them as fresh events and start
-- "On the way" or payment-overdue alerts. Syncing lifecycle stays a separate,
-- deliberate action.

create table if not exists public.placement_import_log (
  batch      uuid        not null,
  op         text        not null,          -- 'insert' (row added) | 'update' (row changed)
  row_id     uuid        not null,
  old_row    jsonb,                         -- the row before this import; null for inserts
  label      text,                          -- the file names, so a person can recognise the import
  created_by text,
  logged_at  timestamptz not null default now()
);

create index if not exists placement_import_log_batch_idx on public.placement_import_log (batch);

alter table public.placement_import_log enable row level security;

drop policy if exists "service role full placement_import_log" on public.placement_import_log;
create policy "service role full placement_import_log"
  on public.placement_import_log for all to service_role using (true) with check (true);

drop policy if exists "auth read placement_import_log" on public.placement_import_log;
create policy "auth read placement_import_log"
  on public.placement_import_log for select to authenticated using (true);

-- p_inserts: whole rows to add. p_updates: [{ id, merged: {stage: date|null}, notes }].
create or replace function public.apply_placement_import(
  p_inserts jsonb default '[]'::jsonb,
  p_updates jsonb default '[]'::jsonb,
  p_label   text  default null
)
returns table (batch uuid, inserted int, updated int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_ins   int  := 0;
  v_upd   int  := 0;
  v_email text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  alter table public.placement_attempts disable trigger trg_sync_lifecycle_from_placement;

  -- 1 · keep the rows an update is about to overwrite
  insert into public.placement_import_log (batch, op, row_id, old_row, label, created_by)
  select v_batch, 'update', p.id, to_jsonb(p), p_label, v_email
  from jsonb_array_elements(p_updates) u
  join public.placement_attempts p on p.id = (u ->> 'id')::uuid;

  -- 2 · apply them
  update public.placement_attempts p
  set shortlisted_at = (u -> 'merged' ->> 'shortlisted_at')::timestamptz,
      interviewed_at = (u -> 'merged' ->> 'interviewed_at')::timestamptz,
      offered_at     = (u -> 'merged' ->> 'offered_at')::timestamptz,
      signed_at      = (u -> 'merged' ->> 'signed_at')::timestamptz,
      start_date     = (u -> 'merged' ->> 'start_date')::timestamptz,
      joined_at      = (u -> 'merged' ->> 'joined_at')::timestamptz,
      notes          = u ->> 'notes',
      updated_at     = now()
  from jsonb_array_elements(p_updates) u
  where p.id = (u ->> 'id')::uuid;
  get diagnostics v_upd = row_count;

  -- 3 · add the journeys that are new, and note which ones landed
  with added as (
    insert into public.placement_attempts (
      doctor_id, doctor_name, doctor_specialty, hospital_id, hospital_name,
      shortlisted_at, interviewed_at, offered_at, signed_at, start_date, joined_at,
      notes, source, created_by
    )
    select r ->> 'doctor_id', r ->> 'doctor_name', r ->> 'doctor_specialty',
           (r ->> 'hospital_id')::uuid, r ->> 'hospital_name',
           (r ->> 'shortlisted_at')::timestamptz, (r ->> 'interviewed_at')::timestamptz,
           (r ->> 'offered_at')::timestamptz,     (r ->> 'signed_at')::timestamptz,
           (r ->> 'start_date')::timestamptz,     (r ->> 'joined_at')::timestamptz,
           r ->> 'notes', coalesce(r ->> 'source', 'csv_import'), v_email
    from jsonb_array_elements(p_inserts) r
    on conflict (doctor_id, hospital_name) do nothing
    returning id
  )
  insert into public.placement_import_log (batch, op, row_id, label, created_by)
  select v_batch, 'insert', added.id, p_label, v_email from added;
  get diagnostics v_ins = row_count;

  alter table public.placement_attempts enable trigger trg_sync_lifecycle_from_placement;

  return query select v_batch, v_ins, v_upd;
end $$;

-- Put an import back: added rows go, changed rows return to what they were.
create or replace function public.undo_placement_import(p_batch uuid)
returns table (removed int, restored int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed  int := 0;
  v_restored int := 0;
begin
  alter table public.placement_attempts disable trigger trg_sync_lifecycle_from_placement;

  delete from public.placement_attempts
  where id in (select row_id from public.placement_import_log where batch = p_batch and op = 'insert');
  get diagnostics v_removed = row_count;

  update public.placement_attempts p
  set shortlisted_at = (l.old_row ->> 'shortlisted_at')::timestamptz,
      interviewed_at = (l.old_row ->> 'interviewed_at')::timestamptz,
      offered_at     = (l.old_row ->> 'offered_at')::timestamptz,
      signed_at      = (l.old_row ->> 'signed_at')::timestamptz,
      start_date     = (l.old_row ->> 'start_date')::timestamptz,
      joined_at      = (l.old_row ->> 'joined_at')::timestamptz,
      notes          = l.old_row ->> 'notes',
      updated_at     = now()
  from public.placement_import_log l
  where l.batch = p_batch and l.op = 'update' and p.id = l.row_id;
  get diagnostics v_restored = row_count;

  delete from public.placement_import_log where batch = p_batch;

  alter table public.placement_attempts enable trigger trg_sync_lifecycle_from_placement;

  return query select v_removed, v_restored;
end $$;

grant execute on function public.apply_placement_import(jsonb, jsonb, text) to authenticated;
grant execute on function public.undo_placement_import(uuid) to authenticated;

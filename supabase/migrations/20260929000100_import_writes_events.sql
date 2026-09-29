-- Write the logged lines, not just the journeys, and undo them together.
--
-- apply_placement_import saved one row per doctor+hospital. Reporting now
-- counts placement_events (see 20260929000000_placement_events.sql), so the
-- import has to write those too — in the same call, so a half-done import
-- still can't happen, and so one undo takes both back.
--
-- Events arrive keyed by (doctor_id, hospital_name) rather than by journey id,
-- because the journeys they belong to may be created by this very call.

drop function if exists public.apply_placement_import(jsonb, jsonb, text);

-- p_inserts: whole rows to add. p_updates: [{ id, merged: {stage: date|null}, notes }].
-- p_events:  [{ doctor_id, hospital_name, stage, occurred_at, rep, country,
--               source_file, source_line }] — one per line the sheet logged.
create or replace function public.apply_placement_import(
  p_inserts jsonb default '[]'::jsonb,
  p_updates jsonb default '[]'::jsonb,
  p_label   text  default null,
  p_events  jsonb default '[]'::jsonb
)
returns table (batch uuid, inserted int, updated int, events int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_ins   int  := 0;
  v_upd   int  := 0;
  v_ev    int  := 0;
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

  -- 4 · the logged lines. The journey is found by (doctor_id, hospital_name),
  --     which step 3 has just created where it was missing. A line already
  --     recorded is left alone, so re-importing a sheet does not double-count
  --     — but two reps logging the same doctor, hospital and day stay two
  --     events, which is how the team counts.
  insert into public.placement_events (
    attempt_id, stage, occurred_at, rep, country, source_file, source_line, batch
  )
  select p.id,
         e ->> 'stage',
         (e ->> 'occurred_at')::date,
         coalesce(nullif(e ->> 'rep', ''), 'unknown'),
         nullif(e ->> 'country', ''),
         e ->> 'source_file',
         (e ->> 'source_line')::int,
         v_batch
  from jsonb_array_elements(p_events) e
  join public.placement_attempts p
    on p.doctor_id = e ->> 'doctor_id' and p.hospital_name = e ->> 'hospital_name'
  on conflict (attempt_id, stage, occurred_at, rep) do nothing;
  get diagnostics v_ev = row_count;

  alter table public.placement_attempts enable trigger trg_sync_lifecycle_from_placement;

  return query select v_batch, v_ins, v_upd, v_ev;
end $$;

-- Put an import back: added rows go, changed rows return to what they were,
-- and the lines this import recorded go with them. Events on a deleted journey
-- disappear with it (on delete cascade); the rest are removed by batch, so a
-- line that was already recorded before this import survives the undo.
create or replace function public.undo_placement_import(p_batch uuid)
returns table (removed int, restored int, events_removed int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed  int := 0;
  v_restored int := 0;
  v_events   int := 0;
begin
  alter table public.placement_attempts disable trigger trg_sync_lifecycle_from_placement;

  delete from public.placement_events where batch = p_batch;
  get diagnostics v_events = row_count;

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

  return query select v_removed, v_restored, v_events;
end $$;

grant execute on function public.apply_placement_import(jsonb, jsonb, text, jsonb) to authenticated;
grant execute on function public.undo_placement_import(uuid) to authenticated;

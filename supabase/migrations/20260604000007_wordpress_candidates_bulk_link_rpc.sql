-- Bulk-update wordpress_candidates.doctor_id from a JSON array of
-- {id, doctor_id} pairs. Used by the wordpress-candidates-link edge
-- function — PostgREST upsert can't do a partial-row update (the
-- NOT NULL columns trip the INSERT validator), so we route through
-- this single SQL UPDATE instead.
--
-- Returns the number of rows actually updated. Only rows whose
-- doctor_id is currently NULL get touched, so manual links never
-- get clobbered.

create or replace function public.wordpress_candidates_bulk_link(updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with src as (
    select (value->>'id')::integer        as id,
           value->>'doctor_id'            as doctor_id
    from jsonb_array_elements(updates) as value
  )
  update public.wordpress_candidates wc
     set doctor_id  = src.doctor_id,
         updated_at = now()
    from src
   where wc.id = src.id
     and wc.doctor_id is null;        -- race-safe: never overwrite manual links

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.wordpress_candidates_bulk_link(jsonb) from public;
grant execute on function public.wordpress_candidates_bulk_link(jsonb) to service_role, authenticated;

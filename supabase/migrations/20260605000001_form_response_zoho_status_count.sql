-- Server-side count of form_responses linked to Zoho leads in a given
-- Lead_Status. Used by the /forms KPI strip to surface "Uncontacted in
-- Zoho" without dragging the full ~28k-lead cache into the client.
--
-- The Zoho cache holds all leads as a JSONB array under
-- zoho_cache.data->'leads'. We unnest with jsonb_array_elements +
-- project to the same 'lead:<id>' format we store in form_responses.
-- doctor_id, then count the join.
--
-- STABLE rather than IMMUTABLE because jsonb_array_elements is stable
-- and we read mutable rows. Not used in an index expression, so this is
-- fine.

create or replace function public.form_response_zoho_status_count(
  p_form_id uuid,
  p_status  text
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  with leads_by_status as (
    select 'lead:' || (l->>'id') as doctor_id
    from public.zoho_cache,
         jsonb_array_elements(data->'leads') as l
    where zoho_cache.id = 1
      and l->>'Lead_Status' = p_status
  )
  select count(*)::int
  from public.form_responses fr
  join leads_by_status z on fr.doctor_id = z.doctor_id
  where fr.form_id = p_form_id
$$;

revoke all on function public.form_response_zoho_status_count(uuid, text) from public;
grant execute on function public.form_response_zoho_status_count(uuid, text) to authenticated, service_role;

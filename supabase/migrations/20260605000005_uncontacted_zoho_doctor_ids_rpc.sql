-- Return the AA doctor_id prefixes ('lead:<id>') for every Zoho lead
-- currently in "Not Contacted" status. Used by the /forms page to
-- power the "Uncontacted in Zoho" filter — the actually-actionable
-- bucket once the team has dismissed unqualified leads and people
-- already being worked.
--
-- Capped at a few hundred ids in practice (probe showed 214 leads
-- with Lead_Status='Not Contacted'), so PostgREST's .in() filter
-- on the resulting set comfortably fits in a URL.

create or replace function public.uncontacted_zoho_doctor_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select 'lead:' || (l->>'id')
    from public.zoho_cache,
         jsonb_array_elements(data->'leads') as l
   where id = 1
     and coalesce(l->>'Lead_Status', '') = 'Not Contacted'
$$;

revoke all on function public.uncontacted_zoho_doctor_ids() from public;
grant execute on function public.uncontacted_zoho_doctor_ids() to authenticated, service_role;

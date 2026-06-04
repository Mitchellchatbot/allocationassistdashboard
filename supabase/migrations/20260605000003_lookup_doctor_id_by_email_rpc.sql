-- Single source of truth for matching an email to an AA doctor_id.
--
-- Both the historical sync + the live webhooks were reading from
-- non-existent zoho_cache_dob / zoho_cache_leads tables. Factor the
-- correct logic (JSONB cache, DoB > Lead precedence) into one SQL
-- function so future fixes only touch this file.
--
-- Returns 'dob:<id>' if the email matches a Doctors on Board row,
-- 'lead:<id>' if it matches a Lead, else NULL.

create or replace function public.lookup_doctor_id_by_email(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id    text;
begin
  if v_email = '' then return null; end if;

  -- 1. DoB match (wins precedence — further down the funnel).
  select 'dob:' || (d->>'id')
    into v_id
    from public.zoho_cache zc,
         jsonb_array_elements(zc.data->'doctorsOnBoard') as d
   where zc.id = 2
     and lower(coalesce(d->>'Email', '')) = v_email
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. Lead match.
  select 'lead:' || (l->>'id')
    into v_id
    from public.zoho_cache zc,
         jsonb_array_elements(zc.data->'leads') as l
   where zc.id = 1
     and lower(coalesce(l->>'Email', '')) = v_email
   limit 1;
  return v_id;
end;
$$;

revoke all on function public.lookup_doctor_id_by_email(text) from public;
grant execute on function public.lookup_doctor_id_by_email(text) to authenticated, service_role;

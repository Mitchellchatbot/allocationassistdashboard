-- Pull the full Zoho record(s) for an email so we can mine fields
-- (phone, mobile, specialty, license status, country of training,
-- recruiter, status, etc.) into the WP candidate profile.
--
-- Returns the lead row if found AND the DoB row if found — the
-- profile-enrichment caller merges both. Each is a JSON blob with
-- the original Zoho field names.

create or replace function public.zoho_records_by_email(p_email text)
returns table(lead jsonb, dob jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then return; end if;

  return query
  select
    (select l
       from public.zoho_cache zc,
            jsonb_array_elements(zc.data->'leads') as l
      where zc.id = 1
        and lower(coalesce(l->>'Email', '')) = v_email
      limit 1) as lead,
    (select d
       from public.zoho_cache zc,
            jsonb_array_elements(zc.data->'doctorsOnBoard') as d
      where zc.id = 2
        and lower(coalesce(d->>'Email', '')) = v_email
      limit 1) as dob;
end;
$$;

revoke all on function public.zoho_records_by_email(text) from public;
grant execute on function public.zoho_records_by_email(text) to authenticated, service_role;

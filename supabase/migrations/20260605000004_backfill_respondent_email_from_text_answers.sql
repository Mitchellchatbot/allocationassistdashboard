-- The Typeform sync only treated answers of type='email' as the
-- respondent's email. The AA form configures the email question as
-- short_text (so the user can validate format with a custom regex),
-- which means the value lives in answer.text rather than answer.email,
-- and our extractor missed it. Result: 17k+ rows with respondent_email
-- = null, breaking the auto-link to Zoho leads.
--
-- Backfill by extracting the first text-type answer whose value looks
-- like an email from raw_payload->answers, then run the lead + DoB
-- linkage update from migration 20260605000002 again now that the
-- email column actually has values.

-- 1. Pull the email out of raw_payload.answers (first text value that
--    matches an email regex). DISTINCT ON (fr.id) takes only one per
--    response.
update public.form_responses fr
   set respondent_email = lower(trim(found.email))
  from (
    select distinct on (fr2.id)
           fr2.id,
           ans->>'text' as email
      from public.form_responses fr2,
           jsonb_array_elements(fr2.raw_payload->'answers') as ans
     where fr2.respondent_email is null
       and ans->>'type' = 'text'
       and (ans->>'text') ~* '^\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\s*$'
     order by fr2.id, (ans->'field'->>'id')
  ) as found
 where fr.id = found.id;

-- 2. Now re-run the doctor_id linkage (same logic as 20260605000002,
--    just re-applies to the newly-emailed rows).
update public.form_responses fr
   set doctor_id = 'lead:' || (l->>'id')
  from public.zoho_cache zc,
       jsonb_array_elements(zc.data->'leads') as l
 where zc.id = 1
   and fr.doctor_id is null
   and fr.respondent_email is not null
   and lower(fr.respondent_email) = lower(coalesce(l->>'Email', ''));

update public.form_responses fr
   set doctor_id = 'dob:' || (d->>'id')
  from public.zoho_cache zc,
       jsonb_array_elements(zc.data->'doctorsOnBoard') as d
 where zc.id = 2
   and fr.respondent_email is not null
   and lower(fr.respondent_email) = lower(coalesce(d->>'Email', ''));

-- 3. Also re-extract respondent_name from first_name + last_name
--    answers, so the row labels read like "Sumit Kumar" instead of
--    falling all the way through to the email or "Anonymous". The
--    frontend stitches first+last from answers as a fallback, but
--    storing the canonical name here keeps it searchable + sorted.
with name_parts as (
  select
    fr.id,
    max(case when lower(coalesce(ans->'field'->>'title', '')) like '%first%name%' then ans->>'text' end) as first_name,
    max(case when lower(coalesce(ans->'field'->>'title', '')) like '%last%name%'  then ans->>'text' end) as last_name
  from public.form_responses fr,
       jsonb_array_elements(fr.raw_payload->'answers') as ans
  where fr.respondent_name is null
    and ans->>'type' = 'text'
  group by fr.id
)
update public.form_responses fr
   set respondent_name = trim(coalesce(np.first_name, '') || ' ' || coalesce(np.last_name, ''))
  from name_parts np
 where fr.id = np.id
   and (coalesce(np.first_name, '') <> '' or coalesce(np.last_name, '') <> '');

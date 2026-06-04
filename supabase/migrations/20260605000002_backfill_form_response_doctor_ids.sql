-- Backfill form_responses.doctor_id from the Zoho cache.
--
-- The typeform sync + webhook readers were querying `zoho_cache_dob`
-- and `zoho_cache_leads` — relational views that don't exist on this
-- project. Every email lookup silently returned no rows, so 17k+
-- responses were inserted with doctor_id = null.
--
-- This migration relinks them by joining respondent_email to the
-- canonical JSONB cache (zoho_cache.data->'leads' on row 1,
-- zoho_cache.data->'doctorsOnBoard' on row 2). Same precedence as
-- the webhook intended: DoB wins over Lead (further down the funnel),
-- so we apply Lead matches first, then overwrite with DoB matches.

-- Step 1: link to leads where the email matches.
update public.form_responses fr
   set doctor_id = 'lead:' || (l->>'id')
  from public.zoho_cache zc,
       jsonb_array_elements(zc.data->'leads') as l
 where zc.id = 1
   and fr.doctor_id is null
   and fr.respondent_email is not null
   and lower(fr.respondent_email) = lower(coalesce(l->>'Email', ''));

-- Step 2: DoB matches take precedence — overwrite any lead match
-- when the same email also appears in DoB. Hits both freshly-linked
-- (lead:) rows and any that were still null.
update public.form_responses fr
   set doctor_id = 'dob:' || (d->>'id')
  from public.zoho_cache zc,
       jsonb_array_elements(zc.data->'doctorsOnBoard') as d
 where zc.id = 2
   and fr.respondent_email is not null
   and lower(fr.respondent_email) = lower(coalesce(d->>'Email', ''));

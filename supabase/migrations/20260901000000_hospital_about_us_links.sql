-- About-Us links for the KSA + Qatar hospitals, taken from the team's real
-- "Working opportunities in Saudi Arabia & Qatar" sends (2026-07-02 export).
-- These are the exact URLs the HI department links each hospital name to, so
-- they are authoritative for hospitals.website — which is rendered as both the
-- hospital-name link and the "About us »" link in buildDoctorHospitalsHtml.
--
-- The Zoho backfill (backfill-hospital-websites) only ever supplies bare
-- homepages. These are the deeper About-Us pages, so we replace a homepage on
-- the SAME host but never clobber a different host that someone entered by hand.

do $$
declare
  updated int := 0;
  n       int;
begin
  -- Guard on every update: website is empty, or its existing value is another
  -- URL on the SAME host (the homepage we're deepening). Host = scheme and www
  -- stripped, up to the first '/'.

  -- ---------- Saudi Arabia ----------

  update public.hospitals set website = 'https://mngha.med.sa/', updated_at = now()
   where (name ilike '%mngha%' or name ilike '%national guard%')
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'mngha.med.sa');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://en.fakeeh.care/about-us/our-story', updated_at = now()
   where name ilike '%fakeeh care%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') in ('fakeeh.care','en.fakeeh.care'));
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://hmg.com/en/Pages/Home.aspx', updated_at = now()
   where (name ilike '%sulaiman al habib%' or name ilike '%alhabib%' or name ilike '%hmg%')
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'hmg.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://saudigermanhealth.com/en', updated_at = now()
   where name ilike '%saudi german%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'saudigermanhealth.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.dallah-hospital.com/english/about/introduction', updated_at = now()
   where name ilike '%dallah%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'dallah-hospital.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://kch.sa/about-us/', updated_at = now()
   where name ilike '%king%college%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'kch.sa');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.myclinic.com.sa/about-us', updated_at = now()
   where replace(lower(name), ' ', '') like '%myclinic%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'myclinic.com.sa');
  get diagnostics n = row_count; updated := updated + n;

  -- Dr. Mohammed Al Fagih (dmf.med.sa). Deliberately does NOT match the
  -- unrelated "Dr. Salah Alfaqih" row — different spelling, different entity.
  update public.hospitals set website = 'https://dmf.med.sa/en/about-us/', updated_at = now()
   where replace(lower(name), ' ', '') like '%alfagih%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'dmf.med.sa');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://hospital.kau.edu.sa/Content-599-AR-38308', updated_at = now()
   where name ilike '%abdulaziz university%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') in ('kau.edu.sa','hospital.kau.edu.sa'));
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://almoosahealthgroup.org/about-us-en/', updated_at = now()
   where replace(lower(name), ' ', '') like '%almoosa%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'almoosahealthgroup.org');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.jhah.com/en/about-us/', updated_at = now()
   where (name ilike '%jhah%' or name ilike '%aramco%')
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'jhah.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.kfshrc.edu.sa/en/about', updated_at = now()
   where name ilike '%king faisal%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'kfshrc.edu.sa');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://care.med.sa/', updated_at = now()
   where name ilike '%national medical care%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'care.med.sa');
  get diagnostics n = row_count; updated := updated + n;

  -- ---------- Qatar ----------

  -- The View is listed under the Apex Health umbrella but has its own site, so
  -- it wins over the Apex link for the "Apex Health The View" row.
  update public.hospitals set website = 'https://www.theviewhospital.com/about-us/about-the-view-hospital', updated_at = now()
   where name ilike '%the view%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'theviewhospital.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.apexhealth-intl.com/about-us', updated_at = now()
   where name ilike '%apex%' and name not ilike '%view%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'apexhealth-intl.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.kmcdoha.com/about-us/about-korean-medical-center', updated_at = now()
   where (name ilike '%korean%' or name ilike '%kmc%')
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'kmcdoha.com');
  get diagnostics n = row_count; updated := updated + n;

  update public.hospitals set website = 'https://www.amnm.com/about-amnm/', updated_at = now()
   where name ilike '%fardan%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'amnm.com');
  get diagnostics n = row_count; updated := updated + n;

  -- Military Medical City Hospital (MMCH) is intentionally absent: the source
  -- email's link for it is a broken Google-Docs artifact (goog_2077459728), not
  -- a real URL. Needs a real About-Us page from the HI team before seeding.

  raise notice 'about-us links: % rows updated; % of % hospitals now have a website',
    updated,
    (select count(*) from public.hospitals where coalesce(website,'') <> ''),
    (select count(*) from public.hospitals);
end $$;

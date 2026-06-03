-- Refresh the specialty rotation queue + audit hospital.country
-- (Ammar 2026-06-03 call follow-up).
--
-- 1. Replace the singleton rotation queue with the canonical specialty
--    list from the AA website (the "around 60" Ammar referenced). The
--    previous queue carried Zoho-bucketed values Ammar said were
--    "very wrong". Cursor reset to 0 so Specialty-of-the-day starts
--    rotating cleanly through the new list.
--
-- 2. For every hospital where country IS NULL, derive country from the
--    city. The country-scoped batches (B4) only work if every hospital
--    has a country set; this fills the gap left by older Zoho rows that
--    only had a city.
--
-- Idempotent — re-applying does nothing harmful.

-- ── 1. Rotation queue ─────────────────────────────────────────────────
update public.specialty_rotation_state set
  queue = ARRAY[
    'Allergist',
    'Anesthesiology',
    'Bariatric Surgery',
    'Breast Surgery',
    'Cardiac Surgery',
    'Cardiology',
    'Cardiothoracic Surgery',
    'Cardiovascular Surgery',
    'Clinical Immunology',
    'Colorectal',
    'Critical Care Medicine',
    'Dental Surgeon',
    'Dentist',
    'Dermatology',
    'Emergency Medicine',
    'Endocrinology',
    'ENT',
    'Family Medicine',
    'Gastroenterology',
    'General Surgery',
    'Geriatric',
    'GP',
    'Hair transplant Surgery',
    'Hematology',
    'Hepatologist',
    'Infectious Disease',
    'Intensive Care Medicine',
    'Internal Medicine',
    'Medical Genetics',
    'Medical Physicist',
    'Microbiologist',
    'Minimally Invasive',
    'Neonatology',
    'Nephrology',
    'Neurology',
    'Neurophysiology',
    'Neurosurgeon',
    'Nuclear Medicine',
    'Nurses',
    'Obstetrics and Gynecology',
    'Occupational Medicine',
    'Occupational Therapy',
    'Oncology',
    'Ophthalmology',
    'Oral Surgeon',
    'Orthopaedic',
    'Orthoptist - Optometry',
    'Pain Medicine',
    'Palliative Care',
    'Pathology',
    'Pediatrics',
    'Physical Medicine and Rehabilitation',
    'Plastic Surgery',
    'Psychiatry',
    'Psychology',
    'Pulmonology',
    'Radiation Therapist',
    'Radiographer',
    'Radiology',
    'Respiratory',
    'Rheumatologist',
    'Spine Surgeon',
    'Sports Medicine',
    'Thoracic Surgery',
    'Urology',
    'Vascular Surgery',
    'Visceral Surgeon'
  ],
  cursor_index = 0,
  updated_at   = now()
where id = 1;

-- ── 2. Hospital country backfill ──────────────────────────────────────
update public.hospitals set country = 'UAE'
where country is null
  and city in ('Dubai','Abu Dhabi','Sharjah','Ras Al Khaimah','Ajman','Fujairah','Al Ain','Umm Al Quwain','Ras al-Khaimah');

update public.hospitals set country = 'Saudi Arabia'
where country is null
  and city in ('Riyadh','Jeddah','Dammam','Khobar','Mecca','Medina','Al Khobar','Makkah','Madinah');

update public.hospitals set country = 'Qatar'
where country is null
  and city in ('Doha','Al Rayyan');

update public.hospitals set country = 'Oman'
where country is null
  and city in ('Muscat','Salalah','Sohar');

update public.hospitals set country = 'Kuwait'
where country is null
  and city in ('Kuwait City','Kuwait');

update public.hospitals set country = 'Bahrain'
where country is null
  and city in ('Manama','Riffa');

-- Log how many remain unmapped so the dashboard can surface them as
-- "needs country" rows. Not an error — these are likely free-text
-- entries from older Zoho imports that need manual cleanup.
do $$
declare unmapped_count int;
begin
  select count(*) into unmapped_count from public.hospitals where country is null;
  raise notice '[country audit] % hospitals still lack a country', unmapped_count;
end $$;

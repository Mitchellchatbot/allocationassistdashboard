-- 43 hospital-specific "Working Opportunity" doctor templates, imported from the
-- opportunities@ outbox (mitchell-from-opportunities-2026-05-25). Each is a
-- separate Profile-Sent doctor template with the hospital, city and about-link
-- baked in, the doctor name tokenised ({{doctor_name}}). Same wording/structure
-- as profile_sent_doctor. Idempotent (on conflict do nothing) so a re-run won't
-- duplicate or clobber hand-edits. A handful of source links were truncated in
-- the export — the base hospital domain is used and can be corrected in the
-- Templates editor.

insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables)
select
  'profile_sent_doctor_' || slug,
  'Working Opportunity — ' || hospital || ' (' || city || ')',
  'profile_sent',
  'Working opportunity at ' || hospital || ', ' || city,
  'Hi {{doctor_name}}!' || E'\n\n'
    || 'I hope you are doing well 😊' || E'\n\n'
    || 'We have an opportunity with ' || hospital || ' in ' || city
    || ' and we highly recommended your profile.' || E'\n\n'
    || 'Please let us know if you hear from them.'
    || case when link <> '' then E'\n\n' || link else '' end,
  '<p>Hi {{doctor_name}}!</p>'
    || '<p>I hope you are doing well 😊</p>'
    || '<p>We have an opportunity with <strong>' || hospital || '</strong> in ' || city
    || ' and we highly recommended your profile.</p>'
    || '<p>Please let us know if you hear from them.</p>'
    || case when link <> '' then '<p><a href="' || link || '">' || link || '</a></p>' else '' end,
  '["doctor_name"]'::jsonb
from (values
  ('mediclinic_dubai',                'Mediclinic',                                      'Dubai',          'https://www.mediclinic.ae'),
  ('nmc_dubai',                        'NMC Healthcare',                                  'Dubai',          'https://nmc.ae/en/aboutus'),
  ('medcare_dubai',                    'Medcare Hospital',                                'Dubai',          'https://www.medcare.ae/en'),
  ('american_hospital_dubai',          'American Hospital',                               'Dubai',          'https://www.ahdubai.com/about'),
  ('fakeeh_dubai',                     'Fakeeh University Hospital',                       'Dubai',          'https://www.fuh.care'),
  ('moorfields_dubai',                 'Moorfields Eye Hospital',                         'Dubai',          'https://moorfields.ae'),
  ('kings_college_dubai',              'King''s College Hospital',                        'Dubai',          'https://kingscollegehospitaldubai.com'),
  ('healthbay_dubai',                  'HealthBay Clinic',                                'Dubai',          'https://healthbayclinic.com/about-us/'),
  ('mirdif_dubai',                     'Mirdif Hospital',                                 'Dubai',          'https://www.hmsmirdifhospital.ae/en/about'),
  ('prime_dubai',                      'Prime Hospital',                                  'Dubai',          'https://www.primehealth.ae/'),
  ('al_garhoud_dubai',                 'Al Garhoud Hospital',                             'Dubai',          'https://www.gph.ae/en/about'),
  ('glucare_dubai',                    'GluCare Health',                                  'Dubai',          'https://glucare.health'),
  ('fakih_ivf_dubai',                  'Fakih IVF Fertility Center',                      'Dubai',          'https://fakihivf.com/'),
  ('gargash_dubai',                    'Gargash Hospital',                                'Dubai',          'https://gargashhospital.com/about-us/'),
  ('emirates_hospital_dubai',          'Emirates Hospital Group',                         'Dubai',          'https://emirateshospitals.ae'),
  ('nmc_abudhabi',                     'NMC Healthcare',                                  'Abu Dhabi',      'https://nmc.ae/en/aboutus'),
  ('ssmc_abudhabi',                    'Sheikh Shakhbout Medical City',                   'Abu Dhabi',      'https://ssmc.ae/'),
  ('skmc_abudhabi',                    'Sheikh Khalifa Medical City',                     'Abu Dhabi',      'https://www.seha.ae'),
  ('tahnoon_alain',                    'Sheikh Tahnoon Medical City',                     'Al Ain',         'https://www.seha.ae/hospital-detail/41'),
  ('burjeel_medical_city_abudhabi',    'Burjeel Medical City',                            'Abu Dhabi',      'https://burjeel.com/burjeelmedicalcity/'),
  ('al_dhafra_abudhabi',               'Al Dhafra Hospital Group',                        'Abu Dhabi',      'https://www.seha.ae/hospital-detail/45'),
  ('yas_group_abudhabi',               'Yas Group',                                       'Abu Dhabi',      'https://adscc.ae/who-we-are/'),
  ('tawam_alain',                      'Tawam Hospital',                                  'Al Ain',         'https://www.seha.ae/hospital-detail/42'),
  ('al_zahra_dubai',                   'Al Zahra Hospital',                               'Dubai',          'https://azhd.ae/about/'),
  ('harley_street_abudhabi',           'Harley Street Medical Center',                    'Abu Dhabi',      'https://www.hsmc.ae'),
  ('sheikh_sultan_sharjah',            'Sheikh Sultan Bin Zayed Hospital',                'Sharjah',        'https://m42.ae'),
  ('zayed_military_abudhabi',          'Zayed Military Hospital',                         'Abu Dhabi',      'https://www.emitachealthcare.com'),
  ('bascom_palmer_abudhabi',           'Bascom Palmer Eye Institute',                     'Abu Dhabi',      'https://www.bascompalmer.ae'),
  ('burjeel_royal_alain',              'Burjeel Royal Hospital',                          'Al Ain',         'https://www.burjeel.com'),
  ('reem_abudhabi',                    'Reem Hospital',                                   'Abu Dhabi',      'https://www.reemhospital.com/our-story/'),
  ('tarmeem_abudhabi',                 'Tarmeem Orthopedic and Spine Specialty Hospital', 'Abu Dhabi',      ''),
  ('capital_health_abudhabi',          'Capital Health',                                  'Abu Dhabi',      'https://srh.ae/about-us/'),
  ('sharjah_university_sharjah',       'Sharjah University Hospital',                      'Sharjah',        'https://www.uhs.ae/'),
  ('rak_hospital_rak',                 'RAK Hospital',                                    'Ras Al Khaimah', 'https://rakhospital.com/about-us/'),
  ('al_jalila_dubai',                  'Al Jalila Children''s Hospital',                  'Dubai',          'https://dubaihealth.ae/l/197362'),
  ('mediclinic_abudhabi',              'Mediclinic',                                      'Abu Dhabi',      'https://www.mediclinic.ae'),
  ('cosmesurge_dubai',                 'Cosmesurge Hospital',                             'Dubai',          'https://www.cosmesurge.com/'),
  ('valens_dubai',                     'Valens Clinic',                                   'Dubai',          'https://thevalensclinic.ae/about-us/'),
  ('acpn_dubai',                       'American Center of Psychiatry and Neurology',     'Dubai',          'https://americancenter.ae'),
  ('latifa_dubai',                     'Latifa Hospital',                                 'Dubai',          'https://dubaihealth.ae/l/196787'),
  ('lighthouse_dubai',                 'The Lighthouse Arabia',                           'Dubai',          'https://www.lighthousearabia.com/about-us'),
  ('aspris_abudhabi',                  'Alkalma / Aspris Wellbeing Centre',               'Abu Dhabi',      'https://www.aspris.ae'),
  ('maudsley_abudhabi',                'Maudsley Health',                                 'Abu Dhabi',      'https://maudsleyhealth.com/')
) as t(slug, hospital, city, link)
on conflict (key) do nothing;

-- Auto-apply per-hospital "Working Opportunity" (doctor) templates.
--
-- There are 43 profile_sent_doctor_<hospital>_<city> templates ("Hi {{doctor_name}},
-- we have an opportunity with <Hospital>…") — the ONLY templates carrying the
-- {{hospital_image}} slot. Until now they only fired when hand-picked in Send
-- Profile. This links each hospital to its template so send-flow-email's
-- email_doctor stage can fall back to it automatically (mirrors how template_key
-- drives the email_hospital stage), and so the Profile Sent editor edits the
-- right template.
--
-- Matching mirrors the hospital-image WHERE clauses (name + city, city added for
-- brand names that recur across emirates). Guarded by coalesce(...,'')='' so it's
-- idempotent and never overrides a hand-set link. Rows with no matching template
-- simply stay NULL and fall back to the generic profile_sent_doctor.

alter table public.hospitals add column if not exists doctor_template_key text;

do $$
declare k text;
begin
  -- Abu Dhabi
  update public.hospitals set doctor_template_key='profile_sent_doctor_al_dhafra_abudhabi',       updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%dhafra%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_aspris_abudhabi',           updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%kalma%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_bascom_palmer_abudhabi',    updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%bascom%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_burjeel_medical_city_abudhabi', updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%burjeel medical city%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_capital_health_abudhabi',   updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%capital health%' and city ilike '%abu dhabi%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_harley_street_abudhabi',    updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%harley street%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_mediclinic_abudhabi',       updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%mediclinic%' and city ilike '%abu dhabi%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_nmc_abudhabi',              updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%nmc%' and city ilike '%abu dhabi%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_reem_abudhabi',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%reem hospital%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_skmc_abudhabi',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%sheikh khalifa%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_ssmc_abudhabi',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%shakhbout%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_tarmeem_abudhabi',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%tarmeem%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_yas_group_abudhabi',        updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%yas%' and city ilike '%abu dhabi%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_zayed_military_abudhabi',   updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%zayed military%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_maudsley_abudhabi',         updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%maudsley%';

  -- Al Ain
  update public.hospitals set doctor_template_key='profile_sent_doctor_burjeel_royal_alain',       updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%burjeel%' and city ilike '%al ain%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_tawam_alain',               updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%tawam%' and city ilike '%al ain%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_tahnoon_alain',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%tahnoon%';

  -- Dubai
  update public.hospitals set doctor_template_key='profile_sent_doctor_al_garhoud_dubai',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%garhoud%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_al_zahra_dubai',            updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%al zahra%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_acpn_dubai',                updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%american center of psychiatry%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_american_hospital_dubai',   updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%american hospital%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_cosmesurge_dubai',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%cosmesurge%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_emirates_hospital_dubai',   updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%emirates group%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_fakih_ivf_dubai',           updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%fakih%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_gargash_dubai',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%gargash%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_glucare_dubai',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%glucare%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_healthbay_dubai',           updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%healthbay%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_kings_college_dubai',       updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%kings college%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_latifa_dubai',              updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%latifa%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_medcare_dubai',             updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%medcare%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_mediclinic_dubai',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%mediclinic%' and city ilike '%dubai%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_mirdif_dubai',              updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%mirdif%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_moorfields_dubai',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%moorfields%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_nmc_dubai',                 updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%nmc%' and city ilike '%dubai%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_prime_dubai',               updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%prime%' and city ilike '%dubai%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_lighthouse_dubai',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%lighthouse%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_valens_dubai',              updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%valens%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_al_jalila_dubai',           updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%jalila%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_fakeeh_dubai',              updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%fakeeh%';

  -- Ras Al Khaimah / Sharjah
  update public.hospitals set doctor_template_key='profile_sent_doctor_rak_hospital_rak',          updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%rak hospital%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_sharjah_university_sharjah', updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%sharjah%' and name ilike '%university%';
  update public.hospitals set doctor_template_key='profile_sent_doctor_sheikh_sultan_sharjah',     updated_at=now() where coalesce(doctor_template_key,'')='' and name ilike '%sultan bin zayed%';

  -- Only keep links that point at a template that actually exists.
  update public.hospitals h set doctor_template_key = null
   where doctor_template_key is not null
     and not exists (select 1 from public.email_templates t where t.key = h.doctor_template_key);

  raise notice 'doctor_template_link: % hospitals linked to a Working-Opportunity template',
    (select count(*) from public.hospitals where coalesce(doctor_template_key,'')<>'');
end $$;

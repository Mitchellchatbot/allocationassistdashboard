-- Replace the vacancy list with the KSA / Qatar / UAE "New Vacancies" sheet.
--
-- Requested 2026-09-15: the dashboard's vacancy list had drifted from what the
-- team is actually working, so this wipes it and seeds the current sheet as the
-- single source of truth. A hard delete (not a status change) was the explicit
-- call, so the cascade takes vacancy_lead_links and vacancy-related
-- notifications with it — those referenced roles that no longer exist.
--
-- Also adds `city`. The column was already being READ by
-- LinkToVacancyDialog (`{v.city && <> · {v.city}</>}`) against a type that
-- never had it, so the location silently never rendered; this sheet carries a
-- Location column, which makes the omission worth closing rather than
-- working around.
--
-- NOTE: sheets-sync inserts vacancies blind, with no dedupe. If a sheet
-- connection with target_kind='vacancies' is still active, its next run will
-- append its rows on top of this list. Pause it on Connections first.

begin;

alter table public.vacancies
  add column if not exists city text;

comment on column public.vacancies.city is
  'Location of the role (Abu Dhabi, Dubai, Jeddah, ...). Distinct from the hospital''s own city: a group like Mediclinic or Solaiman Alhabib posts for a specific site.';

create index if not exists vacancies_city_idx on public.vacancies (city);

-- Clean slate. Cascades to vacancy_lead_links and notifications.related_vacancy_id.
delete from public.vacancies;

-- One row per posting from the sheet. hospital_id is resolved by name where
-- the hospital is already on file (exact match, then with any trailing
-- parenthetical like "(AHD)" stripped); it stays null otherwise, which every
-- consumer already tolerates since they join on hospital_name.
with incoming (hospital_name, city, specialty, notes, opened_by, priority) as (
  values
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Heart Failure', 'Tier 1, with fellowship or training', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Electrophysiology', 'Tier 1, Licensed EP in DOH', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Cardiac CT', 'Tier 1, with fellowship or training', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Oncology', 'Tier 1, specialized in GI', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Neurocritical Care', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Movement Disorder', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Stroke', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – General Neurology', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Sports Medicine', 'Tier 1, experience with athletes', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Allergy & Immunology', 'Tier 1, licensed as Allergy (not Infectious)', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Oral & Maxillofacial', 'Tier 1, Cleft Lip & Palate specialty/training', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Burns Surgery', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Cornea (Medical Ophthalmology)', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Fetal Medicine', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Pediatric Dermatology', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Adolescent Pediatrics', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Specialist Physician – PICU (General)', 'Tier 2', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Foot & Ankle', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Soft Tissue Knee', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('SSMC', 'Abu Dhabi', 'Consultant Physician – Pediatric Rheumatology', 'Tier 1', 'mohamed.othman@allocationassist.com', 'high'),
  ('Solaiman Alhabib Medical Group', 'Qassim Project', 'Consultant IVF', 'Western qualification, Any gender', 'sohaila@allocationassist.com', 'high'),
  ('Solaiman Alhabib Medical Group', 'Qassim Project', 'Consultant Plastic Surgeon', 'Western qualification, Male only', 'sohaila@allocationassist.com', 'high'),
  ('Solaiman Alhabib Medical Group', 'Qassim Project', 'Consultant Neurology', 'Western qualification, Bilingual (Arabic/English), Any gender', 'sohaila@allocationassist.com', 'high'),
  ('Solaiman Alhabib Medical Group', 'Qassim Project', 'Consultant Endocrinology', 'Western qualification, Bilingual (Arabic/English), Any gender', 'sohaila@allocationassist.com', 'high'),
  ('Solaiman Alhabib Medical Group', 'AlQassim Project', 'Male Consultant ICU', 'Arabic speaker, open to Qassim (high package)', 'sohaila@allocationassist.com', 'high'),
  ('NMC', 'AUH (Abu Dhabi)', 'Specialist Endocrinology', '45-50k package (3 positions, non-Arabic & Arabic profile)', 'ishak@allocationassist.com', 'high'),
  ('NMC', 'AUH (Abu Dhabi)', 'Child Psychiatrist', 'With license', 'ishak@allocationassist.com', 'high'),
  ('NMC', 'AUH (Abu Dhabi)', 'Consultant ENT Head & Neck', 'Arabic speaker', 'ishak@allocationassist.com', 'high'),
  ('NMC', 'AUH (Abu Dhabi)', 'Specialist Neonatologist', 'Arabic speaker (2 positions)', 'ishak@allocationassist.com', 'high'),
  ('NMC', 'AUH (Abu Dhabi)', 'Consultant Orthopedic Trauma Surgery', null, 'ishak@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Consultant Fetal Medicine', 'Title eligible', 'ishak@allocationassist.com', 'high'),
  ('Mediclinic', null, 'ENT', 'Western, head & neck and airway management', 'ishak@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Neurosurgeon Consultant', 'Strong Cranial logbook', 'ishak@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Consultant Female Dermatologist', 'Female', 'ishak@allocationassist.com', 'high'),
  ('Mediclinic', null, 'OBGYN', 'Western', 'mohamed.othman@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Gastro', 'Western', 'mohamed.othman@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Dermatologist', 'Western', 'mohamed.othman@allocationassist.com', 'high'),
  ('Mediclinic', null, 'PICU Specialists', 'Multiple requests, can obtain relevant title', 'mohamed.othman@allocationassist.com', 'high'),
  ('Mediclinic', null, 'Clinical Psychologist', 'Oncology experience', 'mohamed.othman@allocationassist.com', 'high'),
  ('Mediclinic', 'Dubai', 'Interventional MSK Radiologist', null, 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Consultant Physician – Neonatology', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Consultant Physician – Fetal Medicine', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Specialist Physician – Fetal Medicine', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Consultant Physician – Child Psychiatry', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Consultant Physician – Paediatric Interventional Radiology', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Paediatric Physical Medicine & Rehabilitation Consultant', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Paediatric ENT Consultant', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Paediatric Orthopaedic Surgery Consultant', 'Tier 1 Qualification, Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Paediatric Radiology Consultant', 'Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('SKMC', 'Abu Dhabi', 'Paediatrics – Gastroenterology Consultant', '7+ years experience, leadership experience, American Board preferred, Priority', 'mohamed.othman@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Female Consultant Endocrinologist', 'American Boarded', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Family Medicine', 'Tier 1 Western / American Board or UK CCT', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Neurosurgeon', 'Tier 1', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Emergency Medicine', 'Tier 1 Canadian or American Board / UK CCT', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Consultant Pulmonologist', 'Tier 1, American Board certified', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Consultant Pediatric Pulmonologist', null, 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Consultant Psychiatrist', 'Tier 1, Arabic speaker', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Specialist Hematologist', null, 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Consultant OB/GYN', 'Arabic speaker', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Consultant Haematology & Oncology', 'BMT experience', 'ishak@allocationassist.com', 'high'),
  ('American Hospital Dubai (AHD)', 'Dubai', 'Internal Medicine', 'American Board, Tier 1', 'ishak@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Pediatric Ophthalmology', null, 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Breast Oncoplasty', 'Female', 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'ENT Rhinoplasty', null, 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Fetal Medicine', null, 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Gastroenterology (ERCP)', 'Female', 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'General Paediatrics', null, 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Dermatology', 'Female', 'mohamed.othman@allocationassist.com', 'high'),
  ('STMC & Tawam', 'Abu Dhabi', 'Consultant Physical Medicine & Rehabilitation', 'Doing pediatric', 'mohamed.othman@allocationassist.com', 'high'),
  ('Bascom Palmer', 'Abu Dhabi', 'Pediatric Ophthalmologist', 'UK- or Europe-qualified with clinical experience', 'mohamed.othman@allocationassist.com', 'high'),
  ('Bascom Palmer', 'Abu Dhabi', 'Ophthalmologist', 'UK- or Europe-qualified, strong Neuro-Ophthalmology experience', 'mohamed.othman@allocationassist.com', 'high'),
  ('SEHA', 'Abu Dhabi', 'Consultant Psychiatry', 'Geriatric fellowship, Arabic speaker', 'mohamed.othman@allocationassist.com', 'high'),
  ('SEHA', 'Abu Dhabi', 'Consultant Child Psychiatry', 'Arabic speaker', 'mohamed.othman@allocationassist.com', 'high'),
  ('King Faisal Hospital', 'Jeddah', 'Consultant, Pediatric Hematology / Oncology / Stem Cell Transplantation & Cellular Therapy', 'Priority to North American training, followed by UK (CCST/CCT), Australian (FRACP), or European cert; Age under 58', 'sohaila@allocationassist.com', 'high')
)
insert into public.vacancies
  (hospital_id, hospital_name, city, specialty, priority, status, notes, opened_by, opened_at)
select
  (
    select h.id from public.hospitals h
    where lower(trim(h.name)) = lower(trim(i.hospital_name))
       or lower(trim(h.name)) = lower(trim(regexp_replace(i.hospital_name, '\s*\(.*\)\s*$', '')))
    order by length(h.name)
    limit 1
  ),
  i.hospital_name,
  i.city,
  i.specialty,
  i.priority,
  'open',
  i.notes,
  i.opened_by,
  now()
from incoming i;

commit;

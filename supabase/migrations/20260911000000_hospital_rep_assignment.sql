-- Hospital representatives, per the roster Saif/Ammar confirmed 2026-09-11.
--
-- Three books, split by country: Sohaila takes Saudi Arabia and Qatar, Ishak and
-- Mohamed split the UAE. Rodaina comes off the hospital book entirely, so the
-- rows that were hers either move to whoever the roster names or go back to
-- unassigned.
--
-- Matched by exact name, so a hospital renamed since this was written is simply
-- skipped rather than mis-assigned. Rows the roster never mentioned keep
-- whatever owner they already had.

update hospitals h
   set owner_email = v.owner_email
  from (values
  ('Al Ain Hospital', 'ishak@allocationassist.com'),
  ('Al Amal Psychiatric Hospital DXB', 'ishak@allocationassist.com'),
  ('Al Amal Psychiatric Hospital, Ministry of Health and Prevention', 'ishak@allocationassist.com'),
  ('Al Jalila Children''s Hospital', 'ishak@allocationassist.com'),
  ('Al Kalma Health', 'ishak@allocationassist.com'),
  ('Al Zahra Hospital', 'ishak@allocationassist.com'),
  ('Ambulatory Services', 'ishak@allocationassist.com'),
  ('American Center of Psychiatry and Neurology', 'ishak@allocationassist.com'),
  ('American Hospital', 'ishak@allocationassist.com'),
  ('Capital Health', 'ishak@allocationassist.com'),
  ('Clemenceau Hospital', 'ishak@allocationassist.com'),
  ('Cleveland Clinic', 'ishak@allocationassist.com'),
  ('CosmeSurge', 'ishak@allocationassist.com'),
  ('DHA GOV HOSPITALS', 'ishak@allocationassist.com'),
  ('Dubai Health Authority', 'ishak@allocationassist.com'),
  ('HealthBay', 'ishak@allocationassist.com'),
  ('International Modern Hospital', 'ishak@allocationassist.com'),
  ('Kings College Hospital', 'ishak@allocationassist.com'),
  ('Latifa Hospital', 'ishak@allocationassist.com'),
  ('Maudsley Health', 'ishak@allocationassist.com'),
  ('Mediclinic Airport Road Hospital', 'ishak@allocationassist.com'),
  ('Mediclinic Al Jowhara', 'ishak@allocationassist.com'),
  ('NMC Hospital AUH', 'ishak@allocationassist.com'),
  ('Novomed Centers', 'ishak@allocationassist.com'),
  ('Priory Wellbeing Centre Dubai', 'ishak@allocationassist.com'),
  ('Rashid Hospital', 'ishak@allocationassist.com'),
  ('Reem Hospital', 'ishak@allocationassist.com'),
  ('Saudi German Hospital Dubai', 'ishak@allocationassist.com'),
  ('Sharjah University Hospital', 'ishak@allocationassist.com'),
  ('Sheikh Shakhbout Medical City', 'ishak@allocationassist.com'),
  ('Tarmeem Hospital', 'ishak@allocationassist.com'),
  ('The LightHouse Arabia DXB', 'ishak@allocationassist.com'),
  ('The Valens Clinic DXB', 'ishak@allocationassist.com'),
  ('Bascom Palmer August Medical Eye Institute', 'mohamed.othman@allocationassist.com'),
  ('Medcare', 'mohamed.othman@allocationassist.com'),
  ('Mubadala', 'mohamed.othman@allocationassist.com'),
  ('RAK Hospital', 'mohamed.othman@allocationassist.com'),
  ('Sheikh Khalifa Medical City', 'mohamed.othman@allocationassist.com'),
  ('Sheikh Khalifa Medical City Abu Dhabi (SEHA)', 'mohamed.othman@allocationassist.com'),
  ('Tawam Hospital', 'mohamed.othman@allocationassist.com'),
  ('Al Rajhi Medicine', 'sohaila@allocationassist.com'),
  ('Almoosa Hospital', 'sohaila@allocationassist.com'),
  ('Aman Hospital', 'sohaila@allocationassist.com'),
  ('Apex Health The View', 'sohaila@allocationassist.com'),
  ('Aramco', 'sohaila@allocationassist.com'),
  ('Hamad Corporate', 'sohaila@allocationassist.com'),
  ('King Abdullah bin Abdulaziz University Hospital', 'sohaila@allocationassist.com'),
  ('King Fahad Medical City', 'sohaila@allocationassist.com'),
  ('King Khaled Eye Specialist Hospital', 'sohaila@allocationassist.com'),
  ('King''s College Hospital London, Jeddah', 'sohaila@allocationassist.com'),
  ('Ministry of National Guard Health Affairs', 'sohaila@allocationassist.com'),
  ('Naufar', 'sohaila@allocationassist.com'),
  ('Primary Health Care Corporation', 'sohaila@allocationassist.com'),
  ('Saudi German Hospital KSA', 'sohaila@allocationassist.com'),
  ('Sidra Medicine', 'sohaila@allocationassist.com'),
  ('Al Kalma', NULL),
  ('American Center of Psychiatry and Neurology DXB', NULL),
  ('American Hospital Dubai', NULL),
  ('Ardens Medical Center DXB', NULL),
  ('Bascom Palmer Eye Institute', NULL),
  ('Capital Health (Gretchen)', NULL),
  ('DHA Government Hospitals', NULL),
  ('Emirates Group', NULL),
  ('Emirates specialty hospital DHCC', NULL),
  ('Hamdan Bin Rashid Cancer Hospital', NULL),
  ('Kings College Hospital Dubai', NULL),
  ('Maudsley Health AUH', NULL),
  ('QIRONSALUD SPECIALITY HOSPITAL', NULL),
  ('QironSalud Specialty Hospital', NULL),
  ('Royal Health Group', NULL),
  ('Royal Health Group Al Ain', NULL),
  ('SEHA Al Dhafra', NULL),
  ('Tawam Hospital AUH STMC', NULL)
) as v(name, owner_email)
 where h.name = v.name
   and h.owner_email is distinct from v.owner_email;

-- Hospital spellings → one hospital, for the placement importer.
--
-- The monthly sheets name the same hospital many ways ("NMC-AUH", "NMC -AUH",
-- "NMC AUH"), and the importer matched journeys on the exact text, so every
-- new spelling started a duplicate journey. This table is the agreed list:
-- each spelling the AA team uses → the sheet-style name placement_attempts
-- stores, plus the hospitals-table record it belongs to when there is one.
--
-- Matching is on alias_key — lower case, letters and digits only — so spacing,
-- hyphens, brackets and case never create a new hospital. Genuinely different
-- sites (HMG Olaya vs HMG Rayan, SKMC vs SKMC Fujairah) stay separate entries.
-- The importer preview adds rows here when someone maps a new spelling.
--
-- Seeded from the list approved on 2026-09-23 (NMC AD = AUH, Mediclinic
-- AD = AUH; everything else kept separate).

create table if not exists public.hospital_aliases (
  alias         text        not null,
  alias_key     text        generated always as (lower(regexp_replace(alias, '[^a-zA-Z0-9]', '', 'g'))) stored,
  hospital_name text        not null,     -- the name placement_attempts.hospital_name stores
  hospital_id   uuid        references public.hospitals(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now()
);

create unique index if not exists hospital_aliases_key_idx on public.hospital_aliases (alias_key);

alter table public.hospital_aliases enable row level security;

drop policy if exists "service role full hospital_aliases" on public.hospital_aliases;
create policy "service role full hospital_aliases"
  on public.hospital_aliases for all to service_role using (true) with check (true);

drop policy if exists "auth read hospital_aliases" on public.hospital_aliases;
create policy "auth read hospital_aliases"
  on public.hospital_aliases for select to authenticated using (true);

drop policy if exists "auth write hospital_aliases" on public.hospital_aliases;
create policy "auth write hospital_aliases"
  on public.hospital_aliases for all to authenticated using (true) with check (true);

-- (spelling, name stored, hospitals-table record)
insert into public.hospital_aliases (alias, hospital_name, hospital_id)
select v.alias, v.hospital_name,
       (select h.id from public.hospitals h where h.name = v.record order by h.created_at limit 1)
from (values
  ('ACP',                                  'ACPN', 'American Center of Psychiatry and Neurology'),
  ('ACPN',                                 'ACPN', 'American Center of Psychiatry and Neurology'),
  ('AH',                                   'AH', 'American Hospital'),
  ('American Hospital',                    'AH', 'American Hospital'),
  ('AHD',                                  'AHD', 'American Hospital Dubai'),
  ('American Hospital (Dubai)',            'AHD', 'American Hospital Dubai'),
  ('Ain Al Khaleej',                       'Ain Al Khaleej', null),
  ('Al Ahli',                              'Al Ahli Qatar', 'Alahli Hospital'),
  ('Al Ahli Qatar',                        'Al Ahli Qatar', 'Alahli Hospital'),
  ('Al Ain Hospital',                      'Al Ain Hospital', 'Al Ain Hospital'),
  ('Alamal Psychiatry',                    'Al Amal Psychiatry', null),
  ('AlDhafra',                             'Al Dhafra', 'Al Dhafra Hospital (SEHA)'),
  ('Dhafra',                               'Al Dhafra', 'Al Dhafra Hospital (SEHA)'),
  ('Al Kalma',                             'Al Kalma', 'Al Kalma Health'),
  ('Al Kalma Health',                      'Al Kalma', 'Al Kalma Health'),
  ('Al Zahra',                             'Al Zahra', 'Al Zahra Hospital'),
  ('ALzhara',                              'Al Zahra', 'Al Zahra Hospital'),
  ('Almoosa',                              'Almoosa', 'Almoosa Hospital'),
  ('ALMOSSA IVF',                          'Almoosa', 'Almoosa Hospital'),
  ('Alrajhi',                              'Alrajhi', 'AlRajhi Hospital'),
  ('Aman',                                 'Aman', 'Aman Hospital'),
  ('Aman Hospital',                        'Aman', 'Aman Hospital'),
  ('APEX',                                 'Apex Health', 'Elegancia group (The View - KMC - MMCH)'),
  ('Apex Health',                          'Apex Health', 'Elegancia group (The View - KMC - MMCH)'),
  ('Aramco',                               'Aramco', 'Aramco'),
  ('Ardens',                               'Ardens', 'Ardens Medical Centre'),
  ('Asparis',                              'Aspris', null),
  ('Aspris',                               'Aspris', null),
  ('Bascom',                               'Bascom Palmer', 'Bascom Palmer Eye Institute'),
  ('Bascom Palmer',                        'Bascom Palmer', 'Bascom Palmer Eye Institute'),
  ('BMC',                                  'BMC', null),
  ('BMC (Abu Dhabi)',                      'BMC AD', null),
  ('BMC AD',                               'BMC AD', null),
  ('BMC - Al Ain',                         'BMC Al Ain', null),
  ('BMC (Dubai)',                          'BMC Dubai', null),
  ('BMC-DXB',                              'BMC Dubai', null),
  ('BMC - Sh',                             'BMC Sharjah', null),
  ('BMC Sharjah',                          'BMC Sharjah', null),
  ('Burjeel',                              'Burjeel Al Ain', 'Burjeel Abu Dhabi and Al Ain'),
  ('Burjeel -Ain',                         'Burjeel Al Ain', 'Burjeel Abu Dhabi and Al Ain'),
  ('Burjeel Al Ain',                       'Burjeel Al Ain', 'Burjeel Abu Dhabi and Al Ain'),
  ('Burjeel -DXB',                         'Burjeel Dubai', 'Burjeel Hospital - Dubai'),
  ('Burjeel Dubai',                        'Burjeel Dubai', 'Burjeel Hospital - Dubai'),
  ('Capital',                              'Capital Health', 'Capital Health'),
  ('Capital Health',                       'Capital Health', 'Capital Health'),
  ('Child Fertility',                      'Child Fertility', 'Child Fertility'),
  ('Dallah',                               'Dallah', 'Dallah Hospital'),
  ('Ego',                                  'Ego Center', null),
  ('Ego Center',                           'Ego Center', null),
  ('EIH',                                  'EIH', null),
  ('Fakih IVF',                            'Fakih IVF', 'Fakih IVF Fertility Center'),
  ('FUH',                                  'FUH', null),
  ('Fujairah University Hospital',         'FUH', null),
  ('Gargash Hospital',                     'Gargash Hospital', 'Gargash Hospital'),
  ('Al Garhoud Hospital',                  'Garhoud', 'Al Garhoud Hospital'),
  ('Garhoud',                              'Garhoud', 'Al Garhoud Hospital'),
  ('Glucare',                              'Glucare', 'Glucare'),
  ('Hamad',                                'Hamad', 'Hamad Medical Corporate'),
  ('Hamad ( Rumailah )',                   'Hamad', 'Hamad Medical Corporate'),
  ('Harley Clinic',                        'Harley Street', 'Harley Street Medical'),
  ('Harley Street',                        'Harley Street', 'Harley Street Medical'),
  ('Harley Street Medical',                'Harley Street', 'Harley Street Medical'),
  ('Harly street',                         'Harley Street', 'Harley Street Medical'),
  ('HealthBay',                            'HealthBay', 'HealthBay'),
  ('HMG',                                  'HMG', 'Sulaiman Al Habib'),
  ('HMG (Dubai)',                          'HMG Dubai', 'Sulaiman Al Habib Dubai'),
  ('HMG Hamra',                            'HMG Hamra', null),
  ('HMG (Jeddah)',                         'HMG Jeddah', 'Sulaiman Al Habib Jeddah'),
  ('HMG (Khobar)',                         'HMG Khobar', null),
  ('HMG Alkhobar',                         'HMG Khobar', null),
  ('HMG (olaya)',                          'HMG Olaya', null),
  ('HMG (Qassim)',                         'HMG Qassim', null),
  ('HMG (Qsm)',                            'HMG Qassim', null),
  ('HMG Al Qassim',                        'HMG Qassim', null),
  ('HMG (rayan)',                          'HMG Rayan', null),
  ('HMG Riyadh',                           'HMG Riyadh', 'Sulaiman Al Habib Riyadh'),
  ('HMG- Riydah',                          'HMG Riyadh', 'Sulaiman Al Habib Riyadh'),
  ('HMG (sahafa)',                         'HMG Sahafa', null),
  ('HMG (takasusi)',                       'HMG Takhassusi', null),
  ('HMG Takhassusi',                       'HMG Takhassusi', null),
  ('HMS',                                  'HMS', null),
  ('KCH',                                  'KCH', null),
  ('King''s',                              'KCH', null),
  ('King''s College Hospital',             'KCH', null),
  ('KFSH',                                 'KFSH', 'King Faisal Specialist Hospital & Research Center'),
  ('KFSHRC',                               'KFSH', 'King Faisal Specialist Hospital & Research Center'),
  ('KKSEH',                                'KKSEH', 'King Khaled Eye Specialist Hospital'),
  ('Apex — KMC',                           'KMC', null),
  ('KMC',                                  'KMC', null),
  ('KMC Qatar',                            'KMC', null),
  ('Maudsely',                             'Maudsley Health', 'Maudsley Health'),
  ('Maudsley Health',                      'Maudsley Health', 'Maudsley Health'),
  ('Muadsley Health',                      'Maudsley Health', 'Maudsley Health'),
  ('Medcare',                              'Medcare', 'Medcare'),
  ('Medcare (Dubai)',                      'Medcare', 'Medcare'),
  ('Medicalinic',                          'Mediclinic', 'Mediclinic Hospital'),
  ('Mediclinic',                           'Mediclinic', 'Mediclinic Hospital'),
  ('Mediclinc AUH',                        'Mediclinic Abu Dhabi', null),
  ('Mediclinic - AD',                      'Mediclinic Abu Dhabi', null),
  ('Mediclinic - AUH',                     'Mediclinic Abu Dhabi', null),
  ('Mediclinic Abu Dhabi',                 'Mediclinic Abu Dhabi', null),
  ('Mediclinic- Ramya',                    'Mediclinic- Ramya', null),
  ('Metabolic',                            'Metabolic', 'Metabolic Health'),
  ('MHD-Mohamadiyah',                      'MHD Mohamadiyah', null),
  ('Mirdif',                               'Mirdif', 'Mirdif Hospital'),
  ('Apex — MMCH',                          'MMCH', null),
  ('MMCH',                                 'MMCH', null),
  ('MMCH Apex Health',                     'MMCH', null),
  ('MMCH Qatar',                           'MMCH', null),
  ('MNGHA',                                'MNGHA', 'Ministry of National Guard Health Affairs'),
  ('MNGHA (Al Ahsa)',                      'MNGHA Al Ahsa', 'MNGHA Al Ahsa'),
  ('MNGHA Ahsa',                           'MNGHA Al Ahsa', 'MNGHA Al Ahsa'),
  ('MNGHA (Jeddah)',                       'MNGHA Jeddah', 'MNGHA Jeddah'),
  ('MNGHA (Qassim)',                       'MNGHA Qassim', 'MNGHA Qassim'),
  ('MNGHA (Riyadh)',                       'MNGHA Riyadh', 'MNGHA Riyadh'),
  ('MNGHA  Taif',                          'MNGHA Taif', 'MNGHA Taif'),
  ('Moorfield',                            'Moorfields', 'Moorfields Eye Hospital'),
  ('Moorfields',                           'Moorfields', 'Moorfields Eye Hospital'),
  ('Moorfile',                             'Moorfields', 'Moorfields Eye Hospital'),
  ('NMC',                                  'NMC', 'NMC Hospital'),
  ('NMC - AD',                             'NMC Abu Dhabi', 'NMC Abu Dhabi'),
  ('NMC - AUH',                            'NMC Abu Dhabi', 'NMC Abu Dhabi'),
  ('NMC Abu Dhabi',                        'NMC Abu Dhabi', 'NMC Abu Dhabi'),
  ('NMC- AED',                             'NMC Abu Dhabi', 'NMC Abu Dhabi'),
  ('NMC Al Ain',                           'NMC Al Ain', null),
  ('NMC-Alan',                             'NMC Al Ain', null),
  ('NMC - Dubai',                          'NMC Dubai', 'NMC Hospital Dubai'),
  ('NMC-Nahda',                            'NMC Nahda', null),
  ('NMC - Sharjah',                        'NMC Sharjah', 'NMC Sharjah'),
  ('NMC-Sh',                               'NMC Sharjah', 'NMC Sharjah'),
  ('NMC-Shj',                              'NMC Sharjah', 'NMC Sharjah'),
  ('NMC- Selby',                           'NMC- Selby', null),
  ('NMC-Gopika',                           'NMC-Gopika', null),
  ('Prime',                                'Prime', 'Prime Hospital'),
  ('Prime Hospital',                       'Prime', 'Prime Hospital'),
  ('Pure-health',                          'Pure-health', null),
  ('Quironsalud',                          'Quironsalud', 'Quironsalud Specialty Hospital'),
  ('RAK',                                  'RAK', 'RAK Hospital'),
  ('RAK Hospital',                         'RAK', 'RAK Hospital'),
  ('Red Sea - Amala - Turtle Bay project', 'Red Sea Project', null),
  ('Red Sea Project',                      'Red Sea Project', null),
  ('Reem Hospital',                        'Reem Hospital', 'Reem Hospital'),
  ('SAKINA',                               'SAKINA', null),
  ('Seha',                                 'SEHA', 'SEHA'),
  ('Saudi German',                         'SGH', 'Saudi German Hospital'),
  ('Saudi German Hospital',                'SGH', 'Saudi German Hospital'),
  ('SGH',                                  'SGH', 'Saudi German Hospital'),
  ('Saudi German Jeddah',                  'SGH Jeddah', null),
  ('SGH Jeddah',                           'SGH Jeddah', null),
  ('Sidra',                                'Sidra', 'Sidra Medicine'),
  ('Sidra Qatar',                          'Sidra', 'Sidra Medicine'),
  ('Silkor',                               'Silkor', null),
  ('SKHF',                                 'SKHF', null),
  ('SKMC',                                 'SKMC', 'Sheikh Khalifa Medical City'),
  ('SKMC - Michael',                       'SKMC - Michael', null),
  ('SKMC -FUH',                            'SKMC Fujairah', null),
  ('SKMC Fujairah',                        'SKMC Fujairah', null),
  ('SKMC Fujiarah',                        'SKMC Fujairah', null),
  ('ssmc',                                 'SSMC', 'Sheikh Shakhbout Medical City'),
  ('STMC',                                 'STMC', 'Sheikh Tahnoun Medical City(STMC)'),
  ('SUH',                                  'SUH', null),
  ('Tarmeem',                              'Tarmeem', 'Tarmeem Hospital'),
  ('TAWAM',                                'Tawam', 'Tawam Hospital'),
  ('The light house',                      'The light house', 'The Light House Arabia'),
  ('Apex — The View',                      'The View', 'Apex Health The View'),
  ('Apex View',                            'The View', 'Apex Health The View'),
  ('The View',                             'The View', 'Apex Health The View'),
  ('Trellis Hospital',                     'Trellis Hospital', null),
  ('UHS',                                  'UHS', 'Sharjah University Hospital'),
  ('University Hospital Sharjah',          'UHS', 'Sharjah University Hospital'),
  ('Valens Clinic',                        'Valens Clinic', 'The Valens Clinic DXB'),
  ('WHH',                                  'WHH', null),
  ('WHH-Womens Health project',            'WHH', null),
  ('Women''s Health Hospital',             'WHH', null),
  ('Yas Clinic',                           'Yas Clinic', null),
  ('Zayed Military',                       'Zayed Military', 'Zayed Military Hospital'),
  ('ZMH',                                  'Zayed Military', 'Zayed Military Hospital'),
  ('Zulekha',                              'Zulekha', 'Zulekha Hospital'),
  ('Zulekha (Sharjah)',                    'Zulekha', 'Zulekha Hospital')
) as v(alias, hospital_name, record)
on conflict (alias_key) do nothing;

-- Spellings that appear in the sheets but not (yet) in placement_attempts.
-- Only the plain misspellings are seeded. The rest — "UK HMG", "NMC-DIP",
-- "KFSH - Jeddah", "Fakih IVF -Qatar", "National Guard", "Health Pay", "UK" —
-- are left unknown on purpose, so the import preview asks a person whether
-- each is a new hospital or another name for one we already have.
insert into public.hospital_aliases (alias, hospital_name, hospital_id)
select v.alias, v.hospital_name,
       (select h.id from public.hospitals h where h.name = v.record order by h.created_at limit 1)
from (values
  ('BMC-SHJ',       'BMC Sharjah',   null),
  ('Harlet Street', 'Harley Street', 'Harley Street Medical'),
  ('AlKalema',      'Al Kalma',      'Al Kalma Health')
) as v(alias, hospital_name, record)
on conflict (alias_key) do nothing;

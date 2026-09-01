-- About-Us links + descriptions for the UAE hospitals, taken from the team's
-- real single-hospital "Working Opportunity in <city> - <hospital>" sends
-- (mitchell-from-opportunities all-dates export). Companion to
-- 20260901000000_hospital_about_us_links.sql which seeded KSA + Qatar.
--
-- website  -> host-guarded: only set when empty or when the existing value is a
--             homepage on the SAME host (we deepen it to the About-Us page);
--             never clobber a different host someone entered by hand.
-- description -> only set when currently empty, so hand-written blurbs win.
-- Every row is matched on a distinctive name token AND city to avoid the
-- multi-emirate collisions (e.g. NMC / Mediclinic exist in several cities).

do $$
declare
  w int := 0; d int := 0; n int;
begin

  update public.hospitals set website = 'https://www.seha.ae/hospital-detail/45', updated_at = now()
   where name ilike '%dhafra%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'seha.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Al Dhafra Hospitals is part of the Abu Dhabi Health Services Company ""SEHA"", the largest healthcare network in the UAE, which is part of the Pure Health Group, the largest integrated healthcare platform in the country. Al Dhafra Hospitals is committed to managing and operating six hospitals: Madinat Zayed Hospital, Ghayathi Hospital, Al Sila Hospital, Delma Hospital, Liwa Hospital and Al Marfa Hospital, and two medical centers: Al Dhafra Family Medicine Center and Bida Al Mutawa Medical Center, in addition to two clinics each, Abu Al Abyad Clinic and Sir Bani Yas Clinic. These hospitals, centers and clinics provide medical services within more than 40 different specialties for inpatients and outpatients in various fields and specialties, the most important of which are internal medicine, cardiology, endocrinology, diabetes, mental health, nutrition, pediatrics, obstetrics, gynecology, general surgery, anesthesia, pharmacy services, laboratory and diagnostic radiology. Al Dhafra hospitals seek to provide integrated and distinguished health care with the highest international standards of quality and safety to enhance patients'' confidence in the services of Al Dhafra hospitals.', updated_at = now()
   where name ilike '%dhafra%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.aspris.ae/our-location/abu-dhabi/', updated_at = now()
   where name ilike '%aspris%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'aspris.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Aspris Wellbeing Centre Abu Dhabi (formerly Priory) is the second Aspris clinic in the UAE and part of a wider network offering mental health treatment to those in need of support. Their Wellbeing Centre is a purpose-built clinic located in Al Bateen and provides a welcoming and modern environment, ideal for starting your recovery journey. Aspris is extremely well placed to bring reputable, safe and pioneering mental health treatment to the UAE and the centre is an opportunity for us to offer the same level of support to you, as it does for those in the UK.', updated_at = now()
   where name ilike '%aspris%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.bascompalmer.ae/explore-how-bascom-palmer-uae-blends-world%e2%80%91class-expertise-innovation-and-compassionate-care-to-protect-and-restore-vision-in-the-uae/', updated_at = now()
   where name ilike '%bascom palmer%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'bascompalmer.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Now in Abu Dhabi, Bascom Palmer brings its legacy of innovation and expertise to the heart of the UAE. Their institute combines cutting-edge technology with compassionate patient care, offering the highest standards of treatment for vision-related conditions. From routine eye examinations to complex surgeries, their team of internationally trained specialists is dedicated to preserving and restoring sight. They are committed to serving the community with the same values that have made Bascom Palmer a trusted name in eye care worldwide: excellence, innovation, compassion, and education. By bridging global expertise with local care, they aim to advance ophthalmology in the region and improve the quality of life for their patients.', updated_at = now()
   where name ilike '%bascom palmer%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://burjeel.com/burjeelmedicalcity/', updated_at = now()
   where name ilike '%burjeel medical city%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'burjeel.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Burjeel Holdings''s flagship hospital, Burjeel Medical City is the most comprehensive private quaternary care hospital in Abu Dhabi. The Burjeel hospitals have been at the forefront of healthcare services in the region and have emerged as the Center of Medical Excellence across the UAE. Over the years, Burjeel has built a strong sense of trust in the hearts of every patient we come across by serving them in all walks of life along with state-of-the-art facilities, and in-depth expertise. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%burjeel medical city%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://srh.ae/about-us/', updated_at = now()
   where name ilike '%capital health%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'srh.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'At Specialized Rehabilitation Hospital, they offer a purpose built facility with state of the art equipment and clinical expertise to take care of all rehabilitation patients and their individualized needs. Their Bayt Al Qudra™ house of ability helps patients rebuild their lives that are recovering from life-changing illness or injury. Their focus is on their patient outcomes to help patients regain independence and mobility. They are affiliated with The Shirley Ryan Ability Lab ( previously known as the Rehabilitation Institute of Chicago ) and now offer world class rehabilitation services in the heart of Abu Dhabi. Their specialized Doctors, Therapists and expert teams work together to create a comprehensive rehabilitation program with advanced treatment and cutting-edge technologies including latest bionics and robotics. Their continuum of care provides Inpatient and Outpatient rehabilitation services including Post-Acute Rehabilitation, Long Term Care- Adults and Pediatrics, Long Term Ventilated Care with 24 hours ICU and HDU support. They are most proud of their SRH team for demonstrating Trust and Pride in the care they deliver each day motivated by their patients whose progress is the “real measure of their success”.', updated_at = now()
   where name ilike '%capital health%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.clevelandclinicabudhabi.ae/en/about-us', updated_at = now()
   where name ilike '%cleveland%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'clevelandclinicabudhabi.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Cleveland Clinic Abu Dhabi combines its patient-centered model of care with state-of-the-art amenities and world-class clinical practices to deliver exceptional medical care that has redefined the healthcare landscape in the region. Cleveland Clinic Abu Dhabi is a physician-led medical institution served by western board-certified physicians and multidisciplinary teams who bring expertise across more than 50 medical and surgical specialties. The hospital the hospital aligns with Abu Dhabi’s Economic Vision 2030, fostering a robust healthcare ecosystem while providing patients with access to world-class care closer to home. Cleveland Clinic Abu Dhabi is composed of 8 institutes, each tailored to meet the region’s distinct healthcare needs while prioritizing the Patients First philosophy. Every aspect of Cleveland Clinic Abu Dhabi, from state-of-the-art clinical technology to thoughtfully curated patient spaces, has been meticulously crafted to ensure a seamless and culturally attuned experience. From tranquil, family-friendly waiting areas to wholesome culinary offerings and private, comfortable patient rooms, the hospital creates an environment that enhances patient outcomes. As a designated research and teaching facility licensed by the Department of Health – Abu Dhabi, Cleveland Clinic Abu Dhabi is at the forefront of medical innovation, driving advancements in clinical care, research and education. It is the first hospital in the UAE to receive Provisional Accreditation from ACCME®, allowing it to certify Continuing Medical Education (CME) activities. Cleveland Clinic Abu Dhabi’s commitment to excellence has earned global recognition. For the second consecutive term, the hospital achieved the Magnet® designation for nursing and patient care, reaffirming its dedication to compassionate care. The Ministry of Health and Prevention (MoHAP) named Cleveland Clinic Abu Dhabi the UAE’s top research hospital for the second consecutive year in 2024. The hospital was also ranked top UAE hospital on Newsweek’s World’s Best Hospitals from 2022 to 2025, and World’s Best Smart Hospitals from 2022 to 2026, demonstrating its ongoing commitment to bringing world-class care to the region and redefining healthcare delivery. Cleveland Clinic Abu Dhabi remains committed to transforming healthcare through innovation and exceptional patient care. Each milestone reflects the dedication of its caregivers, the trust of its patients, and its unwavering pursuit of excellence.', updated_at = now()
   where name ilike '%cleveland%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.hsmc.ae', updated_at = now()
   where name ilike '%harley street%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'hsmc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Harley Street Medical Centre has provided Abu Dhabi with quality healthcare since 2012 and has grown to become one of the leading multispecialty centers in the region. HSMC’s extraordinary patient care team consists of physicians, nurses, surgical technologists, medical assistants, and other administrative staff recognized for their excellence over the years by peers and patients. Their goal is for HSMC to be synonymous with the highest quality outpatient surgical care in the UAE.', updated_at = now()
   where name ilike '%harley street%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://maudsleyhealth.com/', updated_at = now()
   where name ilike '%maudsley%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'maudsleyhealth.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Maudsley Health is a collaboration between South London and Maudsley Health NHS Foundation Trust (The Maudsley), the oldest psychiatric institution in the world, and MACANI Medical Center, an Abu Dhabi-based medical organization set up to bring the highest quality mental health services to the Middle East. They aim to achieve the best possible outcomes for children and young people with mental health problems, and their families by providing high quality and comprehensive assessments, and internationally agreed evidence based interventions.', updated_at = now()
   where name ilike '%maudsley%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;
  update public.hospitals set description = 'Hi Dr. George! I hope you are doing well 😊 We have an opportunity with Mediclinic in Abu Dhabi and we highly recommended your profile.', updated_at = now()
   where name ilike '%mediclinic%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://nmc.ae/en/aboutus', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'nmc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, they have provided high quality, personalised, and compassionate care to their patients and are proud to have earned the trust of millions of people in the UAE and around the world. Their network is made up of 85 medical facilities, including JCI-accredited, multi-specialty hospitals in Abu Dhabi, Dubai, Sharjah, and Al Ain, as well as medical centres, community clinics, day surgery centres, home health services, and long-term care facilities throughout the UAE. The NMC Healthcare Group also includes the ProVita International Medical Centre and CosmeSurge. Whether it is providing comprehensive medical services directly to patients, or in collaboration with healthcare providers internationally, NMC Healthcare is committed to delivering high quality, personalised care that matters.', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.reemhospital.com/our-story/', updated_at = now()
   where name ilike '%reem%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'reemhospital.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Reem Hospital - Established in 2020 and with a capacity of over 200 beds, Reem Hospital is the first Post-acute Rehabilitation, and Multi-specialty Hospital built to provide quality and world-class care to patients throughout their recovery journey. By onboarding best-in-class doctors and integrating renewed advanced technologies as well as AI tracking and programming systems, they aim to provide you access to the world’s best healthcare services, reducing your need to seek medical support abroad. They are proudly operated by VAMED in partnership with Charité, one of the leading University Hospitals in Germany and Europe, with more than 300 years of experience in specialized pediatric care.', updated_at = now()
   where name ilike '%reem%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.seha.ae/hospital-detail/1#:~:text=Sheikh%20Khalifa%20Medical%20City%20(SKMC,and%2016%20Outpatient%20Specialty%20Clinics', updated_at = now()
   where name ilike '%khalifa medical city%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'seha.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Sheikh Khalifa Medical City (SKMC) is a flagship tertiary hospital in the UAE and the largest teaching medical center in Abu Dhabi. SKMC comprises 441 beds and 16 Outpatient Specialty Clinics. As an innovative market leader, SKMC has achieved numerous milestones, including the establishment of the UAE''s first and most comprehensive Kidney Transplant Center and the sole provider of pediatric kidney transplant services in the Emirate of Abu Dhabi. They also take pride in offering the largest Heart Program for Children in the UAE and the only Pediatric Cardiac Surgery Program in the Emirate of Abu Dhabi. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment. Thank you so much!', updated_at = now()
   where name ilike '%khalifa medical city%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://ssmc.ae/', updated_at = now()
   where name ilike '%shakhbout%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'ssmc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Sheikh Shakhbout Medical City is One of UAE’s largest hospitals, SSMC was established as part of the Abu Dhabi Economic Vision 2030 to elevate healthcare services in the Emirate. Their world-class medical destination reinforces their vision for positioning Abu Dhabi as a global healthcare hub. An integrated medical facility, Sheikh Shakhbout Medical City (SSMC) provides patients with:World-class healthcare and medical services Cutting-edge facilities, technologies and diagnostics The medical complex is a cornerstone of Abu Dhabi’s healthcare services which are aligned with global quality and safety standards to consolidate a new meaning for excellence.', updated_at = now()
   where name ilike '%shakhbout%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://tarmeem.com/about/', updated_at = now()
   where name ilike '%tarmeem%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'tarmeem.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Tarmeem Orthopedic and Spine Specialty Hospital, located in Abu Dhabi, was founded by Dr. Ali Alsuwaidi. Dr. Alsuwaidi, a highly respected orthopedic surgeon with over 25 years of experience, is the current President of the Emirates Orthopedic Society. In Tarmeem, Dr. Ali Al Suwaidi leads a team of specialized orthopedic surgeons, each one focusing on a unique medical specialty. These specialties include sports medicine, joint reconstructive surgery for the shoulder, knee, and hip, as well as treatments for spine and back pain, and issues related to the elbow, wrist, hand, foot, and ankle. At Tarmeem, patients are at the heart of their care. The hospital prides itself on offering highly personalized, seamless care that addresses the whole journey of the patient - from pain relief to restoring mobility and then to rehabilitation and preventive care. The medical team, comprising an international group of physicians, is complemented by patient coordinators and nurse navigators who guide each patient through their wellness journey. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%tarmeem%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://adscc.ae/who-we-are/', updated_at = now()
   where name ilike '%yas%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'adscc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'ADSCC is a renowned healthcare institution in Abu Dhabi, United Arab Emirates (UAE), specializing in advanced stem cell therapy, research, and regenerative medicine. Founded in 2018 to meet the growing demand for highly specialized medical services and treatments, ADSCC offers ground-breaking solutions in the region through cutting-edge research and innovative approaches in stem cell and cellular therapies. Equipped with the latest technologies and staffed by internationally recognized physicians and researchers. Our unique holistic model encompasses the entire spectrum of cell therapy, from basic research to clinical trials and applications, ensuring a comprehensive approach. ADSCC features state-of-the-art facilities, including advanced laboratories, cell processing laboratory, Good Manufacturing Practice (GMP) laboratory, apheresis and stem cell collection units, and a multi-disciplinary hospital with dedicated outpatient clinics and inpatient wards. Their comprehensive model covers research, clinical trials, and applications, eliminating the need for patients to seek treatment abroad. ADSCC is the incubator of the Abu Dhabi Bone Marrow Transplant (AD-BMT©) program, the first comprehensive program to provide autologous and allogeneic hematopoietic stem cells transplant (HSCT) for adult and pediatric patients in the UAE since 2020. As a Center of Excellence in Hematopoietic Stem Cell Transplantation accredited by the Department of Health Abu Dhabi, ADSCC’s holistic service model includes advanced research, clinical trials, translational care, and manufacturing capabilities. Their goal is to lead the field of cellular therapy, delivering highly specialized and innovative treatments while driving advancements in regenerative medicine. With a patient-centered approach and a commitment to innovation, they transform healthcare by offering cutting-edge solutions locally, enhancing the well-being of patients in the UAE and beyond. As the UAE’s first and most experienced stem cell transplant center, ADSCC has received multiple prestigious recognitions and conducted strategic collaborations, solidifying its position as a center of excellence. Thank you so much!', updated_at = now()
   where name ilike '%yas%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.emitachealthcare.com/our-success/zayed-military-hospital/#/', updated_at = now()
   where name ilike '%zayed military%' and city ilike '%Abu Dhabi%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'emitachealthcare.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Some information about Zayed Military Hospital : The Zayed Military Hospital is part of Zayed Military City. It is in the Al Shahama area, northeast of Abu Dhabi, UAE. The new hospital is designed as a 260-bed facility, including an ICU, Burn ICU, Cardiac Care Unit, medical, surgical, and pediatric beds. Also, the hospital has a psychiatric center located in a separate building, bringing the total aggregate number of beds to 300. The Zayed Military Hospital campus is 121,000 square meters built on 56 hectares of land. The campus includes an ambulatory care component, as well as housing for the Hospital’s staff and physicians. There are 1,500 parking spots that are ready to intake the Hospital’s staff, patients and visitors. Due to the enormous size of this project, there will be a second construction phase that is mainly designed for expansion, where the one bedroom will be expanded to be double room, and the overall bed’s capacity to reach 500. Since the Zayed Military Hospital has a specialty department for microsurgery, EHS handled the supply and the installation of Brainlab and Haag Streit products at the Neurology department of The Zayed Military Hospital. Haag Streit provides operating microscopes for several fields such as ophthalmology, neuro and spine surgery, ENT, plastic & reconstructive surgery as well as for dental and maxillary operations. This project is unique in terms of the built-up size and the facilities that it provides to its patients. It consists of one of the most innovative and advanced healthcare technologies in the UAE, such as Brainsuite ICT, Brainlab and Haag Streit. Thank you so much!', updated_at = now()
   where name ilike '%zayed military%' and city ilike '%Abu Dhabi%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;
  update public.hospitals set description = 'Hi Mitchell! I hope you are doing well! We heard of an opportunity with Burjeel Royal Hospital in Al Ain and we highly recommended your profile.', updated_at = now()
   where name ilike '%burjeel royal%' and city ilike '%Al Ain%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://nmc.ae/en/hospitals/al-ain/nmc-specialty-hospital-10', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Al Ain%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'nmc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Established in 2007, NMC Specialty Hospital, Al Ain is a multi-specialty hospital providing quality and trusted healthcare services to the people of Al Ain and the surrounding areas. The hospital is affiliated with all major national as well as international insurance companies and enjoys direct billing facilities with the insurance companies and third party administrators (TPA). Backed by a team of expert doctors, experienced nurses, and trained paramedics along with the support of advanced diagnostic equipment and cutting-edge technology, NMC Specialty Hospital, Al Ain offers a wide range of services in various specialties and super-specialties.', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Al Ain%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.seha.ae/hospital-detail/41', updated_at = now()
   where name ilike '%tahnoon%' and city ilike '%Al Ain%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'seha.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'STMC is a leading tertiary medical city , boasting 718 beds designed to deliver planned care more efficiently in a modern patient environment called the "Healing Oasis" concept. Their aim is to provide the highest quality healthcare possible, dedicated to excellence in everything they do, striving to be one of the Best Acute Healthcare Providers in the region. With specialized Centers of Excellence in Trauma, Orthopedics, and Rehabilitation, they offer the most effective setting with a Multidisciplinary Approach that standardizes best practices for emergency and elective surgery. As a teaching hospital and research center affiliated with the United Arab Emirates University, STMC is the preferred choice for healthcare professionals. Their state-of-the-art academic facilities drive groundbreaking research initiatives, shaping the future of healthcare. Their facilities include a standalone Rehabilitation Centre with 131 inpatient beds, an Emergency Department with 72 beds capacity, and advanced operating rooms catering to various surgical specialties. With over 35 unique subspecialty services, including Infectious Diseases, Neurology, Cardiology, and Rehabilitation Medicine, they ensure personalized and holistic care tailored to individual needs. Experience tranquility in their expansive Indoor Healing Garden, the largest in the GCC and Northern region, designed to promote healing and well-being for patients, staff, and visitors alike. Their Rehabilitation Hospital sets new standards in comprehensive care, seamlessly integrated with our tertiary hospital to ensure a smooth transition from acute care to full recovery. Advanced rehabilitation programs utilize cutting-edge technologies to address complex medical needs. Thank you so much!', updated_at = now()
   where name ilike '%tahnoon%' and city ilike '%Al Ain%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;
  update public.hospitals set description = 'Hello Mitchell! I hope you are doing well! We heard of an opportunity with Tawam Hospital in Al Ain and we highly recommended your profile.', updated_at = now()
   where name ilike '%tawam%' and city ilike '%Al Ain%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.gph.ae/en/about', updated_at = now()
   where name ilike '%garhoud%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'gph.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'They provides healthcare services of international quality and outstanding performance. They always strives to achieve the highest standards of medical quality and is always keen to provide the best medical services with a group of skilled Consultants and Specialists. The Hospital is located in Al Garhoud area - Dubai, which ensures easy access for patients from all parts of the Emirates and the neighboring GCC countries on account of its proximity to the airport. HMS Al Garhoud Hospital was opened in 2012 and has built a reputation for providing an international standard of quality care provided in a safe, comfortable and newly equipped facility. On its opening, in the same year, the hospital achieved international accreditation, Joint Commission International Award for meeting the highest standard of quality care and patient safety.', updated_at = now()
   where name ilike '%garhoud%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://dubaihealth.ae/l/197362', updated_at = now()
   where name ilike '%jalila%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'dubaihealth.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'At Al Jalila Children''s Hospital, they are dedicated to providing compassionate, comprehensive care for children from birth through to 18 years, all within a safe and family-friendly environment. They opened their doors in 2016 and are the UAE''s only standalone children''s hospital, proudly serving their diverse communities and striving for every child to have access to expert care for their optimal health and wellbeing. With all pediatric specialties under one roof, your child receives the specialized care they need - whether it''s a common childhood illness, or your little one requires specialist diagnosis and treatment, they offer 360-degree expertise across multiple medical and surgical specialties. These include Cardiac Care, Kidney Care and Kidney Transplantation, Neurosciences, Dermatology, Pediatric Critical Care and Pediatric Oncology, as well as Neonatology for their youngest newborn arrivals. They are committed to bringing the latest therapies and procedures to our region, so that families can access advanced treatment closer to home rather than traveling abroad. This includes our gene therapy program introduced in 2020 - a revolutionary program for the UAE, and one of the world’s largest programs for the genetic condition, spinal muscular atrophy (SMA). At Al Jalila Children’s Hospital, they are here for you. If your child is unwell or in need of specialized medical treatment, you can put your trust in them as they are dedicated to ensuring your child’s health, comfort and safety are our highest priority. They are here to support your child and your whole family through every step of their healthcare journey. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%jalila%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://azhd.ae/about/', updated_at = now()
   where name ilike '%zahra%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'azhd.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Al Zahra Hospital Dubai was established in 2013, with the main aim to provide premium medical care and comfort, through state of the art equipment and world class medical experts. Located on Sheikh Zayed Road, the hospital is Joint Commission International accredited, holding various prestigious certiﬁcations from international accreditation bodies around the world. The state-of-the-art facility has a capacity of 187 beds, serving patients with a broad range of health services, providing personalized service with a focus on clinical outcome through evidence based medicine. At Al Zahra Hospital Dubai, the extensive medical team of over 250 doctors and more than 400 nurses are highly experienced in their respective ﬁelds.', updated_at = now()
   where name ilike '%zahra%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://americancenteruae.com/about-acpn/', updated_at = now()
   where name ilike '%psychiatry%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'americancenteruae.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Welcome to American Center for Psychiatry and Neurology (ACPN), where mental health and wellbeing is their priority. ACPN is a subspecialist medical facility that provides you with quality medical care in neurology and psychiatry in the UAE. Opening their doors to patients in 2008, they have since expanded their facilities from Abu Dhabi to Dubai and Al Ain. Their services have touched the lives of over 100,000 patients throughout the years - a milestone built on your trust as their foundation throughout these years. Thank you so much!', updated_at = now()
   where name ilike '%psychiatry%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;
  update public.hospitals set description = 'Hello Dr. Mitchell! I hope you''re having a good day 😊 We have an opportunity with American Hospital in Dubai and we highly recommended your profile.', updated_at = now()
   where name ilike '%american hospital%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.cosmesurge.com/', updated_at = now()
   where name ilike '%cosmesurge%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'cosmesurge.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Cosmetic & Plastic Surgery in Dubai With over 25 years of experience, they aim to provide international standards of quality and treatment. Their team of highly qualified and internationally recognized Dermatologists and Plastic Surgeons in Dubai strives for 100% patient satisfaction with tailored treatment plans and provides quality medical care and service. They are proud to bring you the ultimate beauty destination; a state-of-the-art hospital dedicated to elegance and refinement. CosmeSurge hospital aims to cater to the increasing demand of cosmetic surgeries amongst residents and at the same time to bolster medical tourism across the region. The goal is to deliver a truly unique experience, providing a continuum of care that goes beyond just the walls of the facility. Their experts provide you with adequate after-care and support, so you have a partner to count on. Thank you so much!', updated_at = now()
   where name ilike '%cosmesurge%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://emirateshospitals.ae', updated_at = now()
   where name ilike '%emirates hospital%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'emirateshospitals.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Some information about Emirates Hospitals Group: Emirates Hospitals Group being at the forefront of medical excellence and innovation, positions itself as a premier provider of healthcare services across the Middle East. They are one of the UAE’s most trusted integrated healthcare service providers, having an extensive portfolio of fully serviced hospitals, specialty clinics, urgent care centres and pharmacies. The group offers an extensive array of services and a wide range of treatment options in every field of modern medicine and healthcare. It proudly boasts of highly advanced technologies, fully-equipped modern hospital rooms, state-of-the-art facilities, all backed by the expertise and reputation of a team of multidisciplinary doctors who possess rich regional and global knowledge. Emirates Hospitals Group continues to expand its presence in GCC at a remarkable pace. The group’s network is being further strengthened through acquisitions and the development of new facilities across GCC and other parts of the world, with the aim of achieving professional excellence in delivering quality care while adhering to regional and global standards in healthcare. Thank you so much!', updated_at = now()
   where name ilike '%emirates hospital%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.fuh.care/about-us/introducing-fakeeh-university-hospital', updated_at = now()
   where name ilike '%fakeeh university%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'fuh.care');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Fakeeh University Hospital delivers the best possible outcomes for its patients through smart technology and academic strengths. Built on an integrated healthcare model, the hospital brings you the legacy of over four decades of compassionate care, drawn from the renowned Fakeeh Care group based in Saudi Arabia. They promote a completely smoke-free environment throughout our hospital. As a top hospital in Dubai, they have a duty to provide a healthy environment and a safe place for patients to be treated and for their professionals to effectively perform their duties. Fakeeh University Hospital is made up of like-minded healthcare providers working towards a common goal, which is delivering quality healthcare to people all around the world. Their passionate staff members have years of experience within and outside the country. They are skilled, empathetic, and truly care about your health needs. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%fakeeh university%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://fakihivf.com/', updated_at = now()
   where name ilike '%fakih%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'fakihivf.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Some information about Fakih IVF Fertility Center:Fakih IVF Fertility Center is one of the leading Infertility, Gynecology, Obstetrics, Genetics, and IVF Centers in the GCC region. Fakih IVF opened the first private IVF center in Dubai in 2011. The second UAE location was opened in Abu Dhabi in April 2013, followed by a branch in Al Ain in 2018 and another in Western Region. Fakih IVF also extended its network to the GCC region in 2017, with the opening of its center in Muscat, Oman. Fakih IVF is one of the few IVF centers in the Middle East with a fully serviced in-house Genetics Laboratory, offering a screening of hereditary diseases, chromosomal abnormalities, and gender selection. Thank you so much!', updated_at = now()
   where name ilike '%fakih%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://gargashhospital.com/about-us/', updated_at = now()
   where name ilike '%gargash%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'gargashhospital.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Gargash is founded with the ultimate vision of offering an end-to-end solution for all gynaecological related problems and fulfilling a patient’s dream of having a healthy family. Gargash is a multi-specialty hospital offering a wide variety of treatments ranging from General Medicine to minimally invasive surgeries. It is their distinct honor to be recognized as the first female Emirati gynaecologist and IVF specialist in the UAE, who took the lead on Assisted Reproductive Technology (ART) and Family Health. Patient care and trustworthy experience is central to their values and their team of medical professionals, and they are sincerely committed to it. They wish to create a patient community thriving on wellbeing, joy and trust. It is their delight to offer premium healthcare services to families from all backgrounds. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%gargash%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://glucare.health/lp-ads-diabetes/', updated_at = now()
   where name ilike '%glucare%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'glucare.health');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'GluCare Health is a healthcare company based in Dubai that focuses on diabetes management and technology. It aims to provide innovative solutions and comprehensive care for individuals with diabetes, leveraging digital health technologies to improve patient outcomes. GluCare Health typically offers services such as personalized diabetes care plans, continuous glucose monitoring, and telehealth consultations with specialists. GluCare.Health was born out of the idea that a combination of a human-centric patient approach with technology working together will lead to a better and more efficient management of diabetes and metabolic syndrome. In 2022, GluCare.Health became the world’s first globally ICHOM-accredited facility. They aspire to report our outcomes transparently with full accountability over our model of care. The approach often combines lifestyle modifications, medication management and advanced monitoring tools to help patients manage their condition more effectively. The goal is to empower individuals with diabetes by providing them with the necessary tools and support for better health management.', updated_at = now()
   where name ilike '%glucare%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://healthbayclinic.com/about-us/', updated_at = now()
   where name ilike '%healthbay%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'healthbayclinic.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'HealthBay opened its very first clinic in 2008 and has since gone on to develop and open additional clinics on Al Wasl Road (Umm Suqeim) and a standalone clinic in Motor City. HealthBay is dedicated to providing the highest level of medical care to its patients using state-of-the-art technology for diagnostics, prevention and treatment. From initial contact onwards, you will be assisted and supported by our friendly team of experienced and dedicated healthcare professionals, who speak a variety of languages including Arabic, English, French, German, Italian, Russian and Spanish, just to name a few.', updated_at = now()
   where name ilike '%healthbay%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.allocationassist.com/kings-college-hospital-london-overseas-partnerships-in-uae-and-saudi-arabia/', updated_at = now()
   where name ilike '%king%college%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'allocationassist.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Some information about King’s College Hospital: King’s College Hospital is a world-renowned teaching hospital in London with over 183 years’ experience, and has been fully present for many years in the UAE. In writing the next chapter in the King’s legacy, they are excited to expand their UAE footprint as they add 100 new beds to their Hospital in Dubai. King’s has numerous Dubai-based state-of-the-art facilities, including their multi-specialty medical centres based in Jumeirah and Marina, their clinics in Park Heights – KIDEO (King’s Institute of Diabetes, Endocrinology and Obesity) and Physiotherapy Clinic, Aesthetics Clinic in Dubai Marina, and their100-bed multi-speciality tertiary hospital in the prestigious Dubai Hills estate. Ties between King’s College Hospital London and the UAE originate from 1979, when a generous donation from the late great His Highness Sheikh Zayed Bin Sultan Al Nahyan, former President of the UAE, helped establish King’s liver research centre. That centre is amongst the top three liver specialist centres in the world. In 2023, they extended this legacy by successfully performing the first liver transplant and becoming the Premier Liver Transplant Centre in Dubai. Thank you so much!', updated_at = now()
   where name ilike '%king%college%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://dubaihealth.ae/l/196787', updated_at = now()
   where name ilike '%latifa%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'dubaihealth.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Established in 1987, they have a long history of providing compassionate, specialized care for women, children and babies at Latifa Hospital. For many women in the UAE, they are the trusted center for pregnancy and delivery care - both high-risk and low-risk pregnancies, for advanced and minimally invasive gynecological surgeries, urogynecology, and gynecologic oncology. Their Pediatric department comprises multiple specialties, with expert and comprehensive medical and surgical care for children up to the age of 12. Around 5,000 babies are born with them every year, and their Neonatology department is equipped to offer critical care for premature newborns and babies born with serious medical conditions. Their multidisciplinary team is here to support mother, baby and family with the best possible emotional and medical care until it’s time to go home. At Latifa Hospital, they pride themselves in providing a comfortable and compassionate environment for mothers and babies, and have been awarded UNICEF’s Baby Friendly Hospital Initiative (BFHI) and Mother-Friendly Hospital Initiative (MFHI) certificates, recognizing their commitment to breastfeeding support and child protection. In addition to their medical and surgical care, they are committed to advancing medical education through their academic institute, where residents receive in-depth training in Obstetrics, Gynecology, and Neonatology, guided by an integrated, multidisciplinary approach. At Latifa Hospital, you and your child’s health and wellbeing are their priority, and they are here to support with comprehensive and compassionate care, every step in your journey.', updated_at = now()
   where name ilike '%latifa%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.medcare.ae/en', updated_at = now()
   where name ilike '%medcare%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'medcare.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Medcare brings the network of multi-speciality hospitals, medical centres and hundreds of specialised doctors work with one core passion in mind – your own and your family''s well-being. They maintain the highest possible standards in all aspects of healthcare; doctors, treatments, facilities and paramedical support that are on par with the global standards. All Medcare hospitals are accredited by the Joint Commission International (JCI), which is widely accepted as the gold standard in global healthcare. They will treat you well. That’s their simple promise, and they will do everything it takes to make things easy for you when health is posing challenges. Their specialists and support staff work in a coordinated and compassionate manner, and deliver compassionate care for all medical conditions.', updated_at = now()
   where name ilike '%medcare%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/', updated_at = now()
   where name ilike '%mediclinic%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'allocationassist.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Mediclinic Middle East is one of the largest healthcare networks in the UAE, with an established reputation for providing healthcare to the highest international standards. Mediclinic operates seven hospitals in the United Arab Emirates with a total of over 978 inpatient beds, as well as 29 clinics in Dubai, Abu Dhabi, Al Ain, and Al Dhafra. All Mediclinic facilities in the UAE are JCI-accredited. The Mediclinic Middle East operates a ‘hub and spoke’ model, with multidisciplinary clinics providing primary healthcare in local communities, referring patients to their hospitals for secondary and tertiary treatment when required. Mediclinic Hospitals have coordinated care centres where multidisciplinary teams work together to deliver advanced clinical services such as the Comprehensive Cancer Centre, Stroke Centre, Metabolic Centre, and Breast Centre. Primary Care Clinics provide follow-up care closer to home after discharge. Mediclinic has a sophisticated, integrated Electronic Medical Records system throughout its network. Mediclinic Middle East also offers telemedicine consultations via the MyMediclinic24x7 app and telemedicine portal.', updated_at = now()
   where name ilike '%mediclinic%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.hmsmirdifhospital.ae/en/about', updated_at = now()
   where name ilike '%mirdif%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'hmsmirdifhospital.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'HMS Mirdif Hospital is a multi-specialty hospital in Dubai that is part of the Health & Medical Services Group which has a long history of excellent care and innovation. It provides world-class healthcare services and international patient support with more than 160-beds that includes a range of luxurious suites that guarantee you the highest standards of luxury and privacy. It provides the best and most advanced treatments managed by well-recognized Consultants and Specialists doctors with international standards and multilingual. HMS Mirdif Hospital, the hospital in Dubai, began operations in December 2021 and is part of the HMS Group of Health and Medical Services, located in Mirdif - Dubai. HMS Mirdif Hospital Dubai offers an Emergency department 24/7 equipped with the latest medical devices, 45 medical and surgical specialties, ICU care for adults, NICU care for newborns, PICU care for children, Radiology and Laboratory department offering the latest imaging and diagnostic technologies to assess and treat patients, alongside a highly trained and vastly experienced team of medical professionals that are all from renowned medical schools, locally and globally, including specialists in every field. Mirdif Hospital is the healthcare provider of choice for local residents, expatriates living in the United Arab Emirates, and a growing number of medical travelers from around the globe. HMS Mirdif Hospital is Indisputably one of the best hospitals in Dubai, offering exceptional medical services to patients from all over the world. The hospital is equipped with advanced medical technology and staffed by a team of highly qualified and experienced healthcare professionals. The hospital specializes in a wide range of medical specialties, including cardiology, neurology, orthopedics, and oncology, among others. Patients receive personalized care and attention, with the hospital''s patient-centered approach placing their needs and preferences at the forefront of their treatment plans. The hospital also offers modern and comfortable facilities, including private rooms with breathtaking views, a variety of dining options, and a range of amenities to ensure patients'' comfort and well-being. Overall, HMS Mirdif Hospital''s commitment to excellence, innovation, and patient-centric care makes it a top choice for those seeking the best healthcare services in Dubai.', updated_at = now()
   where name ilike '%mirdif%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://moorfields.ae/about/moorfields-dubai-healthcare-city/', updated_at = now()
   where name ilike '%moorfields%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'moorfields.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Inaugurated in 2007 in Dubai Healthcare City, the hospital provides the highest standards of eye care, leveraging the legacy and expertise of its London counterpart to offer advanced treatments and services across the United Arab Emirates. Internationally acclaimed for its commitment to the highest quality and patient safety standards, Moorfields Eye Hospital Dubai is accredited by the Joint Commission International (JCI). This distinction underscores its commitment to meeting rigorous international healthcare standards. Moorfields Eye Hospital Dubai also plays a vital role in advancing ophthalmic education and research in the region through its significant partnership with the Mohammed Bin Rashid University of Medicine and Health Sciences (MBRU). This collaboration plays a crucial role in shaping the future of medical professionals and propelling the field of ophthalmology in the region forward.', updated_at = now()
   where name ilike '%moorfields%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://nmc.ae/en/aboutus', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'nmc.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, we have provided high quality, personalised, and compassionate care to our patients and are proud to have earned the trust of millions of people in the UAE and around the world. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%nmc%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.primehealth.ae/', updated_at = now()
   where name ilike '%prime hospital%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'primehealth.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Prime Hospital Dubai is a 100-bed multi-specialty hospital located on Airport Road, Al Garhoud, Dubai. It is part of the Prime Healthcare Group, one of the leading healthcare service providers in the United Arab Emirates. The hospital is known for its high-quality healthcare services, state-of-the-art infrastructure, and experienced medical professionals. It has received several awards and accreditations, including the Joint Commission International (JCI) accreditation, which is a gold standard for healthcare quality. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.', updated_at = now()
   where name ilike '%prime hospital%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.lighthousearabia.com/about-us', updated_at = now()
   where name ilike '%lighthouse%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'lighthousearabia.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'The LightHouse Arabia is a Dubai-based mental health and wellness clinic providing high quality outpatient services to children, adults, couples, and families. They are the leading mental health clinic in the UAE by virtue of our vision, mission, size and the breadth and depth of our team’s clinical expertise. Their international team of over 30 psychologists, psychiatrists, coaches, occupational and speech & language therapists work together to provide integrated care for clients across the age range and life stage. All of their work is evidence-based, anchored in research, results-oriented, and effective. They help with a wide range of mental health and wellbeing challenges – from personal issues such as depression, anxiety, chronic stress, and addictions, to interpersonal issues such as conflict at work and marriage difficulties.', updated_at = now()
   where name ilike '%lighthouse%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://thevalensclinic.ae/about-us/', updated_at = now()
   where name ilike '%valens%' and city ilike '%Dubai%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'thevalensclinic.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'The Valens Clinic is a specialized mental health clinic providing expert care in psychiatry and psychology complemented by a range of integrated wellness services. Their holistic approach to mental wellness includes comprehensive assessments, evidence-based therapies, cutting-edge psychiatric treatments, and compassionate support to help our clients build resilience and lead fulfilling lives. Their team at Valens Clinic consists of highly qualified and licensed clinicians who are deeply committed to your health and wellbeing. With extensive expertise across psychiatry and psychology, their clinicians work collaboratively to provide personalized care tailored to your unique needs. They support you throughout your journey to wellness with evidence-based treatments, compassionate guidance, and continuous encouragement empowering you to achieve lasting mental and emotional balance. At The Valens Clinic, they are a team of dedicated mental health specialists in Dubai committed to providing high-quality care in a safe, confidential and supportive environment. Located in Jumeirah 3 and Business Bay, their clinic is known for its client-centered approach and multilingual therapy services available in English and Arabic. They support adults, children, couples and expats with a wide range of concerns from anxiety and trauma to relationship issues and developmental disorders.', updated_at = now()
   where name ilike '%valens%' and city ilike '%Dubai%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://rakhospital.com/about-us/', updated_at = now()
   where name ilike '%rak hospital%' and city ilike '%Ras Al Khaimah%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'rakhospital.com');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'The flagship unit of Arabian Healthcare Group, has been a beacon of excellence for 17 years. The group’s diverse interests span healthcare, laboratory services hospital, education, and infrastructure. Founded with the vision of bringing high-quality tertiary healthcare to the people of Ras Al Khaimah, RAK Hospital offers world-class care across a wide range of super specialities. Today, as a hub of international quality healthcare, RAK Hospital serves patients from the Gulf and around the world, who rely on its expertise and advanced medical services. The hospital has firmly established itself as the ‘New Health Tourism Destination,’ attracting international patients seeking top-tier healthcare at affordable prices. With a legacy of 17 years, RAK Hospital continues to impact lives, providing exceptional care and fostering trust and well-being in the global community.', updated_at = now()
   where name ilike '%rak hospital%' and city ilike '%Ras Al Khaimah%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://www.uhs.ae/', updated_at = now()
   where name ilike '%sharjah university%' and city ilike '%Sharjah%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'uhs.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Some information about Sharjah University Hospital. The University Hospital of Sharjah (UHS) is established as a Not-for-profit organization by the Decree of the Ruler of Sharjah and Supreme Council Member and is located adjacent to the sprawling campus of University of Sharjah. The prestigious, world-class Hospital is synonymous with commitment, care and impeccable services it offers to the patients. We are one of the best hospitals in the region. Highly experienced, specialist doctors are the backbone of this patient-centric hospital. The hospital encompasses all the specialty and super-specialty areas of medicine and surgery. They have various centers of Excellence that strive to give the patients the best medical advice, treatment and care that could be compared to any famous and most committed medical centers in Sharjah UHS takes pride in its team of Specialist Doctors, Best Gynecology, Nurses and other Healthcare Professionals who give their cent percent to their profession. Their diligent and dedicated team, and the team spirit they demonstrate helps in acclaiming UHS as the top-notch healthcare providers in UAE.', updated_at = now()
   where name ilike '%sharjah university%' and city ilike '%Sharjah%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  update public.hospitals set website = 'https://m42.ae/what-we-do/global-patient-care/sheikh-sultan-bin-zayed-hospital/', updated_at = now()
   where name ilike '%sultan bin zayed%' and city ilike '%Sharjah%'
     and (coalesce(website,'') = '' or regexp_replace(lower(website), '^https?://(www\.)?([^/]+).*$', '\2') = 'm42.ae');
  get diagnostics n = row_count; w := w + n;
  update public.hospitals set description = 'Sheikh Sultan bin Zayed Hospital (SSBZH) is a state-of-the-art healthcare facility in the Northern Emirates run in partnership with M42. This unique collaboration between the civilian and military sectors is an example of a shared commitment to delivering world-class medical care. With access to cutting-edge technologies and the expertise of M42’s renowned network — such as Imperial College London''s Diabetes Center, Amana Healthcare, Mubadala Health and Healthpoint - SSBZH is at the forefront of medical innovation.', updated_at = now()
   where name ilike '%sultan bin zayed%' and city ilike '%Sharjah%' and coalesce(description,'') = '';
  get diagnostics n = row_count; d := d + n;

  raise notice 'UAE about-us: % website rows, % description rows updated', w, d;
end $$;

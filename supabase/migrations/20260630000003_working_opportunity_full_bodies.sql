-- Restore the FULL "Working Opportunity" doctor templates from the original
-- opportunities@ export (mitchell-from-opportunities-2026-05-25.json). The bulk
-- import (20260629000003) only kept hospital/city/link and dropped each
-- hospital's description paragraph(s). This rebuilds all 43 bodies with:
--   greeting (tokenised {{doctor_name}}) + intro + link + the real per-hospital
--   description + "Thank you so much." + {{signature}} (filled per-sender by
--   send-flow-email). Descriptions are verbatim from the source emails.

update public.email_templates set
  body_html  = $h0$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Mediclinic</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.mediclinic.ae">https://www.mediclinic.ae</a></p><p>Mediclinic Middle East is one of the largest healthcare networks in the UAE, with an established reputation for providing healthcare to the highest international standards. Mediclinic operates seven hospitals in the United Arab Emirates with a total of over 978 inpatient beds, as well as 29 clinics in Dubai, Abu Dhabi, Al Ain, and Al Dhafra. All Mediclinic facilities in the UAE are JCI-accredited.</p><p>The Mediclinic Middle East operates a ‘hub and spoke’ model, with multidisciplinary clinics providing primary healthcare in local communities, referring patients to their hospitals for secondary and tertiary treatment when required. Mediclinic Hospitals have coordinated care centres where multidisciplinary teams work together to deliver advanced clinical services such as the Comprehensive Cancer Centre, Stroke Centre, Metabolic Centre, and Breast Centre. Primary Care Clinics provide follow-up care closer to home after discharge. Mediclinic has a sophisticated, integrated Electronic Medical Records system throughout its network. Mediclinic Middle East also offers telemedicine consultations via the MyMediclinic24x7 app and telemedicine portal.</p><p>Thank you so much.</p>{{signature}}$h0$,
  body_text  = $t0$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Mediclinic in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.mediclinic.ae

Mediclinic Middle East is one of the largest healthcare networks in the UAE, with an established reputation for providing healthcare to the highest international standards. Mediclinic operates seven hospitals in the United Arab Emirates with a total of over 978 inpatient beds, as well as 29 clinics in Dubai, Abu Dhabi, Al Ain, and Al Dhafra. All Mediclinic facilities in the UAE are JCI-accredited.

The Mediclinic Middle East operates a ‘hub and spoke’ model, with multidisciplinary clinics providing primary healthcare in local communities, referring patients to their hospitals for secondary and tertiary treatment when required. Mediclinic Hospitals have coordinated care centres where multidisciplinary teams work together to deliver advanced clinical services such as the Comprehensive Cancer Centre, Stroke Centre, Metabolic Centre, and Breast Centre. Primary Care Clinics provide follow-up care closer to home after discharge. Mediclinic has a sophisticated, integrated Electronic Medical Records system throughout its network. Mediclinic Middle East also offers telemedicine consultations via the MyMediclinic24x7 app and telemedicine portal.

Thank you so much.
{{signature_text}}$t0$,
  updated_at = now()
where key = 'profile_sent_doctor_mediclinic_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h1$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>NMC Healthcare</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://nmc.ae/en/aboutus">https://nmc.ae/en/aboutus</a></p><p>NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, we have provided high quality, personalised, and compassionate care to our patients and are proud to have earned the trust of millions of people in the UAE and around the world.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h1$,
  body_text  = $t1$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with NMC Healthcare in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://nmc.ae/en/aboutus

NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, we have provided high quality, personalised, and compassionate care to our patients and are proud to have earned the trust of millions of people in the UAE and around the world.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t1$,
  updated_at = now()
where key = 'profile_sent_doctor_nmc_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h2$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Medcare Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.medcare.ae/en">https://www.medcare.ae/en</a></p><p>Medcare brings the network of multi-speciality hospitals, medical centres and hundreds of specialised doctors work with one core passion in mind – your own and your family's well-being.</p><p>They maintain the highest possible standards in all aspects of healthcare; doctors, treatments, facilities and paramedical support that are on par with the global standards. All Medcare hospitals are accredited by the Joint Commission International (JCI), which is widely accepted as the gold standard in global healthcare.</p><p>They will treat you well. That’s their simple promise, and they will do everything it takes to make things easy for you when health is posing challenges. Their specialists and support staff work in a coordinated and compassionate manner, and deliver compassionate care for all medical conditions.</p><p>Thank you so much.</p>{{signature}}$h2$,
  body_text  = $t2$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Medcare Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.medcare.ae/en

Medcare brings the network of multi-speciality hospitals, medical centres and hundreds of specialised doctors work with one core passion in mind – your own and your family's well-being.

They maintain the highest possible standards in all aspects of healthcare; doctors, treatments, facilities and paramedical support that are on par with the global standards. All Medcare hospitals are accredited by the Joint Commission International (JCI), which is widely accepted as the gold standard in global healthcare.

They will treat you well. That’s their simple promise, and they will do everything it takes to make things easy for you when health is posing challenges. Their specialists and support staff work in a coordinated and compassionate manner, and deliver compassionate care for all medical conditions.

Thank you so much.
{{signature_text}}$t2$,
  updated_at = now()
where key = 'profile_sent_doctor_medcare_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h3$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>American Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.ahdubai.com/about">https://www.ahdubai.com/about</a></p><p>Some information about American Hospital:</p><p>A premier private healthcare provider in the Middle East, American Hospital, part of Mohamed &amp; Obaid Al Mulla Group, was established in 1996 with the goal of providing world-class medical service to the community. The 254-bed, acute care, general medical/surgical private hospital has state-of-the-art facilities and an experienced team of healthcare professionals specialized in more than 40 medical and surgical specialties assuring comprehensive care. All physicians at American Hospital are American Board Certified or equivalent ensuring that patients receive an international standard of care in the UAE.</p><p>American Hospital is the first hospital in the Middle East to be awarded the JCI while its laboratory is the first in the private sector in the region to be accredited by the College of American Pathologists. The hospital is also the inaugural member of the prestigious Mayo Care Network. Further, American Hospital's cancer program was the first to offer comprehensive one-stop care in Dubai. The Life Support Training Centre at American Hospital Dubai is the first in a private hospital in the UAE to be an American Heart Association (AHA) International Training Center.</p><p>Recently, American Hospital is the first medical facility in Dubai to offer the fourth generation of da Vinci Xi surgical system to conduct robotic surgery services, solidifying the Emirate’s position on a regional scale as a hub for medical tourism for patients seeking world-class professional care. The first facility to execute robotic surgery in Dubai, American Hospital cements its position as a pioneer of digital transformation.</p><p>American Hospital also operates seven dedicated clinics – in Dubai Media City, Al Barsha, Al Khawaneej, Jumeirah, Mira, Dubai Hills, and Nad Al Sheba – serving the community by being closer to them.</p><p>Thank you so much.</p>{{signature}}$h3$,
  body_text  = $t3$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with American Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.ahdubai.com/about

Some information about American Hospital:

A premier private healthcare provider in the Middle East, American Hospital, part of Mohamed & Obaid Al Mulla Group, was established in 1996 with the goal of providing world-class medical service to the community. The 254-bed, acute care, general medical/surgical private hospital has state-of-the-art facilities and an experienced team of healthcare professionals specialized in more than 40 medical and surgical specialties assuring comprehensive care. All physicians at American Hospital are American Board Certified or equivalent ensuring that patients receive an international standard of care in the UAE.

American Hospital is the first hospital in the Middle East to be awarded the JCI while its laboratory is the first in the private sector in the region to be accredited by the College of American Pathologists. The hospital is also the inaugural member of the prestigious Mayo Care Network. Further, American Hospital's cancer program was the first to offer comprehensive one-stop care in Dubai. The Life Support Training Centre at American Hospital Dubai is the first in a private hospital in the UAE to be an American Heart Association (AHA) International Training Center.

Recently, American Hospital is the first medical facility in Dubai to offer the fourth generation of da Vinci Xi surgical system to conduct robotic surgery services, solidifying the Emirate’s position on a regional scale as a hub for medical tourism for patients seeking world-class professional care. The first facility to execute robotic surgery in Dubai, American Hospital cements its position as a pioneer of digital transformation.

American Hospital also operates seven dedicated clinics – in Dubai Media City, Al Barsha, Al Khawaneej, Jumeirah, Mira, Dubai Hills, and Nad Al Sheba – serving the community by being closer to them.

Thank you so much.
{{signature_text}}$t3$,
  updated_at = now()
where key = 'profile_sent_doctor_american_hospital_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h4$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Fakeeh University Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.fuh.care">https://www.fuh.care</a></p><p>Fakeeh University Hospital delivers the best possible outcomes for its patients through smart technology and academic strengths. Built on an integrated healthcare model, the hospital brings you the legacy of over four decades of compassionate care, drawn from the renowned Fakeeh Care group based in Saudi Arabia. They promote a completely smoke-free environment throughout our hospital. As a top hospital in Dubai, they have a duty to provide a healthy environment and a safe place for patients to be treated and for their professionals to effectively perform their duties.</p><p>Fakeeh University Hospital is made up of like-minded healthcare providers working towards a common goal, which is delivering quality healthcare to people all around the world. Their passionate staff members have years of experience within and outside the country. They are skilled, empathetic, and truly care about your health needs.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h4$,
  body_text  = $t4$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Fakeeh University Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.fuh.care

Fakeeh University Hospital delivers the best possible outcomes for its patients through smart technology and academic strengths. Built on an integrated healthcare model, the hospital brings you the legacy of over four decades of compassionate care, drawn from the renowned Fakeeh Care group based in Saudi Arabia. They promote a completely smoke-free environment throughout our hospital. As a top hospital in Dubai, they have a duty to provide a healthy environment and a safe place for patients to be treated and for their professionals to effectively perform their duties.

Fakeeh University Hospital is made up of like-minded healthcare providers working towards a common goal, which is delivering quality healthcare to people all around the world. Their passionate staff members have years of experience within and outside the country. They are skilled, empathetic, and truly care about your health needs.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t4$,
  updated_at = now()
where key = 'profile_sent_doctor_fakeeh_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h5$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Moorfields Eye Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://moorfields.ae">https://moorfields.ae</a></p><p>Inaugurated in 2007 in Dubai Healthcare City, the hospital provides the highest standards of eye care, leveraging the legacy and expertise of its London counterpart to offer advanced treatments and services across the United Arab Emirates. Internationally acclaimed for its commitment to the highest quality and patient safety standards, Moorfields Eye Hospital Dubai is accredited by the Joint Commission International (JCI). This distinction underscores its commitment to meeting rigorous international healthcare standards.</p><p>Moorfields Eye Hospital Dubai also plays a vital role in advancing ophthalmic education and research in the region through its significant partnership with the Mohammed Bin Rashid University of Medicine and Health Sciences (MBRU). This collaboration plays a crucial role in shaping the future of medical professionals and propelling the field of ophthalmology in the region forward.</p><p>Thank you so much.</p>{{signature}}$h5$,
  body_text  = $t5$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Moorfields Eye Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://moorfields.ae

Inaugurated in 2007 in Dubai Healthcare City, the hospital provides the highest standards of eye care, leveraging the legacy and expertise of its London counterpart to offer advanced treatments and services across the United Arab Emirates. Internationally acclaimed for its commitment to the highest quality and patient safety standards, Moorfields Eye Hospital Dubai is accredited by the Joint Commission International (JCI). This distinction underscores its commitment to meeting rigorous international healthcare standards.

Moorfields Eye Hospital Dubai also plays a vital role in advancing ophthalmic education and research in the region through its significant partnership with the Mohammed Bin Rashid University of Medicine and Health Sciences (MBRU). This collaboration plays a crucial role in shaping the future of medical professionals and propelling the field of ophthalmology in the region forward.

Thank you so much.
{{signature_text}}$t5$,
  updated_at = now()
where key = 'profile_sent_doctor_moorfields_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h6$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>King's College Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://kingscollegehospitaldubai.com">https://kingscollegehospitaldubai.com</a></p><p>Some information about King’s College Hospital:</p><p>King’s College Hospital is a world-renowned teaching hospital in London with over 183 years’ experience, and has been fully present for many years in the UAE. In writing the next chapter in the King’s legacy, they are excited to expand their UAE footprint as they add 100 new beds to their  Hospital in Dubai.</p><p>King’s has numerous Dubai-based state-of-the-art facilities, including their multi-specialty medical centres based in Jumeirah and Marina, their clinics in Park Heights – KIDEO (King’s Institute of Diabetes, Endocrinology and Obesity) and Physiotherapy Clinic, Aesthetics Clinic in Dubai Marina, and their100-bed multi-speciality tertiary hospital in the prestigious Dubai Hills estate.</p><p>Ties between King’s College Hospital London and the UAE originate from 1979, when a generous donation from the late great His Highness Sheikh Zayed Bin Sultan Al Nahyan, former President of the UAE, helped establish King’s liver research centre. That centre is amongst the top three liver specialist centres in the world. In 2023, they extended this legacy by successfully performing the first liver transplant and becoming the Premier Liver Transplant Centre in Dubai.</p><p>Thank you so much.</p>{{signature}}$h6$,
  body_text  = $t6$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with King's College Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://kingscollegehospitaldubai.com

Some information about King’s College Hospital:

King’s College Hospital is a world-renowned teaching hospital in London with over 183 years’ experience, and has been fully present for many years in the UAE. In writing the next chapter in the King’s legacy, they are excited to expand their UAE footprint as they add 100 new beds to their  Hospital in Dubai.

King’s has numerous Dubai-based state-of-the-art facilities, including their multi-specialty medical centres based in Jumeirah and Marina, their clinics in Park Heights – KIDEO (King’s Institute of Diabetes, Endocrinology and Obesity) and Physiotherapy Clinic, Aesthetics Clinic in Dubai Marina, and their100-bed multi-speciality tertiary hospital in the prestigious Dubai Hills estate.

Ties between King’s College Hospital London and the UAE originate from 1979, when a generous donation from the late great His Highness Sheikh Zayed Bin Sultan Al Nahyan, former President of the UAE, helped establish King’s liver research centre. That centre is amongst the top three liver specialist centres in the world. In 2023, they extended this legacy by successfully performing the first liver transplant and becoming the Premier Liver Transplant Centre in Dubai.

Thank you so much.
{{signature_text}}$t6$,
  updated_at = now()
where key = 'profile_sent_doctor_kings_college_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h7$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>HealthBay Clinic</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://healthbayclinic.com/about-us/">https://healthbayclinic.com/about-us/</a></p><p>HealthBay opened its very first clinic in 2008 and has since gone on to develop and open additional clinics on Al Wasl Road (Umm Suqeim) and a standalone clinic in Motor City. HealthBay is dedicated to providing the highest level of medical care to its patients using state-of-the-art technology for diagnostics, prevention and treatment. From initial contact onwards, you will be assisted and supported by our friendly team of experienced and dedicated healthcare professionals, who speak a variety of languages including Arabic, English, French, German, Italian, Russian and Spanish, just to name a few.</p><p>Thank you so much.</p>{{signature}}$h7$,
  body_text  = $t7$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with HealthBay Clinic in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://healthbayclinic.com/about-us/

HealthBay opened its very first clinic in 2008 and has since gone on to develop and open additional clinics on Al Wasl Road (Umm Suqeim) and a standalone clinic in Motor City. HealthBay is dedicated to providing the highest level of medical care to its patients using state-of-the-art technology for diagnostics, prevention and treatment. From initial contact onwards, you will be assisted and supported by our friendly team of experienced and dedicated healthcare professionals, who speak a variety of languages including Arabic, English, French, German, Italian, Russian and Spanish, just to name a few.

Thank you so much.
{{signature_text}}$t7$,
  updated_at = now()
where key = 'profile_sent_doctor_healthbay_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h8$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Mirdif Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.hmsmirdifhospital.ae/en/about">https://www.hmsmirdifhospital.ae/en/about</a></p><p>HMS Mirdif Hospital is a multi-specialty hospital in Dubai that is part of the Health &amp; Medical Services Group which has a long history of excellent care and innovation. It provides world-class healthcare services and international patient support with more than 160-beds that includes a range of luxurious suites that guarantee you the highest standards of luxury and privacy. It provides the best and most advanced treatments managed by well-recognized Consultants and Specialists doctors with international standards and multilingual. HMS Mirdif Hospital, the hospital in Dubai, began operations in December 2021 and is part of the HMS Group of Health and Medical Services, located in Mirdif - Dubai.</p><p>HMS Mirdif Hospital Dubai offers an Emergency department 24/7 equipped with the latest medical devices, 45 medical and surgical specialties, ICU care for adults, NICU care for newborns, PICU care for children, Radiology and Laboratory department offering the latest imaging and diagnostic technologies to assess and treat patients, alongside a highly trained and vastly experienced team of medical professionals that are all from renowned medical schools, locally and globally, including specialists in every field. Mirdif Hospital is the healthcare provider of choice for local residents, expatriates living in the United Arab Emirates, and a growing number of medical travelers from around the globe.</p><p>HMS Mirdif Hospital is Indisputably one of the best hospitals in Dubai, offering exceptional medical services to patients from all over the world. The hospital is equipped with advanced medical technology and staffed by a team of highly qualified and experienced healthcare professionals. The hospital specializes in a wide range of medical specialties, including cardiology, neurology, orthopedics, and oncology, among others. Patients receive personalized care and attention, with the hospital's patient-centered approach placing their needs and preferences at the forefront of their treatment plans. The hospital also offers modern and comfortable facilities, including private rooms with breathtaking views, a variety of dining options, and a range of amenities to ensure patients' comfort and well-being. Overall, HMS Mirdif Hospital's commitment to excellence, innovation, and patient-centric care makes it a top choice for those seeking the best healthcare services in Dubai.</p><p>Thank you so much.</p>{{signature}}$h8$,
  body_text  = $t8$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Mirdif Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.hmsmirdifhospital.ae/en/about

HMS Mirdif Hospital is a multi-specialty hospital in Dubai that is part of the Health & Medical Services Group which has a long history of excellent care and innovation. It provides world-class healthcare services and international patient support with more than 160-beds that includes a range of luxurious suites that guarantee you the highest standards of luxury and privacy. It provides the best and most advanced treatments managed by well-recognized Consultants and Specialists doctors with international standards and multilingual. HMS Mirdif Hospital, the hospital in Dubai, began operations in December 2021 and is part of the HMS Group of Health and Medical Services, located in Mirdif - Dubai.

HMS Mirdif Hospital Dubai offers an Emergency department 24/7 equipped with the latest medical devices, 45 medical and surgical specialties, ICU care for adults, NICU care for newborns, PICU care for children, Radiology and Laboratory department offering the latest imaging and diagnostic technologies to assess and treat patients, alongside a highly trained and vastly experienced team of medical professionals that are all from renowned medical schools, locally and globally, including specialists in every field. Mirdif Hospital is the healthcare provider of choice for local residents, expatriates living in the United Arab Emirates, and a growing number of medical travelers from around the globe.

HMS Mirdif Hospital is Indisputably one of the best hospitals in Dubai, offering exceptional medical services to patients from all over the world. The hospital is equipped with advanced medical technology and staffed by a team of highly qualified and experienced healthcare professionals. The hospital specializes in a wide range of medical specialties, including cardiology, neurology, orthopedics, and oncology, among others. Patients receive personalized care and attention, with the hospital's patient-centered approach placing their needs and preferences at the forefront of their treatment plans. The hospital also offers modern and comfortable facilities, including private rooms with breathtaking views, a variety of dining options, and a range of amenities to ensure patients' comfort and well-being. Overall, HMS Mirdif Hospital's commitment to excellence, innovation, and patient-centric care makes it a top choice for those seeking the best healthcare services in Dubai.

Thank you so much.
{{signature_text}}$t8$,
  updated_at = now()
where key = 'profile_sent_doctor_mirdif_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h9$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Prime Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.primehealth.ae/">https://www.primehealth.ae/</a></p><p>Prime Hospital Dubai is a 100-bed multi-specialty hospital located on Airport Road, Al Garhoud, Dubai. It is part of the Prime Healthcare Group, one of the leading healthcare service providers in the United Arab Emirates. The hospital is known for its high-quality healthcare services, state-of-the-art infrastructure, and experienced medical professionals. It has received several awards and accreditations, including the Joint Commission International (JCI) accreditation, which is a gold standard for healthcare quality.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h9$,
  body_text  = $t9$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Prime Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.primehealth.ae/

Prime Hospital Dubai is a 100-bed multi-specialty hospital located on Airport Road, Al Garhoud, Dubai. It is part of the Prime Healthcare Group, one of the leading healthcare service providers in the United Arab Emirates. The hospital is known for its high-quality healthcare services, state-of-the-art infrastructure, and experienced medical professionals. It has received several awards and accreditations, including the Joint Commission International (JCI) accreditation, which is a gold standard for healthcare quality.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t9$,
  updated_at = now()
where key = 'profile_sent_doctor_prime_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h10$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Al Garhoud Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.gph.ae/en/about">https://www.gph.ae/en/about</a></p><p>They provides healthcare services of international quality and outstanding performance. They always strives to achieve the highest standards of medical quality and is always keen to provide the best medical services with a group of skilled Consultants and Specialists. The Hospital is located in Al Garhoud area - Dubai, which ensures easy access for patients from all parts of the Emirates and the neighboring GCC countries on account of its proximity to the airport. HMS Al Garhoud Hospital was opened in 2012 and has built a reputation for providing an international standard of quality care provided in a safe, comfortable and newly equipped facility. On its opening, in the same year, the hospital achieved international accreditation, Joint Commission International Award for meeting the highest standard of quality care and patient safety.</p><p>Thank you so much.</p>{{signature}}$h10$,
  body_text  = $t10$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Al Garhoud Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.gph.ae/en/about

They provides healthcare services of international quality and outstanding performance. They always strives to achieve the highest standards of medical quality and is always keen to provide the best medical services with a group of skilled Consultants and Specialists. The Hospital is located in Al Garhoud area - Dubai, which ensures easy access for patients from all parts of the Emirates and the neighboring GCC countries on account of its proximity to the airport. HMS Al Garhoud Hospital was opened in 2012 and has built a reputation for providing an international standard of quality care provided in a safe, comfortable and newly equipped facility. On its opening, in the same year, the hospital achieved international accreditation, Joint Commission International Award for meeting the highest standard of quality care and patient safety.

Thank you so much.
{{signature_text}}$t10$,
  updated_at = now()
where key = 'profile_sent_doctor_al_garhoud_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h11$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>GluCare Health</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://glucare.health">https://glucare.health</a></p><p>GluCare Health is a healthcare company based in Dubai that focuses on diabetes management and technology. It aims to provide innovative solutions and comprehensive care for individuals with diabetes, leveraging digital health technologies to improve patient outcomes. GluCare Health typically offers services such as personalized diabetes care plans, continuous glucose monitoring, and telehealth consultations with specialists.</p><p>GluCare.Health was born out of the idea that a combination of a human-centric patient approach with technology working together will lead to a better and more efficient management of diabetes and metabolic syndrome.</p><p>In 2022, GluCare.Health became the world’s first globally ICHOM-accredited facility. They aspire to report our outcomes transparently with full accountability over our model of care.</p><p>The approach often combines lifestyle modifications, medication management and advanced monitoring tools to help patients manage their condition more effectively. The goal is to empower individuals with diabetes by providing them with the necessary tools and support for better health management.</p><p>Thank you so much.</p>{{signature}}$h11$,
  body_text  = $t11$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with GluCare Health in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://glucare.health

GluCare Health is a healthcare company based in Dubai that focuses on diabetes management and technology. It aims to provide innovative solutions and comprehensive care for individuals with diabetes, leveraging digital health technologies to improve patient outcomes. GluCare Health typically offers services such as personalized diabetes care plans, continuous glucose monitoring, and telehealth consultations with specialists.

GluCare.Health was born out of the idea that a combination of a human-centric patient approach with technology working together will lead to a better and more efficient management of diabetes and metabolic syndrome.

In 2022, GluCare.Health became the world’s first globally ICHOM-accredited facility. They aspire to report our outcomes transparently with full accountability over our model of care.

The approach often combines lifestyle modifications, medication management and advanced monitoring tools to help patients manage their condition more effectively. The goal is to empower individuals with diabetes by providing them with the necessary tools and support for better health management.

Thank you so much.
{{signature_text}}$t11$,
  updated_at = now()
where key = 'profile_sent_doctor_glucare_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h12$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Fakih IVF Fertility Center</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://fakihivf.com/">https://fakihivf.com/</a></p><p>Hello Dr. Mitchell!</p><p>We hope you're having a good day 😊</p><p>We have an opportunity with with Fakih IVF Fertility Center in Dubai and we highly recommended your profile.</p><p>Please let us know as soon as you hear from them.</p><p>Some information about Fakih IVF Fertility Center:Fakih IVF Fertility Center is one of the leading Infertility, Gynecology, Obstetrics, Genetics, and IVF Centers in the GCC region. Fakih IVF opened the first private IVF center in Dubai in 2011. The second UAE location was opened in Abu Dhabi in April 2013, followed by a branch in Al Ain in 2018 and another in Western Region. Fakih IVF also extended its network to the GCC region in 2017, with the opening of its center in Muscat, Oman. Fakih IVF is one of the few IVF centers in the Middle East with a fully serviced in-house Genetics Laboratory, offering a screening of hereditary diseases, chromosomal abnormalities, and gender selection.</p><p>Thank you so much.</p>{{signature}}$h12$,
  body_text  = $t12$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Fakih IVF Fertility Center in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://fakihivf.com/

Hello Dr. Mitchell!

We hope you're having a good day 😊

We have an opportunity with with Fakih IVF Fertility Center in Dubai and we highly recommended your profile.

Please let us know as soon as you hear from them.

Some information about Fakih IVF Fertility Center:Fakih IVF Fertility Center is one of the leading Infertility, Gynecology, Obstetrics, Genetics, and IVF Centers in the GCC region. Fakih IVF opened the first private IVF center in Dubai in 2011. The second UAE location was opened in Abu Dhabi in April 2013, followed by a branch in Al Ain in 2018 and another in Western Region. Fakih IVF also extended its network to the GCC region in 2017, with the opening of its center in Muscat, Oman. Fakih IVF is one of the few IVF centers in the Middle East with a fully serviced in-house Genetics Laboratory, offering a screening of hereditary diseases, chromosomal abnormalities, and gender selection.

Thank you so much.
{{signature_text}}$t12$,
  updated_at = now()
where key = 'profile_sent_doctor_fakih_ivf_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h13$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Gargash Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://gargashhospital.com/about-us/">https://gargashhospital.com/about-us/</a></p><p>Gargash is founded with the ultimate vision of offering an end-to-end solution for all gynaecological related problems and fulfilling a patient’s dream of having a healthy family. Gargash is a multi-specialty hospital offering a wide variety of treatments ranging from General Medicine to minimally invasive surgeries. It is their distinct honor to be recognized as the first female Emirati gynaecologist and IVF specialist in the UAE, who took the lead on Assisted Reproductive Technology (ART) and Family Health. Patient care and trustworthy experience is central to their values and their team of medical professionals, and they are sincerely committed to it. They wish to create a patient community thriving on wellbeing, joy and trust. It is their delight to offer premium healthcare services to families from all backgrounds.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h13$,
  body_text  = $t13$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Gargash Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://gargashhospital.com/about-us/

Gargash is founded with the ultimate vision of offering an end-to-end solution for all gynaecological related problems and fulfilling a patient’s dream of having a healthy family. Gargash is a multi-specialty hospital offering a wide variety of treatments ranging from General Medicine to minimally invasive surgeries. It is their distinct honor to be recognized as the first female Emirati gynaecologist and IVF specialist in the UAE, who took the lead on Assisted Reproductive Technology (ART) and Family Health. Patient care and trustworthy experience is central to their values and their team of medical professionals, and they are sincerely committed to it. They wish to create a patient community thriving on wellbeing, joy and trust. It is their delight to offer premium healthcare services to families from all backgrounds.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t13$,
  updated_at = now()
where key = 'profile_sent_doctor_gargash_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h14$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Emirates Hospital Group</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://emirateshospitals.ae">https://emirateshospitals.ae</a></p><p>Some information about Emirates Hospitals Group:</p><p>Emirates Hospitals Group being at the forefront of medical excellence and innovation, positions itself as a premier provider of healthcare services across the Middle East. They are one of the UAE’s most trusted integrated healthcare service providers, having an extensive portfolio of fully serviced hospitals, specialty clinics, urgent care centres and pharmacies.</p><p>The group offers an extensive array of services and a wide range of treatment options in every field of modern medicine and healthcare. It proudly boasts of highly advanced technologies, fully-equipped modern hospital rooms, state-of-the-art facilities, all backed by the expertise and reputation of a team of multidisciplinary doctors who possess rich regional and global knowledge.</p><p>Emirates Hospitals Group continues to expand its presence in GCC at a remarkable pace. The group’s network is being further strengthened through acquisitions and the development of new facilities across GCC and other parts of the world, with the aim of achieving professional excellence in delivering quality care while adhering to regional and global standards in healthcare.</p><p>Thank you so much.</p>{{signature}}$h14$,
  body_text  = $t14$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Emirates Hospital Group in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://emirateshospitals.ae

Some information about Emirates Hospitals Group:

Emirates Hospitals Group being at the forefront of medical excellence and innovation, positions itself as a premier provider of healthcare services across the Middle East. They are one of the UAE’s most trusted integrated healthcare service providers, having an extensive portfolio of fully serviced hospitals, specialty clinics, urgent care centres and pharmacies.

The group offers an extensive array of services and a wide range of treatment options in every field of modern medicine and healthcare. It proudly boasts of highly advanced technologies, fully-equipped modern hospital rooms, state-of-the-art facilities, all backed by the expertise and reputation of a team of multidisciplinary doctors who possess rich regional and global knowledge.

Emirates Hospitals Group continues to expand its presence in GCC at a remarkable pace. The group’s network is being further strengthened through acquisitions and the development of new facilities across GCC and other parts of the world, with the aim of achieving professional excellence in delivering quality care while adhering to regional and global standards in healthcare.

Thank you so much.
{{signature_text}}$t14$,
  updated_at = now()
where key = 'profile_sent_doctor_emirates_hospital_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h15$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>NMC Healthcare</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://nmc.ae/en/aboutus">https://nmc.ae/en/aboutus</a></p><p>NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, they have provided high quality, personalised, and compassionate care to their patients and are proud to have earned the trust of millions of people in the UAE and around the world.</p><p>Their network is made up of 85 medical facilities, including JCI-accredited, multi-specialty hospitals in Abu Dhabi, Dubai, Sharjah, and Al Ain, as well as medical centres, community clinics, day surgery centres, home health services, and long-term care facilities throughout the UAE. The NMC Healthcare Group also includes the ProVita International Medical Centre and CosmeSurge. Whether it is providing comprehensive medical services directly to patients, or in collaboration with healthcare providers internationally, NMC Healthcare is committed to delivering high quality, personalised care that matters.</p><p>Thank you so much.</p>{{signature}}$h15$,
  body_text  = $t15$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with NMC Healthcare in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://nmc.ae/en/aboutus

NMC Healthcare is one of the largest private healthcare networks in the United Arab Emirates, and the third largest in Oman. Since 1975, they have provided high quality, personalised, and compassionate care to their patients and are proud to have earned the trust of millions of people in the UAE and around the world.

Their network is made up of 85 medical facilities, including JCI-accredited, multi-specialty hospitals in Abu Dhabi, Dubai, Sharjah, and Al Ain, as well as medical centres, community clinics, day surgery centres, home health services, and long-term care facilities throughout the UAE. The NMC Healthcare Group also includes the ProVita International Medical Centre and CosmeSurge. Whether it is providing comprehensive medical services directly to patients, or in collaboration with healthcare providers internationally, NMC Healthcare is committed to delivering high quality, personalised care that matters.

Thank you so much.
{{signature_text}}$t15$,
  updated_at = now()
where key = 'profile_sent_doctor_nmc_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h16$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Sheikh Shakhbout Medical City</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://ssmc.ae/">https://ssmc.ae/</a></p><p>Sheikh Shakhbout Medical City is One of UAE’s largest hospitals, SSMC was established as part of the Abu Dhabi Economic Vision 2030 to elevate healthcare services in the Emirate. Their world-class medical destination reinforces their vision for positioning Abu Dhabi as a global healthcare hub.</p><p>An integrated medical facility, Sheikh Shakhbout Medical City (SSMC) provides patients with:World-class healthcare and medical services</p><p>Cutting-edge facilities, technologies and diagnostics</p><p>The medical complex is a cornerstone of Abu Dhabi’s healthcare services which are aligned with global quality and safety standards to consolidate a new meaning for excellence.</p><p>Thank you so much.</p>{{signature}}$h16$,
  body_text  = $t16$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Sheikh Shakhbout Medical City in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://ssmc.ae/

Sheikh Shakhbout Medical City is One of UAE’s largest hospitals, SSMC was established as part of the Abu Dhabi Economic Vision 2030 to elevate healthcare services in the Emirate. Their world-class medical destination reinforces their vision for positioning Abu Dhabi as a global healthcare hub.

An integrated medical facility, Sheikh Shakhbout Medical City (SSMC) provides patients with:World-class healthcare and medical services

Cutting-edge facilities, technologies and diagnostics

The medical complex is a cornerstone of Abu Dhabi’s healthcare services which are aligned with global quality and safety standards to consolidate a new meaning for excellence.

Thank you so much.
{{signature_text}}$t16$,
  updated_at = now()
where key = 'profile_sent_doctor_ssmc_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h17$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Sheikh Khalifa Medical City</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.seha.ae">https://www.seha.ae</a></p><p>Sheikh Khalifa Medical City (SKMC) is a flagship tertiary hospital in the UAE and the largest teaching medical center in Abu Dhabi. SKMC comprises 441 beds and 16 Outpatient Specialty Clinics. As an innovative market leader, SKMC has achieved numerous milestones, including the establishment of the UAE's first and most comprehensive Kidney Transplant Center and the sole provider of pediatric kidney transplant services in the Emirate of Abu Dhabi. They also take pride in offering the largest Heart Program for Children in the UAE and the only Pediatric Cardiac Surgery Program in the Emirate of Abu Dhabi.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h17$,
  body_text  = $t17$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Sheikh Khalifa Medical City in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.seha.ae

Sheikh Khalifa Medical City (SKMC) is a flagship tertiary hospital in the UAE and the largest teaching medical center in Abu Dhabi. SKMC comprises 441 beds and 16 Outpatient Specialty Clinics. As an innovative market leader, SKMC has achieved numerous milestones, including the establishment of the UAE's first and most comprehensive Kidney Transplant Center and the sole provider of pediatric kidney transplant services in the Emirate of Abu Dhabi. They also take pride in offering the largest Heart Program for Children in the UAE and the only Pediatric Cardiac Surgery Program in the Emirate of Abu Dhabi.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t17$,
  updated_at = now()
where key = 'profile_sent_doctor_skmc_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h18$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Sheikh Tahnoon Medical City</strong> in Al Ain and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.seha.ae/hospital-detail/41">https://www.seha.ae/hospital-detail/41</a></p><p>STMC is a leading tertiary medical city , boasting 718 beds designed to deliver planned care more efficiently in a modern patient environment called the &quot;Healing Oasis&quot; concept. Their aim is to provide the highest quality healthcare possible, dedicated to excellence in everything they do, striving to be one of the Best Acute Healthcare Providers in the region. With specialized Centers of Excellence in Trauma, Orthopedics, and Rehabilitation, they offer the most effective setting with a Multidisciplinary Approach that standardizes best practices for emergency and elective surgery. As a teaching hospital and research center affiliated with the United Arab Emirates University, STMC is the preferred choice for healthcare professionals. Their state-of-the-art academic facilities drive groundbreaking research initiatives, shaping the future of healthcare.</p><p>Their facilities include a standalone Rehabilitation Centre with 131 inpatient beds, an Emergency Department with 72 beds capacity, and advanced operating rooms catering to various surgical specialties. With over 35 unique subspecialty services, including Infectious Diseases, Neurology, Cardiology, and Rehabilitation Medicine, they ensure personalized and holistic care tailored to individual needs. Experience tranquility in their expansive Indoor Healing Garden, the largest in the GCC and Northern region, designed to promote healing and well-being for patients, staff, and visitors alike. Their Rehabilitation Hospital sets new standards in comprehensive care, seamlessly integrated with our tertiary hospital to ensure a smooth transition from acute care to full recovery. Advanced rehabilitation programs utilize cutting-edge technologies to address complex medical needs.</p><p>Thank you so much.</p>{{signature}}$h18$,
  body_text  = $t18$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Sheikh Tahnoon Medical City in Al Ain and we highly recommended your profile.

Please let us know if you hear from them.

https://www.seha.ae/hospital-detail/41

STMC is a leading tertiary medical city , boasting 718 beds designed to deliver planned care more efficiently in a modern patient environment called the "Healing Oasis" concept. Their aim is to provide the highest quality healthcare possible, dedicated to excellence in everything they do, striving to be one of the Best Acute Healthcare Providers in the region. With specialized Centers of Excellence in Trauma, Orthopedics, and Rehabilitation, they offer the most effective setting with a Multidisciplinary Approach that standardizes best practices for emergency and elective surgery. As a teaching hospital and research center affiliated with the United Arab Emirates University, STMC is the preferred choice for healthcare professionals. Their state-of-the-art academic facilities drive groundbreaking research initiatives, shaping the future of healthcare.

Their facilities include a standalone Rehabilitation Centre with 131 inpatient beds, an Emergency Department with 72 beds capacity, and advanced operating rooms catering to various surgical specialties. With over 35 unique subspecialty services, including Infectious Diseases, Neurology, Cardiology, and Rehabilitation Medicine, they ensure personalized and holistic care tailored to individual needs. Experience tranquility in their expansive Indoor Healing Garden, the largest in the GCC and Northern region, designed to promote healing and well-being for patients, staff, and visitors alike. Their Rehabilitation Hospital sets new standards in comprehensive care, seamlessly integrated with our tertiary hospital to ensure a smooth transition from acute care to full recovery. Advanced rehabilitation programs utilize cutting-edge technologies to address complex medical needs.

Thank you so much.
{{signature_text}}$t18$,
  updated_at = now()
where key = 'profile_sent_doctor_tahnoon_alain' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h19$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Burjeel Medical City</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://burjeel.com/burjeelmedicalcity/">https://burjeel.com/burjeelmedicalcity/</a></p><p>Burjeel Holdings's flagship hospital, Burjeel Medical City is the most comprehensive private quaternary care hospital in Abu Dhabi. The Burjeel hospitals have been at the forefront of healthcare services in the region and have emerged as the Center of Medical Excellence across the UAE. Over the years, Burjeel has built a strong sense of trust in the hearts of every patient we come across by serving them in all walks of life along with state-of-the-art facilities, and in-depth expertise.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h19$,
  body_text  = $t19$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Burjeel Medical City in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://burjeel.com/burjeelmedicalcity/

Burjeel Holdings's flagship hospital, Burjeel Medical City is the most comprehensive private quaternary care hospital in Abu Dhabi. The Burjeel hospitals have been at the forefront of healthcare services in the region and have emerged as the Center of Medical Excellence across the UAE. Over the years, Burjeel has built a strong sense of trust in the hearts of every patient we come across by serving them in all walks of life along with state-of-the-art facilities, and in-depth expertise.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t19$,
  updated_at = now()
where key = 'profile_sent_doctor_burjeel_medical_city_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h20$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Al Dhafra Hospital Group</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.seha.ae/hospital-detail/45">https://www.seha.ae/hospital-detail/45</a></p><p>Al Dhafra Hospitals is part of the Abu Dhabi Health Services Company &quot;&quot;SEHA&quot;&quot;, the largest healthcare network in the UAE, which is part of the Pure Health Group, the largest integrated healthcare platform in the country.</p><p>Al Dhafra Hospitals is committed to managing and operating six hospitals: Madinat Zayed Hospital, Ghayathi Hospital, Al Sila Hospital, Delma Hospital, Liwa Hospital and Al Marfa Hospital, and two medical centers: Al Dhafra Family Medicine Center and Bida Al Mutawa Medical Center, in addition to two clinics each, Abu Al Abyad Clinic and Sir Bani Yas Clinic.</p><p>These hospitals, centers and clinics provide medical services within more than 40 different specialties for inpatients and outpatients in various fields and specialties, the most important of which are internal medicine, cardiology, endocrinology, diabetes, mental health, nutrition, pediatrics, obstetrics, gynecology, general surgery, anesthesia, pharmacy services, laboratory and diagnostic radiology.</p><p>Al Dhafra hospitals seek to provide integrated and distinguished health care with the highest international standards of quality and safety to enhance patients' confidence in the services of Al Dhafra hospitals.</p><p>Thank you so much.</p>{{signature}}$h20$,
  body_text  = $t20$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Al Dhafra Hospital Group in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.seha.ae/hospital-detail/45

Al Dhafra Hospitals is part of the Abu Dhabi Health Services Company ""SEHA"", the largest healthcare network in the UAE, which is part of the Pure Health Group, the largest integrated healthcare platform in the country.

Al Dhafra Hospitals is committed to managing and operating six hospitals: Madinat Zayed Hospital, Ghayathi Hospital, Al Sila Hospital, Delma Hospital, Liwa Hospital and Al Marfa Hospital, and two medical centers: Al Dhafra Family Medicine Center and Bida Al Mutawa Medical Center, in addition to two clinics each, Abu Al Abyad Clinic and Sir Bani Yas Clinic.

These hospitals, centers and clinics provide medical services within more than 40 different specialties for inpatients and outpatients in various fields and specialties, the most important of which are internal medicine, cardiology, endocrinology, diabetes, mental health, nutrition, pediatrics, obstetrics, gynecology, general surgery, anesthesia, pharmacy services, laboratory and diagnostic radiology.

Al Dhafra hospitals seek to provide integrated and distinguished health care with the highest international standards of quality and safety to enhance patients' confidence in the services of Al Dhafra hospitals.

Thank you so much.
{{signature_text}}$t20$,
  updated_at = now()
where key = 'profile_sent_doctor_al_dhafra_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h21$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Yas Group</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://adscc.ae/who-we-are/">https://adscc.ae/who-we-are/</a></p><p>ADSCC is a renowned healthcare institution in Abu Dhabi, United Arab Emirates (UAE), specializing in advanced stem cell therapy, research, and regenerative medicine. Founded in 2018 to meet the growing demand for highly specialized medical services and treatments, ADSCC offers ground-breaking solutions in the region through cutting-edge research and innovative approaches in stem cell and cellular therapies.</p><p>Equipped with the latest technologies and staffed by internationally recognized physicians and researchers. Our unique holistic model encompasses the entire spectrum of cell therapy, from basic research to clinical trials and applications, ensuring a comprehensive approach. ADSCC features state-of-the-art facilities, including advanced laboratories, cell processing laboratory, Good Manufacturing Practice (GMP) laboratory, apheresis and stem cell collection units, and a multi-disciplinary hospital with dedicated outpatient clinics and inpatient wards. Their comprehensive model covers research, clinical trials, and applications, eliminating the need for patients to seek treatment abroad.</p><p>ADSCC is the incubator of the Abu Dhabi Bone Marrow Transplant (AD-BMT©) program, the first comprehensive program to provide autologous and allogeneic hematopoietic stem cells transplant (HSCT) for adult and pediatric patients in the UAE since 2020. As a Center of Excellence in Hematopoietic Stem Cell Transplantation accredited by the Department of Health Abu Dhabi, ADSCC’s holistic service model includes advanced research, clinical trials, translational care, and manufacturing capabilities.</p><p>Their  goal is to lead the field of cellular therapy, delivering highly specialized and innovative treatments while driving advancements in regenerative medicine. With a patient-centered approach and a commitment to innovation, they transform healthcare by offering cutting-edge solutions locally, enhancing the well-being of patients in the UAE and beyond.</p><p>As the UAE’s first and most experienced stem cell transplant center, ADSCC has received multiple prestigious recognitions and conducted strategic collaborations, solidifying its position as a center of excellence.</p><p>Thank you so much.</p>{{signature}}$h21$,
  body_text  = $t21$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Yas Group in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://adscc.ae/who-we-are/

ADSCC is a renowned healthcare institution in Abu Dhabi, United Arab Emirates (UAE), specializing in advanced stem cell therapy, research, and regenerative medicine. Founded in 2018 to meet the growing demand for highly specialized medical services and treatments, ADSCC offers ground-breaking solutions in the region through cutting-edge research and innovative approaches in stem cell and cellular therapies.

Equipped with the latest technologies and staffed by internationally recognized physicians and researchers. Our unique holistic model encompasses the entire spectrum of cell therapy, from basic research to clinical trials and applications, ensuring a comprehensive approach. ADSCC features state-of-the-art facilities, including advanced laboratories, cell processing laboratory, Good Manufacturing Practice (GMP) laboratory, apheresis and stem cell collection units, and a multi-disciplinary hospital with dedicated outpatient clinics and inpatient wards. Their comprehensive model covers research, clinical trials, and applications, eliminating the need for patients to seek treatment abroad.

ADSCC is the incubator of the Abu Dhabi Bone Marrow Transplant (AD-BMT©) program, the first comprehensive program to provide autologous and allogeneic hematopoietic stem cells transplant (HSCT) for adult and pediatric patients in the UAE since 2020. As a Center of Excellence in Hematopoietic Stem Cell Transplantation accredited by the Department of Health Abu Dhabi, ADSCC’s holistic service model includes advanced research, clinical trials, translational care, and manufacturing capabilities.

Their  goal is to lead the field of cellular therapy, delivering highly specialized and innovative treatments while driving advancements in regenerative medicine. With a patient-centered approach and a commitment to innovation, they transform healthcare by offering cutting-edge solutions locally, enhancing the well-being of patients in the UAE and beyond.

As the UAE’s first and most experienced stem cell transplant center, ADSCC has received multiple prestigious recognitions and conducted strategic collaborations, solidifying its position as a center of excellence.

Thank you so much.
{{signature_text}}$t21$,
  updated_at = now()
where key = 'profile_sent_doctor_yas_group_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h22$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Tawam Hospital</strong> in Al Ain and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.seha.ae/hospital-detail/42">https://www.seha.ae/hospital-detail/42</a></p><p>Tawam Hospital is a is a premier tertiary care facility one of the largest hospitals in the United Arab Emirates, and part of the SEHA Health System owned and operated by Abu Dhabi Health Services Company (SEHA) PureHealth subsidiary, the largest integrated healthcare platform in the Middle East, which is responsible for the curative activities of all the public hospitals and clinics of the Emirate of Abu Dhabi and northern emirates. Tawam Hospital was specifically designed &amp; established in 1979 to address a range of complex and critical care requirements unique to the residents and communities of Al Ain City and Abu Dhabi emirate and designed to transform our healthcare system services to the highest medical quality and customer care to the international standards.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h22$,
  body_text  = $t22$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Tawam Hospital in Al Ain and we highly recommended your profile.

Please let us know if you hear from them.

https://www.seha.ae/hospital-detail/42

Tawam Hospital is a is a premier tertiary care facility one of the largest hospitals in the United Arab Emirates, and part of the SEHA Health System owned and operated by Abu Dhabi Health Services Company (SEHA) PureHealth subsidiary, the largest integrated healthcare platform in the Middle East, which is responsible for the curative activities of all the public hospitals and clinics of the Emirate of Abu Dhabi and northern emirates. Tawam Hospital was specifically designed & established in 1979 to address a range of complex and critical care requirements unique to the residents and communities of Al Ain City and Abu Dhabi emirate and designed to transform our healthcare system services to the highest medical quality and customer care to the international standards.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t22$,
  updated_at = now()
where key = 'profile_sent_doctor_tawam_alain' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h23$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Al Zahra Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://azhd.ae/about/">https://azhd.ae/about/</a></p><p>Al Zahra Hospital Dubai was established in 2013, with the main aim to provide premium medical care and comfort, through state of the art equipment and world class medical experts.</p><p>Located on Sheikh Zayed Road, the hospital is Joint Commission International accredited, holding various prestigious certiﬁcations from international accreditation bodies around the world. The state-of-the-art facility has a capacity of 187 beds, serving patients with a broad range of health services, providing personalized service with a focus on clinical outcome through evidence based medicine.</p><p>At Al Zahra Hospital Dubai, the extensive medical team of over 250 doctors and more than 400 nurses are highly experienced in their respective ﬁelds.</p><p>Thank you so much.</p>{{signature}}$h23$,
  body_text  = $t23$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Al Zahra Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://azhd.ae/about/

Al Zahra Hospital Dubai was established in 2013, with the main aim to provide premium medical care and comfort, through state of the art equipment and world class medical experts.

Located on Sheikh Zayed Road, the hospital is Joint Commission International accredited, holding various prestigious certiﬁcations from international accreditation bodies around the world. The state-of-the-art facility has a capacity of 187 beds, serving patients with a broad range of health services, providing personalized service with a focus on clinical outcome through evidence based medicine.

At Al Zahra Hospital Dubai, the extensive medical team of over 250 doctors and more than 400 nurses are highly experienced in their respective ﬁelds.

Thank you so much.
{{signature_text}}$t23$,
  updated_at = now()
where key = 'profile_sent_doctor_al_zahra_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h24$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Harley Street Medical Center</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.hsmc.ae">https://www.hsmc.ae</a></p><p>Harley Street Medical Centre has provided Abu Dhabi with quality healthcare since 2012 and has grown to become one of the leading multispecialty centers in the region.</p><p>HSMC’s extraordinary patient care team consists of physicians, nurses, surgical technologists, medical assistants, and other administrative staff recognized for their excellence over the years by peers and patients. Their goal is for HSMC to be synonymous with the highest quality outpatient surgical care in the UAE.</p><p>Thank you so much.</p>{{signature}}$h24$,
  body_text  = $t24$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Harley Street Medical Center in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.hsmc.ae

Harley Street Medical Centre has provided Abu Dhabi with quality healthcare since 2012 and has grown to become one of the leading multispecialty centers in the region.

HSMC’s extraordinary patient care team consists of physicians, nurses, surgical technologists, medical assistants, and other administrative staff recognized for their excellence over the years by peers and patients. Their goal is for HSMC to be synonymous with the highest quality outpatient surgical care in the UAE.

Thank you so much.
{{signature_text}}$t24$,
  updated_at = now()
where key = 'profile_sent_doctor_harley_street_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h25$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Sheikh Sultan Bin Zayed Hospital</strong> in Sharjah and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://m42.ae">https://m42.ae</a></p><p>Sheikh Sultan bin Zayed Hospital (SSBZH) is a state-of-the-art healthcare facility in the Northern Emirates run in partnership with M42. This unique collaboration between the civilian and military sectors is an example of a shared commitment to delivering world-class medical care. With access to cutting-edge technologies and the expertise of M42’s renowned network — such as Imperial College London's Diabetes Center, Amana Healthcare, Mubadala Health and Healthpoint - SSBZH is at the forefront of medical innovation.</p><p>Thank you so much.</p>{{signature}}$h25$,
  body_text  = $t25$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Sheikh Sultan Bin Zayed Hospital in Sharjah and we highly recommended your profile.

Please let us know if you hear from them.

https://m42.ae

Sheikh Sultan bin Zayed Hospital (SSBZH) is a state-of-the-art healthcare facility in the Northern Emirates run in partnership with M42. This unique collaboration between the civilian and military sectors is an example of a shared commitment to delivering world-class medical care. With access to cutting-edge technologies and the expertise of M42’s renowned network — such as Imperial College London's Diabetes Center, Amana Healthcare, Mubadala Health and Healthpoint - SSBZH is at the forefront of medical innovation.

Thank you so much.
{{signature_text}}$t25$,
  updated_at = now()
where key = 'profile_sent_doctor_sheikh_sultan_sharjah' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h26$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Zayed Military Hospital</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.emitachealthcare.com">https://www.emitachealthcare.com</a></p><p>Hello Mitchell!</p><p>I hope you are well 😊</p><p>We heard of an opportunity with Zayed Military Hospital in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know once you hear from them.</p><p>Some information about Zayed Military Hospital :</p><p>The Zayed Military Hospital is part of Zayed Military City. It is in the Al Shahama area, northeast of Abu Dhabi, UAE. The new hospital is designed as a 260-bed facility, including an ICU, Burn ICU, Cardiac Care Unit, medical, surgical, and pediatric beds. Also, the hospital has a psychiatric center located in a separate building, bringing the total aggregate number of beds to 300.</p><p>The Zayed Military Hospital campus is 121,000 square meters built on 56 hectares of land. The campus includes an ambulatory care component, as well as housing for the Hospital’s staff and physicians. There are 1,500 parking spots that are ready to intake the Hospital’s staff, patients and visitors. Due to the enormous size of this project, there will be a second construction phase that is mainly designed for expansion, where the one bedroom will be expanded to be double room, and the overall bed’s capacity to reach 500. Since the Zayed Military Hospital has a specialty department for microsurgery, EHS handled the supply and the installation of Brainlab and Haag Streit products at the Neurology department of The Zayed Military Hospital. Haag Streit provides operating microscopes for several fields such as ophthalmology, neuro and spine surgery, ENT, plastic &amp; reconstructive surgery as well as for dental and maxillary operations. This project is unique in terms of the built-up size and the facilities that it provides to its patients. It consists of one of the most innovative and advanced healthcare technologies in the UAE, such as Brainsuite ICT, Brainlab and Haag Streit.</p><p>Thank you so much.</p>{{signature}}$h26$,
  body_text  = $t26$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Zayed Military Hospital in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.emitachealthcare.com

Hello Mitchell!

I hope you are well 😊

We heard of an opportunity with Zayed Military Hospital in Abu Dhabi and we highly recommended your profile.

Please let us know once you hear from them.

Some information about Zayed Military Hospital :

The Zayed Military Hospital is part of Zayed Military City. It is in the Al Shahama area, northeast of Abu Dhabi, UAE. The new hospital is designed as a 260-bed facility, including an ICU, Burn ICU, Cardiac Care Unit, medical, surgical, and pediatric beds. Also, the hospital has a psychiatric center located in a separate building, bringing the total aggregate number of beds to 300.

The Zayed Military Hospital campus is 121,000 square meters built on 56 hectares of land. The campus includes an ambulatory care component, as well as housing for the Hospital’s staff and physicians. There are 1,500 parking spots that are ready to intake the Hospital’s staff, patients and visitors. Due to the enormous size of this project, there will be a second construction phase that is mainly designed for expansion, where the one bedroom will be expanded to be double room, and the overall bed’s capacity to reach 500. Since the Zayed Military Hospital has a specialty department for microsurgery, EHS handled the supply and the installation of Brainlab and Haag Streit products at the Neurology department of The Zayed Military Hospital. Haag Streit provides operating microscopes for several fields such as ophthalmology, neuro and spine surgery, ENT, plastic & reconstructive surgery as well as for dental and maxillary operations. This project is unique in terms of the built-up size and the facilities that it provides to its patients. It consists of one of the most innovative and advanced healthcare technologies in the UAE, such as Brainsuite ICT, Brainlab and Haag Streit.

Thank you so much.
{{signature_text}}$t26$,
  updated_at = now()
where key = 'profile_sent_doctor_zayed_military_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h27$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Bascom Palmer Eye Institute</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.bascompalmer.ae">https://www.bascompalmer.ae</a></p><p>Now in Abu Dhabi, Bascom Palmer brings its legacy of innovation and expertise to the heart of the UAE. Their institute combines cutting-edge technology with compassionate patient care, offering the highest standards of treatment for vision-related conditions. From routine eye examinations to complex surgeries, their team of internationally trained specialists is dedicated to preserving and restoring sight.</p><p>They are committed to serving the community with the same values that have made Bascom Palmer a trusted name in eye care worldwide: excellence, innovation, compassion, and education. By bridging global expertise with local care, they aim to advance ophthalmology in the region and improve the quality of life for their patients.</p><p>Thank you so much.</p>{{signature}}$h27$,
  body_text  = $t27$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Bascom Palmer Eye Institute in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.bascompalmer.ae

Now in Abu Dhabi, Bascom Palmer brings its legacy of innovation and expertise to the heart of the UAE. Their institute combines cutting-edge technology with compassionate patient care, offering the highest standards of treatment for vision-related conditions. From routine eye examinations to complex surgeries, their team of internationally trained specialists is dedicated to preserving and restoring sight.

They are committed to serving the community with the same values that have made Bascom Palmer a trusted name in eye care worldwide: excellence, innovation, compassion, and education. By bridging global expertise with local care, they aim to advance ophthalmology in the region and improve the quality of life for their patients.

Thank you so much.
{{signature_text}}$t27$,
  updated_at = now()
where key = 'profile_sent_doctor_bascom_palmer_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h28$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Burjeel Royal Hospital</strong> in Al Ain and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.burjeel.com">https://www.burjeel.com</a></p><p>- Facilities and Services: Burjeel Royal Hospital offers a wide range of medical services, including emergency care, inpatient and outpatient services, diagnostic imaging, surgery, and specialized care in various fields such as cardiology, orthopedics, obstetrics, gynecology, pediatrics, and more.</p><p>- Accreditations: The hospital typically maintains high standards of care and may hold accreditations from various healthcare organizations, ensuring that it meets international quality standards.</p><p>- Advanced Technology: The hospital is equipped with advanced medical technologies and state-of-the-art facilities, which enable it to provide effective and efficient patient care.</p><p>- Multidisciplinary Team: The healthcare professionals at Burjeel Royal Hospital likely include a diverse team of doctors, nurses, and support staff, who are trained in various specialties and work collaboratively to provide comprehensive care.</p><p>- Patient-Centric Approach: As part of its mission, the hospital focuses on delivering patient-centered care, emphasizing comfort, safety, and satisfaction for patients and their families.</p><p>- Community Engagement: The hospital may also be involved in community outreach programs, health awareness campaigns, and initiatives aimed at promoting public health.</p><p>Thank you so much.</p>{{signature}}$h28$,
  body_text  = $t28$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Burjeel Royal Hospital in Al Ain and we highly recommended your profile.

Please let us know if you hear from them.

https://www.burjeel.com

- Facilities and Services: Burjeel Royal Hospital offers a wide range of medical services, including emergency care, inpatient and outpatient services, diagnostic imaging, surgery, and specialized care in various fields such as cardiology, orthopedics, obstetrics, gynecology, pediatrics, and more.

- Accreditations: The hospital typically maintains high standards of care and may hold accreditations from various healthcare organizations, ensuring that it meets international quality standards.

- Advanced Technology: The hospital is equipped with advanced medical technologies and state-of-the-art facilities, which enable it to provide effective and efficient patient care.

- Multidisciplinary Team: The healthcare professionals at Burjeel Royal Hospital likely include a diverse team of doctors, nurses, and support staff, who are trained in various specialties and work collaboratively to provide comprehensive care.

- Patient-Centric Approach: As part of its mission, the hospital focuses on delivering patient-centered care, emphasizing comfort, safety, and satisfaction for patients and their families.

- Community Engagement: The hospital may also be involved in community outreach programs, health awareness campaigns, and initiatives aimed at promoting public health.

Thank you so much.
{{signature_text}}$t28$,
  updated_at = now()
where key = 'profile_sent_doctor_burjeel_royal_alain' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h29$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Reem Hospital</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.reemhospital.com/our-story/">https://www.reemhospital.com/our-story/</a></p><p>Reem Hospital - Established in 2020 and with a capacity of over 200 beds, Reem Hospital is the first Post-acute Rehabilitation, and Multi-specialty Hospital built to provide quality and world-class care to patients throughout their recovery journey. By onboarding best-in-class doctors and integrating renewed advanced technologies as well as AI tracking and programming systems, they aim to provide you access to the world’s best healthcare services, reducing your need to seek medical support abroad.</p><p>They are proudly operated by VAMED in partnership with Charité, one of the leading University Hospitals in Germany and Europe, with more than 300 years of experience in specialized pediatric care.</p><p>Thank you so much.</p>{{signature}}$h29$,
  body_text  = $t29$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Reem Hospital in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.reemhospital.com/our-story/

Reem Hospital - Established in 2020 and with a capacity of over 200 beds, Reem Hospital is the first Post-acute Rehabilitation, and Multi-specialty Hospital built to provide quality and world-class care to patients throughout their recovery journey. By onboarding best-in-class doctors and integrating renewed advanced technologies as well as AI tracking and programming systems, they aim to provide you access to the world’s best healthcare services, reducing your need to seek medical support abroad.

They are proudly operated by VAMED in partnership with Charité, one of the leading University Hospitals in Germany and Europe, with more than 300 years of experience in specialized pediatric care.

Thank you so much.
{{signature_text}}$t29$,
  updated_at = now()
where key = 'profile_sent_doctor_reem_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h30$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Tarmeem Orthopedic and Spine Specialty Hospital</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p>Hi Mitchell!</p><p>I hope you are doing well!</p><p>We have an amazing opportunities with Tarmeem Orthopedic and Spine Specialty Hospital in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know as soon as you hear from them.</p><p>Tarmeem Orthopedic and Spine Specialty Hospital, located in Abu Dhabi, was founded by Dr. Ali Alsuwaidi. Dr. Alsuwaidi, a highly respected orthopedic surgeon with over 25 years of experience, is the current President of the Emirates Orthopedic Society. In Tarmeem, Dr. Ali Al Suwaidi leads a team of specialized orthopedic surgeons, each one focusing on a unique medical specialty. These specialties include sports medicine, joint reconstructive surgery for the shoulder, knee, and hip, as well as treatments for spine and back pain, and issues related to the elbow, wrist, hand, foot, and ankle. At Tarmeem, patients are at the heart of their care. The hospital prides itself on offering highly personalized, seamless care that addresses the whole journey of the patient - from pain relief to restoring mobility and then to rehabilitation and preventive care. The medical team, comprising an international group of physicians, is complemented by patient coordinators and nurse navigators who guide each patient through their wellness journey. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h30$,
  body_text  = $t30$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Tarmeem Orthopedic and Spine Specialty Hospital in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

Hi Mitchell!

I hope you are doing well!

We have an amazing opportunities with Tarmeem Orthopedic and Spine Specialty Hospital in Abu Dhabi and we highly recommended your profile.

Please let us know as soon as you hear from them.

Tarmeem Orthopedic and Spine Specialty Hospital, located in Abu Dhabi, was founded by Dr. Ali Alsuwaidi. Dr. Alsuwaidi, a highly respected orthopedic surgeon with over 25 years of experience, is the current President of the Emirates Orthopedic Society. In Tarmeem, Dr. Ali Al Suwaidi leads a team of specialized orthopedic surgeons, each one focusing on a unique medical specialty. These specialties include sports medicine, joint reconstructive surgery for the shoulder, knee, and hip, as well as treatments for spine and back pain, and issues related to the elbow, wrist, hand, foot, and ankle. At Tarmeem, patients are at the heart of their care. The hospital prides itself on offering highly personalized, seamless care that addresses the whole journey of the patient - from pain relief to restoring mobility and then to rehabilitation and preventive care. The medical team, comprising an international group of physicians, is complemented by patient coordinators and nurse navigators who guide each patient through their wellness journey. They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t30$,
  updated_at = now()
where key = 'profile_sent_doctor_tarmeem_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h31$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Capital Health</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://srh.ae/about-us/">https://srh.ae/about-us/</a></p><p>At Specialized Rehabilitation Hospital, they offer a purpose built facility with state of the art equipment and clinical expertise to take care of all rehabilitation patients and their individualized needs. Their Bayt Al Qudra™ house of ability helps patients rebuild their lives that are recovering from life-changing illness or injury. Their focus is on their patient outcomes to help patients regain independence and mobility. They are affiliated with The Shirley Ryan Ability Lab ( previously known as the Rehabilitation Institute of Chicago ) and now offer world class rehabilitation services in the heart of Abu Dhabi. Their specialized Doctors, Therapists and expert teams work together to create a comprehensive rehabilitation program with advanced treatment and cutting-edge technologies including latest bionics and robotics. Their continuum of care provides Inpatient and Outpatient rehabilitation services including Post-Acute Rehabilitation, Long Term Care- Adults and Pediatrics, Long Term Ventilated Care with 24 hours ICU and HDU support.</p><p>They are most proud of their SRH team for demonstrating Trust and Pride in the care they deliver each day motivated by their patients whose progress is the “real measure of their success”.</p><p>Thank you so much.</p>{{signature}}$h31$,
  body_text  = $t31$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Capital Health in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://srh.ae/about-us/

At Specialized Rehabilitation Hospital, they offer a purpose built facility with state of the art equipment and clinical expertise to take care of all rehabilitation patients and their individualized needs. Their Bayt Al Qudra™ house of ability helps patients rebuild their lives that are recovering from life-changing illness or injury. Their focus is on their patient outcomes to help patients regain independence and mobility. They are affiliated with The Shirley Ryan Ability Lab ( previously known as the Rehabilitation Institute of Chicago ) and now offer world class rehabilitation services in the heart of Abu Dhabi. Their specialized Doctors, Therapists and expert teams work together to create a comprehensive rehabilitation program with advanced treatment and cutting-edge technologies including latest bionics and robotics. Their continuum of care provides Inpatient and Outpatient rehabilitation services including Post-Acute Rehabilitation, Long Term Care- Adults and Pediatrics, Long Term Ventilated Care with 24 hours ICU and HDU support.

They are most proud of their SRH team for demonstrating Trust and Pride in the care they deliver each day motivated by their patients whose progress is the “real measure of their success”.

Thank you so much.
{{signature_text}}$t31$,
  updated_at = now()
where key = 'profile_sent_doctor_capital_health_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h32$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Sharjah University Hospital</strong> in Sharjah and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.uhs.ae/">https://www.uhs.ae/</a></p><p>Some information about Sharjah University Hospital.</p><p>The University Hospital of Sharjah (UHS) is established as a Not-for-profit organization by the Decree of the Ruler of Sharjah and Supreme Council Member and is located adjacent to the sprawling campus of University of Sharjah. The prestigious, world-class Hospital is synonymous with commitment, care and impeccable services it offers to the patients. We are one of the best hospitals in the region.</p><p>Highly experienced, specialist doctors are the backbone of this patient-centric hospital. The hospital encompasses all the specialty and super-specialty areas of medicine and surgery. They have various centers of Excellence that strive to give the patients the best medical advice, treatment and care that could be compared to any famous and most committed medical centers in Sharjah</p><p>UHS takes pride in its team of Specialist Doctors, Best Gynecology, Nurses and other Healthcare Professionals who give their cent percent to their profession. Their diligent and dedicated team, and the team spirit they demonstrate helps in acclaiming UHS as the top-notch healthcare providers in UAE.</p><p>Thank you so much.</p>{{signature}}$h32$,
  body_text  = $t32$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Sharjah University Hospital in Sharjah and we highly recommended your profile.

Please let us know if you hear from them.

https://www.uhs.ae/

Some information about Sharjah University Hospital.

The University Hospital of Sharjah (UHS) is established as a Not-for-profit organization by the Decree of the Ruler of Sharjah and Supreme Council Member and is located adjacent to the sprawling campus of University of Sharjah. The prestigious, world-class Hospital is synonymous with commitment, care and impeccable services it offers to the patients. We are one of the best hospitals in the region.

Highly experienced, specialist doctors are the backbone of this patient-centric hospital. The hospital encompasses all the specialty and super-specialty areas of medicine and surgery. They have various centers of Excellence that strive to give the patients the best medical advice, treatment and care that could be compared to any famous and most committed medical centers in Sharjah

UHS takes pride in its team of Specialist Doctors, Best Gynecology, Nurses and other Healthcare Professionals who give their cent percent to their profession. Their diligent and dedicated team, and the team spirit they demonstrate helps in acclaiming UHS as the top-notch healthcare providers in UAE.

Thank you so much.
{{signature_text}}$t32$,
  updated_at = now()
where key = 'profile_sent_doctor_sharjah_university_sharjah' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h33$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>RAK Hospital</strong> in Ras Al Khaimah and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://rakhospital.com/about-us/">https://rakhospital.com/about-us/</a></p><p>The flagship unit of Arabian Healthcare Group, has been a beacon of excellence for 17 years. The group’s diverse interests span healthcare, laboratory services hospital, education, and infrastructure. Founded with the vision of bringing high-quality tertiary healthcare to the people of Ras Al Khaimah, RAK Hospital offers world-class care across a wide range of super specialities. Today, as a hub of international quality healthcare, RAK Hospital serves patients from the Gulf and around the world, who rely on its expertise and advanced medical services. The hospital has firmly established itself as the ‘New Health Tourism Destination,’ attracting international patients seeking top-tier healthcare at affordable prices. With a legacy of 17 years, RAK Hospital continues to impact lives, providing exceptional care and fostering trust and well-being in the global community.</p><p>Thank you so much.</p>{{signature}}$h33$,
  body_text  = $t33$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with RAK Hospital in Ras Al Khaimah and we highly recommended your profile.

Please let us know if you hear from them.

https://rakhospital.com/about-us/

The flagship unit of Arabian Healthcare Group, has been a beacon of excellence for 17 years. The group’s diverse interests span healthcare, laboratory services hospital, education, and infrastructure. Founded with the vision of bringing high-quality tertiary healthcare to the people of Ras Al Khaimah, RAK Hospital offers world-class care across a wide range of super specialities. Today, as a hub of international quality healthcare, RAK Hospital serves patients from the Gulf and around the world, who rely on its expertise and advanced medical services. The hospital has firmly established itself as the ‘New Health Tourism Destination,’ attracting international patients seeking top-tier healthcare at affordable prices. With a legacy of 17 years, RAK Hospital continues to impact lives, providing exceptional care and fostering trust and well-being in the global community.

Thank you so much.
{{signature_text}}$t33$,
  updated_at = now()
where key = 'profile_sent_doctor_rak_hospital_rak' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h34$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Al Jalila Children's Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://dubaihealth.ae/l/197362">https://dubaihealth.ae/l/197362</a></p><p>At Al Jalila Children's Hospital, they are dedicated to providing compassionate, comprehensive care for children from birth through to 18 years, all within a safe and family-friendly environment. They opened their  doors in 2016 and are the UAE's only standalone children's hospital, proudly serving their diverse communities and striving for every child to have access to expert care for their optimal health and wellbeing.</p><p>With all pediatric specialties under one roof, your child receives the specialized care they need -  whether it's a common childhood illness, or your little one requires specialist diagnosis and treatment, they offer 360-degree expertise across multiple medical and surgical specialties. These include Cardiac Care, Kidney Care and Kidney Transplantation, Neurosciences, Dermatology, Pediatric Critical Care and Pediatric Oncology, as well as Neonatology for their youngest newborn arrivals.</p><p>They are committed to bringing the latest therapies and procedures to our region, so that families can access advanced treatment closer to home rather than traveling abroad. This includes our gene therapy program introduced in 2020 -  a revolutionary program for the UAE, and one of the world’s largest programs for the genetic condition, spinal muscular atrophy (SMA). At Al Jalila Children’s Hospital, they are here for you. If your child is unwell or in need of specialized medical treatment, you can put your trust in them as they are dedicated to ensuring your child’s health, comfort and safety are our highest priority. They are here to support your child and your whole family through every step of their healthcare journey.</p><p>They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.</p><p>Thank you so much.</p>{{signature}}$h34$,
  body_text  = $t34$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Al Jalila Children's Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://dubaihealth.ae/l/197362

At Al Jalila Children's Hospital, they are dedicated to providing compassionate, comprehensive care for children from birth through to 18 years, all within a safe and family-friendly environment. They opened their  doors in 2016 and are the UAE's only standalone children's hospital, proudly serving their diverse communities and striving for every child to have access to expert care for their optimal health and wellbeing.

With all pediatric specialties under one roof, your child receives the specialized care they need -  whether it's a common childhood illness, or your little one requires specialist diagnosis and treatment, they offer 360-degree expertise across multiple medical and surgical specialties. These include Cardiac Care, Kidney Care and Kidney Transplantation, Neurosciences, Dermatology, Pediatric Critical Care and Pediatric Oncology, as well as Neonatology for their youngest newborn arrivals.

They are committed to bringing the latest therapies and procedures to our region, so that families can access advanced treatment closer to home rather than traveling abroad. This includes our gene therapy program introduced in 2020 -  a revolutionary program for the UAE, and one of the world’s largest programs for the genetic condition, spinal muscular atrophy (SMA). At Al Jalila Children’s Hospital, they are here for you. If your child is unwell or in need of specialized medical treatment, you can put your trust in them as they are dedicated to ensuring your child’s health, comfort and safety are our highest priority. They are here to support your child and your whole family through every step of their healthcare journey.

They are an extremely progressive and motivated team with excellent supportive leadership and with a positive working environment.

Thank you so much.
{{signature_text}}$t34$,
  updated_at = now()
where key = 'profile_sent_doctor_al_jalila_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h35$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Mediclinic</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.mediclinic.ae">https://www.mediclinic.ae</a></p><p>Mediclinic Airport Road Hospital - Mediclinic Airport Road Hospital</p><p>Mediclinic Airport Road Hospital was established in 2008 and provides a wide range of inpatient and outpatient services including a 24-hour Emergency department. This Joint Commission International (JCI) accredited hospital offers the very highest standard of healthcare, delivered by a highly qualified team of medical experts. They continue to develop their services to be the leading private tertiary hospital in Abu Dhabi. This includes refurbishment and upgrade of their facilities and services and the significant new extension, more than double the size of the existing hospital, which will contains the Comprehensive Cancer Centre (Radiotherapy, Nuclear medicine and Chemotherapy in partnership with Hirslanden in Switzerland and Mediclinic City Hospital in Dubai), as well as upgraded maternity, NICU and pediatric facilities and services and a new pharmacy.</p><p>Thank you so much.</p>{{signature}}$h35$,
  body_text  = $t35$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Mediclinic in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.mediclinic.ae

Mediclinic Airport Road Hospital - Mediclinic Airport Road Hospital

Mediclinic Airport Road Hospital was established in 2008 and provides a wide range of inpatient and outpatient services including a 24-hour Emergency department. This Joint Commission International (JCI) accredited hospital offers the very highest standard of healthcare, delivered by a highly qualified team of medical experts. They continue to develop their services to be the leading private tertiary hospital in Abu Dhabi. This includes refurbishment and upgrade of their facilities and services and the significant new extension, more than double the size of the existing hospital, which will contains the Comprehensive Cancer Centre (Radiotherapy, Nuclear medicine and Chemotherapy in partnership with Hirslanden in Switzerland and Mediclinic City Hospital in Dubai), as well as upgraded maternity, NICU and pediatric facilities and services and a new pharmacy.

Thank you so much.
{{signature_text}}$t35$,
  updated_at = now()
where key = 'profile_sent_doctor_mediclinic_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h36$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Cosmesurge Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.cosmesurge.com/">https://www.cosmesurge.com/</a></p><p>Cosmetic &amp; Plastic Surgery in Dubai</p><p>With over 25 years of experience, they aim to provide international standards of quality and treatment. Their team of highly qualified and internationally recognized Dermatologists and Plastic Surgeons in Dubai strives for 100% patient satisfaction with tailored treatment plans and provides quality medical care and service. They are proud to bring you the ultimate beauty destination; a state-of-the-art hospital dedicated to elegance and refinement. CosmeSurge hospital aims to cater to the increasing demand of cosmetic surgeries amongst residents and at the same time to bolster medical tourism across the region. The goal is to deliver a truly unique experience, providing a continuum of care that goes beyond just the walls of the facility. Their experts provide you with adequate after-care and support, so you have a partner to count on.</p><p>Thank you so much.</p>{{signature}}$h36$,
  body_text  = $t36$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Cosmesurge Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.cosmesurge.com/

Cosmetic & Plastic Surgery in Dubai

With over 25 years of experience, they aim to provide international standards of quality and treatment. Their team of highly qualified and internationally recognized Dermatologists and Plastic Surgeons in Dubai strives for 100% patient satisfaction with tailored treatment plans and provides quality medical care and service. They are proud to bring you the ultimate beauty destination; a state-of-the-art hospital dedicated to elegance and refinement. CosmeSurge hospital aims to cater to the increasing demand of cosmetic surgeries amongst residents and at the same time to bolster medical tourism across the region. The goal is to deliver a truly unique experience, providing a continuum of care that goes beyond just the walls of the facility. Their experts provide you with adequate after-care and support, so you have a partner to count on.

Thank you so much.
{{signature_text}}$t36$,
  updated_at = now()
where key = 'profile_sent_doctor_cosmesurge_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h37$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Valens Clinic</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://thevalensclinic.ae/about-us/">https://thevalensclinic.ae/about-us/</a></p><p>The Valens Clinic is a specialized mental health clinic providing expert care in psychiatry and psychology complemented by a range of integrated wellness services. Their holistic approach to mental wellness includes comprehensive assessments, evidence-based therapies, cutting-edge psychiatric treatments, and compassionate support to help our clients build resilience and lead fulfilling lives. Their team at Valens Clinic consists of highly qualified and licensed clinicians who are deeply committed to your health and wellbeing. With extensive expertise across psychiatry and psychology, their clinicians work collaboratively to provide personalized care tailored to your unique needs. They support you throughout your journey to wellness with evidence-based treatments, compassionate guidance, and continuous encouragement empowering you to achieve lasting mental and emotional balance.</p><p>At The Valens Clinic, they are a team of dedicated mental health specialists in Dubai committed to providing high-quality care in a safe, confidential and supportive environment. Located in Jumeirah 3 and Business Bay, their clinic is known for its client-centered approach and multilingual therapy services available in English and Arabic. They support adults, children, couples and expats with a wide range of concerns from anxiety and trauma to relationship issues and developmental disorders.</p><p>Thank you so much.</p>{{signature}}$h37$,
  body_text  = $t37$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Valens Clinic in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://thevalensclinic.ae/about-us/

The Valens Clinic is a specialized mental health clinic providing expert care in psychiatry and psychology complemented by a range of integrated wellness services. Their holistic approach to mental wellness includes comprehensive assessments, evidence-based therapies, cutting-edge psychiatric treatments, and compassionate support to help our clients build resilience and lead fulfilling lives. Their team at Valens Clinic consists of highly qualified and licensed clinicians who are deeply committed to your health and wellbeing. With extensive expertise across psychiatry and psychology, their clinicians work collaboratively to provide personalized care tailored to your unique needs. They support you throughout your journey to wellness with evidence-based treatments, compassionate guidance, and continuous encouragement empowering you to achieve lasting mental and emotional balance.

At The Valens Clinic, they are a team of dedicated mental health specialists in Dubai committed to providing high-quality care in a safe, confidential and supportive environment. Located in Jumeirah 3 and Business Bay, their clinic is known for its client-centered approach and multilingual therapy services available in English and Arabic. They support adults, children, couples and expats with a wide range of concerns from anxiety and trauma to relationship issues and developmental disorders.

Thank you so much.
{{signature_text}}$t37$,
  updated_at = now()
where key = 'profile_sent_doctor_valens_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h38$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>American Center of Psychiatry and Neurology</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://americancenter.ae">https://americancenter.ae</a></p><p>Welcome to American Center for Psychiatry and Neurology (ACPN), where mental health and wellbeing is their priority. ACPN is a subspecialist medical facility that provides you with quality medical care in neurology and psychiatry in the UAE.</p><p>Opening their doors to patients in 2008, they have since expanded their facilities from Abu Dhabi to Dubai and Al Ain. Their services have touched the lives of over 100,000 patients throughout the years - a milestone built on your trust as their foundation throughout these years.</p><p>Thank you so much.</p>{{signature}}$h38$,
  body_text  = $t38$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with American Center of Psychiatry and Neurology in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://americancenter.ae

Welcome to American Center for Psychiatry and Neurology (ACPN), where mental health and wellbeing is their priority. ACPN is a subspecialist medical facility that provides you with quality medical care in neurology and psychiatry in the UAE.

Opening their doors to patients in 2008, they have since expanded their facilities from Abu Dhabi to Dubai and Al Ain. Their services have touched the lives of over 100,000 patients throughout the years - a milestone built on your trust as their foundation throughout these years.

Thank you so much.
{{signature_text}}$t38$,
  updated_at = now()
where key = 'profile_sent_doctor_acpn_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h39$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Latifa Hospital</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://dubaihealth.ae/l/196787">https://dubaihealth.ae/l/196787</a></p><p>Established in 1987, they have a long history of providing compassionate, specialized care for women, children and babies at Latifa Hospital.  For many women in the UAE, they are the trusted center for pregnancy and delivery care - both high-risk and low-risk pregnancies, for advanced and minimally invasive gynecological surgeries, urogynecology, and gynecologic oncology. Their Pediatric department comprises multiple specialties, with expert and comprehensive medical and surgical care for children up to the age of 12. Around 5,000 babies are born with them every year, and their Neonatology department is equipped to offer critical care for premature newborns and babies born with serious medical conditions. Their multidisciplinary team is here to support mother, baby and family with the best possible emotional and medical care until it’s time to go home.</p><p>At Latifa Hospital, they pride themselves in providing a comfortable and compassionate environment for mothers and babies, and have been awarded UNICEF’s Baby Friendly Hospital Initiative (BFHI) and Mother-Friendly Hospital Initiative (MFHI) certificates, recognizing their commitment to breastfeeding support and child protection. In addition to their medical and surgical care, they are committed to advancing medical education through their academic institute, where residents receive in-depth training in Obstetrics, Gynecology, and Neonatology, guided by an integrated, multidisciplinary approach.</p><p>At Latifa Hospital, you and your child’s health and wellbeing are their priority, and they are here to support with comprehensive and compassionate care, every step in your journey.</p><p>Thank you so much.</p>{{signature}}$h39$,
  body_text  = $t39$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Latifa Hospital in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://dubaihealth.ae/l/196787

Established in 1987, they have a long history of providing compassionate, specialized care for women, children and babies at Latifa Hospital.  For many women in the UAE, they are the trusted center for pregnancy and delivery care - both high-risk and low-risk pregnancies, for advanced and minimally invasive gynecological surgeries, urogynecology, and gynecologic oncology. Their Pediatric department comprises multiple specialties, with expert and comprehensive medical and surgical care for children up to the age of 12. Around 5,000 babies are born with them every year, and their Neonatology department is equipped to offer critical care for premature newborns and babies born with serious medical conditions. Their multidisciplinary team is here to support mother, baby and family with the best possible emotional and medical care until it’s time to go home.

At Latifa Hospital, they pride themselves in providing a comfortable and compassionate environment for mothers and babies, and have been awarded UNICEF’s Baby Friendly Hospital Initiative (BFHI) and Mother-Friendly Hospital Initiative (MFHI) certificates, recognizing their commitment to breastfeeding support and child protection. In addition to their medical and surgical care, they are committed to advancing medical education through their academic institute, where residents receive in-depth training in Obstetrics, Gynecology, and Neonatology, guided by an integrated, multidisciplinary approach.

At Latifa Hospital, you and your child’s health and wellbeing are their priority, and they are here to support with comprehensive and compassionate care, every step in your journey.

Thank you so much.
{{signature_text}}$t39$,
  updated_at = now()
where key = 'profile_sent_doctor_latifa_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h40$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>The Lighthouse Arabia</strong> in Dubai and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.lighthousearabia.com/about-us">https://www.lighthousearabia.com/about-us</a></p><p>The LightHouse Arabia is a Dubai-based mental health and wellness clinic providing high quality outpatient services to children, adults, couples, and families. They are the leading mental health clinic in the UAE by virtue of our vision, mission, size and the breadth and depth of our team’s clinical expertise. Their international team of over 30 psychologists, psychiatrists, coaches, occupational and speech &amp; language therapists work together to provide integrated care for clients across the age range and life stage. All of their work is evidence-based, anchored in research, results-oriented, and effective.</p><p>They help with a wide range of mental health and wellbeing challenges – from personal issues such as depression, anxiety, chronic stress, and addictions, to interpersonal issues such as conflict at work and marriage difficulties.</p><p>Thank you so much.</p>{{signature}}$h40$,
  body_text  = $t40$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with The Lighthouse Arabia in Dubai and we highly recommended your profile.

Please let us know if you hear from them.

https://www.lighthousearabia.com/about-us

The LightHouse Arabia is a Dubai-based mental health and wellness clinic providing high quality outpatient services to children, adults, couples, and families. They are the leading mental health clinic in the UAE by virtue of our vision, mission, size and the breadth and depth of our team’s clinical expertise. Their international team of over 30 psychologists, psychiatrists, coaches, occupational and speech & language therapists work together to provide integrated care for clients across the age range and life stage. All of their work is evidence-based, anchored in research, results-oriented, and effective.

They help with a wide range of mental health and wellbeing challenges – from personal issues such as depression, anxiety, chronic stress, and addictions, to interpersonal issues such as conflict at work and marriage difficulties.

Thank you so much.
{{signature_text}}$t40$,
  updated_at = now()
where key = 'profile_sent_doctor_lighthouse_dubai' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h41$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Alkalma / Aspris Wellbeing Centre</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://www.aspris.ae">https://www.aspris.ae</a></p><p>Aspris Wellbeing Centre Abu Dhabi (formerly Priory) is the second Aspris clinic in the UAE and part of a wider network offering mental health treatment to those in need of support. Their Wellbeing Centre is a purpose-built clinic located in Al Bateen and provides a welcoming and modern environment, ideal for starting your recovery journey. Aspris is extremely well placed to bring reputable, safe and pioneering mental health treatment to the UAE and the centre is an opportunity for us to offer the same level of support to you, as it does for those in the UK.</p><p>Thank you so much.</p>{{signature}}$h41$,
  body_text  = $t41$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Alkalma / Aspris Wellbeing Centre in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://www.aspris.ae

Aspris Wellbeing Centre Abu Dhabi (formerly Priory) is the second Aspris clinic in the UAE and part of a wider network offering mental health treatment to those in need of support. Their Wellbeing Centre is a purpose-built clinic located in Al Bateen and provides a welcoming and modern environment, ideal for starting your recovery journey. Aspris is extremely well placed to bring reputable, safe and pioneering mental health treatment to the UAE and the centre is an opportunity for us to offer the same level of support to you, as it does for those in the UK.

Thank you so much.
{{signature_text}}$t41$,
  updated_at = now()
where key = 'profile_sent_doctor_aspris_abudhabi' and flow_key = 'profile_sent';

update public.email_templates set
  body_html  = $h42$<p>Hi {{doctor_name}}!</p><p>I hope you are doing well 😊</p><p>We have an opportunity with <strong>Maudsley Health</strong> in Abu Dhabi and we highly recommended your profile.</p><p>Please let us know if you hear from them.</p><p><a href="https://maudsleyhealth.com/">https://maudsleyhealth.com/</a></p><p>Maudsley Health is a collaboration between South London and Maudsley Health NHS Foundation Trust (The Maudsley), the oldest psychiatric institution in the world, and MACANI Medical Center, an Abu Dhabi-based medical organization set up to bring the highest quality mental health services to the Middle East.</p><p>They aim to achieve the best possible outcomes for children and young people with mental health problems, and their families by providing high quality and comprehensive assessments, and internationally agreed evidence based interventions.</p><p>Thank you so much.</p>{{signature}}$h42$,
  body_text  = $t42$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with Maudsley Health in Abu Dhabi and we highly recommended your profile.

Please let us know if you hear from them.

https://maudsleyhealth.com/

Maudsley Health is a collaboration between South London and Maudsley Health NHS Foundation Trust (The Maudsley), the oldest psychiatric institution in the world, and MACANI Medical Center, an Abu Dhabi-based medical organization set up to bring the highest quality mental health services to the Middle East.

They aim to achieve the best possible outcomes for children and young people with mental health problems, and their families by providing high quality and comprehensive assessments, and internationally agreed evidence based interventions.

Thank you so much.
{{signature_text}}$t42$,
  updated_at = now()
where key = 'profile_sent_doctor_maudsley_abudhabi' and flow_key = 'profile_sent';

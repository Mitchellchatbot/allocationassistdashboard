-- Real profile-sent doctor emails, transcribed from what the team actually
-- sends (opportunities@allocationassist.com export, 2026-07-02). Three distinct
-- doctor-facing formats the team uses, all on the `profile_sent` flow so they
-- show up in the doctor-email template picker (flow_key filter) and can be
-- swapped per send:
--
--   1. profile_sent_doctor            — single-hospital "Working Opportunity"
--      (rewritten to match the real Cleveland Clinic email, §3 of the export).
--   2. profile_sent_doctor_matched    — "Best matched Hospitals for <specialty>"
--      with the full UAE hospital-network list baked in (§4 — the dominant
--      format; ~50 of these in the export, one per specialty).
--   3. profile_sent_doctor_discussing — "we're discussing your profile with the
--      hospitals below" shortlist (§1).
--
-- All plain plinky style (bare <p>, no banner header) so send-flow-email's
-- Garamond wrapper styles them like every other email, and each ends in the
-- branded {{signature}}. Tokens: {{doctor_name}}, {{doctor_specialty}},
-- {{hospital_name}}, {{city}}, {{hospital_profile_url}}, {{hospital_description}}.

-- ── 1) profile_sent_doctor — single-hospital "Working Opportunity" ───────────
update public.email_templates set
  name    = 'Doctor · Working Opportunity (single hospital)',
  subject = 'Working Opportunity in {{city}} - {{hospital_name}}',
  body_html = $H1$<p>Hello Dr. {{doctor_name}}!</p>
<p>I hope you're having a good day 😊</p>
<p>We have an opportunity with <strong>{{hospital_name}}</strong>{{#city}} in {{city}}{{/city}} and we highly recommended your profile.</p>
<p>Please let us know if you hear from them.</p>
{{#hospital_profile_url}}<p><a href="{{hospital_profile_url}}" style="color:#0d9488;">{{hospital_profile_url}}</a></p>{{/hospital_profile_url}}
{{#hospital_description}}<p>{{hospital_description}}</p>{{/hospital_description}}
<p>Thank you so much.</p>
{{signature}}$H1$,
  body_text = $T1$Hello Dr. {{doctor_name}}!

I hope you're having a good day :)

We have an opportunity with {{hospital_name}}{{#city}} in {{city}}{{/city}} and we highly recommended your profile.

Please let us know if you hear from them.

{{hospital_profile_url}}

{{hospital_description}}

Thank you so much.

{{signature}}$T1$,
  variables  = '["doctor_name","hospital_name","city","hospital_profile_url","hospital_description","signature"]'::jsonb,
  updated_at = now()
where key = 'profile_sent_doctor';

-- ── 2) profile_sent_doctor_matched — "Best matched Hospitals" + network ──────
insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables, updated_at)
values (
  'profile_sent_doctor_matched',
  'Doctor · Best matched Hospitals (by specialty + full network)',
  'profile_sent',
  'Best matched Hospitals for {{doctor_specialty}} in the UAE - Allocation Assist',
  $T2$Hi Dr. {{doctor_name}},

I hope you are doing well.

From our experience in the market, below are the hospitals that we feel are most relevant and suitable for your speciality and training. We have recommended your profile to these hospitals. Please see the information guide provided for each hospital to find out more about their facilities.

However the UAE is a very progressive country with a rapidly evolving healthcare sector and sometimes the hospitals have unannounced plans to build departments, so we also recommend introducing our Doctors' profiles to other leading hospitals in case they have plans in the future.

Here is an entire list of our hospital network in the UAE:

In Dubai:
Dubai Health Authority - https://dubaihealth.ae/hospitals
American Hospital - https://www.ahdubai.com/about
King's College Hospital - https://www.allocationassist.com/kings-college-hospital-london-overseas-partnerships-in-uae-and-saudi-arabia/
NMC Hospital - https://www.allocationassist.com/nmc-healthcare-in-uae/
Fakeeh University Hospital - https://www.allocationassist.com/fakeeh-care-group/
Mediclinic Hospital - https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/
Al Zahra Hospital - https://azhd.ae/
Healthbay - https://healthbayclinic.com/about-us/
Mirdif Hospital - https://www.hmsmirdifhospital.ae/en/about
Zulekha Hospital - https://www.zulekhahospitals.com/dubai/best-hospital-in-dubai
Dubai London Clinic - https://dubailondonclinic.com/a-word-from-the-founder/
Saudi German Hospital - https://saudigerman.com/about-us
Clemenceau Hospital - https://cmcdubai.ae/about-us/

In Abu Dhabi:
Sheikh Shakhbout Medical City - https://www.allocationassist.com/seha-governmental-hospitals-in-uae/
Sheikh Khalifa Medical City - https://www.allocationassist.com/seha-governmental-hospitals-in-uae/
Sheikh Tahnoon Medical City - https://www.seha.ae/hospital-detail/41
Burjeel Medical City - https://burjeel.com/burjeelspecialty/
Burjeel Abu Dhabi & Al Ain - https://burjeel.com/abu-dhabi/
Mubadala Group - https://mubadalahealthdubai.com/about-us/
Mediclinic Airport Road Hospital - https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/
Mediclinic Al Noor Hospital - https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/
NMC Hospital Abu Dhabi - https://www.allocationassist.com/nmc-healthcare-in-uae/
Tawam Hospital - https://www.seha.ae/hospital-detail/42
Harley Street Medical - https://www.hsmc.ae/harley-street-medical-centre/
Ambulatory Services - https://arec.ae/about-ahs/
Reem Hospital - https://www.reemhospital.com/our-story/
Al Dhafra Hospitals - https://www.seha.ae/hospital-detail/45

In Sharjah:
Sharjah University Hospital - https://www.uhs.ae/about-us/who-we-are

In Fujairah:
Al Sharq Hospital - https://alsharqhospital.ae/about-us

Regarding the list above, there are a few facilities that are not directly relevant to your specialty. The reason we still highlight your profile to these HR / directors is because sometimes they are connected / involved with multiple facilities under the same investment / governmental group.

The hospitals will either let us know they are interested in your profile and ask us to arrange a meeting / interview with you, or they might contact you directly, as we do not remove your contact information from your CV or our online platform. So please let us know as soon as you hear from any hospitals via email, phone call, WhatsApp or LinkedIn so that we can assist you through the interview and salary / contract negotiations.

Thank you so much.

{{signature}}$T2$,
  $H2$<p>Hi Dr. {{doctor_name}},</p>
<p>I hope you are doing well.</p>
<p>From our experience in the market, below are the hospitals that we feel are most relevant and suitable for your speciality and training. We have recommended your profile to these hospitals. Please see the information guide provided for each hospital to find out more about their facilities.</p>
{{#doctor_specialty}}<p>For a <strong>{{doctor_specialty}}</strong>, we focus on the hospitals with the strongest specialised departments in your field, and we have recommended your profile to the most relevant of them.</p>{{/doctor_specialty}}
<p>However the UAE is a very progressive country with a rapidly evolving healthcare sector and sometimes the hospitals have unannounced plans to build departments, so we also recommend introducing our Doctors' profiles to other leading hospitals in case they have plans in the future.</p>
<p><strong>Here is an entire list of our hospital network in the UAE:</strong></p>
<p style="font-weight:600;margin:14px 0 4px;">In Dubai:</p>
<p style="margin:2px 0;"><a href="https://dubaihealth.ae/hospitals" style="color:#0d9488;">Dubai Health Authority</a></p>
<p style="margin:2px 0;"><a href="https://www.ahdubai.com/about" style="color:#0d9488;">American Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/kings-college-hospital-london-overseas-partnerships-in-uae-and-saudi-arabia/" style="color:#0d9488;">King's College Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/nmc-healthcare-in-uae/" style="color:#0d9488;">NMC Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/fakeeh-care-group/" style="color:#0d9488;">Fakeeh University Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/" style="color:#0d9488;">Mediclinic Hospital</a></p>
<p style="margin:2px 0;"><a href="https://azhd.ae/" style="color:#0d9488;">Al Zahra Hospital</a></p>
<p style="margin:2px 0;"><a href="https://healthbayclinic.com/about-us/" style="color:#0d9488;">Healthbay</a></p>
<p style="margin:2px 0;"><a href="https://www.hmsmirdifhospital.ae/en/about" style="color:#0d9488;">Mirdif Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.zulekhahospitals.com/dubai/best-hospital-in-dubai" style="color:#0d9488;">Zulekha Hospital</a></p>
<p style="margin:2px 0;"><a href="https://dubailondonclinic.com/a-word-from-the-founder/" style="color:#0d9488;">Dubai London Clinic</a></p>
<p style="margin:2px 0;"><a href="https://saudigerman.com/about-us" style="color:#0d9488;">Saudi German Hospital</a></p>
<p style="margin:2px 0;"><a href="https://cmcdubai.ae/about-us/" style="color:#0d9488;">Clemenceau Hospital</a></p>
<p style="font-weight:600;margin:14px 0 4px;">In Abu Dhabi:</p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/seha-governmental-hospitals-in-uae/" style="color:#0d9488;">Sheikh Shakhbout Medical City</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/seha-governmental-hospitals-in-uae/" style="color:#0d9488;">Sheikh Khalifa Medical City</a></p>
<p style="margin:2px 0;"><a href="https://www.seha.ae/hospital-detail/41" style="color:#0d9488;">Sheikh Tahnoon Medical City</a></p>
<p style="margin:2px 0;"><a href="https://burjeel.com/burjeelspecialty/" style="color:#0d9488;">Burjeel Medical City</a></p>
<p style="margin:2px 0;"><a href="https://burjeel.com/abu-dhabi/" style="color:#0d9488;">Burjeel Abu Dhabi &amp; Al Ain</a></p>
<p style="margin:2px 0;"><a href="https://mubadalahealthdubai.com/about-us/" style="color:#0d9488;">Mubadala Group</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/" style="color:#0d9488;">Mediclinic Airport Road Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/mediclinic-middle-east-in-the-uae/" style="color:#0d9488;">Mediclinic Al Noor Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.allocationassist.com/nmc-healthcare-in-uae/" style="color:#0d9488;">NMC Hospital Abu Dhabi</a></p>
<p style="margin:2px 0;"><a href="https://www.seha.ae/hospital-detail/42" style="color:#0d9488;">Tawam Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.hsmc.ae/harley-street-medical-centre/" style="color:#0d9488;">Harley Street Medical</a></p>
<p style="margin:2px 0;"><a href="https://arec.ae/about-ahs/" style="color:#0d9488;">Ambulatory Services</a></p>
<p style="margin:2px 0;"><a href="https://www.reemhospital.com/our-story/" style="color:#0d9488;">Reem Hospital</a></p>
<p style="margin:2px 0;"><a href="https://www.seha.ae/hospital-detail/45" style="color:#0d9488;">Al Dhafra Hospitals</a></p>
<p style="font-weight:600;margin:14px 0 4px;">In Sharjah:</p>
<p style="margin:2px 0;"><a href="https://www.uhs.ae/about-us/who-we-are" style="color:#0d9488;">Sharjah University Hospital</a></p>
<p style="font-weight:600;margin:14px 0 4px;">In Fujairah:</p>
<p style="margin:2px 0;"><a href="https://alsharqhospital.ae/about-us" style="color:#0d9488;">Al Sharq Hospital</a></p>
<p style="margin-top:14px;">Regarding the list above, there are a few facilities that are not directly relevant to your specialty. The reason we still highlight your profile to these HR / directors is because sometimes they are connected / involved with multiple facilities under the same investment / governmental group.</p>
<p>The hospitals will either let us know they are interested in your profile and ask us to arrange a meeting / interview with you, or they might contact you directly, as we do not remove your contact information from your CV or our online platform. So please let us know as soon as you hear from any hospitals via email, phone call, WhatsApp or LinkedIn so that we can assist you through the interview and salary / contract negotiations.</p>
<p>Thank you so much.</p>
{{signature}}$H2$,
  '["doctor_name","doctor_specialty","signature"]'::jsonb,
  now()
)
on conflict (key) do update set
  name       = excluded.name,
  flow_key   = excluded.flow_key,
  subject    = excluded.subject,
  body_text  = excluded.body_text,
  body_html  = excluded.body_html,
  variables  = excluded.variables,
  updated_at = now();

-- ── 3) profile_sent_doctor_discussing — "discussing with these hospitals" ────
insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables, updated_at)
values (
  'profile_sent_doctor_discussing',
  'Doctor · Discussing your profile with these hospitals',
  'profile_sent',
  'Working opportunities in the Gulf - Allocation Assist',
  $T3$Hello Dr. {{doctor_name}}!

I hope you're doing well :)

We are currently discussing your profile with the hospitals below; please let us know if you hear from any of them through email, phone call, or LinkedIn. We will also let you know as soon as we receive feedback.

We will help you negotiate the salary and allowance to secure your best offer.

- (list the hospitals you have submitted this doctor to here)

We wish you a wonderful day!

{{signature}}$T3$,
  $H3$<p>Hello Dr. {{doctor_name}}!</p>
<p>I hope you're doing well 😊</p>
<p>We are currently discussing your profile with the hospitals below; please let us know if you hear from any of them through email, phone call, or LinkedIn. We will also let you know as soon as we receive feedback.</p>
<p>We will help you negotiate the salary and allowance to secure your best offer.</p>
<ul>
  <li>Edit this list to name the hospitals you have submitted this doctor to.</li>
</ul>
<p>We wish you a wonderful day!</p>
{{signature}}$H3$,
  '["doctor_name","signature"]'::jsonb,
  now()
)
on conflict (key) do update set
  name       = excluded.name,
  flow_key   = excluded.flow_key,
  subject    = excluded.subject,
  body_text  = excluded.body_text,
  body_html  = excluded.body_html,
  variables  = excluded.variables,
  updated_at = now();

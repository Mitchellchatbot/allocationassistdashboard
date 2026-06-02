-- Load Saif's real templates received May 23, 2026.
-- Replaces the PLACEHOLDER copy for three templates with the actual phrasing
-- AA's team uses today, preserving emojis and links from the original emails.
--
-- UPSERTs by `key` so re-running this is safe. The Templates tab in the
-- dashboard will reflect these immediately after migration.

-- ── Relocation · Attestation Info ────────────────────────────────────────────
update public.email_templates
set
  subject = 'Document attestation for your UAE work visa',
  variables = '["doctor_name"]'::jsonb,
  body_text = $TEXT$Hello {{doctor_name}}!

We hope you are well!

Please find the below information about the attestation that will be required to get your UAE work visa.

You can visit the below link for all the information about document attestation:
https://www.linkedin.com/posts/emiliedavies_doctors-health-uae-activity-6818426317281746944-zyKN

We highly recommend our Doctors use a company called BVS Global as they are a reputable company here in Dubai that specializes in assisting Doctors with document attestation.

Here are their contact details:

Website: https://www.bvsglobal.com/
Email: sme@bvsglobal.com

Note: To sponsor your family after you arrive, you must attest your marriage certificate and birth certificates for your children.

Please let us know if we can assist you with anything.

Thank you so much!$TEXT$,
  body_html = $HTML$<p>Hello {{doctor_name}}!</p>
<p>We hope you are well!</p>
<p>Please find the below information about the attestation that will be required to get your UAE work visa.</p>
<p>You can visit the below link for all the information about document attestation:<br>
<a href="https://www.linkedin.com/posts/emiliedavies_doctors-health-uae-activity-6818426317281746944-zyKN">Doctors &mdash; Health UAE &mdash; LinkedIn post</a></p>
<p>We highly recommend our Doctors use a company called <strong>BVS Global</strong> as they are a reputable company here in Dubai that specializes in assisting Doctors with document attestation.</p>
<p>Here are their contact details:</p>
<ul>
  <li>Website: <a href="https://www.bvsglobal.com/">https://www.bvsglobal.com/</a></li>
  <li>Email: <a href="mailto:sme@bvsglobal.com">sme@bvsglobal.com</a></li>
</ul>
<p><em>Note: To sponsor your family after you arrive, you must attest your marriage certificate and birth certificates for your children.</em></p>
<p>Please let us know if we can assist you with anything.</p>
<p>Thank you so much!</p>$HTML$,
  updated_at = now()
where key = 'relocation_attestation';

-- ── Profile Sent · Hospital Email (single-doctor variant with bio + table) ──
-- Maps to the email Ammar sent introducing Dr. Hina Hussain to Mediclinic.
-- Multi-doctor batch sends (Tuesday top-15) are Phase 6 / a separate template;
-- keep this one focused on the single-doctor case the Send Profile dialog uses.
--
-- Tokens used here that map to existing Zoho fields:
--   doctor_name, doctor_speciality, doctor_country_training, doctor_license,
--   doctor_phone, doctor_email
-- Tokens that don't exist in Zoho today (left as {{...}} for the team to fill
-- once Phase 2 profile-generation extracts them from CVs):
--   doctor_title, doctor_bio, doctor_area_of_interest, doctor_years_experience,
--   doctor_nationality, doctor_age, doctor_marital_status, doctor_family_status,
--   doctor_salary_expectation, doctor_notice_period, hospital_contact_name
update public.email_templates
set
  subject = '{{doctor_name}} - {{doctor_title}} ({{doctor_area_of_interest}}) - {{doctor_country_training}} - {{doctor_license}}',
  variables = '["doctor_name","doctor_title","doctor_speciality","doctor_bio","doctor_area_of_interest","doctor_country_training","doctor_years_experience","doctor_nationality","doctor_age","doctor_marital_status","doctor_family_status","doctor_license","doctor_salary_expectation","doctor_notice_period","doctor_phone","doctor_email","hospital_name","hospital_contact_name"]'::jsonb,
  body_text = $TEXT$Hello {{hospital_contact_name}}!

I hope you are having a good day 😊

{{doctor_name}} is a {{doctor_country_training}} {{doctor_title}}.

{{doctor_bio}}

----
Name: {{doctor_name}}
Title and Specialty as per the UAE license: {{doctor_title}}
Area of Interest: {{doctor_area_of_interest}}
Country Of Training: {{doctor_country_training}}
Years of Experience: {{doctor_years_experience}}
Nationality: {{doctor_nationality}}
Age: {{doctor_age}}
Marital Status: {{doctor_marital_status}}
Family Status: {{doctor_family_status}}
UAE license type / Status: {{doctor_license}}
Salary Expectation: {{doctor_salary_expectation}}
Notice Period: {{doctor_notice_period}}
Mobile: {{doctor_phone}}
Email: {{doctor_email}}
----

Please let us know if you are interested in {{doctor_name}}'s profile and if so, we would be pleased to assist you in this regard.

We wish you a great day!$TEXT$,
  body_html = $HTML$<p>Hello {{hospital_contact_name}}!</p>
<p>I hope you are having a good day 😊</p>
<p><strong>{{doctor_name}}</strong> is a {{doctor_country_training}} {{doctor_title}}.</p>
<p>{{doctor_bio}}</p>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; font-size: 12px; margin: 16px 0;">
  <thead>
    <tr style="background: #f4f4f4; font-weight: bold;">
      <th>Name</th>
      <th>Title and Specialty<br>(per UAE license)</th>
      <th>Area of Interest</th>
      <th>Country Of Training</th>
      <th>Years of Experience</th>
      <th>Nationality</th>
      <th>Age</th>
      <th>Marital Status</th>
      <th>Family Status</th>
      <th>UAE license type / Status</th>
      <th>Salary Expectation</th>
      <th>Notice Period</th>
      <th>Mobile</th>
      <th>Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{{doctor_name}}</td>
      <td>{{doctor_title}}</td>
      <td>{{doctor_area_of_interest}}</td>
      <td>{{doctor_country_training}}</td>
      <td>{{doctor_years_experience}}</td>
      <td>{{doctor_nationality}}</td>
      <td>{{doctor_age}}</td>
      <td>{{doctor_marital_status}}</td>
      <td>{{doctor_family_status}}</td>
      <td>{{doctor_license}}</td>
      <td>{{doctor_salary_expectation}}</td>
      <td>{{doctor_notice_period}}</td>
      <td>{{doctor_phone}}</td>
      <td><a href="mailto:{{doctor_email}}">{{doctor_email}}</a></td>
    </tr>
  </tbody>
</table>
<p>Please let us know if you are interested in {{doctor_name}}'s profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>$HTML$,
  updated_at = now()
where key = 'profile_sent_hospital';

-- ── Profile Sent · Doctor Notification ──────────────────────────────────────
-- Maps to "Working Opportunities in Dubai" outreach AA sends to a doctor when
-- they've been introduced to a specific hospital. Includes the hospital's
-- public AA profile page + a marketing paragraph about that hospital.
update public.email_templates
set
  subject = 'Working opportunity at {{hospital_name}}, {{city}}',
  variables = '["doctor_name","hospital_name","city","hospital_profile_url","hospital_description"]'::jsonb,
  body_text = $TEXT$Hi {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with {{hospital_name}} in {{city}} and we highly recommended your profile.

Please let us know your availability for an interview next week.

{{hospital_profile_url}}

{{hospital_description}}

Thank you so much.$TEXT$,
  body_html = $HTML$<p>Hi {{doctor_name}}!</p>
<p>I hope you are doing well 😊</p>
<p>We have an opportunity with <strong>{{hospital_name}}</strong> in {{city}} and we highly recommended your profile.</p>
<p>Please let us know your availability for an interview next week.</p>
<p><a href="{{hospital_profile_url}}">{{hospital_profile_url}}</a></p>
<p style="font-size: 12px; color: #444;">{{hospital_description}}</p>
<p>Thank you so much.</p>$HTML$,
  updated_at = now()
where key = 'profile_sent_doctor';

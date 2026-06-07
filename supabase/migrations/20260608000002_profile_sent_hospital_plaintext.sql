-- profile_sent_hospital — Plinky-style plain rewrite.
-- The old template had a teal header banner, "DOCTOR INTRODUCTION" pill,
-- "AT A GLANCE" cards, and a teal CTA button. Ammar's reference Plinky
-- email (Apr 3 2026, Dr. Hina Hussain → Mediclinic) is just a greeting,
-- a one-line intro, the bio paragraph, a clean labelled-field table,
-- a close, and the standard signature. This rewrite matches that
-- exactly so the emails the team sends from the dashboard read as
-- 'a person typed this in Gmail' rather than 'this is a marketing
-- campaign'.

update public.email_templates
set
  subject = '{{doctor_name}} – {{doctor_title}} – {{doctor_country_training}}',
  body_html = $html$
<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>
<p>I hope you are having a good day 😊</p>
<p>Dr. {{doctor_name}} is a {{doctor_country_training}} {{doctor_title}}.</p>
<p>{{doctor_bio}}</p>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2332;border:1px solid #cbd5e1;margin:18px 0;">
  <thead>
    <tr style="background:#f1f5f9;">
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">#</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Name</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Title and Specialty as per the UAE license</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Area of Interest</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Country Of Training</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Years of Experience</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Nationality</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Age</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Marital Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Family Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">UAE license type / Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Salary Expectation</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Notice Period</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Mobile</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">1</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_name}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_title}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_area_of_interest}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_country_training}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_years_experience}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_nationality}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_age}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_marital_status}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_family_status}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_license}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_salary_expectation}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_notice_period}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_phone}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_email}}</td>
    </tr>
  </tbody>
</table>
<p>Please let us know if you are interested in her profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>
{{signature}}
$html$,
  body_text = $text$Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!

I hope you are having a good day :)

Dr. {{doctor_name}} is a {{doctor_country_training}} {{doctor_title}}.

{{doctor_bio}}

Name:                {{doctor_name}}
Title / Specialty:   {{doctor_title}}
Area of Interest:    {{doctor_area_of_interest}}
Country of Training: {{doctor_country_training}}
Years of Experience: {{doctor_years_experience}}
Nationality:         {{doctor_nationality}}
Age:                 {{doctor_age}}
Marital Status:      {{doctor_marital_status}}
Family Status:       {{doctor_family_status}}
UAE License:         {{doctor_license}}
Salary Expectation:  {{doctor_salary_expectation}}
Notice Period:       {{doctor_notice_period}}
Mobile:              {{doctor_phone}}
Email:               {{doctor_email}}

Please let us know if you are interested in her profile and if so, we would be pleased to assist you in this regard.

We wish you a great day!

{{signature_text}}
$text$
where key = 'profile_sent_hospital';

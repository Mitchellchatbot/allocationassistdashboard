-- profile_sent_hospital — let a captured profile IMAGE replace the data table.
--
-- Hasan: the hospital email should show a polished candidate card (the same look
-- as the "View full profile" page) as a single inline image, instead of the
-- plain labelled-field table — and it must not show empty fields. The dashboard
-- captures that card to a PNG (skipping blank fields) and passes its URL as
-- `doctor_card_image_url` in run metadata.
--
-- Mechanics: when doctor_card_image_url is present we render the <img> (and hide
-- the standalone bio paragraph + table, which the card already contains); when
-- it's absent the email is byte-for-byte what it was before (bio + table). Uses
-- the {{#token}} / {{^token}} sections both render engines now support.

update public.email_templates
set
  body_html = $html$
<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>
<p>I hope you are having a good day 😊</p>
<p>Dr. {{doctor_name}} is a {{doctor_country_training}} {{doctor_title}}.</p>
{{#doctor_card_image_url}}
<img src="{{doctor_card_image_url}}" alt="Dr. {{doctor_name}} — candidate profile" style="display:block;width:100%;max-width:720px;height:auto;border:0;border-radius:16px;margin:18px 0;" />
{{/doctor_card_image_url}}
{{^doctor_card_image_url}}
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
{{/doctor_card_image_url}}
<p>Please let us know if you are interested in her profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>
{{signature}}
$html$
where key = 'profile_sent_hospital';

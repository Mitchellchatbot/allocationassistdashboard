-- profile_sent_hospital layout: the bio is now the MAIN paragraph and always
-- leads — greeting → bio → (card image OR data table) → closing. Previously the
-- card image REPLACED the bio; now the image (when present) sits after the bio,
-- and only the fallback data table is swapped out for it.
--
-- Re-sets body_html to the canonical structure (no auto summary line, no Area of
-- Interest column, header cells nowrap inside an overflow-x:auto scroll box).
update public.email_templates
set body_html = $html$
<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>
<p>I hope you are having a good day 😊</p>
<p>{{doctor_bio}}</p>
{{#doctor_card_image_url}}
<img src="{{doctor_card_image_url}}" alt="Dr. {{doctor_name}} — candidate profile" style="display:block;width:100%;max-width:720px;height:auto;border:0;border-radius:16px;margin:18px 0;" />
{{/doctor_card_image_url}}
{{^doctor_card_image_url}}
<div style="overflow-x:auto;max-width:100%;margin:18px 0;"><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2332;border:1px solid #cbd5e1;">
  <thead>
    <tr style="background:#f1f5f9;">
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">#</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Name</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Title and Specialty as per the UAE license</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Country Of Training</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Years of Experience</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Nationality</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Age</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Marital Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Family Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">UAE license type / Status</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Salary Expectation</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Notice Period</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Mobile</th>
      <th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;">Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">1</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_name}}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_title}}</td>
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
</table></div>
{{/doctor_card_image_url}}
<p>Please let us know if you are interested in her profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>
{{signature}}
$html$
where key = 'profile_sent_hospital';

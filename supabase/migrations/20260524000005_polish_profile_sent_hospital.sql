-- Polish the profile_sent_hospital template.
-- Saif's original was a 14-column horizontal table — readable on desktop, awful
-- on mobile / narrow inbox panes. This rebuild uses a branded envelope + a
-- vertical "doctor spec sheet" layout (key/value rows) that reads cleanly at
-- any width. Same data, much better visual hierarchy.

update public.email_templates set
  subject = '{{doctor_name}} — {{doctor_title}}, {{doctor_country_training}}',
  body_text = $TEXT$Hello {{hospital_contact_name}}!

I hope you're having a good day 😊

I'd like to introduce {{doctor_name}} — a {{doctor_country_training}} {{doctor_title}}.

{{doctor_bio}}

---
DOCTOR PROFILE — {{doctor_name}}

Title & Specialty:       {{doctor_title}}
Area of Interest:        {{doctor_area_of_interest}}
Country of Training:     {{doctor_country_training}}
Years of Experience:     {{doctor_years_experience}}
Nationality:             {{doctor_nationality}}
Age:                     {{doctor_age}}
Marital Status:          {{doctor_marital_status}}
Family Status:           {{doctor_family_status}}
UAE License:             {{doctor_license}}
Salary Expectation:      {{doctor_salary_expectation}}
Notice Period:           {{doctor_notice_period}}
Mobile:                  {{doctor_phone}}
Email:                   {{doctor_email}}
---

Please let us know if you're interested in {{doctor_name}}'s profile — we'd be glad to set up next steps.

We wish you a great day!

The Allocation Assist team$TEXT$,
  body_html = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:640px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">DOCTOR PROFILE INTRODUCTION</div>
        </td></tr>

        <tr><td style="padding:32px 32px 4px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hello <strong>{{hospital_contact_name}}</strong>!</p>
          <p style="margin:0 0 18px;">I hope you're having a good day 😊</p>
          <p style="margin:0 0 18px;">I'd like to introduce <strong>{{doctor_name}}</strong> — a {{doctor_country_training}} {{doctor_title}}.</p>
          <p style="margin:0 0 18px;color:#3a4a5c;font-size:14px;line-height:1.7;">{{doctor_bio}}</p>
        </td></tr>

        <tr><td style="padding:8px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fafbfc;border:1px solid #e8ecf0;border-radius:10px;">
            <tr><td colspan="2" style="padding:16px 22px 12px;border-bottom:1px solid #eef0f3;">
              <div style="font-size:10px;color:#5a6c7d;letter-spacing:0.6px;text-transform:uppercase;font-weight:600;">Doctor Profile</div>
              <div style="font-size:17px;color:#1a2332;font-weight:700;margin-top:3px;letter-spacing:-0.2px;">{{doctor_name}}</div>
            </td></tr>

            <tr>
              <td style="padding:10px 22px;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;width:42%;vertical-align:top;">Title &amp; Specialty</td>
              <td style="padding:10px 22px;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_title}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Area of Interest</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_area_of_interest}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Country of Training</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_country_training}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Years of Experience</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_years_experience}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Nationality</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_nationality}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Age</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_age}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Marital Status</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_marital_status}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Family Status</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_family_status}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">UAE License</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;font-weight:500;">{{doctor_license}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Salary Expectation</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_salary_expectation}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Notice Period</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_notice_period}}</td>
            </tr>
            <tr>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Mobile</td>
              <td style="padding:10px 22px;border-top:1px solid #eef0f3;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;"><a href="tel:{{doctor_phone}}" style="color:#14a098;text-decoration:none;">{{doctor_phone}}</a></td>
            </tr>
            <tr>
              <td style="padding:10px 22px 14px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Email</td>
              <td style="padding:10px 22px 14px;border-top:1px solid #eef0f3;font-size:13px;vertical-align:top;line-height:1.55;"><a href="mailto:{{doctor_email}}" style="color:#14a098;text-decoration:none;">{{doctor_email}}</a></td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 8px;font-size:14px;line-height:1.65;color:#3a4a5c;">
          <p style="margin:0 0 10px;">Please let us know if you're interested in <strong>{{doctor_name}}'s</strong> profile — we'd be glad to set up next steps.</p>
          <p style="margin:0 0 12px;color:#5a6c7d;">We wish you a great day!</p>
          <p style="margin:0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>

        <tr><td style="background-color:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  updated_at = now()
where key = 'profile_sent_hospital';

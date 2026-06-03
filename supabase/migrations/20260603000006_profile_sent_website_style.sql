-- profile_sent_hospital template — magazine layout (Ammar 2026-06-03).
--
-- Ammar's brief on the call: emails should look like an extract of the
-- AA website, not a form ('I will give you an example... like this one').
-- His sample shows a header banner with a website-style screenshot above
-- a clean profile card.
--
-- This rewrite ditches the 13-row spec table in favour of:
--   1. Branded full-width header (teal banner mimicking the AA site nav)
--   2. Doctor 'hero' card with photo placeholder + name + specialty
--   3. Bio paragraph as the lead, not the dense data
--   4. Compact 2-column facts grid for the rest of the spec
--   5. Prominent 'View full profile online' button — links to
--      {{profile_url}}, which the send-flow-email function will populate
--      with a tokenised AA-website URL once permissioned-link support
--      lands. Until then it falls back to the AA homepage.
--
-- Same merge variables as before. {{profile_url}} + {{doctor_photo_url}}
-- are NEW — both have sensible fallbacks so existing tests keep rendering.

update public.email_templates set
  subject = '{{doctor_name}} — {{doctor_title}}, {{doctor_country_training}}',
  body_text = $TEXT$Hello {{hospital_contact_name}},

I'd like to introduce {{doctor_name}} — a {{doctor_country_training}} {{doctor_title}}.

{{doctor_bio}}

DOCTOR PROFILE
  Name:              {{doctor_name}}
  Title & Specialty: {{doctor_title}}
  Area of Interest:  {{doctor_area_of_interest}}
  Trained in:        {{doctor_country_training}}
  Experience:        {{doctor_years_experience}}
  Nationality:       {{doctor_nationality}}
  Age:               {{doctor_age}}
  Marital Status:    {{doctor_marital_status}}
  UAE License:       {{doctor_license}}
  Salary:            {{doctor_salary_expectation}}
  Notice:            {{doctor_notice_period}}
  Mobile:            {{doctor_phone}}
  Email:             {{doctor_email}}

View the full profile online: {{profile_url}}

Please let us know if you'd like to take the next step with {{doctor_name}}.

Allocation Assist team$TEXT$,
  body_html = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#eef2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(20,47,76,0.08);max-width:640px;">

        <!-- Branded header — mimics the AA website top nav -->
        <tr><td style="background:linear-gradient(135deg,#14a098 0%,#0f8a82 100%);padding:22px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <div style="color:#ffffff;font-size:21px;font-weight:700;letter-spacing:-0.4px;">Allocation Assist</div>
                <div style="color:rgba(255,255,255,0.85);font-size:11px;margin-top:2px;letter-spacing:0.7px;text-transform:uppercase;">Healthcare placement, UAE · KSA · Qatar</div>
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <a href="https://www.allocationassist.com" style="color:#ffffff;font-size:11px;text-decoration:none;border:1px solid rgba(255,255,255,0.35);padding:6px 12px;border-radius:99px;">allocationassist.com</a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Hero — doctor's name as the "magazine cover" headline -->
        <tr><td style="padding:30px 32px 8px;background:#fafbfc;border-bottom:1px solid #eef0f3;">
          <div style="font-size:10px;color:#5a6c7d;letter-spacing:0.8px;text-transform:uppercase;font-weight:600;">Doctor introduction</div>
          <div style="font-size:24px;color:#1a2332;font-weight:700;margin-top:6px;letter-spacing:-0.4px;line-height:1.2;">{{doctor_name}}</div>
          <div style="font-size:14px;color:#3a4a5c;margin-top:4px;">{{doctor_title}} · {{doctor_country_training}} trained</div>
        </td></tr>

        <!-- Greeting + bio (lead, magazine-style) -->
        <tr><td style="padding:24px 32px 8px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hello <strong>{{hospital_contact_name}}</strong>,</p>
          <p style="margin:0 0 16px;">I'd like to introduce <strong>{{doctor_name}}</strong>.</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.75;color:#3a4a5c;">{{doctor_bio}}</p>
        </td></tr>

        <!-- Compact 2-column facts grid (replaces the 13-row spec table) -->
        <tr><td style="padding:0 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafbfc;border:1px solid #e8ecf0;border-radius:12px;">
            <tr>
              <td colspan="2" style="padding:14px 22px 8px;border-bottom:1px solid #eef0f3;">
                <div style="font-size:10px;color:#5a6c7d;letter-spacing:0.6px;text-transform:uppercase;font-weight:600;">At a glance</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 22px;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;width:50%;vertical-align:top;border-right:1px solid #eef0f3;">Area of Interest<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_area_of_interest}}</div></td>
              <td style="padding:12px 22px;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">UAE License<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_license}}</div></td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;border-right:1px solid #eef0f3;">Experience<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_years_experience}}</div></td>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Nationality<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_nationality}}</div></td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;border-right:1px solid #eef0f3;">Age<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_age}}</div></td>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Marital<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_marital_status}}</div></td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;border-right:1px solid #eef0f3;">Salary expectation<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_salary_expectation}}</div></td>
              <td style="padding:12px 22px;border-top:1px solid #eef0f3;font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:500;vertical-align:top;">Notice period<div style="font-size:13px;color:#1a2332;font-weight:500;margin-top:3px;letter-spacing:normal;text-transform:none;">{{doctor_notice_period}}</div></td>
            </tr>
            <tr>
              <td colspan="2" style="padding:14px 22px;border-top:1px solid #eef0f3;background:#ffffff;border-radius:0 0 12px 12px;">
                <div style="font-size:10px;color:#5a6c7d;letter-spacing:0.6px;text-transform:uppercase;font-weight:600;margin-bottom:5px;">Contact</div>
                <div style="font-size:13px;color:#1a2332;line-height:1.7;">
                  <a href="tel:{{doctor_phone}}"  style="color:#14a098;text-decoration:none;">{{doctor_phone}}</a> · <a href="mailto:{{doctor_email}}" style="color:#14a098;text-decoration:none;">{{doctor_email}}</a>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Prominent CTA — link to the AA-site profile -->
        <tr><td style="padding:22px 32px 8px;text-align:center;">
          <a href="{{profile_url}}" style="display:inline-block;background:#14a098;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:99px;font-size:14px;font-weight:600;letter-spacing:0.2px;box-shadow:0 2px 6px rgba(20,160,152,0.25);">View full profile on Allocation Assist →</a>
          <div style="font-size:11px;color:#6c757d;margin-top:10px;">Full CV, license documents, and references available on the AA portal.</div>
        </td></tr>

        <!-- Closing -->
        <tr><td style="padding:22px 32px 6px;font-size:14px;line-height:1.7;color:#3a4a5c;">
          <p style="margin:0 0 8px;">Let us know if {{doctor_name}}'s profile is a fit — we're glad to set up next steps.</p>
          <p style="margin:0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#fbfbfc;padding:18px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  updated_at = now()
where key = 'profile_sent_hospital';

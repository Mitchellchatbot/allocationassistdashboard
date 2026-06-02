-- Add a "Join Interview" CTA button to the interview_tips_confirmation
-- template. Uses Mustache section syntax {{#interview_link}}...{{/interview_link}}
-- so the button only renders when a link is present (in-person / phone
-- interviews don't have one).

update public.email_templates set
  body_html = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">THE SOURCE OF WORKFORCE</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 16px;">Hi <strong>{{doctor_name}}</strong>!</p>
          <p style="margin:0 0 16px;">Your interview is confirmed 🎉</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f5fafa;border-radius:10px;margin:20px 0;width:100%;"><tr><td style="padding:16px 20px;">
            <div style="font-size:11px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Interview details</div>
            <div style="font-size:14px;color:#2d3a4a;line-height:1.8;">
              <strong style="color:#1a2332;">Hospital:</strong> {{hospital_name}}<br>
              <strong style="color:#1a2332;">Date &amp; time:</strong> {{interview_datetime}}<br>
              <strong style="color:#1a2332;">Format:</strong> {{interview_format}}
            </div>
          </td></tr></table>
          {{#interview_link}}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{interview_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Join interview</a></td></tr></table>
          <p style="margin:0 0 16px;font-size:12px;color:#6c757d;">Or paste this link into your browser:<br><a href="{{interview_link}}" style="color:#14a098;text-decoration:none;word-break:break-all;">{{interview_link}}</a></p>
          {{/interview_link}}
          <p style="margin:24px 0 10px;font-weight:600;color:#1a2332;">A few tips that consistently help our candidates:</p>
          <ol style="margin:0 0 16px;padding-left:22px;color:#2d3a4a;">
            <li style="margin-bottom:10px;"><strong>Research the hospital</strong> — services, accreditations, recent news. A quick read of their website goes a long way.</li>
            <li style="margin-bottom:10px;"><strong>Be ready to walk through your clinical experience</strong>: case mix, complex cases, your approach to teamwork, and your relocation timeline.</li>
            <li style="margin-bottom:10px;"><strong>Have thoughtful questions for them</strong>: team structure, patient volume, support staff, opportunities for growth. Hospitals love candidates who ask.</li>
            <li style="margin-bottom:10px;"><strong>If it's a video interview</strong>, test your setup 15 minutes early — camera, mic, lighting, and a quiet room.</li>
            <li><strong>Dress for the part</strong> — smart and professional, as you would for any senior medical interview.</li>
          </ol>
          <p style="margin:20px 0 0;color:#5a6c7d;font-size:14px;font-style:italic;">Your profile already impressed them. This is just about confirming the fit. Take a breath, be yourself, and let your experience speak.</p>
          <p style="margin:24px 0 0;">Best of luck — we're rooting for you.</p>
          <p style="margin:8px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>
        <tr><td style="background-color:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  body_text = $TEXT$Hi {{doctor_name}}!

Your interview is confirmed 🎉

Interview details:
- Hospital: {{hospital_name}}
- Date & Time: {{interview_datetime}}
- Format: {{interview_format}}
{{#interview_link}}
Join here: {{interview_link}}
{{/interview_link}}

A few tips that consistently help our candidates do well:

1. Research the hospital — services, accreditations, recent news. A quick read of their website goes a long way.

2. Be ready to walk through your clinical experience: case mix, complex cases you've handled, your approach to teamwork, and your relocation timeline.

3. Have thoughtful questions for them: team structure, patient volume, support staff, opportunities for growth. Hospitals love candidates who ask.

4. If it's a video interview, test your setup 15 minutes early — camera, mic, lighting, and a quiet room.

5. Dress as you would for any senior medical interview — smart and professional.

Your profile already impressed them. This is just about confirming the fit. Take a breath, be yourself, and let your experience speak.

Best of luck — we're rooting for you.

The Allocation Assist team$TEXT$,
  variables  = '["doctor_name","hospital_name","interview_datetime","interview_format","interview_link"]'::jsonb,
  updated_at = now()
where key = 'interview_tips_confirmation';

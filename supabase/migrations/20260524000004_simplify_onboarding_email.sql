-- Simplify the onboarding welcome email to just the CV upload step.
-- The original v2 template had two CTAs — qualification form + document upload.
-- We never built the qualification form, so the {{form_link}} token rendered as
-- a literal placeholder and the "Open qualification form" button went nowhere.
-- Stripping it down to the one action that actually works.

update public.email_templates set
  subject = 'Welcome to Allocation Assist — let''s get you placed',
  body_text = $TEXT$Hi {{doctor_name}}!

Welcome aboard 😊

We're thrilled to be partnering with you on your journey to a new opportunity in the UAE and GCC. Now that your first payment is confirmed, here's the one thing we need from you to get started:

Upload your CV + any registration documents you'd like us to share with hospitals:

{{upload_link}}

Once we have your CV, our team builds your professional profile and starts introducing you to hospitals matching your specialty. Most doctors finish the upload in under 5 minutes.

If anything is unclear, just reply to this email — we're here.

Welcome again, and thank you for trusting us with your next move.

The Allocation Assist team$TEXT$,
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
          <p style="margin:0 0 16px;">Welcome aboard 😊</p>
          <p style="margin:0 0 24px;">We're thrilled to be partnering with you on your journey to a new opportunity in the UAE and GCC. Now that your first payment is confirmed, here's the one thing we need from you to get started.</p>
          <p style="margin:0 0 16px;font-weight:600;color:#1a2332;">Upload your CV + any registration documents:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{upload_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Upload my documents</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">Once we have your CV, our team builds your professional profile and starts introducing you to hospitals matching your specialty. Most doctors finish the upload in under 5 minutes.</p>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If anything is unclear, just reply to this email — we're here.</p>
          <p style="margin:24px 0 0;">Welcome again, and thank you for trusting us with your next move.</p>
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
  variables  = '["doctor_name","upload_link"]'::jsonb,
  updated_at = now()
where key = 'onboarding_welcome';

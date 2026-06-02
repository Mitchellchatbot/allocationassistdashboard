-- Polished v2 email templates.
-- Replaces the PLACEHOLDER copy on the 9 still-unwritten templates with real
-- AA-team-voice copy + a unified branded HTML envelope (table-based for
-- Outlook compatibility, inline CSS, mobile-friendly max-width: 600px).
--
-- Saif's 3 templates (relocation_attestation, profile_sent_hospital,
-- profile_sent_doctor) are NOT touched — those carry his actual wording and
-- format, and the profile_sent_hospital one has its own table layout that
-- doesn't belong in a generic email envelope.

-- ── Flow 1.1 · Onboarding · Welcome ─────────────────────────────────────────
update public.email_templates set
  subject = 'Welcome to Allocation Assist — let''s get you placed',
  body_text = $TEXT$Hi {{doctor_name}}!

Welcome aboard 😊

We're thrilled to be partnering with you on your journey to a new opportunity in the UAE and GCC. Now that your first payment is confirmed, here's exactly what happens next.

Two quick steps from you:

1. Complete your qualification form
   {{form_link}}

2. Upload your documents — CV, licenses, certificates
   {{upload_link}}

These help us build your professional profile so we can introduce you to the right hospitals. Most doctors finish both in under 15 minutes.

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
          <p style="margin:0 0 24px;">We're thrilled to be partnering with you on your journey to a new opportunity in the UAE and GCC. Now that your first payment is confirmed, here's exactly what happens next.</p>
          <p style="margin:0 0 8px;font-weight:600;color:#1a2332;">Two quick steps from you:</p>
          <p style="margin:0 0 12px;"><strong>1.</strong> Complete your qualification form</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{form_link}}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Open qualification form</a></td></tr></table>
          <p style="margin:0 0 12px;"><strong>2.</strong> Upload your documents — CV, licenses, certificates</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{upload_link}}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Upload my documents</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">Most doctors finish both in under 15 minutes. If anything is unclear, just reply to this email — we're here.</p>
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
  variables  = '["doctor_name","form_link","upload_link"]'::jsonb,
  updated_at = now()
where key = 'onboarding_welcome';


-- ── Flow 1.2 · Onboarding · Form Reminder ───────────────────────────────────
update public.email_templates set
  subject = 'Quick reminder — your qualification form',
  body_text = $TEXT$Hi {{doctor_name}},

Hope your week is going well!

Just a gentle nudge — we haven't received your qualification form yet. It takes about 10 minutes and helps us pitch you accurately to the right hospitals.

Complete it here: {{form_link}}

If you've hit any issues with the form, reply to this email and we'll sort it out quickly.

Thanks!
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
          <p style="margin:0 0 16px;">Hi <strong>{{doctor_name}}</strong>,</p>
          <p style="margin:0 0 16px;">Hope your week is going well!</p>
          <p style="margin:0 0 24px;">Just a gentle nudge — we haven't received your qualification form yet. It takes about 10 minutes and helps us pitch you accurately to the right hospitals.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{form_link}}" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Complete my form</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If you've hit any issues with the form, reply to this email and we'll sort it out quickly.</p>
          <p style="margin:24px 0 0;">Thanks!</p>
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
  variables  = '["doctor_name","form_link"]'::jsonb,
  updated_at = now()
where key = 'onboarding_form_reminder';


-- ── Flow 3 · Shortlist Confirmation ─────────────────────────────────────────
update public.email_templates set
  subject = 'Great news — {{hospital_name}} has shortlisted you!',
  body_text = $TEXT$Hi {{doctor_name}}!

We're excited to share some great news 😊

{{hospital_name}} has reviewed your profile and shortlisted you for further consideration. This is a really positive step — they only shortlist candidates they're seriously interested in.

What happens next:

- The hospital will arrange an interview (we usually facilitate the scheduling).
- We'll let you know as soon as a date is confirmed.
- In the meantime, take some time to research {{hospital_name}} so you're ready to ask informed questions.

Sit tight — we'll be in touch soon with interview details.

Well done, and thank you!
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
          <p style="margin:0 0 16px;">We're excited to share some great news 😊</p>
          <div style="border-left:3px solid #14a098;padding:6px 0 6px 18px;margin:20px 0;background:#f5fafa;border-radius:0 6px 6px 0;">
            <p style="margin:0;font-size:15px;color:#1a2332;"><strong>{{hospital_name}}</strong> has reviewed your profile and <strong>shortlisted you</strong> for further consideration.</p>
          </div>
          <p style="margin:0 0 16px;">This is a really positive step — hospitals only shortlist candidates they're seriously interested in.</p>
          <p style="margin:20px 0 8px;font-weight:600;color:#1a2332;">What happens next:</p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#2d3a4a;">
            <li style="margin-bottom:6px;">The hospital will arrange an interview (we usually facilitate the scheduling).</li>
            <li style="margin-bottom:6px;">We'll let you know as soon as a date is confirmed.</li>
            <li>In the meantime, take some time to research {{hospital_name}} so you're ready with informed questions.</li>
          </ul>
          <p style="margin:24px 0 0;">Sit tight — we'll be in touch soon.</p>
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
  variables  = '["doctor_name","hospital_name"]'::jsonb,
  updated_at = now()
where key = 'shortlist_confirmation';


-- ── Flow 4 · Interview Tips + Confirmation ──────────────────────────────────
update public.email_templates set
  subject = 'Your interview with {{hospital_name}} — confirmation + tips',
  body_text = $TEXT$Hi {{doctor_name}}!

Your interview is confirmed 🎉

Interview details:
- Hospital: {{hospital_name}}
- Date & Time: {{interview_datetime}}
- Format: {{interview_format}}

A few tips that consistently help our candidates do well:

1. Research the hospital — services, accreditations, recent news. A quick read of their website goes a long way.

2. Be ready to walk through your clinical experience: case mix, complex cases you've handled, your approach to teamwork, and your relocation timeline.

3. Have thoughtful questions for them: team structure, patient volume, support staff, opportunities for growth. Hospitals love candidates who ask.

4. If it's a video interview, test your setup 15 minutes early — camera, mic, lighting, and a quiet room.

5. Dress as you would for any senior medical interview — smart and professional.

Your profile already impressed them. This is just about confirming the fit. Take a breath, be yourself, and let your experience speak.

Best of luck — we're rooting for you.

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
          <p style="margin:0 0 16px;">Your interview is confirmed 🎉</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f5fafa;border-radius:10px;margin:20px 0;width:100%;"><tr><td style="padding:16px 20px;">
            <div style="font-size:11px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Interview details</div>
            <div style="font-size:14px;color:#2d3a4a;line-height:1.8;">
              <strong style="color:#1a2332;">Hospital:</strong> {{hospital_name}}<br>
              <strong style="color:#1a2332;">Date &amp; time:</strong> {{interview_datetime}}<br>
              <strong style="color:#1a2332;">Format:</strong> {{interview_format}}
            </div>
          </td></tr></table>
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
  variables  = '["doctor_name","hospital_name","interview_datetime","interview_format"]'::jsonb,
  updated_at = now()
where key = 'interview_tips_confirmation';


-- ── Flow 5 · Relocation Guide ───────────────────────────────────────────────
-- Generic shell. Saif will provide 10 city-specific guides (Dubai, AD, Sharjah,
-- RAK, Riyadh, Jeddah, Qatar, etc.) — those replace this body per-city via
-- the Templates editor. The shell here gives a reasonable default.
update public.email_templates set
  subject = 'Welcome to {{city}} — your relocation guide',
  body_text = $TEXT$Hi {{doctor_name}}!

Congratulations on signing your offer 🎉

This is a big step, and we want to make your move to {{city}} as smooth as possible. Below is our quick-start guide — we'll send a follow-up with attestation details separately.

A practical checklist for the next few weeks:

- Begin researching neighborhoods and schools (if applicable to your family)
- Start gathering documents for attestation (separate email coming on that)
- Notify your current employer per your notice period
- Hold off on flights until visa confirmation lands

A more detailed city guide for {{city}} is attached — covering housing, banking, transportation, healthcare, schools, and other essentials.

We're here throughout this process. Just reply to this email anytime you have a question.

Looking forward to having you in {{city}}!

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
          <p style="margin:0 0 16px;">Congratulations on signing your offer 🎉</p>
          <p style="margin:0 0 24px;">This is a big step, and we want to make your move to <strong>{{city}}</strong> as smooth as possible. Below is our quick-start guide — we'll send a follow-up with attestation details separately.</p>
          <p style="margin:20px 0 10px;font-weight:600;color:#1a2332;">A practical checklist for the next few weeks:</p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#2d3a4a;">
            <li style="margin-bottom:8px;">Begin researching neighborhoods and schools (if applicable to your family)</li>
            <li style="margin-bottom:8px;">Start gathering documents for attestation — a separate email is coming on that</li>
            <li style="margin-bottom:8px;">Notify your current employer per your notice period</li>
            <li>Hold off on booking flights until visa confirmation lands</li>
          </ul>
          <div style="background:#f5fafa;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0;font-size:14px;color:#2d3a4a;">A detailed city guide for <strong>{{city}}</strong> is attached, covering housing, banking, transportation, healthcare, schools, and other essentials.</p>
          </div>
          <p style="margin:16px 0;color:#5a6c7d;font-size:14px;">We're here throughout this process. Just reply to this email anytime you have a question.</p>
          <p style="margin:24px 0 0;">Looking forward to having you in {{city}}!</p>
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
  variables  = '["doctor_name","city","guide_link"]'::jsonb,
  updated_at = now()
where key = 'relocation_guide';


-- ── Flow 6.1 · Second Payment · Invoice ─────────────────────────────────────
update public.email_templates set
  subject = 'Your second payment is due — invoice attached',
  body_text = $TEXT$Hi {{doctor_name}}!

Welcome to your new role — we hope your first couple of weeks have gone well 😊

As per our service agreement, your second payment of {{amount}} is now due.

Amount: {{amount}}
Due date: {{due_date}}

Pay quickly via the secure link below: {{payment_link}}

If you need an invoice copy for your records, reply to this email and we'll send one over.

Thank you for trusting us with your placement — it means a lot.

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
          <p style="margin:0 0 16px;">Welcome to your new role — we hope your first couple of weeks have gone well 😊</p>
          <p style="margin:0 0 20px;">As per our service agreement, your second payment is now due.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f5fafa;border-radius:10px;margin:20px 0;width:100%;border-left:3px solid #14a098;"><tr><td style="padding:18px 22px;">
            <div style="font-size:11px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Amount due</div>
            <div style="font-size:22px;font-weight:700;color:#1a2332;letter-spacing:-0.3px;">{{amount}}</div>
            <div style="font-size:13px;color:#5a6c7d;margin-top:6px;">Due <strong style="color:#2d3a4a;">{{due_date}}</strong></div>
          </td></tr></table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{payment_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Pay invoice</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If you need an invoice copy for your records, reply to this email and we'll send one over.</p>
          <p style="margin:24px 0 0;">Thank you for trusting us with your placement — it means a lot.</p>
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
  variables  = '["doctor_name","amount","due_date","payment_link"]'::jsonb,
  updated_at = now()
where key = 'second_payment_invoice';


-- ── Flow 6.2 · Second Payment · 25-Day Reminder ─────────────────────────────
update public.email_templates set
  subject = 'Friendly reminder — second payment',
  body_text = $TEXT$Hi {{doctor_name}},

We hope you're settling in well!

Just a gentle reminder — your second payment of {{amount}} is still showing as outstanding. The due date is {{due_date}}.

You can pay quickly here: {{payment_link}}

If you've already paid and we've missed it, please reply with the transaction reference and we'll get it cleared on our side.

Thanks!
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
          <p style="margin:0 0 16px;">Hi <strong>{{doctor_name}}</strong>,</p>
          <p style="margin:0 0 16px;">We hope you're settling in well!</p>
          <p style="margin:0 0 20px;">Just a gentle reminder — your second payment of <strong>{{amount}}</strong> is still showing as outstanding. The due date is <strong>{{due_date}}</strong>.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{payment_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Pay invoice</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If you've already paid and we've missed it, please reply with the transaction reference and we'll get it cleared on our side.</p>
          <p style="margin:24px 0 0;">Thanks!</p>
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
  variables  = '["doctor_name","amount","due_date","payment_link"]'::jsonb,
  updated_at = now()
where key = 'second_payment_reminder_25';


-- ── Flow 6.3 · Second Payment · Day-Before-Due Reminder ─────────────────────
update public.email_templates set
  subject = 'Your invoice is due tomorrow',
  body_text = $TEXT$Hi {{doctor_name}}!

Quick heads-up — your second payment of {{amount}} is due tomorrow ({{due_date}}).

Pay here: {{payment_link}}

If you need an extension or have any concerns, reply to this email and we'll work something out.

Thanks!
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
          <p style="margin:0 0 20px;">Quick heads-up — your second payment of <strong>{{amount}}</strong> is due <strong>tomorrow ({{due_date}})</strong>.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{payment_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Pay now</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If you need an extension or have any concerns, reply to this email and we'll work something out.</p>
          <p style="margin:24px 0 0;">Thanks!</p>
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
  variables  = '["doctor_name","amount","due_date","payment_link"]'::jsonb,
  updated_at = now()
where key = 'second_payment_reminder_due';


-- ── Flow 6.4 · Second Payment · Weekly Post-Due Reminder ────────────────────
update public.email_templates set
  subject = 'Outstanding invoice — let''s sort this',
  body_text = $TEXT$Hi {{doctor_name}},

Following up on your second payment of {{amount}}, which is now {{days_overdue}} days overdue.

To clear the balance: {{payment_link}}

If something is preventing payment, please reply to this email so we can find a solution together. We'd much rather hear from you than have this sitting unresolved.

Thank you.
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
          <p style="margin:0 0 16px;">Hi <strong>{{doctor_name}}</strong>,</p>
          <p style="margin:0 0 20px;">Following up on your second payment of <strong>{{amount}}</strong>, which is now <strong>{{days_overdue}} days overdue</strong>.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#c05a3e;"><a href="{{payment_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Clear balance</a></td></tr></table>
          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">If something is preventing payment, please reply to this email so we can find a solution together. We'd much rather hear from you than have this sitting unresolved.</p>
          <p style="margin:24px 0 0;">Thank you.</p>
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
  variables  = '["doctor_name","amount","days_overdue","payment_link"]'::jsonb,
  updated_at = now()
where key = 'second_payment_reminder_weekly';

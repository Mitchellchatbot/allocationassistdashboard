-- Contract check-in templates (Ammar 2026-06-03).
--
-- The "Contract Signing" flow was rebuilt as a CHECK-IN loop:
-- HI doesn't send the contract — the hospital does. AA just nudges
-- both sides until the doctor confirms signing.
--
-- Three new templates:
--   contract_checkin_doctor   — email to the doctor congratulating on
--                                the offer + asking them to share once
--                                they sign so we can start relocation
--   contract_checkin_hospital — email to the hospital's recruiter
--                                confirming we're chasing the doctor
--   contract_checkin_reminder — sent ~5 days later if no signature
--                                logged yet, nudges both sides
--
-- The old contract templates (if any) stay in place; we don't
-- delete history.

-- Make sure email_templates accepts these new keys. The table already
-- exists from earlier migrations; we just insert.

insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables)
values (
  'contract_checkin_doctor',
  'Contract Check-in · Doctor',
  'contract_signing',
  '🎉 Congrats on your offer from {{hospital_name}} — what''s next?',
  $TEXT$Hi {{doctor_name}},

Congratulations on receiving the offer from {{hospital_name}}! 🎉

We want to make sure your transition goes smoothly, so once you've signed the offer letter, please let us know — we'll kick off the relocation guide (visa, housing, attestation, etc.) right away.

A few quick reminders:
- The offer is between you and {{hospital_name}} directly. Take whatever time you need to review it.
- Reply to this email or text us once you've signed, and we'll handle the rest.
- If you have questions about anything in the contract, we're happy to talk it through.

We're rooting for you!

— The Allocation Assist team
{{signature_text}}$TEXT$,
  $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background:#14a098;padding:22px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.85);font-size:11px;margin-top:2px;letter-spacing:0.6px;">CONTRACT CHECK-IN</div>
        </td></tr>
        <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hi <strong>{{doctor_name}}</strong>,</p>
          <p style="margin:0 0 14px;">Congratulations on receiving the offer from <strong>{{hospital_name}}</strong>! 🎉</p>
          <p style="margin:0 0 18px;">We want to make sure your transition goes smoothly. <strong>Once you've signed the offer letter, please let us know</strong> — we'll kick off the relocation guide (visa, housing, attestation) right away.</p>
          <div style="background:#f5fafa;border-left:4px solid #14a098;padding:14px 18px;margin:18px 0;border-radius:6px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#0f6e68;">A few quick reminders</p>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:#2d3a4a;line-height:1.7;">
              <li>The offer is between you and the hospital directly. Take whatever time you need to review it.</li>
              <li>Reply to this email or text us once you've signed, and we'll handle the rest.</li>
              <li>Questions about anything in the contract? We're happy to talk it through.</li>
            </ul>
          </div>
          <p style="margin:18px 0 0;">We're rooting for you!</p>
          <p style="margin:8px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
          {{signature}}
        </td></tr>
        <tr><td style="background:#fbfbfc;padding:18px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  '["doctor_name","hospital_name","signature","signature_text"]'::jsonb
) on conflict (key) do update set
  subject  = excluded.subject,
  body_text = excluded.body_text,
  body_html = excluded.body_html,
  variables = excluded.variables,
  updated_at = now();

insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables)
values (
  'contract_checkin_hospital',
  'Contract Check-in · Hospital',
  'contract_signing',
  'Following up with {{doctor_name}} on your offer',
  $TEXT$Hi {{hospital_contact_name}},

Thanks for extending the offer to {{doctor_name}} — we really appreciate the partnership.

We're following up directly with {{doctor_name}} to check in on the signature process. As soon as we hear they've signed, we'll let you know and kick off the relocation support on our side (visa, attestation, flights).

If anything is needed from us in the meantime, just reply to this email.

— The Allocation Assist team
{{signature_text}}$TEXT$,
  $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background:#14a098;padding:22px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.85);font-size:11px;margin-top:2px;letter-spacing:0.6px;">CONTRACT CHECK-IN</div>
        </td></tr>
        <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hi <strong>{{hospital_contact_name}}</strong>,</p>
          <p style="margin:0 0 14px;">Thanks for extending the offer to <strong>{{doctor_name}}</strong> — we really appreciate the partnership.</p>
          <p style="margin:0 0 18px;">We're following up directly with {{doctor_name}} to check in on the signature process. As soon as we hear they've signed, we'll let you know and kick off the relocation support on our side (visa, attestation, flights).</p>
          <p style="margin:18px 0 0;color:#5a6c7d;">If anything's needed from us in the meantime, just reply to this email.</p>
          <p style="margin:14px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
          {{signature}}
        </td></tr>
        <tr><td style="background:#fbfbfc;padding:18px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  '["doctor_name","hospital_name","hospital_contact_name","signature","signature_text"]'::jsonb
) on conflict (key) do update set
  subject  = excluded.subject,
  body_text = excluded.body_text,
  body_html = excluded.body_html,
  variables = excluded.variables,
  updated_at = now();

insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables)
values (
  'contract_checkin_reminder',
  'Contract Check-in · Reminder',
  'contract_signing',
  'Quick check — have you signed your offer with {{hospital_name}}?',
  $TEXT$Hi {{doctor_name}},

Quick nudge — have you had a chance to sign the offer from {{hospital_name}}?

No pressure if you're still reviewing. We just want to make sure you have everything you need, and we'd love to get the relocation paperwork moving on our side as soon as you're ready.

Reply or text us once it's signed (or if you have questions).

— The Allocation Assist team
{{signature_text}}$TEXT$,
  $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background:#14a098;padding:22px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.85);font-size:11px;margin-top:2px;letter-spacing:0.6px;">CONTRACT CHECK-IN REMINDER</div>
        </td></tr>
        <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hi <strong>{{doctor_name}}</strong>,</p>
          <p style="margin:0 0 14px;">Quick nudge — have you had a chance to sign the offer from <strong>{{hospital_name}}</strong>?</p>
          <p style="margin:0 0 18px;">No pressure if you're still reviewing. We just want to make sure you have everything you need, and we'd love to get the relocation paperwork moving on our side as soon as you're ready.</p>
          <p style="margin:18px 0 0;color:#5a6c7d;">Reply or text us once it's signed (or if you have questions).</p>
          <p style="margin:14px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
          {{signature}}
        </td></tr>
        <tr><td style="background:#fbfbfc;padding:18px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$HTML$,
  '["doctor_name","hospital_name","signature","signature_text"]'::jsonb
) on conflict (key) do update set
  subject  = excluded.subject,
  body_text = excluded.body_text,
  body_html = excluded.body_html,
  variables = excluded.variables,
  updated_at = now();

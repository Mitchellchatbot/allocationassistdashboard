-- Real templates from Ammar (Allocation Assist), received 2026-05-23.
-- Replaces the placeholder versions seeded earlier.
--
-- Three changes:
--   1. relocation_attestation     — real attestation copy with BVS Global referral
--   2. profile_sent_doctor        — opportunity-style email (Mediclinic example tokenised)
--   3. profile_sent_hospital_batch (new) — multi-doctor list format for the
--                                          Tuesday top-15 + daily 2-profile blasts.
--                                          Phase 6 sender will populate {{doctors_table_html}}.

-- ── 1) Attestation email ───────────────────────────────────────────────────
update public.email_templates set
  subject   = 'Attestation of Documents in the UAE',
  body_text = $AT$Hello Dr. {{doctor_name}}!

We hope you are well!

Please find the below information about the attestation that will be required to get your UAE work visa.

You can visit the link below for all the information about document attestation:
https://www.linkedin.com/posts/emiliedavies_doctors-health-uae-activity-6818426317281746944-zyKN

We highly recommend our Doctors use a company called BVS Global, as they are a reputable company here in Dubai that specializes in assisting Doctors with document attestation.

Here are their contact details:
Website: https://www.bvsglobal.com/
Email:   sme@bvsglobal.com

Note: To sponsor your family after you arrive, you must attest your marriage certificate and birth certificates for your children.

Please let us know if we can assist you with anything.

Thank you so much!

The Allocation Assist team$AT$,
  body_html = $ATH$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">ATTESTATION OF DOCUMENTS</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 16px;">Hello Dr. <strong>{{doctor_name}}</strong>!</p>
          <p style="margin:0 0 16px;">We hope you are well!</p>
          <p style="margin:0 0 16px;">Please find the below information about the attestation that will be required to get your UAE work visa.</p>
          <p style="margin:0 0 16px;">You can visit the link below for all the information about document attestation:</p>
          <p style="margin:0 0 20px;"><a href="https://www.linkedin.com/posts/emiliedavies_doctors-health-uae-activity-6818426317281746944-zyKN" style="color:#14a098;text-decoration:none;">Attestation overview (LinkedIn post)</a></p>
          <p style="margin:0 0 16px;">We highly recommend our Doctors use a company called <strong>BVS Global</strong>, as they are a reputable company here in Dubai that specializes in assisting Doctors with document attestation.</p>
          <div style="background:#f5fafa;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 6px;font-weight:600;color:#1a2332;">BVS Global contact details</p>
            <p style="margin:0;font-size:14px;">Website: <a href="https://www.bvsglobal.com/" style="color:#14a098;text-decoration:none;">bvsglobal.com</a></p>
            <p style="margin:4px 0 0;font-size:14px;">Email: <a href="mailto:sme@bvsglobal.com" style="color:#14a098;text-decoration:none;">sme@bvsglobal.com</a></p>
          </div>
          <div style="border-left:3px solid #14a098;padding:12px 16px;background:#fbfbfc;border-radius:6px;margin:16px 0;">
            <p style="margin:0;font-size:14px;color:#2d3a4a;"><strong>Note:</strong> To sponsor your family after you arrive, you must attest your marriage certificate and birth certificates for your children.</p>
          </div>
          <p style="margin:20px 0 0;">Please let us know if we can assist you with anything.</p>
          <p style="margin:16px 0 0;">Thank you so much!</p>
          <p style="margin:16px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>
        <tr><td style="background-color:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$ATH$,
  variables  = '["doctor_name"]'::jsonb,
  updated_at = now()
where key = 'relocation_attestation';


-- ── 2) Hospital-opportunity doctor email (per Mediclinic example) ─────────
-- Generalised so the same template renders for any hospital — hospital_name,
-- hospital_profile_url, and hospital_description are tokens. The send-flow
-- function already passes hospital_name from the run; the URL + description
-- come from the hospitals table (already on the schema).
update public.email_templates set
  subject   = 'Working Opportunity in {{city}} - {{hospital_name}}',
  body_text = $PSD$Hi Dr. {{doctor_name}}!

I hope you are doing well 😊

We have an opportunity with {{hospital_name}} in {{city}} and we highly recommended your profile.

Please let us know your availability for an interview next week.

{{#hospital_profile_url}}{{hospital_profile_url}}{{/hospital_profile_url}}

{{#hospital_description}}{{hospital_description}}{{/hospital_description}}

Thank you so much.

The Allocation Assist team$PSD$,
  body_html = $PSDH$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">WORKING OPPORTUNITY</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 16px;">Hi Dr. <strong>{{doctor_name}}</strong>!</p>
          <p style="margin:0 0 16px;">I hope you are doing well 😊</p>
          <p style="margin:0 0 16px;">We have an opportunity with <strong>{{hospital_name}}</strong> in <strong>{{city}}</strong> and we highly recommended your profile.</p>
          <p style="margin:0 0 24px;">Please let us know your availability for an interview next week.</p>
          {{#hospital_profile_url}}
          <p style="margin:0 0 16px;"><a href="{{hospital_profile_url}}" style="color:#14a098;text-decoration:none;">More about {{hospital_name}} →</a></p>
          {{/hospital_profile_url}}
          {{#hospital_description}}
          <div style="background:#f5fafa;border-radius:10px;padding:16px 20px;margin:20px 0;font-size:14px;color:#2d3a4a;line-height:1.6;">
            {{hospital_description}}
          </div>
          {{/hospital_description}}
          <p style="margin:24px 0 0;">Thank you so much.</p>
          <p style="margin:8px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>
        <tr><td style="background-color:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$PSDH$,
  variables  = '["doctor_name","hospital_name","city","hospital_profile_url","hospital_description"]'::jsonb,
  updated_at = now()
where key = 'profile_sent_doctor';


-- ── 3) Multi-doctor batch template (new) ──────────────────────────────────
-- For the Tuesday top-15 + daily 2-profile blasts. The sender (Phase 6)
-- pre-renders the doctors table as `doctors_table_html` and passes it through.
insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables, updated_at)
values (
  'profile_sent_hospital_batch',
  'Profile Sent · Hospital Batch (multi-doctor list)',
  'profile_sent',
  'Available {{specialty}} Doctors — Allocation Assist',
  $BT$Hello {{hospital_contact_name}}!

I hope you are having a good day 😊

Here are some of our available {{specialty}} from the Allocation Assist Platform.

{{doctors_table_html}}

Please let us know if you require further assistance with any of them.

Thank you so much.

The Allocation Assist team$BT$,
  $BH$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="780" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:780px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">AVAILABLE DOCTORS</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 16px;">Hello <strong>{{hospital_contact_name}}</strong>!</p>
          <p style="margin:0 0 16px;">I hope you are having a good day 😊</p>
          <p style="margin:0 0 20px;">Here are some of our available <strong>{{specialty}}</strong> from the Allocation Assist Platform.</p>
          {{doctors_table_html}}
          <p style="margin:24px 0 0;">Please let us know if you require further assistance with any of them.</p>
          <p style="margin:16px 0 0;">Thank you so much.</p>
          <p style="margin:8px 0 0;color:#5a6c7d;">— The Allocation Assist team</p>
        </td></tr>
        <tr><td style="background-color:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;line-height:1.6;">
          <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE<br>
          <a href="https://www.allocationassist.com" style="color:#14a098;text-decoration:none;">allocationassist.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>$BH$,
  '["hospital_contact_name","specialty","doctors_table_html"]'::jsonb,
  now()
)
on conflict (key) do update set
  name        = excluded.name,
  flow_key    = excluded.flow_key,
  subject     = excluded.subject,
  body_text   = excluded.body_text,
  body_html   = excluded.body_html,
  variables   = excluded.variables,
  updated_at  = now();

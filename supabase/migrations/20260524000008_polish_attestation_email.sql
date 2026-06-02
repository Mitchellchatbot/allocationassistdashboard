-- Polish the relocation_attestation template — wrap Saif's existing copy in
-- the same branded envelope as the other automation emails. Same wording
-- (the BVS Global recommendation, LinkedIn link, family-sponsorship note are
-- all preserved verbatim per Saif's actual template), just better visual
-- hierarchy: brand header, card layout, accent panel for the BVS Global
-- contact block, branded footer.

update public.email_templates set
  subject = 'Document attestation for your UAE work visa',
  body_html = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">DOCUMENT ATTESTATION</div>
        </td></tr>

        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 14px;">Hello <strong>{{doctor_name}}</strong>!</p>
          <p style="margin:0 0 18px;">We hope you are well!</p>
          <p style="margin:0 0 18px;">Please find the below information about the attestation that will be required to get your UAE work visa.</p>

          <p style="margin:0 0 10px;color:#5a6c7d;font-size:14px;">You can read the full guide here:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="https://www.linkedin.com/posts/emiliedavies_doctors-health-uae-activity-6818426317281746944-zyKN" style="display:inline-block;padding:11px 22px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">Open the attestation guide</a></td></tr></table>

          <p style="margin:0 0 18px;">We highly recommend our Doctors use a company called <strong>BVS Global</strong> as they are a reputable company here in Dubai that specializes in assisting Doctors with document attestation.</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f5fafa;border-radius:10px;margin:0 0 24px;width:100%;border-left:3px solid #14a098;"><tr><td style="padding:16px 22px;">
            <div style="font-size:10px;color:#5a6c7d;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Recommended Partner</div>
            <div style="font-size:16px;color:#1a2332;font-weight:700;margin-bottom:10px;">BVS Global</div>
            <div style="font-size:13px;color:#3a4a5c;line-height:1.8;">
              <strong style="color:#1a2332;">Website:</strong> <a href="https://www.bvsglobal.com/" style="color:#14a098;text-decoration:none;">bvsglobal.com</a><br>
              <strong style="color:#1a2332;">Email:</strong> <a href="mailto:sme@bvsglobal.com" style="color:#14a098;text-decoration:none;">sme@bvsglobal.com</a>
            </div>
          </td></tr></table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border-radius:8px;margin:0 0 24px;width:100%;border-left:3px solid #f59e0b;"><tr><td style="padding:14px 20px;">
            <div style="font-size:11px;color:#92400e;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;margin-bottom:6px;">Important note</div>
            <div style="font-size:13px;color:#1a2332;line-height:1.65;">
              To sponsor your family after you arrive, you must attest your <strong>marriage certificate</strong> and <strong>birth certificates</strong> for your children.
            </div>
          </td></tr></table>

          <p style="margin:0 0 16px;color:#5a6c7d;font-size:14px;">Please let us know if we can assist you with anything.</p>

          <p style="margin:24px 0 0;">Thank you so much!</p>
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
  updated_at = now()
where key = 'relocation_attestation';

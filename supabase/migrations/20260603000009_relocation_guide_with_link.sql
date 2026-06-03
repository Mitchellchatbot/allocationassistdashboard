-- relocation_guide template — surface the city-specific article URL
-- prominently as a CTA button (Ammar 2026-06-03).
--
-- The previous body referenced "A detailed city guide for {{city}} is
-- attached" with no actual link. With the new relocation_articles
-- table looking up by hospital city, every relocation email now ships
-- with a real per-emirate guide URL — surface it as a clear button.

update public.email_templates set
  body_text = $TEXT$Hi {{doctor_name}},

Congratulations on signing your offer 🎉

This is a big step, and we want to make your move to {{city}} as smooth as possible. Below is your guide — we'll send a follow-up with attestation details separately.

A practical checklist for the next few weeks:
- Begin researching neighborhoods and schools (if applicable to your family)
- Start gathering documents for attestation — a separate email is coming on that
- Notify your current employer per your notice period
- Hold off on booking flights until visa confirmation lands

Read the full guide: {{guide_link}}
{{guide_label}}

We're here throughout this process. Just reply to this email anytime you have a question.

Looking forward to having you in {{city}}!

— The Allocation Assist team$TEXT$,
  body_html = $HTML$<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
        <tr><td style="background-color:#14a098;padding:24px 32px;">
          <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Allocation Assist</div>
          <div style="color:rgba(255,255,255,0.82);font-size:11px;margin-top:3px;letter-spacing:0.5px;">RELOCATION GUIDE · {{city}}</div>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.65;color:#2d3a4a;">
          <p style="margin:0 0 16px;">Hi <strong>{{doctor_name}}</strong>!</p>
          <p style="margin:0 0 16px;">Congratulations on signing your offer 🎉</p>
          <p style="margin:0 0 22px;">This is a big step, and we want to make your move to <strong>{{city}}</strong> as smooth as possible. We've put together a city-specific guide covering housing, banking, transportation, healthcare, schools, and other essentials.</p>

          <!-- Per-emirate article CTA — populated from relocation_articles -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td style="background:#14a098;border-radius:99px;">
              <a href="{{guide_link}}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:13px 28px;font-size:14px;font-weight:600;letter-spacing:0.2px;">
                Open the {{city}} guide →
              </a>
            </td></tr>
          </table>

          <p style="margin:20px 0 10px;font-weight:600;color:#1a2332;">A practical checklist for the next few weeks:</p>
          <ul style="margin:0 0 22px;padding-left:20px;color:#2d3a4a;">
            <li style="margin-bottom:8px;">Begin researching neighborhoods and schools (if applicable to your family)</li>
            <li style="margin-bottom:8px;">Start gathering documents for attestation — a separate email is coming on that</li>
            <li style="margin-bottom:8px;">Notify your current employer per your notice period</li>
            <li>Hold off on booking flights until visa confirmation lands</li>
          </ul>
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
  variables  = '["doctor_name","city","guide_link","guide_label"]'::jsonb,
  updated_at = now()
where key = 'relocation_guide';

-- Real second-payment templates from Saif's team (Plinky + Emilie),
-- received 2026-06-02 via Slack.
--
-- 4 stages mapped to the schema we already have:
--   second_payment_invoice          → Plinky's warm invoice email at +15d (casual)
--   second_payment_reminder_25      → First formal reminder letter (Emilie) at +25d
--   second_payment_reminder_due     → Second/escalation reminder (day before due)
--   second_payment_reminder_weekly  → FINAL reminder with debt-collection escalation
--
-- Tokens used by the renderer:
--   {{doctor_name}}, {{city}}, {{country}}, {{amount}}, {{due_date}},
--   {{invoice_number}}, {{invoice_issue_date}}, {{payment_link}},
--   {{days_overdue}}, {{late_fee_amount}}
--
-- The casual invoice email uses {{signature}} so it picks up the branded
-- block we wired earlier. The formal letters bake Emilie's signature into
-- the template directly (different sender + letterhead format).

-- Shared letterhead HTML used at the top of every formal reminder. Kept
-- inline rather than a partial because edge function templates can't
-- include each other.
-- (Definition repeated per template below — keeping templates self-contained
-- means non-engineers can edit one without breaking the others.)

-- ─── 1. Initial invoice — Plinky's warm welcome at +15 days ────────────
update public.email_templates
   set subject = '2nd Payment Invoice — Welcome to the UAE!',
       body_html = $A$
<p>Dear Dr. {{doctor_name}},</p>
<p>This is Plinky from the finance department at Allocation Assist.</p>
<p>I hope this email finds you well and we trust you are settling in well at your new job here in the UAE.</p>
<p>Thank you so much for choosing to work with us — we are so proud that we have introduced such an incredible Doctor to the UAE healthcare system.</p>
<p>We are sure that you will achieve so much here and you are surely already making such a huge impact on the patients' care as well as your new colleagues.</p>
<p>Please keep in touch and let us know if ever you need any support with anything here in Dubai, UAE — we would always love to hear from you!</p>
<p>We will now send the invoice for our hospital marketing and consultation services (<strong>{{amount}}</strong>), via our payment gateway. You just need to click the link below to pay with your card by <strong>{{due_date}}</strong>:</p>
<p style="margin:18px 0;"><a href="{{payment_link}}" style="display:inline-block;background:#14b8a6;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Pay Invoice</a></p>
<p>Please don't hesitate to contact us any time if you have any questions or concerns — I will be more than happy to assist you.</p>
<p>Thank you so much and I wish you a lovely day!</p>
{{signature}}
$A$,
       body_text = $AT$
Dear Dr. {{doctor_name}},

This is Plinky from the finance department at Allocation Assist.
I hope this email finds you well and we trust you are settling in well at your new job here in the UAE.

Thank you so much for choosing to work with us — we are so proud that we have introduced such an incredible Doctor to the UAE healthcare system.

We are sure that you will achieve so much here and you are surely already making such a huge impact on the patients' care as well as your new colleagues.

Please keep in touch and let us know if ever you need any support with anything here in Dubai, UAE — we would always love to hear from you!

We will now send the invoice for our hospital marketing and consultation services ({{amount}}), via our payment gateway. You just need to click the link below to pay with your card by {{due_date}}:

{{payment_link}}

Please don't hesitate to contact us any time if you have any questions or concerns — I will be more than happy to assist you.

Thank you so much and I wish you a lovely day!
{{signature_text}}
$AT$
 where key = 'second_payment_invoice';

-- ─── 2. First formal reminder — at +25 days ────────────────────────────
update public.email_templates
   set subject = 'Payment Reminder for Invoice {{invoice_number}}',
       body_html = $B$
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a2332;max-width:640px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-bottom:2px solid #14b8a6;padding-bottom:12px;margin-bottom:24px;">
    <tr>
      <td style="vertical-align:middle;padding-right:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:22px;letter-spacing:-0.3px;">Allocation Assist</div>
        <div style="color:#94a3b8;font-size:11px;letter-spacing:0.5px;">The source of workforce</div>
      </td>
      <td style="vertical-align:middle;border-left:1px solid #e2e8f0;padding-left:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:15px;">Allocation Assist DMCC</div>
        <div style="color:#475569;font-size:11px;line-height:1.5;">
          Unit No: 2604, Reef Tower, Plot No: JLT-PH2-O1A, Jumeirah Lakes Towers, Dubai, UAE<br>
          Email: info@allocationassist.com · Tel: +971 50 518 0841 · Website: www.allocationassist.com
        </div>
      </td>
    </tr>
  </table>

  <p style="color:#475569;font-size:13px;margin:0 0 18px;">{{invoice_issue_date}}</p>

  <p style="margin:0 0 4px;font-weight:600;">Dr {{doctor_name}},</p>
  <p style="margin:0;color:#475569;font-size:13px;">{{city}}<br>{{country}}</p>

  <p style="margin:24px 0 18px;text-decoration:underline;font-weight:700;">Subject: Payment Reminder for Invoice ({{invoice_number}})</p>

  <p>Our records show that we are still awaiting payment for invoice reference <strong>#({{invoice_number}})</strong> issued on <strong>{{invoice_issue_date}}</strong> for <strong>{{amount}}</strong>.</p>

  <p>We would appreciate full settlement as soon as possible. You can pay via online payment gateway or bank transfer using the details below:</p>

  <ol style="padding-left:20px;">
    <li style="margin-bottom:14px;">
      <strong>Payment link:</strong><br>
      <a href="{{payment_link}}" style="color:#1d4ed8;word-break:break-all;">{{payment_link}}</a>
    </li>
    <li>
      <strong>Bank details:</strong><br>
      Name: ALLOCATION ASSIST DMCC<br>
      Account Number: 019101098278<br>
      IBAN Number: AE520330000019101098278<br>
      Branch: ABU DHABI MAIN<br>
      Currency: AED<br>
      SWIFT Code / BIC: BOMLAEAD<br>
      Ref: (client name)
    </li>
  </ol>

  <p>If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.</p>

  <p>Please let us know if you have any questions or need assistance with the payment process.</p>

  <p style="margin-top:32px;">Thank you,</p>
  <p style="margin:8px 0 0;font-weight:700;">Emilie Davies</p>
  <p style="margin:0;color:#475569;font-size:13px;">CEO, Allocation Assist DMCC</p>
</div>
$B$,
       body_text = $BT$
{{invoice_issue_date}}

Dr {{doctor_name}},
{{city}}
{{country}}

Subject: Payment Reminder for Invoice ({{invoice_number}})

Our records show that we are still awaiting payment for invoice reference #({{invoice_number}}) issued on {{invoice_issue_date}} for {{amount}}.

We would appreciate full settlement as soon as possible. You can pay via online payment gateway or bank transfer using the details below:

1) Payment link:
{{payment_link}}

2) Bank details:
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN Number: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT Code / BIC: BOMLAEAD
Ref: (client name)

If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.

Please let us know if you have any questions or need assistance with the payment process.

Thank you,

Emilie Davies
CEO, Allocation Assist DMCC
$BT$
 where key = 'second_payment_reminder_25';

-- ─── 3. Second reminder — day before due ───────────────────────────────
update public.email_templates
   set subject = 'Payment Reminder for Overdue Invoice ({{invoice_number}})',
       body_html = $C$
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a2332;max-width:640px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-bottom:2px solid #14b8a6;padding-bottom:12px;margin-bottom:24px;">
    <tr>
      <td style="vertical-align:middle;padding-right:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:22px;letter-spacing:-0.3px;">Allocation Assist</div>
        <div style="color:#94a3b8;font-size:11px;letter-spacing:0.5px;">The source of workforce</div>
      </td>
      <td style="vertical-align:middle;border-left:1px solid #e2e8f0;padding-left:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:15px;">Allocation Assist DMCC</div>
        <div style="color:#475569;font-size:11px;line-height:1.5;">
          Unit No: 2604, Reef Tower, Plot No: JLT-PH2-O1A, Jumeirah Lakes Towers, Dubai, UAE<br>
          Email: info@allocationassist.com · Tel: +971 50 518 0841 · Website: www.allocationassist.com
        </div>
      </td>
    </tr>
  </table>

  <p style="color:#475569;font-size:13px;margin:0 0 18px;">{{invoice_issue_date}}</p>

  <p style="margin:0 0 4px;font-weight:600;">Dr {{doctor_name}},</p>
  <p style="margin:0;color:#475569;font-size:13px;">{{city}}<br>{{country}}</p>

  <p style="margin:24px 0 18px;text-decoration:underline;font-weight:700;">Subject: Payment Reminder for Overdue Invoice ({{invoice_number}})</p>

  <p>This is our <strong>second reminder</strong> for the outstanding payment of Invoice <strong>({{invoice_number}})</strong> issued on <strong>{{invoice_issue_date}}</strong> for <strong>{{amount}}</strong>.</p>

  <p>We would appreciate full settlement as soon as possible. You can pay via online payment gateway or bank transfer using the details below:</p>

  <ol style="padding-left:20px;">
    <li style="margin-bottom:14px;">
      <strong>Payment link:</strong><br>
      <a href="{{payment_link}}" style="color:#1d4ed8;word-break:break-all;">{{payment_link}}</a>
    </li>
    <li>
      <strong>Bank details:</strong><br>
      Name: ALLOCATION ASSIST DMCC<br>
      Account Number: 019101098278<br>
      IBAN Number: AE520330000019101098278<br>
      Branch: ABU DHABI MAIN<br>
      Currency: AED<br>
      SWIFT Code / BIC: BOMLAEAD<br>
      Ref: (client name)
    </li>
  </ol>

  <p>If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.</p>

  <p>Please let us know if you have any questions or need assistance with the payment process.</p>

  <p style="margin-top:32px;">Thank you,</p>
  <p style="margin:8px 0 0;font-weight:700;">Emilie Davies</p>
  <p style="margin:0;color:#475569;font-size:13px;">CEO, Allocation Assist DMCC</p>
</div>
$C$,
       body_text = $CT$
{{invoice_issue_date}}

Dr {{doctor_name}},
{{city}}
{{country}}

Subject: Payment Reminder for Overdue Invoice ({{invoice_number}})

This is our second reminder for the outstanding payment of Invoice ({{invoice_number}}) issued on {{invoice_issue_date}} for {{amount}}.

We would appreciate full settlement as soon as possible. You can pay via online payment gateway or bank transfer using the details below:

1) Payment link:
{{payment_link}}

2) Bank details:
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN Number: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT Code / BIC: BOMLAEAD
Ref: (client name)

If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.

Please let us know if you have any questions or need assistance with the payment process.

Thank you,

Emilie Davies
CEO, Allocation Assist DMCC
$CT$
 where key = 'second_payment_reminder_due';

-- ─── 4. FINAL reminder — weekly post-due, escalation with debt collection ──
update public.email_templates
   set subject = 'FINAL Payment Reminder for Overdue Invoice ({{invoice_number}})',
       body_html = $D$
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a2332;max-width:640px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-bottom:2px solid #14b8a6;padding-bottom:12px;margin-bottom:24px;">
    <tr>
      <td style="vertical-align:middle;padding-right:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:22px;letter-spacing:-0.3px;">Allocation Assist</div>
        <div style="color:#94a3b8;font-size:11px;letter-spacing:0.5px;">The source of workforce</div>
      </td>
      <td style="vertical-align:middle;border-left:1px solid #e2e8f0;padding-left:18px;">
        <div style="color:#14b8a6;font-weight:700;font-size:15px;">Allocation Assist DMCC</div>
        <div style="color:#475569;font-size:11px;line-height:1.5;">
          Unit No: 2604, Reef Tower, Plot No: JLT-PH2-O1A, Jumeirah Lakes Towers, Dubai, UAE<br>
          Email: info@allocationassist.com · Tel: +971 50 518 0841 · Website: www.allocationassist.com
        </div>
      </td>
    </tr>
  </table>

  <p style="color:#475569;font-size:13px;margin:0 0 18px;">{{invoice_issue_date}}</p>

  <p style="margin:0 0 4px;font-weight:600;">Dr {{doctor_name}},</p>
  <p style="margin:0;color:#475569;font-size:13px;">{{city}}<br>{{country}}</p>

  <p style="margin:24px 0 18px;text-decoration:underline;font-weight:700;">
    Subject: <span style="color:#dc2626;">FINAL Payment Reminder</span> for Overdue Invoice ({{invoice_number}})
  </p>

  <p>This is our <strong>last reminder</strong> for the outstanding payment of <strong>({{invoice_number}})</strong> issued on <strong>{{invoice_issue_date}}</strong> for <strong>{{amount}}</strong>.</p>

  <p>Please settle the full invoice amount within the next <strong>3 days</strong> from the date of this letter, failing which we will refer the payment recovery to a <strong style="color:#dc2626;">debt collection agency and a 12% late fee</strong> added to the invoice value (<strong>{{late_fee_amount}}</strong>) to partially cover the debt collection agency and administrative costs. <strong>Do note that debt collection agencies in Dubai are required to report unpaid debts to credit bureaus, which can negatively impact your credit score and future ability to obtain credit.</strong></p>

  <p>You can pay via online payment gateway or bank transfer using the details below:</p>

  <ol style="padding-left:20px;">
    <li style="margin-bottom:14px;">
      <strong>Payment link:</strong><br>
      <a href="{{payment_link}}" style="color:#1d4ed8;word-break:break-all;">{{payment_link}}</a>
    </li>
    <li>
      <strong>Bank details:</strong><br>
      Name: ALLOCATION ASSIST DMCC<br>
      Account Number: 019101098278<br>
      IBAN Number: AE520330000019101098278<br>
      Branch: ABU DHABI MAIN<br>
      Currency: AED<br>
      SWIFT Code / BIC: BOMLAEAD<br>
      Ref: (client name)
    </li>
  </ol>

  <p>If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.</p>

  <p>Please let us know if you have any questions or need assistance with the payment process.</p>

  <p style="margin-top:32px;">Thank you,</p>
  <p style="margin:8px 0 0;font-weight:700;">Emilie Davies</p>
  <p style="margin:0;color:#475569;font-size:13px;">CEO, Allocation Assist DMCC</p>
</div>
$D$,
       body_text = $DT$
{{invoice_issue_date}}

Dr {{doctor_name}},
{{city}}
{{country}}

Subject: FINAL Payment Reminder for Overdue Invoice ({{invoice_number}})

This is our last reminder for the outstanding payment of ({{invoice_number}}) issued on {{invoice_issue_date}} for {{amount}}.

Please settle the full invoice amount within the next 3 days from the date of this letter, failing which we will refer the payment recovery to a debt collection agency and a 12% late fee added to the invoice value ({{late_fee_amount}}) to partially cover the debt collection agency and administrative costs. Do note that debt collection agencies in Dubai are required to report unpaid debts to credit bureaus, which can negatively impact your credit score and future ability to obtain credit.

You can pay via online payment gateway or bank transfer using the details below:

1) Payment link:
{{payment_link}}

2) Bank details:
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN Number: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT Code / BIC: BOMLAEAD
Ref: (client name)

If payment has been sent — thank you. Please reply with the payment reference and date so we can update our records.

Please let us know if you have any questions or need assistance with the payment process.

Thank you,

Emilie Davies
CEO, Allocation Assist DMCC
$DT$
 where key = 'second_payment_reminder_weekly';

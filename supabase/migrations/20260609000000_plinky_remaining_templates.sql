-- Finish the Plinky-plain sweep: the 2026-06-08 migration converted
-- profile_sent_*, contract_checkin_*, second_payment_invoice and
-- relocation_guide, but left these on their old branded/raw bodies —
-- so they still showed teal banner headers, coloured callout boxes,
-- CTA buttons, a DMCC letterhead, a literal "Subject:" line, an
-- unpopulated {{invoice_issue_date}}, and a hard-coded "Emilie Davies"
-- signature. Bring them in line: {{logo_header}} + plain paragraphs +
-- {{signature}}, same as everything else.

-- ── shortlist_confirmation ─────────────────────────────────────────────
update public.email_templates
set
  subject = 'Great news — you have been shortlisted at {{hospital_name}}',
  body_html = $sh$
{{logo_header}}
<p>Hi Dr. {{doctor_name}}!</p>
<p>We're excited to share some great news 😊</p>
<p><strong>{{hospital_name}}</strong> has reviewed your profile and shortlisted you for further consideration. This is a really positive step — hospitals only shortlist candidates they're seriously interested in.</p>
<p><strong>What happens next:</strong></p>
<ul>
<li>The hospital will arrange an interview (we usually facilitate the scheduling).</li>
<li>We'll let you know as soon as a date is confirmed.</li>
<li>In the meantime, take some time to research {{hospital_name}} so you're ready with informed questions.</li>
</ul>
<p>Sit tight — we'll be in touch soon.</p>
{{signature}}
$sh$,
  body_text = $shT$Hi Dr. {{doctor_name}}!

We're excited to share some great news :)

{{hospital_name}} has reviewed your profile and shortlisted you for further consideration. This is a really positive step — hospitals only shortlist candidates they're seriously interested in.

What happens next:
- The hospital will arrange an interview (we usually facilitate the scheduling).
- We'll let you know as soon as a date is confirmed.
- In the meantime, take some time to research {{hospital_name}} so you're ready with informed questions.

Sit tight — we'll be in touch soon.

{{signature_text}}
$shT$
where key = 'shortlist_confirmation';

-- ── interview_tips_confirmation ────────────────────────────────────────
update public.email_templates
set
  subject = 'Your interview with {{hospital_name}} — confirmation + tips',
  body_html = $iv$
{{logo_header}}
<p>Hi Dr. {{doctor_name}}!</p>
<p>Your interview is confirmed 🎉</p>
<p><strong>Hospital:</strong> {{hospital_name}}<br/>
<strong>Date &amp; time:</strong> {{interview_datetime}}<br/>
<strong>Format:</strong> {{interview_format}}</p>
<p>Join link: <a href="{{interview_link}}">{{interview_link}}</a></p>
<p><strong>A few tips that consistently help our candidates:</strong></p>
<ul>
<li>Research the hospital — services, accreditations, recent news. A quick read of their website goes a long way.</li>
<li>Be ready to walk through your clinical experience: case mix, complex cases, your approach to teamwork, and your relocation timeline.</li>
<li>Have thoughtful questions for them: team structure, patient volume, support staff, opportunities for growth. Hospitals love candidates who ask.</li>
</ul>
<p>You've got this — we're rooting for you.</p>
{{signature}}
$iv$,
  body_text = $ivT$Hi Dr. {{doctor_name}}!

Your interview is confirmed!

Hospital: {{hospital_name}}
Date & time: {{interview_datetime}}
Format: {{interview_format}}

Join link: {{interview_link}}

A few tips that consistently help our candidates:
- Research the hospital — services, accreditations, recent news. A quick read of their website goes a long way.
- Be ready to walk through your clinical experience: case mix, complex cases, your approach to teamwork, and your relocation timeline.
- Have thoughtful questions for them: team structure, patient volume, support staff, opportunities for growth.

You've got this — we're rooting for you.

{{signature_text}}
$ivT$
where key = 'interview_tips_confirmation';

-- ── relocation_attestation ─────────────────────────────────────────────
update public.email_templates
set
  subject = 'Attestation of documents for your UAE work visa',
  body_html = $at$
{{logo_header}}
<p>Hello Dr. {{doctor_name}}!</p>
<p>I hope you are well!</p>
<p>Please find below the information about the attestation you'll need to get your UAE work visa.</p>
<p>You can read a full overview of document attestation here: <a href="https://www.linkedin.com/pulse/what-attestation-why-required-how-get-done-emilie-davies-1f/">Attestation overview (LinkedIn post)</a></p>
<p>We highly recommend a company called <strong>BVS Global</strong> — a reputable firm here in Dubai that specializes in assisting doctors with document attestation.</p>
<p><strong>BVS Global</strong><br/>
Website: <a href="https://bvsglobal.com">bvsglobal.com</a><br/>
Email: <a href="mailto:sme@bvsglobal.com">sme@bvsglobal.com</a></p>
<p><strong>Note:</strong> to sponsor your family after you arrive, you must attest your marriage certificate and your children's birth certificates.</p>
<p>Please let us know if we can assist you with anything. Thank you so much!</p>
{{signature}}
$at$,
  body_text = $atT$Hello Dr. {{doctor_name}}!

I hope you are well!

Please find below the information about the attestation you'll need to get your UAE work visa.

Attestation overview (LinkedIn post): https://www.linkedin.com/pulse/what-attestation-why-required-how-get-done-emilie-davies-1f/

We highly recommend a company called BVS Global — a reputable firm here in Dubai that specializes in assisting doctors with document attestation.

BVS Global
Website: bvsglobal.com
Email: sme@bvsglobal.com

Note: to sponsor your family after you arrive, you must attest your marriage certificate and your children's birth certificates.

Please let us know if we can assist you with anything. Thank you so much!

{{signature_text}}
$atT$
where key = 'relocation_attestation';

-- ── second_payment_reminder_25 (first, gentle) ─────────────────────────
update public.email_templates
set
  subject = 'Payment reminder — invoice {{invoice_number}}',
  body_html = $r25$
{{logo_header}}
<p>Dear Dr. {{doctor_name}},</p>
<p>This is a friendly reminder that we're still awaiting payment for invoice <strong>{{invoice_number}}</strong> for <strong>{{amount}}</strong>, due on <strong>{{due_date}}</strong>.</p>
<p>You can settle it via the payment link or by bank transfer:</p>
<p><strong>Payment link:</strong> <a href="{{payment_link}}">{{payment_link}}</a></p>
<p><strong>Bank transfer</strong><br/>
Name: ALLOCATION ASSIST DMCC<br/>
Account Number: 019101098278<br/>
IBAN: AE520330000019101098278<br/>
Branch: ABU DHABI MAIN<br/>
Currency: AED<br/>
SWIFT / BIC: BOMLAEAD</p>
<p>If you've already paid — thank you! Please reply with the payment reference and date so we can update our records.</p>
<p>Any questions, just reply and we'll be happy to help.</p>
{{signature}}
$r25$,
  body_text = $r25T$Dear Dr. {{doctor_name}},

This is a friendly reminder that we're still awaiting payment for invoice {{invoice_number}} for {{amount}}, due on {{due_date}}.

You can settle it via the payment link or by bank transfer:

Payment link: {{payment_link}}

Bank transfer
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT / BIC: BOMLAEAD

If you've already paid — thank you! Please reply with the payment reference and date so we can update our records.

Any questions, just reply and we'll be happy to help.

{{signature_text}}
$r25T$
where key = 'second_payment_reminder_25';

-- ── second_payment_reminder_due (second, overdue) ──────────────────────
update public.email_templates
set
  subject = 'Payment reminder — invoice {{invoice_number}} (overdue)',
  body_html = $rdue$
{{logo_header}}
<p>Dear Dr. {{doctor_name}},</p>
<p>This is our second reminder for the outstanding payment of invoice <strong>{{invoice_number}}</strong> for <strong>{{amount}}</strong>. The due date has now passed, so we'd appreciate full settlement as soon as possible.</p>
<p>You can pay via the link or by bank transfer:</p>
<p><strong>Payment link:</strong> <a href="{{payment_link}}">{{payment_link}}</a></p>
<p><strong>Bank transfer</strong><br/>
Name: ALLOCATION ASSIST DMCC<br/>
Account Number: 019101098278<br/>
IBAN: AE520330000019101098278<br/>
Branch: ABU DHABI MAIN<br/>
Currency: AED<br/>
SWIFT / BIC: BOMLAEAD</p>
<p>If payment has already been sent — thank you. Please reply with the payment reference and date so we can update our records.</p>
<p>Please let us know if you have any questions or need help with the payment.</p>
{{signature}}
$rdue$,
  body_text = $rdueT$Dear Dr. {{doctor_name}},

This is our second reminder for the outstanding payment of invoice {{invoice_number}} for {{amount}}. The due date has now passed, so we'd appreciate full settlement as soon as possible.

You can pay via the link or by bank transfer:

Payment link: {{payment_link}}

Bank transfer
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT / BIC: BOMLAEAD

If payment has already been sent — thank you. Please reply with the payment reference and date so we can update our records.

Please let us know if you have any questions or need help with the payment.

{{signature_text}}
$rdueT$
where key = 'second_payment_reminder_due';

-- ── second_payment_reminder_weekly (final follow-up) ───────────────────
update public.email_templates
set
  subject = 'Invoice {{invoice_number}} still outstanding',
  body_html = $rwk$
{{logo_header}}
<p>Dear Dr. {{doctor_name}},</p>
<p>We're following up again on invoice <strong>{{invoice_number}}</strong> for <strong>{{amount}}</strong>, which is still outstanding. We'd really appreciate your settling this as soon as possible.</p>
<p>You can pay via the link or by bank transfer:</p>
<p><strong>Payment link:</strong> <a href="{{payment_link}}">{{payment_link}}</a></p>
<p><strong>Bank transfer</strong><br/>
Name: ALLOCATION ASSIST DMCC<br/>
Account Number: 019101098278<br/>
IBAN: AE520330000019101098278<br/>
Branch: ABU DHABI MAIN<br/>
Currency: AED<br/>
SWIFT / BIC: BOMLAEAD</p>
<p>If you're experiencing any difficulty or have a question about the invoice, please reply to this email — we're happy to help and find a way forward.</p>
{{signature}}
$rwk$,
  body_text = $rwkT$Dear Dr. {{doctor_name}},

We're following up again on invoice {{invoice_number}} for {{amount}}, which is still outstanding. We'd really appreciate your settling this as soon as possible.

You can pay via the link or by bank transfer:

Payment link: {{payment_link}}

Bank transfer
Name: ALLOCATION ASSIST DMCC
Account Number: 019101098278
IBAN: AE520330000019101098278
Branch: ABU DHABI MAIN
Currency: AED
SWIFT / BIC: BOMLAEAD

If you're experiencing any difficulty or have a question about the invoice, please reply to this email — we're happy to help and find a way forward.

{{signature_text}}
$rwkT$
where key = 'second_payment_reminder_weekly';

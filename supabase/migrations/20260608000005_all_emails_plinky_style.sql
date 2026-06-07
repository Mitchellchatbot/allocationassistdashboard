-- Sweep every remaining email template to the Plinky-style plain
-- look the team uses in Gmail. Strips: teal banner headers, "AT A
-- GLANCE" cards, coloured CTA buttons, decorative tables. Adds:
-- {{logo_header}} at the top so every email opens with the AA mark,
-- and {{signature}} at the bottom which now renders in a Cambria
-- serif stack to match Ammar's reference.
--
-- We keep tokens intact so the template editor + render path don't
-- need changes — only the surrounding chrome goes.

-- ── profile_sent_hospital: add logo header to the template I already
-- shipped in 20260608000002.
update public.email_templates
set body_html = '{{logo_header}}' || body_html
where key = 'profile_sent_hospital'
  and body_html not like '{{logo_header}}%';

-- ── profile_sent_doctor: rewrite to the same simple greeting + body
-- + signature pattern. Previously had a teal "WORKING OPPORTUNITY"
-- banner header and a {{profile_url}} CTA.
update public.email_templates
set
  subject = 'Working Opportunity in {{city}} – {{hospital_name}}',
  body_html = $html$
{{logo_header}}
<p>Hi Dr. {{doctor_name}}!</p>
<p>I hope you are doing well 😊</p>
<p>I am reaching out because of a working opportunity for a {{doctor_title}} at <strong>{{hospital_name}}</strong> in {{city}}, {{country}}.</p>
{{#hospital_description}}<p>{{hospital_description}}</p>{{/hospital_description}}
<p>If this opportunity interests you, please let me know and I will be happy to share more details and arrange the next steps.</p>
<p>Looking forward to hearing from you.</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}}!

I hope you are doing well :)

I am reaching out because of a working opportunity for a {{doctor_title}} at {{hospital_name}} in {{city}}, {{country}}.

{{hospital_description}}

If this opportunity interests you, please let me know and I will be happy to share more details and arrange the next steps.

Looking forward to hearing from you.

{{signature_text}}
$text$
where key = 'profile_sent_doctor';

-- ── second_payment_invoice
update public.email_templates
set
  body_html = $html$
{{logo_header}}
<p>Hi Dr. {{doctor_name}},</p>
<p>Welcome to the UAE! It has been a pleasure working with you on this transition.</p>
<p>Please find your second-payment invoice below.</p>
<p style="margin:14px 0;"><strong>Invoice:</strong> {{invoice_number}}<br/><strong>Amount:</strong> {{amount}}<br/><strong>Due date:</strong> {{due_date}}</p>
<p>Payment link: <a href="{{payment_link}}">{{payment_link}}</a></p>
<p>If you have any questions about the invoice, just reply to this email and I will sort it out.</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}},

Welcome to the UAE! It has been a pleasure working with you on this transition.

Please find your second-payment invoice below.

Invoice:   {{invoice_number}}
Amount:    {{amount}}
Due date:  {{due_date}}

Payment link: {{payment_link}}

If you have any questions about the invoice, just reply to this email and I will sort it out.

{{signature_text}}
$text$
where key = 'second_payment_invoice';

-- ── relocation_guide
update public.email_templates
set
  body_html = $html$
{{logo_header}}
<p>Hi Dr. {{doctor_name}},</p>
<p>Welcome to {{city}} 🎉</p>
<p>Here is your relocation guide for {{city}} — covers visa, attestation, housing, transport, and the first-week essentials.</p>
<p>👉 <a href="{{guide_link}}">{{guide_label}}</a></p>
<p>If anything in there is unclear or you would like a recommendation on a specific area, just reply and I will help.</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}},

Welcome to {{city}}!

Here is your relocation guide for {{city}} — covers visa, attestation, housing, transport, and the first-week essentials.

{{guide_label}}: {{guide_link}}

If anything in there is unclear or you would like a recommendation on a specific area, just reply and I will help.

{{signature_text}}
$text$
where key = 'relocation_guide';

-- ── contract_checkin_doctor
update public.email_templates
set
  body_html = $html$
{{logo_header}}
<p>🎉 Hi Dr. {{doctor_name}}!</p>
<p>Congratulations on your offer from <strong>{{hospital_name}}</strong>!</p>
<p>Quick check-in: have you had a chance to review and sign the contract?</p>
<p>If you have any questions about the offer, just reply to this email and I will be happy to walk through it with you.</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}}!

Congratulations on your offer from {{hospital_name}}!

Quick check-in: have you had a chance to review and sign the contract?

If you have any questions about the offer, just reply to this email and I will be happy to walk through it with you.

{{signature_text}}
$text$
where key = 'contract_checkin_doctor';

-- ── contract_checkin_hospital
update public.email_templates
set
  body_html = $html$
{{logo_header}}
<p>Hi {{hospital_contact_name}},</p>
<p>I hope you are having a good day 😊</p>
<p>Following up on the offer for <strong>Dr. {{doctor_name}}</strong>.</p>
<p>Has Dr. {{doctor_name}} returned the signed contract on your side? Happy to nudge again from our end if it would help.</p>
{{signature}}
$html$,
  body_text = $text$Hi {{hospital_contact_name}},

I hope you are having a good day :)

Following up on the offer for Dr. {{doctor_name}}.

Has Dr. {{doctor_name}} returned the signed contract on your side? Happy to nudge again from our end if it would help.

{{signature_text}}
$text$
where key = 'contract_checkin_hospital';

-- ── contract_checkin_reminder
update public.email_templates
set
  body_html = $html$
{{logo_header}}
<p>Hi Dr. {{doctor_name}},</p>
<p>Quick check — have you had a chance to sign the offer from <strong>{{hospital_name}}</strong>?</p>
<p>Once it is signed I can move the next steps forward (relocation, attestation, joining date). Just reply once it is done, or let me know if anything is holding it up.</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}},

Quick check — have you had a chance to sign the offer from {{hospital_name}}?

Once it is signed I can move the next steps forward (relocation, attestation, joining date). Just reply once it is done, or let me know if anything is holding it up.

{{signature_text}}
$text$
where key = 'contract_checkin_reminder';

-- ── Already-clean templates: just prepend the logo header so every
-- email starts with the AA mark.
update public.email_templates
set body_html = '{{logo_header}}' || body_html
where key in (
  'onboarding_welcome',
  'onboarding_form_reminder',
  'shortlist_confirmation',
  'interview_tips_confirmation',
  'relocation_attestation',
  'second_payment_reminder_25',
  'second_payment_reminder_weekly',
  'second_payment_reminder_due',
  'profile_sent_hospital_batch'
)
and body_html not like '{{logo_header}}%';

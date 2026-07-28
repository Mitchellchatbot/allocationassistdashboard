-- profile_sent_hospital: guarantee a CARD in every single-profile send.
-- The card image ({{doctor_card_image_url}}) is a best-effort client screenshot;
-- if the capture fails, the email previously went out table-only (no card). Add
-- an inverted-section fallback to the SERVER-rendered {{doctor_card_html}} card
-- (send-flow-email always builds it, no screenshot needed), so BOTH a card and
-- the table are present in every case. Image is preferred when present; the
-- table always follows.

update public.email_templates
set body_html = $html$
<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>
<p>I hope you are having a good day 😊</p>
<p>{{doctor_bio}}</p>
{{#doctor_card_image_url}}
<img src="{{doctor_card_image_url}}" alt="Dr. {{doctor_name}} — candidate profile" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px;margin:18px 0;" />
{{/doctor_card_image_url}}
{{^doctor_card_image_url}}
{{doctor_card_html}}
{{/doctor_card_image_url}}
{{doctor_row_table_html}}
<p>Please let us know if you are interested in their profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>
{{signature}}
$html$
where key = 'profile_sent_hospital';

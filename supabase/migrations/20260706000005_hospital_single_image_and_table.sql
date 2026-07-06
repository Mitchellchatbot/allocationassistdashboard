-- profile_sent_hospital (single doctor → hospital): the team wants BOTH the
-- profile card image AND the details table, in this order (Hasan 2026-07-06):
--   greeting → bio → image (if captured) → table → closing → signature
--
-- Previously it was "image OR table" (the card image REPLACED the table via a
-- {{^doctor_card_image_url}} inverted section, and the table was a hardcoded
-- wide 14-column layout inline in the template). Now:
--   • the image shows when present, and the table ALWAYS follows it;
--   • the inline wide table is replaced by {{doctor_row_table_html}} — the
--     vertical field → value table (send-flow-email builds it), which reads
--     cleanly for one doctor and never scrolls sideways;
--   • the image carries a real width="560" attribute + max-width so Gmail can't
--     render the high-DPI card screenshot at full (huge) size.
--
-- Multi-doctor sends stay table-only (profile_sent_hospital_batch) — unchanged.

update public.email_templates
set body_html = $html$
<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>
<p>I hope you are having a good day 😊</p>
<p>{{doctor_bio}}</p>
{{#doctor_card_image_url}}
<img src="{{doctor_card_image_url}}" alt="Dr. {{doctor_name}} — candidate profile" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px;margin:18px 0;" />
{{/doctor_card_image_url}}
{{doctor_row_table_html}}
<p>Please let us know if you are interested in their profile and if so, we would be pleased to assist you in this regard.</p>
<p>We wish you a great day!</p>
{{signature}}
$html$
where key = 'profile_sent_hospital';

-- Greet a NAMED contact as just "Hello <Name>!" — drop the trailing "team".
--
-- The hospital-intro greeting was:
--   Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!
-- which ALWAYS appended "team!", so a named recipient read "Hello Annette team!".
-- Rewrite it with an inverted section so:
--   • a contact  → "Hello <Name>!"                    (no "team")
--   • no contact → "Hello <Hospital> team!"           (via {{hospital_name}})
-- Client + server now pass the person's name or "" (never the hospital name), so
-- the empty case falls into the inverted branch.
--
-- Targets EVERY template still carrying the old greeting (default + any variant),
-- in both body_html and body_text. Matches on the token substring so it's robust
-- to the surrounding <p>/<strong> wrapping.
update public.email_templates
set body_html = replace(
      body_html,
      '{{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team',
      '{{#hospital_contact_name}}{{hospital_contact_name}}{{/hospital_contact_name}}{{^hospital_contact_name}}{{hospital_name}} team{{/hospital_contact_name}}'),
    body_text = replace(
      body_text,
      '{{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team',
      '{{#hospital_contact_name}}{{hospital_contact_name}}{{/hospital_contact_name}}{{^hospital_contact_name}}{{hospital_name}} team{{/hospital_contact_name}}')
where body_html like '%{{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team%'
   or body_text like '%{{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team%';

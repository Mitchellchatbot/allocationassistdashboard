-- {{logo_header}} rendered as a literal token at the top of doctor/flow emails
-- (shortlist_confirmation, relocation_guide, second_payment_reminder_*, etc.).
--
-- Root cause: send-flow-email's render() leaves any empty-valued token as the
-- literal "{{token}}" on purpose (so missing doctor fields are visible). It
-- passes logo_header:"" intending to blank it, but "" is treated the same as
-- missing → the placeholder survives. The top-of-email logo image was pulled
-- deliberately (branding now lives in the bottom signature), so the token is
-- dead. Strip it (and its trailing whitespace) from every template.
update public.email_templates
set body_html = regexp_replace(body_html, '\{\{logo_header\}\}\s*', '', 'g')
where body_html like '%{{logo_header}}%';

-- "Hi Dr. Dr. Louise Denjean" — templates hardcode "Dr." before
-- {{doctor_name}}, but the name token already carries the title (e.g.
-- "Dr. Louise Denjean"), so it doubles up. Drop the hardcoded "Dr. " prefix
-- everywhere {{doctor_name}} is used (greetings + hospital references) and let
-- the name token stand on its own — one title, never two.
update public.email_templates
set body_html = replace(body_html, 'Dr. {{doctor_name}}', '{{doctor_name}}')
where body_html like '%Dr. {{doctor_name}}%';

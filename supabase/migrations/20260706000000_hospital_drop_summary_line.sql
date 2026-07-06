-- profile_sent_hospital: drop the auto "Dr. X is a {country} {title}." summary
-- line that sat right above the bio (it just restated the first sentence of
-- {{doctor_bio}}). Keep the greeting + the bio itself. Targeted replace against
-- the body set by 20260702000001; no-op if the markup has diverged.
update public.email_templates
set body_html = replace(
  body_html,
  '<p>Dr. {{doctor_name}} is a {{doctor_country_training}} {{doctor_title}}.</p>',
  ''
)
where key = 'profile_sent_hospital';

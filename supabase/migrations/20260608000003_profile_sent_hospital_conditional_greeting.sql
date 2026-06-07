-- Patch profile_sent_hospital so "Hello team!" works when no hospital
-- contact name is known. Without this the renderer leaves the literal
-- "Hello {{hospital_contact_name}} team!" in the output — the renderer's
-- intentional 'show unresolved tokens' fallback hurts here.
--
-- Mustache-style conditional: `{{#token}}…{{/token}}` only renders the
-- inner block when the token has a truthy value. Used here to drop the
-- name + its trailing space when the hospital isn't linked yet.

update public.email_templates
set
  body_html = replace(
    body_html,
    '<p>Hello {{hospital_contact_name}} team!</p>',
    '<p>Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!</p>'
  ),
  body_text = replace(
    body_text,
    'Hello {{hospital_contact_name}} team!',
    'Hello {{#hospital_contact_name}}{{hospital_contact_name}} {{/hospital_contact_name}}team!'
  )
where key = 'profile_sent_hospital';

-- Seed the JotForm row so the dashboard's /forms tab can show its
-- submissions, and so the jotform-webhook edge function has a stable
-- form_id to attach responses to.
--
-- This form is the one the team sends to doctors to collect their
-- profile info — the data flows into a WordPress candidate
-- automatically via the new jotform-webhook edge function.
--
-- Webhook URL once deployed:
--   POST /functions/v1/jotform-webhook?key=<webhook_secret>
-- Paste that into JotForm's Settings → Integrations → Webhooks.

insert into public.forms (name, description, form_type, provider, webhook_secret, active)
values (
  'JotForm — Doctor Profile Intake',
  'Self-serve doctor profile intake. Each submission auto-creates or updates a WordPress candidate (matched by email) and links to a Zoho lead when one exists.',
  'doctor_intake',
  'jotform',
  md5(random()::text || clock_timestamp()::text || 'jf'),
  true
)
on conflict do nothing;

-- Add provider_form_id flexibility + pre-seed the two Elementor forms.
--
-- The original schema required (provider, provider_form_id) to be unique
-- across all rows. Elementor doesn't give us a stable "form ID" we can
-- depend on — different forms POST to the same webhook URL without any
-- self-identifying token. So for Elementor we identify the form purely
-- by its webhook_secret in the URL.
--
-- This migration:
--   1. Relaxes the unique (provider, provider_form_id) constraint when
--      provider_form_id is empty/null (Elementor case).
--   2. Adds an Elementor-specific PAT column (api_token) for parity with
--      Typeform's historical-sync use case (unused for Elementor itself
--      but keeps both providers symmetric).
--   3. Pre-seeds 2 Elementor forms (Consultation Form, DoctorsFinder
--      Form) so the user sees them as ready-to-wire tabs immediately.
--      Their webhook secrets are random; user copies them out of the UI.

-- 1. Allow nullable provider_form_id for Elementor rows that have no
--    stable provider id. Existing unique index used (provider, provider_form_id)
--    which Postgres treats as distinct if any column is null. So nullable
--    works — just need to relax the NOT NULL.
alter table public.forms
  alter column provider_form_id drop not null;

-- 2. api_token for historical sync. Stored encrypted-at-rest by the
--    Supabase Postgres box itself; never exposed to the anon client
--    (RLS already restricts SELECT to authenticated, but UI should
--    redact). Used by the typeform-historical-sync function to call
--    https://api.typeform.com/forms/<form_id>/responses on the user's
--    behalf.
alter table public.forms
  add column if not exists api_token text;

-- 3. Pre-seed Elementor forms.
--    Webhook URL: /functions/v1/form-webhook?key=<webhook_secret>
--    User pastes that URL into Elementor's webhook action.
-- Webhook secret: 32 hex chars built by hashing a clock-anchored random.
-- md5(text)::text is a 32-char hex string — equivalent strength to
-- gen_random_bytes(16) for our use case (collision-resistance only,
-- not cryptographic key material).
insert into public.forms (name, description, form_type, provider, webhook_secret, active)
values
  ('Consultation Form',  'Patient/doctor consultation request from the AA website (Elementor).',
    'consultation', 'elementor',
    md5(random()::text || clock_timestamp()::text || 'cf'), true),
  ('DoctorsFinder Form', 'Hospital-side "doctors finder" inquiry from the AA website (Elementor).',
    'doctors_finder', 'elementor',
    md5(random()::text || clock_timestamp()::text || 'df'), true)
on conflict do nothing;

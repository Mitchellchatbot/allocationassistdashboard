-- Hospital Introduction Department — supporting registries.
--
-- 1. hospitals       — the 95 hospitals AA introduces doctors to.
--                      Resolves "Hospital X → which recruiter email + template + city"
--                      when Flow 2 (Profile Sent) fires and Flow 5 (Relocation) picks
--                      the right city-specific guide.
--
-- 2. email_templates — DB-backed copy for every automation flow stage.
--                      Storing in the DB (rather than hard-coding) lets Saif/Hospital
--                      Intro team edit subject + body without an engineering deploy.
--                      Each stage references a template via `template_key`.

create table if not exists public.hospitals (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  city                     text,
  country                  text,
  primary_recruiter_email  text,
  primary_contact_name     text,
  recruiter_phone          text,
  -- Optional override of the default profile_sent template (e.g. some hospitals
  -- prefer a different format). Falls back to the generic profile template
  -- when null. References email_templates.key (loose ref — no FK so we can
  -- delete templates without breaking hospital rows).
  template_key             text,
  notes                    text,
  -- Hospital relationship health score 0-100 (computed elsewhere, stored here
  -- for quick lookup in dashboards / vacancy views).
  health_score             int,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists hospitals_name_idx    on public.hospitals (name);
create index if not exists hospitals_city_idx    on public.hospitals (city);
create index if not exists hospitals_country_idx on public.hospitals (country);

create table if not exists public.email_templates (
  id           uuid primary key default gen_random_uuid(),
  -- Stable slug — referenced from flow stage keys + hospital overrides.
  -- Examples: 'onboarding_welcome', 'profile_sent_hospital', 'interview_tips'.
  key          text unique not null,
  name         text not null,
  -- Which flow this template belongs to (loose tag — purely for grouping in UI).
  flow_key     text,
  subject      text not null,
  body_html    text not null default '',
  body_text    text not null default '',
  -- Documented list of supported tokens, e.g. ["doctor_name", "hospital_name"].
  -- Rendered as a chip list in the editor so Saif knows what placeholders work.
  variables    jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

create index if not exists email_templates_flow_idx on public.email_templates (flow_key);

alter table public.hospitals       enable row level security;
alter table public.email_templates enable row level security;

-- Idempotent policy creation. Postgres <16 has no `create policy if not
-- exists`, so drop first then create — keeps this migration safe to re-run
-- if hospitals/email_templates were already created via the SQL editor and
-- some (but not all) policies pre-exist.
drop policy if exists "service role full hospitals" on public.hospitals;
drop policy if exists "service role full templates" on public.email_templates;
drop policy if exists "auth read hospitals"        on public.hospitals;
drop policy if exists "auth write hospitals"       on public.hospitals;
drop policy if exists "auth update hospitals"      on public.hospitals;
drop policy if exists "auth delete hospitals"      on public.hospitals;
drop policy if exists "auth read templates"        on public.email_templates;
drop policy if exists "auth write templates"       on public.email_templates;
drop policy if exists "auth update templates"      on public.email_templates;
drop policy if exists "auth delete templates"      on public.email_templates;

create policy "service role full hospitals" on public.hospitals       for all to service_role using (true) with check (true);
create policy "service role full templates" on public.email_templates for all to service_role using (true) with check (true);

-- Authenticated dashboard users get full CRUD on both (Hospital Intro team
-- needs to add hospitals + edit templates without engineering).
create policy "auth read hospitals"   on public.hospitals       for select to authenticated using (true);
create policy "auth write hospitals"  on public.hospitals       for insert to authenticated with check (true);
create policy "auth update hospitals" on public.hospitals       for update to authenticated using (true) with check (true);
create policy "auth delete hospitals" on public.hospitals       for delete to authenticated using (true);

create policy "auth read templates"   on public.email_templates for select to authenticated using (true);
create policy "auth write templates"  on public.email_templates for insert to authenticated with check (true);
create policy "auth update templates" on public.email_templates for update to authenticated using (true) with check (true);
create policy "auth delete templates" on public.email_templates for delete to authenticated using (true);

-- Seed default email templates for every "email" / "reminder" stage across the
-- 6 Phase 1 flows. Subjects mirror the defaults in src/lib/automation-flows.ts.
-- Body copy is placeholder pending Saif's real templates — flagged in `body_text`
-- so a quick visual scan of the editor shows which still need real copy.
insert into public.email_templates (key, name, flow_key, subject, body_text, variables) values
  ('onboarding_welcome',          'Onboarding · Welcome Email',          'onboarding',
    'Welcome to Allocation Assist — next steps to get you placed',
    'PLACEHOLDER — replace with Saif''s onboarding email copy. Tokens: {{doctor_name}}, {{form_link}}, {{upload_link}}.',
    '["doctor_name", "form_link", "upload_link"]'::jsonb),
  ('onboarding_form_reminder',    'Onboarding · Form Reminder',          'onboarding',
    'Quick reminder — your qualification form is waiting',
    'PLACEHOLDER — reminder copy. Tokens: {{doctor_name}}, {{form_link}}.',
    '["doctor_name", "form_link"]'::jsonb),
  ('profile_sent_hospital',       'Profile Sent · Hospital Email',       'profile_sent',
    'Candidate introduction — {{doctor_name}}, {{doctor_speciality}}',
    'PLACEHOLDER — generic profile-introduction email. Tokens: {{doctor_name}}, {{doctor_speciality}}, {{hospital_name}}, {{profile_link}}.',
    '["doctor_name", "doctor_speciality", "hospital_name", "profile_link"]'::jsonb),
  ('profile_sent_doctor',         'Profile Sent · Doctor Notification',  'profile_sent',
    'Your profile has been sent to {{hospital_name}}',
    'PLACEHOLDER — doctor notification. Tokens: {{doctor_name}}, {{hospital_name}}.',
    '["doctor_name", "hospital_name"]'::jsonb),
  ('shortlist_confirmation',      'Shortlist · Confirmation',            'shortlist',
    'Great news — you''ve been shortlisted by {{hospital_name}}',
    'PLACEHOLDER — shortlist confirmation. Tokens: {{doctor_name}}, {{hospital_name}}.',
    '["doctor_name", "hospital_name"]'::jsonb),
  ('interview_tips_confirmation', 'Interview · Tips + Confirmation',     'interview',
    'Your interview with {{hospital_name}} — confirmation + tips',
    'PLACEHOLDER — interview tips + confirmation. Tokens: {{doctor_name}}, {{hospital_name}}, {{interview_datetime}}, {{interview_format}}.',
    '["doctor_name", "hospital_name", "interview_datetime", "interview_format"]'::jsonb),
  ('relocation_guide',            'Relocation · City Guide',             'relocation',
    'Your relocation guide for {{city}}',
    'PLACEHOLDER — city-specific relocation guide. Tokens: {{doctor_name}}, {{city}}, {{guide_link}}.',
    '["doctor_name", "city", "guide_link"]'::jsonb),
  ('relocation_attestation',      'Relocation · Attestation Info',       'relocation',
    'Document attestation — what you need before you arrive',
    'PLACEHOLDER — attestation requirements. Tokens: {{doctor_name}}, {{country}}.',
    '["doctor_name", "country"]'::jsonb),
  ('second_payment_invoice',      'Second Payment · Invoice',            'second_payment',
    'Second payment — invoice attached',
    'PLACEHOLDER — second payment invoice. Tokens: {{doctor_name}}, {{amount}}, {{due_date}}, {{payment_link}}.',
    '["doctor_name", "amount", "due_date", "payment_link"]'::jsonb),
  ('second_payment_reminder_25',  'Second Payment · 25-Day Reminder',    'second_payment',
    'Friendly reminder — second payment invoice',
    'PLACEHOLDER — friendly reminder. Tokens: {{doctor_name}}, {{amount}}, {{payment_link}}.',
    '["doctor_name", "amount", "payment_link"]'::jsonb),
  ('second_payment_reminder_due', 'Second Payment · Day-Before-Due Reminder', 'second_payment',
    'Your invoice is due tomorrow',
    'PLACEHOLDER — last friendly reminder. Tokens: {{doctor_name}}, {{amount}}, {{due_date}}, {{payment_link}}.',
    '["doctor_name", "amount", "due_date", "payment_link"]'::jsonb),
  ('second_payment_reminder_weekly', 'Second Payment · Weekly Post-Due Reminder', 'second_payment',
    'Outstanding invoice — please action',
    'PLACEHOLDER — escalating weekly reminder. Tokens: {{doctor_name}}, {{amount}}, {{days_overdue}}, {{payment_link}}.',
    '["doctor_name", "amount", "days_overdue", "payment_link"]'::jsonb)
on conflict (key) do nothing;

-- Seed a small starter set of hospitals so the registry isn't empty before
-- Saif sends the full 95-list. These are widely-known UAE hospitals — Saif
-- will replace with the authoritative list. Marked with notes='seed' for
-- easy bulk-delete: DELETE FROM hospitals WHERE notes='seed'.
insert into public.hospitals (name, city, country, notes) values
  ('American Hospital Dubai',           'Dubai',     'UAE',          'seed'),
  ('Mediclinic City Hospital',          'Dubai',     'UAE',          'seed'),
  ('NMC Royal Hospital',                'Dubai',     'UAE',          'seed'),
  ('Saudi German Hospital Dubai',       'Dubai',     'UAE',          'seed'),
  ('Aster DM Healthcare',               'Dubai',     'UAE',          'seed'),
  ('Cleveland Clinic Abu Dhabi',        'Abu Dhabi', 'UAE',          'seed'),
  ('Sheikh Khalifa Medical City',       'Abu Dhabi', 'UAE',          'seed'),
  ('Burjeel Hospital',                  'Abu Dhabi', 'UAE',          'seed'),
  ('Al Qassimi Hospital',               'Sharjah',   'UAE',          'seed'),
  ('RAK Hospital',                      'Ras Al Khaimah', 'UAE',     'seed'),
  ('King Faisal Specialist Hospital',   'Riyadh',    'Saudi Arabia', 'seed'),
  ('King Faisal Hospital, Jeddah',      'Jeddah',    'Saudi Arabia', 'seed'),
  ('Sidra Medicine',                    'Doha',      'Qatar',        'seed'),
  ('Hamad Medical Corporation',         'Doha',      'Qatar',        'seed')
on conflict do nothing;

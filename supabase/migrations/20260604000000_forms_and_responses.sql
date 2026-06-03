-- Forms infrastructure (Typeform + future providers).
--
-- Two tables:
--   forms           — one row per configured form (Typeform / Google
--                     Forms / etc). Stores provider IDs + a webhook
--                     secret for verifying inbound submissions.
--   form_responses  — one row per submission. answers is raw JSON
--                     from the provider (different providers ship
--                     different shapes; we keep the raw + a tiny
--                     summary text for searchability).
--
-- Provider webhooks POST to /functions/v1/typeform-webhook (and any
-- future per-provider endpoints) which validates + inserts.

create table if not exists public.forms (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  -- 'doctor_intake' / 'hospital_feedback' / 'custom' / etc. Free-text
  -- so the team can categorise without a migration per type.
  form_type         text not null default 'custom',
  -- Provider: 'typeform' for now; design leaves room for others
  -- (google_forms, jotform, internal, etc.).
  provider          text not null default 'typeform',
  -- Provider's identifier for the form (Typeform form_id from URL).
  provider_form_id  text not null,
  -- HMAC secret shared with the provider's webhook for signature
  -- validation. Optional but recommended. Generated client-side on
  -- create and saved here.
  webhook_secret    text,
  -- Public Typeform URL — surfaced in the dashboard as a link to view
  -- the live form / open it for new submissions.
  public_url        text,
  -- Lightweight stats — kept in sync via the webhook + a periodic refresh.
  response_count    integer not null default 0,
  last_response_at  timestamptz,
  active            boolean not null default true,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_form_id)
);

create index if not exists forms_form_type_idx on public.forms (form_type);
create index if not exists forms_provider_idx  on public.forms (provider);

create table if not exists public.form_responses (
  id                    uuid primary key default gen_random_uuid(),
  form_id               uuid not null references public.forms(id) on delete cascade,
  -- Provider's response id (Typeform "response_id" / "token").
  provider_response_id  text not null,
  submitted_at          timestamptz not null default now(),
  -- Raw payload from the provider. Typeform ships definition + answers;
  -- we keep all of it so re-parsing later (e.g. for a missed field) is
  -- possible without re-fetching.
  raw_payload           jsonb not null,
  -- Flattened answers: { question_label: stringified value }. Built by
  -- the webhook receiver so the UI can render a clean table without
  -- repeating the Typeform-specific extraction logic.
  answers               jsonb not null default '{}'::jsonb,
  -- Optional respondent identifier (email / name) extracted by the
  -- webhook receiver if the form asked for it. Used to surface
  -- "Submitted by Dr. X" in the response list.
  respondent_name       text,
  respondent_email      text,
  -- If we recognised the respondent as an existing AA lead / DoB,
  -- this links to that doctor (prefixed: lead:<id> / dob:<id>).
  doctor_id             text,
  created_at            timestamptz not null default now(),
  unique (form_id, provider_response_id)
);

create index if not exists form_responses_form_idx           on public.form_responses (form_id);
create index if not exists form_responses_submitted_idx      on public.form_responses (submitted_at desc);
create index if not exists form_responses_email_idx          on public.form_responses (respondent_email)
  where respondent_email is not null;
create index if not exists form_responses_doctor_idx         on public.form_responses (doctor_id)
  where doctor_id is not null;

alter table public.forms          enable row level security;
alter table public.form_responses enable row level security;

drop policy if exists "service role full forms"          on public.forms;
drop policy if exists "service role full form_responses" on public.form_responses;
drop policy if exists "auth read forms"                  on public.forms;
drop policy if exists "auth write forms"                 on public.forms;
drop policy if exists "auth read form_responses"         on public.form_responses;

create policy "service role full forms"          on public.forms          for all to service_role using (true) with check (true);
create policy "service role full form_responses" on public.form_responses for all to service_role using (true) with check (true);
create policy "auth read forms"                  on public.forms          for select to authenticated using (true);
create policy "auth write forms"                 on public.forms          for all    to authenticated using (true) with check (true);
create policy "auth read form_responses"         on public.form_responses for select to authenticated using (true);

-- Realtime: dashboard shows live response count as new submissions land.
alter publication supabase_realtime add table public.forms;
alter publication supabase_realtime add table public.form_responses;

-- ── Trigger: keep forms.response_count + last_response_at in sync ─────
create or replace function public.bump_form_response_counters()
returns trigger
language plpgsql
as $$
begin
  update public.forms set
    response_count   = response_count + 1,
    last_response_at = greatest(coalesce(last_response_at, '-infinity'::timestamptz), new.submitted_at),
    updated_at       = now()
  where id = new.form_id;
  return new;
end $$;

drop trigger if exists trg_bump_form_response_counters on public.form_responses;
create trigger trg_bump_form_response_counters
after insert on public.form_responses
for each row execute function public.bump_form_response_counters();

comment on table public.forms is 'Configured external forms (Typeform / Google Forms / etc.). One row per form the dashboard is wired to receive submissions for.';
comment on table public.form_responses is 'One row per inbound submission. raw_payload preserves provider format; answers is the flattened question→value map the UI renders.';

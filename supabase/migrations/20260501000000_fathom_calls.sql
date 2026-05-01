-- Fathom Calls — meeting recordings/transcripts pulled from Fathom AI.
-- Two write paths:
--   1. fathom-webhook edge function inserts on `meeting.completed`
--   2. fathom-proxy edge function backfills via REST sync
-- Both upsert on `fathom_id` so duplicate deliveries are no-ops.

create table if not exists fathom_calls (
  id                   uuid primary key default gen_random_uuid(),
  fathom_id            text unique not null,
  share_url            text,
  title                text,
  scheduled_start      timestamptz,
  recording_start      timestamptz,
  recording_end        timestamptz,
  duration_seconds     integer,
  host_email           text,
  host_name            text,
  invitees             jsonb,
  external_domains     text[],
  summary              text,
  action_items         jsonb,
  transcript_plaintext text,
  transcript_segments  jsonb,
  raw                  jsonb,
  matched_lead_id      text,
  matched_doctor_name  text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists fathom_calls_recording_start_idx on fathom_calls (recording_start desc);
create index if not exists fathom_calls_host_email_idx       on fathom_calls (host_email);
create index if not exists fathom_calls_transcript_fts_idx
  on fathom_calls using gin (to_tsvector('english', coalesce(transcript_plaintext, '')));

alter table fathom_calls enable row level security;

drop policy if exists fathom_calls_auth_read    on fathom_calls;
drop policy if exists fathom_calls_service_write on fathom_calls;

create policy fathom_calls_auth_read on fathom_calls
  for select
  using (auth.role() = 'authenticated');

create policy fathom_calls_service_write on fathom_calls
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- updated_at touch trigger
create or replace function fathom_calls_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists fathom_calls_updated_at on fathom_calls;
create trigger fathom_calls_updated_at
  before update on fathom_calls
  for each row execute function fathom_calls_set_updated_at();

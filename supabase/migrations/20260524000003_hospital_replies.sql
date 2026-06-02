-- Hospital reply parsing — log every reply we classify so the team has an
-- audit trail of what Claude saw + what action was taken. Powers the
-- "auto-detect shortlist confirmations" pipeline:
--   1. Team pastes (or inbound webhook delivers) a hospital reply
--   2. classify-hospital-reply edge function sends it to Claude
--   3. Result lands here + an action fires on the linked Profile Sent run

create table if not exists public.hospital_replies (
  id              uuid primary key default gen_random_uuid(),
  -- The Profile Sent run this reply belongs to. Nullable so we can still
  -- log replies that fail to match a run (audit value > linking value).
  run_id          uuid references public.automation_flow_runs(id) on delete set null,
  doctor_id       text,
  doctor_name     text,
  hospital_name   text,
  -- Reply metadata
  reply_from      text,
  reply_subject   text,
  reply_text      text not null,
  -- Classification output from Claude
  classification  text not null,                                  -- shortlisted | declined | needs_more_info | unclear | wrong_doctor
  confidence      numeric(3,2),
  ai_summary      text,
  ai_raw_response jsonb,
  -- What we did with this classification
  action_taken    text,
  -- Where the reply came from — manual paste vs an automated source we add later.
  source          text not null default 'manual_paste',           -- manual_paste | resend_inbound | gmail
  created_at      timestamptz not null default now(),
  created_by      text
);

create index if not exists hospital_replies_run_idx        on public.hospital_replies (run_id);
create index if not exists hospital_replies_classification on public.hospital_replies (classification);
create index if not exists hospital_replies_doctor_idx     on public.hospital_replies (doctor_id);

alter table public.hospital_replies enable row level security;

drop policy if exists "service role full hospital_replies" on public.hospital_replies;
drop policy if exists "auth read hospital_replies"        on public.hospital_replies;

create policy "service role full hospital_replies" on public.hospital_replies for all to service_role using (true) with check (true);
create policy "auth read hospital_replies"         on public.hospital_replies for select to authenticated using (true);

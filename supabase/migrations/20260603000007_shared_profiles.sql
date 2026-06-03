-- Permissioned profile links (Ammar 2026-06-03).
--
-- Hospitals receive doctor profile emails that need a "View full
-- profile" CTA — but the AA-website profile is behind a login wall
-- ('not everyone can see the profiles of doctors'). This table backs
-- a tokenised, time-bound public view: each profile_sent run mints a
-- token that lets THAT hospital see THAT doctor's profile without an
-- account.
--
-- View page lives at /shared-profile/:token (public route, no auth).
-- Tokens expire 90 days from creation by default (long enough for
-- hospitals to follow up; short enough to invalidate stale shares).

create table if not exists public.shared_profile_tokens (
  token         text primary key,
  doctor_id     text not null,
  doctor_name   text,
  hospital      text,
  run_id        uuid references public.automation_flow_runs(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '90 days'),
  -- One row per view. We don't store IPs (lite GDPR posture) — just
  -- a count + last access for the team to see whether the hospital
  -- opened the link.
  view_count    integer not null default 0,
  last_viewed_at timestamptz,
  revoked_at    timestamptz                                       -- manual revoke if a hospital relationship sours
);

create index if not exists shared_profile_tokens_doctor_idx
  on public.shared_profile_tokens (doctor_id);

create index if not exists shared_profile_tokens_run_idx
  on public.shared_profile_tokens (run_id);

create index if not exists shared_profile_tokens_expires_idx
  on public.shared_profile_tokens (expires_at)
  where revoked_at is null;

-- RLS: service role only. Everyone else reads via the public edge
-- function which validates token + expiry server-side.
alter table public.shared_profile_tokens enable row level security;

drop policy if exists "service role full shared_profile_tokens" on public.shared_profile_tokens;
create policy "service role full shared_profile_tokens"
  on public.shared_profile_tokens
  for all to service_role using (true) with check (true);

comment on table public.shared_profile_tokens is 'Permissioned, time-bound view tokens — one per profile_sent send. Lets a hospital recipient open the doctor''s profile without an AA-website login.';

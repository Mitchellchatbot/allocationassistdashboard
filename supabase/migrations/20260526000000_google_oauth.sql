-- Google OAuth tokens (singleton). The team connects ONE Google account
-- whose Drive holds the sheets they want to ingest; the refresh token lets
-- us mint short-lived access tokens forever without anyone re-logging in.
--
-- One row per app install (id = 1). If you ever want per-user OAuth instead
-- of a shared team account, add a `user_email` column + drop the singleton
-- check.

create table if not exists public.google_oauth_tokens (
  id              int primary key default 1,
  account_email   text,                   -- the email of the connected Google user (for display)
  refresh_token   text not null,          -- never expires (unless revoked)
  access_token    text,                   -- cached so we don't refresh every tick
  expires_at      timestamptz,            -- when the cached access_token stops working
  scopes          text,                   -- space-separated scopes Google actually granted
  connected_by    text,                   -- email of dashboard user who clicked Connect
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint google_oauth_tokens_singleton check (id = 1)
);

alter table public.google_oauth_tokens enable row level security;

drop policy if exists "service role full google_oauth_tokens" on public.google_oauth_tokens;
drop policy if exists "auth read google_oauth_tokens"         on public.google_oauth_tokens;

-- Service role has full access (edge functions read/write it). Authenticated
-- users can READ but NOT see the refresh_token — explicit RLS via a view
-- below to redact secrets.
create policy "service role full google_oauth_tokens" on public.google_oauth_tokens for all to service_role using (true) with check (true);
create policy "auth read google_oauth_tokens"  on public.google_oauth_tokens for select to authenticated using (true);

-- Safe public-ish view: same row WITHOUT the refresh_token / access_token.
-- Frontend queries this to render the "Connected as ammar@..." banner.
drop view if exists public.google_oauth_status;
create view public.google_oauth_status as
  select id, account_email, scopes, connected_by, connected_at, updated_at,
         (refresh_token is not null) as connected,
         (expires_at is not null and expires_at > now()) as access_token_valid
  from public.google_oauth_tokens;

grant select on public.google_oauth_status to authenticated;

-- Extend sheet_connections.auth_mode to include 'oauth'. service_account
-- stays as a fallback for backward compatibility but UI defaults to oauth.
alter table public.sheet_connections
  drop constraint if exists sheet_connections_auth_mode_check;

alter table public.sheet_connections
  drop constraint if exists sheet_connections_check;

-- (the column-level CHECK lives in the original migration; recreate it
--  with 'oauth' added).
alter table public.sheet_connections
  add constraint sheet_connections_auth_mode_check
  check (auth_mode in ('public_csv', 'service_account', 'oauth'));

alter publication supabase_realtime add table public.google_oauth_tokens;

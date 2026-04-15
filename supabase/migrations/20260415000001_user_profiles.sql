-- ── User profiles ─────────────────────────────────────────────────────────────
-- Stores role + page permissions for every user.
-- Created by the create-user edge function (service role).
-- Read by the client after login to determine what the user can access.

create table if not exists public.user_profiles (
  id            uuid        references auth.users(id) on delete cascade primary key,
  email         text        not null,
  full_name     text,
  role          text        not null default 'custom',   -- admin | sales | finance | worker | custom
  allowed_pages text[]      not null default '{}',       -- e.g. '{/,/sales,/finance}'
  created_at    timestamptz default now(),
  created_by    uuid        references auth.users(id)
);

alter table public.user_profiles enable row level security;

-- Each user can read their own profile (needed immediately after login)
create policy "users read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles (for the Users management tab)
create policy "admins read all profiles"
  on public.user_profiles for select
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Only the service role (edge functions) may insert / update / delete
-- (no client-side mutations allowed)

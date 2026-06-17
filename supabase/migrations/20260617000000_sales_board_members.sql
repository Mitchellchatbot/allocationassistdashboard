-- Sales board roster: people an admin pins onto the Sales Tracker leaderboard,
-- in addition to whoever auto-appears from Zoho lead ownership.
create table if not exists public.sales_board_members (
  id          uuid primary key default gen_random_uuid(),
  member_name text not null,                 -- display name (matched to Zoho Owner for stats)
  email       text,
  user_id     uuid,                           -- optional link to the dashboard user
  added_by    text,
  created_at  timestamptz not null default now()
);
create unique index if not exists sales_board_members_name_uniq
  on public.sales_board_members (lower(member_name));

alter table public.sales_board_members enable row level security;

-- Everyone signed in can read the board.
drop policy if exists "sales_board_read" on public.sales_board_members;
create policy "sales_board_read" on public.sales_board_members
  for select using (auth.role() = 'authenticated');

-- Only admins can add / remove.
drop policy if exists "sales_board_admin_write" on public.sales_board_members;
create policy "sales_board_admin_write" on public.sales_board_members
  for all
  using      (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'admin'))
  with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'admin'));

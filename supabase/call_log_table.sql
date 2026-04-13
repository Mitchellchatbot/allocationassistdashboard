-- Run this in Supabase Dashboard → SQL Editor

create table if not exists call_log (
  id               uuid primary key default gen_random_uuid(),
  call_date        text,          -- e.g. "19-Jan", "20-Jan 25"
  status           text,          -- High Potential, Declined, Follow up in the future, etc.
  doctor_name      text,
  specialty        text,
  country_training text,          -- country where they completed their training
  country_origin   text,          -- country of origin / nationality
  years_experience numeric,       -- nullable — not always provided
  notes            text,
  created_at       timestamptz default now()
);

-- Allow the dashboard (anon/authenticated key) to read and insert rows
alter table call_log enable row level security;

create policy "allow_all_authenticated" on call_log
  for all
  using (true)
  with check (true);

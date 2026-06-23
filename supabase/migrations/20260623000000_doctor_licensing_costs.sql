-- Per-doctor licensing-spend ledger.
--
-- Zoho has no field for "money spent on licensing out of the doctor's first
-- invoice" (UK->UAE license conversion, DataFlow verification, etc.), so we
-- keep it in the dashboard. One row per cost item, keyed by the AA doctor_id
-- (`dob:<zohoId>`). Amounts are AED (the dashboard's base currency); the UI's
-- AED/USD toggle converts on display only. Receipts (optional) live in the
-- private `licensing-receipts` storage bucket, referenced by receipt_path.

create table if not exists public.doctor_licensing_costs (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    text not null,
  doctor_name  text,
  description  text not null,
  amount_aed   numeric(12,2) not null default 0,
  spent_on     date,
  receipt_path text,
  receipt_name text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text
);

create index if not exists doctor_licensing_costs_doctor_idx
  on public.doctor_licensing_costs (doctor_id);

alter table public.doctor_licensing_costs enable row level security;

drop policy if exists "service role full licensing" on public.doctor_licensing_costs;
drop policy if exists "auth read licensing"         on public.doctor_licensing_costs;
drop policy if exists "auth write licensing"        on public.doctor_licensing_costs;

create policy "service role full licensing" on public.doctor_licensing_costs
  for all to service_role using (true) with check (true);
create policy "auth read licensing" on public.doctor_licensing_costs
  for select to authenticated using (true);
create policy "auth write licensing" on public.doctor_licensing_costs
  for all to authenticated using (true) with check (true);

-- Private bucket for receipt files (PDF / images).
insert into storage.buckets (id, name, public)
values ('licensing-receipts', 'licensing-receipts', false)
on conflict (id) do nothing;

drop policy if exists "auth read licensing receipts"  on storage.objects;
drop policy if exists "auth write licensing receipts" on storage.objects;

create policy "auth read licensing receipts" on storage.objects
  for select to authenticated using (bucket_id = 'licensing-receipts');
create policy "auth write licensing receipts" on storage.objects
  for all to authenticated using (bucket_id = 'licensing-receipts') with check (bucket_id = 'licensing-receipts');

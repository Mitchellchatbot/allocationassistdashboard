-- contract_sends — tracks every BoldSign envelope we send so the
-- boldsign-webhook function can map an incoming "Completed" event back to
-- the Zoho lead that triggered the send. On signing, the webhook creates a
-- Contact ("Doctors on Board") in Zoho and flips Lead_Status to "Closed Won".
create table if not exists public.contract_sends (
  id                    uuid primary key default gen_random_uuid(),
  boldsign_document_id  text unique not null,
  zoho_lead_id          text not null,
  doctor_email          text not null,
  doctor_name           text not null,
  status                text not null default 'sent',  -- sent | viewed | signed | declined | expired | failed
  signed_at             timestamptz,
  zoho_contact_id       text,                          -- populated after Contact creation
  zoho_error            text,                          -- last error text, if anything failed
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists contract_sends_lead_idx   on public.contract_sends (zoho_lead_id);
create index if not exists contract_sends_status_idx on public.contract_sends (status);

alter table public.contract_sends enable row level security;

-- Service-role only — Edge Functions write here, the dashboard reads via
-- the same service role from server-side queries. No anon access.
create policy "service role full access" on public.contract_sends
  for all to service_role using (true) with check (true);

-- Allow authenticated dashboard users to SELECT (they need to render the
-- Sent Contracts table + receive bell notifications via realtime).
create policy "authenticated read" on public.contract_sends
  for select to authenticated using (true);

-- Enable Supabase realtime so the dashboard's useContractActivity channel
-- fires when the boldsign-webhook flips a row's status to 'signed'.
alter publication supabase_realtime add table public.contract_sends;

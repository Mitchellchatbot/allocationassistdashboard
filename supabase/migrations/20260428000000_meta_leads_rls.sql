-- Allow the dashboard frontend (running as the authenticated role) to read
-- meta_leads. The form-import automation already writes via service role
-- which bypasses RLS, so this only affects reads from the browser.
--
-- Note: meta_leads_pipeline is a VIEW, not a table — RLS doesn't apply to
-- views directly; they inherit policies from the underlying meta_leads table.

alter table public.meta_leads enable row level security;

-- Drop any old read policy first so this migration is idempotent
drop policy if exists "authenticated read meta_leads" on public.meta_leads;

create policy "authenticated read meta_leads"
  on public.meta_leads
  for select
  to authenticated
  using (true);

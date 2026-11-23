-- Let a signed-in user import historical submissions.
--
-- form_responses has had policies for select, update and delete since June,
-- but never insert - every row until now arrived through a webhook running
-- as the service role, which bypasses RLS. So the "Backfill historical
-- submissions" button on /forms could never have worked: the upload parsed,
-- the insert was refused by RLS, and the page reported "CSV import failed"
-- with no reason. It surfaced the first time anyone tried to use it, loading
-- the Doctors Finder history.
--
-- with check (true) matches the table's existing stance: any authenticated
-- user may already read every response, edit its outreach fields and delete
-- it outright. Withholding insert alone protected nothing.

drop policy if exists "auth insert form_responses" on public.form_responses;
create policy "auth insert form_responses"
  on public.form_responses
  for insert
  to authenticated
  with check (true);

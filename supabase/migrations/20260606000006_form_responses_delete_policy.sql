-- Allow authenticated dashboard users to delete form_response rows.
-- The Forms page's row-level trash button uses this — handy for
-- clearing test data without dropping to SQL.
drop policy if exists "auth delete form_responses" on public.form_responses;
create policy "auth delete form_responses"
  on public.form_responses
  for delete
  to authenticated
  using (true);

-- Same access to insert/update — they were missing too, only select
-- was open. The trash button needs delete; the outreach editor on
-- each row needs update. Insert kept service-role only since the
-- webhooks are the only path that creates rows.
drop policy if exists "auth update form_responses" on public.form_responses;
create policy "auth update form_responses"
  on public.form_responses
  for update
  to authenticated
  using (true)
  with check (true);

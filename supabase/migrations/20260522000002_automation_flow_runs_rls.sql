-- Frontend dialogs (TriggerFlowDialog, SendProfileDialog) write to
-- automation_flow_runs directly. The original migration only granted
-- authenticated SELECT — this adds the missing INSERT and UPDATE so the
-- "Mark first payment received" / "Send profile" / etc. buttons can persist
-- their runs from the browser session.
--
-- Service-role writes (from edge functions like boldsign-send,
-- send-flow-email) already bypass RLS via the existing `service role full
-- runs` policy, so they're unaffected.

drop policy if exists "auth insert runs" on public.automation_flow_runs;
drop policy if exists "auth update runs" on public.automation_flow_runs;

create policy "auth insert runs" on public.automation_flow_runs
  for insert to authenticated with check (true);

create policy "auth update runs" on public.automation_flow_runs
  for update to authenticated using (true) with check (true);

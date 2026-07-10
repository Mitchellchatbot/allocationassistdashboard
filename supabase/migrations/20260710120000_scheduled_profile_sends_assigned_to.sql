-- Sender override for scheduled profile sends.
-- When the dispatcher picks a specific sender in the Send Profile dialog
-- (instead of the per-hospital owner default), the choice is stored here and
-- tick-scheduler stamps it onto the created run's assigned_to so the From line
-- matches what they picked. Null → the assign_run_from_hospital_owner trigger
-- decides (each hospital's owner → created_by), the unchanged default.
alter table public.scheduled_profile_sends
  add column if not exists assigned_to text;

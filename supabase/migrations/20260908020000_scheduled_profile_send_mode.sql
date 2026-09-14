-- A scheduled profile send can now narrow which of the two emails it fires,
-- matching the picker the Send-Profile dialog gained for immediate sends:
--   'both'     — hospital intro + the doctor's working-opportunity email
--   'hospital' — intro only, no working-opportunity email
--   'doctor'   — working-opportunity email only, hospitals not contacted
--
-- Without this the choice was silently dropped on the "Schedule for later"
-- path: the row carried no send mode, so tick-sends replayed every scheduled
-- send as 'both' regardless of what the dispatcher picked.
--
-- Defaults to 'both' so every existing row keeps firing exactly as it does now.
alter table public.scheduled_profile_sends
  add column if not exists send_mode text not null default 'both';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scheduled_profile_sends_send_mode_check'
  ) then
    alter table public.scheduled_profile_sends
      add constraint scheduled_profile_sends_send_mode_check
      check (send_mode in ('both', 'hospital', 'doctor'));
  end if;
end $$;

comment on column public.scheduled_profile_sends.send_mode is
  'Which legs fire: both | hospital (intro only) | doctor (working-opportunity only).';

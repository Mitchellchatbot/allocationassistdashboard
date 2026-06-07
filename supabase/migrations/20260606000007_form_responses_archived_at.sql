-- Archive instead of hard-delete on the Forms page. The team
-- frequently wants to clear test data / one-off submissions out of
-- the working view without losing audit trail (and without
-- accidentally giving the impression we're reaching back into
-- JotForm / Typeform to delete the source submission — which we
-- never were doing in the first place, but the naming was confusing).
--
-- archived_at = null  → visible in the live list
-- archived_at = now() → hidden in the live list, surfaced in Archive
alter table public.form_responses
  add column if not exists archived_at timestamptz;

create index if not exists form_responses_archived_idx
  on public.form_responses (archived_at)
  where archived_at is not null;

-- Partial index for the live feed query (filter where archived_at is null)
create index if not exists form_responses_active_form_submitted_idx
  on public.form_responses (form_id, submitted_at desc)
  where archived_at is null;

-- A jsonb scratchpad on forms used by jotform-webhook to cache the
-- JotForm questions API response. Without this, every webhook
-- submission would re-fetch the question definition just to map
-- truncated keys ('q3_typeA52') to their real text ('Please upload a
-- recent professional picture from a studio').
alter table public.forms
  add column if not exists metadata jsonb not null default '{}'::jsonb;

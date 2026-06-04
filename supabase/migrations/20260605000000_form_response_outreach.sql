-- Form-response outreach state.
--
-- The team needs to work form responses as leads: set status, log
-- notes from a call, schedule a follow-up, and (for DoctorsFinder
-- specifically) treat $750 paid leads as high-priority.
--
-- Two changes:
--   1. forms.lead_value_cents — per-form monetary value of a response.
--      Backfilled to $750 (75 000 cents) for DoctorsFinder; default 0
--      for everything else (Typeform / Consultation already create
--      Zoho leads, so no inherent purchase cost).
--   2. form_responses gets a small outreach lifecycle:
--        outreach_status   new (default) | contacted | qualified | declined | closed
--        outreach_owner    HI member email — who's working it
--        outreach_notes    free-text notepad (single blob; promotable
--                          to a child table later if history matters)
--        last_contacted_at when status was last bumped to contacted
--        next_followup_at  when to chase again
--
-- The existing pg_trgm search_text trigger is updated to include
-- outreach_notes so the search bar matches anything jotted there too.

alter table public.forms
  add column if not exists lead_value_cents integer not null default 0;

update public.forms
   set lead_value_cents = 75000
 where (name ilike '%doctorsfinder%' or name ilike '%doctors finder%')
   and lead_value_cents = 0;

alter table public.form_responses
  add column if not exists outreach_status   text        not null default 'new',
  add column if not exists outreach_owner    text,
  add column if not exists outreach_notes    text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_followup_at  timestamptz;

create index if not exists form_responses_outreach_status_idx
  on public.form_responses (outreach_status);
create index if not exists form_responses_outreach_followup_idx
  on public.form_responses (next_followup_at)
  where next_followup_at is not null;
create index if not exists form_responses_outreach_owner_idx
  on public.form_responses (outreach_owner)
  where outreach_owner is not null;

-- Extend the search_text builder to cover outreach_notes so the search
-- bar matches anything the team jotted down on a call.
create or replace function public.form_responses_build_search_text(r public.form_responses)
returns text language sql stable as $$
  select lower(
    coalesce(r.respondent_name,      '') || ' ' ||
    coalesce(r.respondent_email,     '') || ' ' ||
    coalesce(r.doctor_id,            '') || ' ' ||
    coalesce(r.provider_response_id, '') || ' ' ||
    coalesce(r.outreach_notes,       '') || ' ' ||
    coalesce(r.outreach_owner,       '') || ' ' ||
    coalesce(
      (select string_agg(value, ' ') from jsonb_each_text(r.answers)),
      ''
    )
  )
$$;

-- One-shot re-backfill so existing rows pick up the trigger output
-- (no-op for any row that wasn't touched, but cheap insurance).
update public.form_responses
   set search_text = public.form_responses_build_search_text(form_responses.*);

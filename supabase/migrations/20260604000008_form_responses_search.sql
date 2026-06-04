-- Server-side search for /forms.
--
-- The page was pulling ALL form_responses for a form into memory and
-- filtering client-side. Fine at 100 rows, painful at 17k. This migration
-- adds a denormalised search_text column + a pg_trgm GIN index so the
-- page can paginate (200 first / 50 per scroll) and query the DB
-- directly when the search bar has input.
--
-- search_text concatenates everything the team currently searches over:
-- name, email, doctor_id, provider response id, and every answer value
-- in the JSONB blob (so question-content matches still work).
--
-- Trigger keeps the column in sync on insert/update. The migration also
-- backfills existing rows in one shot.

create extension if not exists pg_trgm;

-- Returns the search-bag text for a row. STABLE rather than IMMUTABLE
-- because jsonb_each_text is stable; that's fine here since we only
-- call it from a trigger + the backfill, never from an index expression.
create or replace function public.form_responses_build_search_text(r public.form_responses)
returns text language sql stable as $$
  select lower(
    coalesce(r.respondent_name,        '') || ' ' ||
    coalesce(r.respondent_email,       '') || ' ' ||
    coalesce(r.doctor_id,              '') || ' ' ||
    coalesce(r.provider_response_id,   '') || ' ' ||
    coalesce(
      (select string_agg(value, ' ') from jsonb_each_text(r.answers)),
      ''
    )
  )
$$;

alter table public.form_responses
  add column if not exists search_text text;

create or replace function public.form_responses_set_search_text()
returns trigger language plpgsql as $$
begin
  new.search_text := public.form_responses_build_search_text(new);
  return new;
end;
$$;

drop trigger if exists trg_form_responses_search on public.form_responses;
create trigger trg_form_responses_search
  before insert or update on public.form_responses
  for each row execute function public.form_responses_set_search_text();

-- Backfill (one-shot — trigger handles future writes).
update public.form_responses
   set search_text = public.form_responses_build_search_text(form_responses.*)
 where search_text is null;

-- pg_trgm GIN index — fast ILIKE matches across the search_text bag.
create index if not exists form_responses_search_trgm_idx
  on public.form_responses using gin (search_text gin_trgm_ops);

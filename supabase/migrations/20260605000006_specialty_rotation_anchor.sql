-- Make the specialty rotation auto-advance daily.
--
-- Before: cursor_index only moved when send-batch fired a
-- specialty_of_day send. The UI card showed the same "today's pick"
-- for days at a time if no send went out — Saif's flag was "this isnt
-- changing every day".
--
-- After: we anchor the cursor at a known date, then derive today's
-- pick client-side as `(cursor_index + days_since_anchor) mod queue
-- length`. The DB cursor stays the source of truth at the anchor;
-- the displayed cursor walks itself forward every calendar day.
--
-- Advance / queue-edit actions re-anchor at today so the math stays
-- intuitive (clicking Advance moves you forward exactly one specialty
-- from "today", not from the last anchor + N days).

alter table public.specialty_rotation_state
  add column if not exists cursor_anchor_at timestamptz not null default now();

-- Existing row: roll the freshly-defaulted anchor back to updated_at.
-- The ALTER above just stamped cursor_anchor_at = now() on every row;
-- pulling it back to updated_at means the derived cursor advances by
-- "days since the last edit", not "0 days".
update public.specialty_rotation_state
   set cursor_anchor_at = updated_at
 where cursor_anchor_at > updated_at;

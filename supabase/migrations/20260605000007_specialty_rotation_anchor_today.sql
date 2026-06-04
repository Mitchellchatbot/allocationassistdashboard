-- The previous migration anchored cursor_anchor_at to updated_at on the
-- existing row, which could be months old (the team rarely edits the
-- queue). With derivation = cursor_index + days_since_anchor, that
-- silently jumped today's pick forward by however many days have
-- elapsed — confusing for the team.
--
-- Re-stamp at now() so "today" displays whatever cursor_index was
-- persisted, and the daily walk starts from there.

update public.specialty_rotation_state
   set cursor_anchor_at = now()
 where id = 1;

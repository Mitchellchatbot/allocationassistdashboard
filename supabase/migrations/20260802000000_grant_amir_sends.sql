-- Amir (amir@allocationassist.com, role hi_member) couldn't see the "Sends" tab
-- (profile send) in the sidebar. His user_profiles.allowed_pages predates the
-- route consolidation: it has the OLD send routes (/automations, /batches,
-- /profile-sent) but not the NEW unified /sends page the sidebar item gates on.
-- A DB row wins over the hi_member code default (which already includes /sends),
-- so grant /sends explicitly. Idempotent: only touches the row if it's missing,
-- and only ADDS /sends (never removes existing access).
update public.user_profiles
set allowed_pages = (
  select array_agg(distinct p)
  from unnest(coalesce(allowed_pages, '{}'::text[]) || '{/sends}'::text[]) as p
)
where id in (select id from auth.users where lower(email) = 'amir@allocationassist.com')
  and not (coalesce(allowed_pages, '{}'::text[]) @> '{/sends}'::text[]);

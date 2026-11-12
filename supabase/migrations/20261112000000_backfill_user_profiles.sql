-- Give the three accounts that had no user_profiles row a profile, before the
-- app's email fallback starts failing closed (see src/lib/access.ts).
--
-- Without a row, these accounts got every page through the old fallback.
-- With fail-closed they would get none. The team asked to keep their access
-- as it was, so all three get an explicit admin row:
--
--   admin@allocationassist.com
--   worker@allocationassist.com
--   worker2@allocationassist.com
--
-- Safe to re-run: existing rows for these accounts are set to admin.

insert into public.user_profiles (id, email, full_name, role, allowed_pages)
select u.id, lower(u.email), u.raw_user_meta_data->>'full_name', 'admin', ARRAY[
    '/', '/my-workspace', '/sales', '/marketing', '/doctors', '/team',
    '/finance', '/meta-ads', '/settings', '/worker', '/calls', '/chatbot',
    '/follow-ups', '/sends', '/automations', '/information', '/vacancies',
    '/reports', '/batches', '/profile-sent', '/import-bulk', '/connections',
    '/forms', '/feedback'
  ]::text[]
from auth.users u
where lower(u.email) in (
  'admin@allocationassist.com',
  'worker@allocationassist.com',
  'worker2@allocationassist.com'
)
on conflict (id) do update
  set role = 'admin', allowed_pages = excluded.allowed_pages;

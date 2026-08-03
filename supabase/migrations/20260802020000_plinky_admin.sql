-- Grant Plinky (plinky@allocationassist.com) admin so she can manage users
-- (Settings → Users is gated on role = 'admin'). Upsert: creates her profile row
-- if she has none, else promotes the existing one. Only sets role + allowed_pages
-- on conflict (keeps any existing email/full_name). Finance stays separately gated
-- by canSeeFinance(), so admin alone doesn't reveal it.
insert into public.user_profiles (id, email, full_name, role, allowed_pages)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', 'Plinky'), 'admin', ARRAY[
    '/', '/my-workspace', '/sales', '/marketing', '/doctors', '/team',
    '/finance', '/meta-ads', '/settings', '/worker', '/calls', '/chatbot',
    '/follow-ups', '/sends', '/automations', '/information', '/vacancies',
    '/reports', '/batches', '/profile-sent', '/import-bulk', '/connections',
    '/forms', '/feedback'
  ]::text[]
from auth.users u
where lower(u.email) = 'plinky@allocationassist.com'
on conflict (id) do update
  set role = 'admin', allowed_pages = excluded.allowed_pages;

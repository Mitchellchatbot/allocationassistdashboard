-- Grant Amir (amir@allocationassist.com) admin so he can manage users
-- (the Settings → Users tab is gated on role = 'admin'). Sets the full page
-- allowlist too (mirrors ALL_PAGES in src/hooks/use-auth.ts). Finance stays
-- separately gated by the canSeeFinance() email allowlist, so admin alone does
-- NOT reveal Finance.
update public.user_profiles
set role = 'admin',
    allowed_pages = ARRAY[
      '/', '/my-workspace', '/sales', '/marketing', '/doctors', '/team',
      '/finance', '/meta-ads', '/settings', '/worker', '/calls', '/chatbot',
      '/follow-ups', '/sends', '/automations', '/information', '/vacancies',
      '/reports', '/batches', '/profile-sent', '/import-bulk', '/connections',
      '/forms', '/feedback'
    ]::text[]
where id in (select id from auth.users where lower(email) = 'amir@allocationassist.com');

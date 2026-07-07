-- Grant amir@allocationassist.com access to the full Hospital Introduction
-- section. Non-destructive: UNIONs the HI page set into his existing
-- allowed_pages (keeps his role + any other access he already has — pure grant,
-- never revokes). Mirrors how the HI team was provisioned in ...0603000000.
--
-- If amir has no user_profiles row yet, this is a no-op — and the email fallback
-- in use-auth.ts already treats unknown emails as admin (full access), so he'd
-- see everything anyway once he logs in. Idempotent.
do $$
declare n int;
begin
  update public.user_profiles
     set allowed_pages = array(
       select distinct unnest(
         allowed_pages || array[
           '/', '/my-workspace', '/automations', '/information', '/doctors',
           '/vacancies', '/profile-sent', '/batches', '/reports', '/forms', '/settings'
         ]
       )
     )
   where lower(email) = 'amir@allocationassist.com';
  get diagnostics n = row_count;
  raise notice 'amir HI access: % profile row(s) updated', n;
end $$;

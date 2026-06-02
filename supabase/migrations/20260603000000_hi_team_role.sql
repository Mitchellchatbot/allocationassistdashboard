-- ── HI team role + allowed pages ───────────────────────────────────────
-- Promote the four Hospital Introduction team emails to a scoped
-- `hi_member` role with a focused page set. Idempotent: only updates
-- existing user_profiles rows. HI members who haven't logged in yet (no
-- profile row) get the same scoping via the email-fallback in use-auth.ts.
--
-- Roster source of truth: src/lib/hi-team.ts

update public.user_profiles
   set role          = 'hi_member',
       allowed_pages = array[
         '/',
         '/my-workspace',
         '/automations',
         '/doctor-profiles',
         '/vacancies',
         '/batches',
         '/reports'
       ]
 where lower(email) in (
   'rodaina@allocationassist.com',
   'mohamed.othman@allocationassist.com',
   'sohaila@allocationassist.com',
   'ishak@allocationassist.com'
 );

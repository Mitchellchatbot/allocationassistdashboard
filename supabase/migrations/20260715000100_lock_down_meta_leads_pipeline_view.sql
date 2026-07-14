-- meta_leads_pipeline is a VIEW over the meta_leads base table. meta_leads has
-- RLS (migration 20260428000000_meta_leads_rls), but a Postgres view runs with
-- its OWNER's privileges (not the caller's) unless security_invoker is set — so
-- the view BYPASSES the base table's RLS. Combined with an anon SELECT grant on
-- the view, the anon (public) role could still read all ~16k lead rows through
-- it. (The base table meta_leads itself correctly denies anon.)
--
-- Fix: remove the anon/public grant on the view so only authenticated (logged-in
-- staff) — who are already allowed to read meta_leads — can query it. Edge
-- functions use the service role and are unaffected.
do $$
begin
  if to_regclass('public.meta_leads_pipeline') is not null then
    execute 'revoke all on public.meta_leads_pipeline from anon, public';
    execute 'grant select on public.meta_leads_pipeline to authenticated';
  end if;
end $$;

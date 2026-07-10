-- Replies inbox follow-ups.

-- 1) direction: inbound (captured replies) vs outbound (replies/forwards we sent
--    from the portal). Lets the inbox list stay incoming-only while the detail
--    pane renders the full back-and-forth as a conversation.
alter table public.hospital_replies
  add column if not exists direction text not null default 'inbound';   -- inbound | outbound

-- 2) Grant the /replies page to everyone who already has HI access (anyone who
--    can see /profile-sent) — non-destructive UNION, mirrors the amir grant.
update public.user_profiles
   set allowed_pages = array(select distinct unnest(allowed_pages || array['/replies']))
 where '/profile-sent' = any(allowed_pages);

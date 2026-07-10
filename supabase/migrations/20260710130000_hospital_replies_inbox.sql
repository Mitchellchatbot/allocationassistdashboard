-- Replies inbox — extend hospital_replies so the dashboard can show inbound
-- replies as a real inbox (raw HTML body, threading id, read/handled state) and
-- receive them live. Powers the new "Replies" page.

alter table public.hospital_replies
  add column if not exists reply_html       text,          -- raw HTML body (reply_text stays the plaintext)
  add column if not exists reply_message_id text,          -- inbound Message-ID, for threading a reply back
  add column if not exists in_reply_to      text,          -- the In-Reply-To/References we can thread on
  add column if not exists is_read          boolean not null default false,
  add column if not exists handled_at       timestamptz,   -- team marked it dealt-with
  add column if not exists forwarded_at     timestamptz;   -- last time it was forwarded from the portal

-- Internal team (authenticated) can mark replies read / handled / forwarded.
drop policy if exists "auth update hospital_replies" on public.hospital_replies;
create policy "auth update hospital_replies" on public.hospital_replies
  for update to authenticated using (true) with check (true);

-- Live updates for the inbox.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hospital_replies'
  ) then
    alter publication supabase_realtime add table public.hospital_replies;
  end if;
end $$;

-- Public bucket for email-embedded assets (logo, footer mark, etc).
-- Email clients (Outlook, Gmail) hot-link <img src="..."> and we don't
-- want APIKEY/JWT gating in the way. Anyone who can guess a URL can
-- read; nothing sensitive lives in this bucket.

insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do update set public = excluded.public;

-- Public read policy (one-time, idempotent).
drop policy if exists "Public read email-assets" on storage.objects;
create policy "Public read email-assets"
  on storage.objects for select
  to public
  using (bucket_id = 'email-assets');

-- Service role writes; no user uploads.
drop policy if exists "Service-role write email-assets" on storage.objects;
create policy "Service-role write email-assets"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'email-assets');

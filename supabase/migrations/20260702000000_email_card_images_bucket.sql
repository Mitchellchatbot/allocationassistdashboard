-- Public bucket for doctor-card SCREENSHOTS used inline in the hospital intro
-- email. The "Download & attach screenshot" button on the Send Profile dialog
-- rasterises the profile card (html2canvas) to a PNG and uploads it here; the
-- send then renders <img src=<this url>> in place of the {{doctor_card_html}}
-- block so the hospital sees a pixel-perfect card no matter the email client.
--
-- Why public: Resend attaches/hot-links each image's URL server-side with no
-- auth header — a private bucket would 401 that fetch. Paths are random UUIDs
-- (see uploadCardImage in src/lib/card-screenshot.ts) so URLs are unguessable
-- and nothing is listed. Same trade-off the email-assets / email-attachments
-- buckets already make.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-card-images', 'email-card-images', true,
  10485760,  -- 10MB — a 2× card PNG is well under 1MB, generous headroom
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read so Resend can hot-link the image when it builds the email.
drop policy if exists "Public read email-card-images" on storage.objects;
create policy "Public read email-card-images"
  on storage.objects for select
  to public
  using (bucket_id = 'email-card-images');

-- Dashboard team members (authenticated) upload from the Send Profile dialog.
drop policy if exists "Auth write email-card-images" on storage.objects;
create policy "Auth write email-card-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-card-images');

-- Let the uploader clean up a screenshot they discarded before send.
drop policy if exists "Auth delete email-card-images" on storage.objects;
create policy "Auth delete email-card-images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'email-card-images');

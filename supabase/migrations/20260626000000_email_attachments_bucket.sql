-- Public bucket for user-uploaded email attachments (CVs, logbooks, etc).
-- Amir 2026-06-26: the team wants to attach a doctor's CV / logbook to the
-- hospital introduction email instead of describing it in the body.
--
-- Why public: Resend attaches files by fetching each attachment's `path`
-- URL server-side with no auth header. A private bucket would 401 the fetch.
-- Paths are random UUIDs (see uploadEmailAttachment in src/lib/email-attachments.ts)
-- so the URLs are unguessable; nothing is listed publicly. Same trade-off the
-- email-assets + relocation-guides buckets already make.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-attachments', 'email-attachments', true,
  26214400,  -- 25MB — comfortably covers a scanned CV / logbook PDF
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read so Resend can hot-link the file when it builds the email.
drop policy if exists "Public read email-attachments" on storage.objects;
create policy "Public read email-attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'email-attachments');

-- Dashboard team members (authenticated) upload from the Send Profile dialog.
drop policy if exists "Auth write email-attachments" on storage.objects;
create policy "Auth write email-attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'email-attachments');

-- Let the uploader clean up a file they just attached then removed before send.
drop policy if exists "Auth delete email-attachments" on storage.objects;
create policy "Auth delete email-attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'email-attachments');

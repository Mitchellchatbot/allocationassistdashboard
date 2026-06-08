-- Relocation guide → real PDF attachments (Ammar's actual flow).
--
-- Ammar sends the relocation guide as a set of PDF ATTACHMENTS ("you gotta
-- send them PDFs"), not a link. This migration:
--   1. Creates a public `relocation-guides` bucket the team uploads PDFs into:
--      the shared pack (schools, apps, rental prices) lives in `_default/`,
--      and each city's own relocation guide lives in its slug folder
--      (dubai/, abu-dhabi/, al-ain/, sharjah/…). send-flow-email attaches
--      `_default` + the city folder, so each doctor gets the shared pack PLUS
--      their city's guide.
--   2. Rewrites the relocation_guide email template to Ammar's "welcoming
--      gift" wording, referencing the attached guide (send-flow-email lists
--      the city's folder and attaches every PDF it finds).
--
-- The PDFs themselves are uploaded out-of-band (Supabase Studio → Storage →
-- relocation-guides, or a future dashboard UI) — they are not in this repo.

-- ── 1. Bucket ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'relocation-guides', 'relocation-guides', true,
  26214400,  -- 25MB per file
  array['application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read so Resend can fetch the attachment URLs (and doctors could open
-- them directly). Nothing sensitive lives here — generic city guides.
drop policy if exists "Public read relocation-guides" on storage.objects;
create policy "Public read relocation-guides"
  on storage.objects for select
  to public
  using (bucket_id = 'relocation-guides');

-- Team (authenticated) + service role can upload/replace/remove guide files.
drop policy if exists "Team write relocation-guides" on storage.objects;
create policy "Team write relocation-guides"
  on storage.objects for insert
  to authenticated, service_role
  with check (bucket_id = 'relocation-guides');

drop policy if exists "Team update relocation-guides" on storage.objects;
create policy "Team update relocation-guides"
  on storage.objects for update
  to authenticated, service_role
  using (bucket_id = 'relocation-guides');

drop policy if exists "Team delete relocation-guides" on storage.objects;
create policy "Team delete relocation-guides"
  on storage.objects for delete
  to authenticated, service_role
  using (bucket_id = 'relocation-guides');

-- ── 2. Email template — Ammar's welcoming-gift wording ──────────────────────
update public.email_templates
set
  subject = 'Your relocation guide for {{city}} 🎉',
  body_html = $html$
{{logo_header}}
<p>Hi Dr. {{doctor_name}}!</p>
<p>I hope you are doing well!</p>
<p>Thank you so much for choosing to work with Allocation Assist.</p>
<p>As one of our Valued Doctors, I am grateful to share the attached relocation guide for {{city}} as our welcoming gift for you.</p>
<p>If you have any questions or concerns, please feel free to reach out. We're here to support you every step of the way.</p>
<p>I wish you a wonderful day!</p>
{{signature}}
$html$,
  body_text = $text$Hi Dr. {{doctor_name}}!

I hope you are doing well!

Thank you so much for choosing to work with Allocation Assist.

As one of our Valued Doctors, I am grateful to share the attached relocation guide for {{city}} as our welcoming gift for you.

If you have any questions or concerns, please feel free to reach out. We're here to support you every step of the way.

I wish you a wonderful day!

{{signature_text}}
$text$
where key = 'relocation_guide';

-- Hospital photos for working-opportunity emails (Sean: "add images to working
-- opportunity email templates"; Hasan pointed at the attachments folder). The
-- photos were uploaded to storage at email-assets/hospitals/<slug>.png; this
-- adds an image_url column, maps the ones we have by name, and drops a
-- {{hospital_image}} slot into the WO doctor templates so the hospital's photo
-- renders near the top of the email (empty when a hospital has no photo on file).

-- 1) Column to hold each hospital's photo URL (set in the Hospitals tab too).
alter table public.hospitals add column if not exists image_url text;

-- 2) Map the photos we uploaded from the outbox attachments (name-matched).
update public.hospitals set image_url = 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/cleveland-clinic-abu-dhabi.png'
  where coalesce(image_url, '') = '' and name ilike '%cleveland%';
update public.hospitals set image_url = 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/al-ahli-hospital-qatar.png'
  where coalesce(image_url, '') = '' and (name ilike '%al-ahli%' or name ilike '%al ahli%');
update public.hospitals set image_url = 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/national-medical-care.png'
  where coalesce(image_url, '') = '' and name ilike '%national medical care%';
update public.hospitals set image_url = 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/al-rajhi.png'
  where coalesce(image_url, '') = '' and name ilike '%rajhi%';

-- 3) Insert the {{hospital_image}} slot just before the "We have an opportunity"
-- line in every working-opportunity doctor template (HTML body only — the image
-- is HTML; the plain-text body stays image-free). Idempotent.
update public.email_templates
set body_html = regexp_replace(body_html, '(<p>We have an opportunity)', '{{hospital_image}}\1'),
    updated_at = now()
where flow_key = 'profile_sent'
  and body_html like '%We have an opportunity%'
  and body_html not like '%{{hospital_image}}%';

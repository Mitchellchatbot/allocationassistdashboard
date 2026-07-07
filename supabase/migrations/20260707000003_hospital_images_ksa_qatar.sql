-- KSA + Qatar hospital photos from the attachments/2026-07-02 email export
-- (Hasan: "map those too"). The 4 that ...000008 uploaded (Cleveland, Al-Ahli
-- Qatar, National Medical Care, Al Rajhi) already have files in storage; this
-- (a) FIXES the Al-Ahli mapping — the row is "Alahli Hospital" so the old
-- '%al-ahli%' pattern never matched — and (b) maps the newly-uploaded ones
-- (The View, Dr Sulaiman Al Habib, Aman, KMC Korean, Military Medical City).
--
-- Guarded by coalesce(image_url,'')='' so it's idempotent and never clobbers.
-- Rows that don't exist yet just match nothing — the file is uploaded and can be
-- attached later from the Add-hospital editor.

do $$
declare base text := 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/';
begin
  -- Qatar
  update public.hospitals set image_url = base||'qatar-the-view.png',              updated_at = now() where coalesce(image_url,'')='' and name ilike '%the view%';
  update public.hospitals set image_url = base||'al-ahli-hospital-qatar.png',       updated_at = now() where coalesce(image_url,'')='' and name ilike '%ahli%' and city ilike '%doha%';
  update public.hospitals set image_url = base||'qatar-aman.png',                   updated_at = now() where coalesce(image_url,'')='' and name ilike '%aman%' and city ilike '%doha%';
  update public.hospitals set image_url = base||'qatar-kmc-korean.png',             updated_at = now() where coalesce(image_url,'')='' and (name ilike '%korean%' or name ilike '%kmc%') and city ilike '%doha%';
  update public.hospitals set image_url = base||'qatar-military-medical-city.png',  updated_at = now() where coalesce(image_url,'')='' and name ilike '%military medical city%';

  -- Saudi Arabia
  update public.hospitals set image_url = base||'ksa-dr-sulaiman-al-habib.png',     updated_at = now() where coalesce(image_url,'')='' and name ilike '%sulaiman al habib%';
  update public.hospitals set image_url = base||'national-medical-care.png',        updated_at = now() where coalesce(image_url,'')='' and (name ilike '%national medical care%' or name ilike '%care medical%');
  update public.hospitals set image_url = base||'al-rajhi.png',                      updated_at = now() where coalesce(image_url,'')='' and name ilike '%rajhi%';

  raise notice 'ksa_qatar images: % hospitals now have a photo', (select count(*) from public.hospitals where coalesce(image_url,'')<>'');
end $$;

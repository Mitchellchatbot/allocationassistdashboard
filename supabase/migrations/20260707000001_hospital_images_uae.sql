-- Hospital photos, round 2 (Hasan: "imagesforemails" folder of ~42 Working-
-- Opportunity hospital shots). Uploaded to email-assets/hospitals/<slug>.png;
-- this name-matches each to a hospital row and sets image_url so the
-- {{hospital_image}} slot (added in ...000008) renders the hospital's photo in
-- its working-opportunity emails.
--
-- Matching notes:
--  * Guarded by coalesce(image_url,'')='' so it's idempotent and never clobbers
--    a photo already set (the 4 from ...000008, or a manual one from the tab).
--  * City is added to the WHERE for names that recur across emirates
--    (Mediclinic, NMC, Tawam, Burjeel) so the Abu Dhabi photo doesn't land on
--    the Dubai branch and vice-versa.
--  * A few images have no hospital row yet (e.g. Yas Group, Sheikh Tahnoon);
--    those UPDATEs simply match 0 rows — the file is still uploaded and can be
--    picked up later from the Hospitals tab.

do $$
declare base text := 'https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/hospitals/';
begin
  -- Abu Dhabi
  update public.hospitals set image_url = base||'abu-dhabi-al-dhafra-hospital-group.png', updated_at = now() where coalesce(image_url,'')='' and name ilike '%dhafra%';
  update public.hospitals set image_url = base||'abu-dhabi-alkalma-aspris.png',           updated_at = now() where coalesce(image_url,'')='' and name ilike '%kalma%';
  update public.hospitals set image_url = base||'abu-dhabi-bascom-palmer.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%bascom%';
  update public.hospitals set image_url = base||'abu-dhabi-burjeel-medical-city.png',      updated_at = now() where coalesce(image_url,'')='' and name ilike '%burjeel medical city%';
  update public.hospitals set image_url = base||'abu-dhabi-capital-health.png',            updated_at = now() where coalesce(image_url,'')='' and name ilike '%capital health%' and city ilike '%abu dhabi%';
  update public.hospitals set image_url = base||'abu-dhabi-harley-street.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%harley street%';
  update public.hospitals set image_url = base||'abu-dhabi-mediclinic.png',                updated_at = now() where coalesce(image_url,'')='' and name ilike '%mediclinic%' and city ilike '%abu dhabi%';
  update public.hospitals set image_url = base||'abu-dhabi-nmc.png',                       updated_at = now() where coalesce(image_url,'')='' and name ilike '%nmc%' and city ilike '%abu dhabi%';
  update public.hospitals set image_url = base||'abu-dhabi-reem-hospital.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%reem hospital%';
  update public.hospitals set image_url = base||'abu-dhabi-sheikh-khalifa-medical-city.png', updated_at = now() where coalesce(image_url,'')='' and name ilike '%sheikh khalifa%';
  update public.hospitals set image_url = base||'abu-dhabi-sheikh-shakhbout.png',          updated_at = now() where coalesce(image_url,'')='' and name ilike '%shakhbout%';
  update public.hospitals set image_url = base||'abu-dhabi-tarmeem.png',                   updated_at = now() where coalesce(image_url,'')='' and name ilike '%tarmeem%';
  update public.hospitals set image_url = base||'abu-dhabi-yas-group.png',                 updated_at = now() where coalesce(image_url,'')='' and name ilike '%yas%' and city ilike '%abu dhabi%';
  update public.hospitals set image_url = base||'abu-dhabi-zayed-military.png',            updated_at = now() where coalesce(image_url,'')='' and name ilike '%zayed military%';

  -- Al Ain
  update public.hospitals set image_url = base||'al-ain-burjeel-royal.png',                updated_at = now() where coalesce(image_url,'')='' and name ilike '%burjeel%' and city ilike '%al ain%';
  update public.hospitals set image_url = base||'al-ain-tawam.png',                        updated_at = now() where coalesce(image_url,'')='' and name ilike '%tawam%' and city ilike '%al ain%';
  update public.hospitals set image_url = base||'al-ain-sheikh-tahnoon.png',               updated_at = now() where coalesce(image_url,'')='' and name ilike '%tahnoon%';

  -- Dubai
  update public.hospitals set image_url = base||'dubai-al-garhoud.png',                    updated_at = now() where coalesce(image_url,'')='' and name ilike '%garhoud%';
  update public.hospitals set image_url = base||'dubai-al-zahra.png',                      updated_at = now() where coalesce(image_url,'')='' and name ilike '%al zahra%';
  update public.hospitals set image_url = base||'dubai-american-center-psychiatry.png',    updated_at = now() where coalesce(image_url,'')='' and name ilike '%american center of psychiatry%';
  update public.hospitals set image_url = base||'dubai-american-hospital.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%american hospital%';
  update public.hospitals set image_url = base||'dubai-cosmesurge.png',                    updated_at = now() where coalesce(image_url,'')='' and name ilike '%cosmesurge%';
  update public.hospitals set image_url = base||'dubai-emirates-hospital-group.png',       updated_at = now() where coalesce(image_url,'')='' and name ilike '%emirates group%';
  update public.hospitals set image_url = base||'dubai-fakih-ivf.png',                     updated_at = now() where coalesce(image_url,'')='' and name ilike '%fakih%';
  update public.hospitals set image_url = base||'dubai-gargash.png',                       updated_at = now() where coalesce(image_url,'')='' and name ilike '%gargash%';
  update public.hospitals set image_url = base||'dubai-glucare.png',                       updated_at = now() where coalesce(image_url,'')='' and name ilike '%glucare%';
  update public.hospitals set image_url = base||'dubai-healthbay.png',                     updated_at = now() where coalesce(image_url,'')='' and name ilike '%healthbay%';
  update public.hospitals set image_url = base||'dubai-kings-college.png',                 updated_at = now() where coalesce(image_url,'')='' and name ilike '%kings college%';
  update public.hospitals set image_url = base||'dubai-latifa.png',                        updated_at = now() where coalesce(image_url,'')='' and name ilike '%latifa%';
  update public.hospitals set image_url = base||'dubai-medcare.png',                       updated_at = now() where coalesce(image_url,'')='' and name ilike '%medcare%';
  update public.hospitals set image_url = base||'dubai-mediclinic.png',                    updated_at = now() where coalesce(image_url,'')='' and name ilike '%mediclinic%' and city ilike '%dubai%';
  update public.hospitals set image_url = base||'dubai-mirdif.png',                        updated_at = now() where coalesce(image_url,'')='' and name ilike '%mirdif%';
  update public.hospitals set image_url = base||'dubai-moorfields.png',                    updated_at = now() where coalesce(image_url,'')='' and name ilike '%moorfields%';
  update public.hospitals set image_url = base||'dubai-nmc.png',                           updated_at = now() where coalesce(image_url,'')='' and name ilike '%nmc%' and city ilike '%dubai%';
  update public.hospitals set image_url = base||'dubai-prime.png',                         updated_at = now() where coalesce(image_url,'')='' and name ilike '%prime%' and city ilike '%dubai%';
  update public.hospitals set image_url = base||'dubai-lighthouse-arabia.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%lighthouse%';
  update public.hospitals set image_url = base||'dubai-valens.png',                        updated_at = now() where coalesce(image_url,'')='' and name ilike '%valens%';
  update public.hospitals set image_url = base||'dubai-al-jalila-childrens.png',           updated_at = now() where coalesce(image_url,'')='' and name ilike '%jalila%';
  update public.hospitals set image_url = base||'dubai-fakeeh-university.png',             updated_at = now() where coalesce(image_url,'')='' and name ilike '%fakeeh%';

  -- Ras Al Khaimah / Sharjah
  update public.hospitals set image_url = base||'rak-hospital.png',                        updated_at = now() where coalesce(image_url,'')='' and name ilike '%rak hospital%';
  update public.hospitals set image_url = base||'sharjah-university-hospital.png',         updated_at = now() where coalesce(image_url,'')='' and name ilike '%sharjah%' and name ilike '%university%';
  update public.hospitals set image_url = base||'sharjah-sheikh-sultan-bin-zayed.png',     updated_at = now() where coalesce(image_url,'')='' and name ilike '%sultan bin zayed%';

  raise notice 'hospital_images_uae: % hospitals now have a photo', (select count(*) from public.hospitals where coalesce(image_url,'')<>'');
end $$;

-- Captured profile-card image for scheduled profile sends.
-- Immediate Send-Profile sends embed a captured PNG of the doctor card (uploaded
-- to the email-card-images bucket) via run metadata.doctor_card_image_url, so the
-- hospital sees the pixel-perfect photo card instead of the HTML fallback.
-- Scheduled sends had no place to keep that URL, so tick-scheduler couldn't stamp
-- it onto the fired run — the email fell back to the teal HTML card ("it sent the
-- HTML element instead of the photo"). Snapshot the URL here at schedule time; the
-- image lives in a persistent bucket, so it's still valid when the send fires.
alter table public.scheduled_profile_sends
  add column if not exists card_image_url text;

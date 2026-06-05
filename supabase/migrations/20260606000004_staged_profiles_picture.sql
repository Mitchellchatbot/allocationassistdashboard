-- The JotForm picture URL captured from form_responses
-- widget_metadata. Held on the staged row so the Publish handler can
-- (a) display it as the staging avatar and (b) upload to WP media
-- + set acf.profile_picture if the team chooses Publish.
alter table public.staged_doctor_profiles
  add column if not exists picture_url text;

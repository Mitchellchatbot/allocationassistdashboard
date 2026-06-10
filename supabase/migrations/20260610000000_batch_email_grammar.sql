-- profile_sent_hospital_batch: fix the dangling intro line.
-- "Here are some of our available {{specialty}} from the Allocation Assist
-- Platform." reads as a fragment ("available cardiology from…"). Add the
-- missing noun so it works for every specialty token, including the
-- "Mixed Specialty Doctors" label used by daily_duo / tuesday batches.
-- Surgical replace against the live template (the 2026-06-08 plinky pass only
-- prepended the logo header, it didn't touch this line).

update public.email_templates
set body_html = replace(
      body_html,
      'available <strong>{{specialty}}</strong> from the Allocation Assist Platform',
      'available <strong>{{specialty}}</strong> profiles from the Allocation Assist Platform'),
    body_text = replace(
      body_text,
      'available {{specialty}} from the Allocation Assist Platform',
      'available {{specialty}} profiles from the Allocation Assist Platform'),
    updated_at = now()
where key = 'profile_sent_hospital_batch';

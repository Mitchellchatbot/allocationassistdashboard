-- The batch email subject was "Available {{specialty}} Doctors — Allocation
-- Assist". send-batch now renders {{specialty}} as a plural practitioner noun
-- ("Cardiovascular Surgeons" / "Mixed Specialty Doctors"), so the trailing
-- " Doctors" produced "...Surgeons Doctors" / "...Doctors Doctors". Drop it.
update public.email_templates
set subject = replace(subject, '{{specialty}} Doctors', '{{specialty}}')
where key = 'profile_sent_hospital_batch'
  and subject like '%{{specialty}} Doctors%';

-- The 43 imported "Working Opportunity" doctor templates (20260629000003) were
-- brought in WITHOUT a sign-off: their bodies stop at the hospital link, so they
-- send with no "Warmest Regards / Allocation Assist" block that every other
-- profile-sent template carries. Append the {{signature}} token — filled in
-- per-sender by send-flow-email (name / title / phone / JLT address / website /
-- logo) — plus the "Thank you so much." closing line, matching the base
-- profile_sent_doctor template.
--
-- Guarded three ways so it's safe + idempotent: only the imported keys
-- (profile_sent_doctor_<slug>), only the profile_sent flow, and only rows that
-- don't already contain a signature (so any hand-edits in the Templates editor
-- survive and a re-run is a no-op).

update public.email_templates
set
  body_html  = body_html || '<p>Thank you so much.</p>{{signature}}',
  body_text  = body_text || E'\n\nThank you so much.\n{{signature_text}}',
  updated_at = now()
where flow_key = 'profile_sent'
  and key like 'profile\_sent\_doctor\_%' escape '\'
  and body_html not like '%{{signature}}%';

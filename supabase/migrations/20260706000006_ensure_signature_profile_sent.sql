-- Guarantee every profile_sent email carries the branded {{signature}} block
-- (Hasan 2026-07-06: "make sure all emails have … the signature"). Idempotent —
-- a no-op for the templates that already end in {{signature}} (all the current
-- ones do), but it back-stops any profile_sent template that's missing it so the
-- AA sign-off + logo always render.
update public.email_templates
set body_html = rtrim(body_html) || E'\n{{signature}}', updated_at = now()
where flow_key = 'profile_sent'
  and coalesce(body_html, '') not like '%{{signature}}%';

update public.email_templates
set body_text = rtrim(coalesce(body_text, '')) || E'\n\n{{signature}}', updated_at = now()
where flow_key = 'profile_sent'
  and coalesce(body_text, '') not like '%{{signature}}%';

-- Remove the "Upload my documents" CV-upload button from the onboarding_welcome
-- email. The team no longer collects CVs via an emailed upload link, and
-- send-flow-email no longer generates an {{upload_link}}, so the button would
-- otherwise render with an empty href.
update public.email_templates
set body_html = replace(
  body_html,
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background-color:#14a098;"><a href="{{upload_link}}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Upload my documents</a></td></tr></table>',
  ''
),
updated_at = now()
where key = 'onboarding_welcome';

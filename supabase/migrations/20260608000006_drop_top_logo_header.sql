-- The dashboard's template-editor preview doesn't resolve server-side
-- tokens, so {{logo_header}} was rendering as literal text in the
-- email preview. Cleaner to put the brand at the BOTTOM (the signature
-- now embeds the icon above 'Allocation Assist'), matching the
-- Plinky-style reference where the logo sits in the signature block.
--
-- Strips the leading {{logo_header}} (and any whitespace around it)
-- from every template body — html + text — set in
-- 20260608000005_all_emails_plinky_style.

update public.email_templates
set
  body_html = regexp_replace(body_html, '^\s*\{\{\s*logo_header\s*\}\}\s*', ''),
  body_text = regexp_replace(body_text, '^\s*\{\{\s*logo_header\s*\}\}\s*', '');

-- Belt + braces: catch any mid-body occurrences too.
update public.email_templates
set
  body_html = replace(body_html, '{{logo_header}}', ''),
  body_text = replace(body_text, '{{logo_header}}', '');

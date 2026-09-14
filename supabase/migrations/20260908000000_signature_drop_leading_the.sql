-- Sign-off reads "Allocation Assist team", not "The Allocation Assist team".
-- The rendered {{signature}} block is built in code (send-batch SIGNATURE_HTML /
-- send-flow-email pickSender) and already updated; this catches the templates
-- that still spell the closer out inline instead of using the token.

update public.email_templates
   set body_html = regexp_replace(body_html, 'The Allocation Assist team', 'Allocation Assist team', 'g')
 where body_html like '%The Allocation Assist team%';

update public.email_templates
   set body_text = regexp_replace(body_text, 'The Allocation Assist team', 'Allocation Assist team', 'g')
 where body_text like '%The Allocation Assist team%';

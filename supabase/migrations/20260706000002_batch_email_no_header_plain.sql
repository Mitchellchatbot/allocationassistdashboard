-- profile_sent_hospital_batch: strip the old card chrome so the batch email
-- reads exactly like the rest of the (plinky-style) emails.
--
-- Hasan 2026-07-06: "no header either please, we need it to have the same font
-- as the rest of the emails as well, exact same styling."
--
-- The batch template was the last one still carrying the 2026-05 card design:
-- a grey #f4f6f8 page wrapper, a white rounded card, a teal #14a098 banner
-- header ("Allocation Assist / AVAILABLE DOCTORS"), a hardcoded -apple-system
-- 15px font, and a footer bar. The 2026-06-08 plinky sweep only PREPENDED
-- {{logo_header}} to it (which send-batch doesn't even provide, so it renders
-- empty) — it never stripped the card. Rewrite it now to the same plain
-- greeting + body + {{signature}} pattern every other template uses, with NO
-- header block at all. send-batch wraps the rendered body in a
-- font-family:Garamond div, so these bare <p>/<table> elements inherit the
-- email's Garamond stack — matching the single-doctor hospital email 1:1.
--
-- Tokens are unchanged (hospital_contact_name, specialty, doctors_table_html,
-- signature) so the render path in send-batch needs no changes. The AA logo
-- still appears — it's baked into {{signature}} at the bottom.

update public.email_templates
set
  body_html = $html$<p>Hello <strong>{{hospital_contact_name}}</strong>!</p>
<p>I hope you are having a good day 😊</p>
<p>Here are some of our available <strong>{{specialty}}</strong> profiles from the Allocation Assist Platform.</p>
{{doctors_table_html}}
<p>Please let us know if you require further assistance with any of them.</p>
<p>Thank you so much.</p>
{{signature}}$html$,
  body_text = $text$Hello {{hospital_contact_name}}!

I hope you are having a good day :)

Here are some of our available {{specialty}} profiles from the Allocation Assist Platform.

{{doctors_table_html}}

Please let us know if you require further assistance with any of them.

Thank you so much.

{{signature}}$text$,
  variables  = '["hospital_contact_name","specialty","doctors_table_html","signature"]'::jsonb,
  updated_at = now()
where key = 'profile_sent_hospital_batch';

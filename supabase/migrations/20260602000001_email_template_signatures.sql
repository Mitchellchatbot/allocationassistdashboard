-- Replace the ad-hoc "— The Allocation Assist team" closers in every email
-- template with the {{signature}} token so the renderer injects Allocation
-- Assist's branded signature block (teal "Warmest Regards" + JLT address +
-- website + logo, matching Ammar's manual sends).
--
-- After this migration:
--   * Old templates still ship — the renderer falls back to literal {{signature}}
--     if the token is missing, but we'd see that as a defect.
--   * New templates only need to drop {{signature}} where the closer should sit.

update public.email_templates
   set body_html = regexp_replace(
         body_html,
         '<p[^>]*>—\s*The Allocation Assist team[^<]*</p>',
         '{{signature}}',
         'gi'
       )
 where body_html ~* '<p[^>]*>—\s*The Allocation Assist team';

update public.email_templates
   set body_text = regexp_replace(
         body_text,
         '—\s*The Allocation Assist team',
         '{{signature_text}}',
         'gi'
       )
 where body_text ~* '—\s*The Allocation Assist team';

-- Fallback: any template whose HTML doesn't already include {{signature}}
-- gets one appended just before the closing footer / </body>.
update public.email_templates
   set body_html = body_html || E'\n{{signature}}'
 where body_html not like '%{{signature}}%'
   and key in (
     'interview_tips_confirmation',
     'shortlist_confirmation',
     'profile_sent_doctor',
     'relocation_guide',
     'relocation_attestation',
     'second_payment_invoice',
     'second_payment_reminder_25',
     'second_payment_reminder_due',
     'second_payment_reminder_weekly',
     'onboarding_welcome',
     'onboarding_form_reminder'
   );

update public.email_templates
   set body_text = body_text || E'\n{{signature_text}}'
 where body_text not like '%{{signature_text}}%'
   and key in (
     'interview_tips_confirmation',
     'shortlist_confirmation',
     'profile_sent_doctor',
     'relocation_guide',
     'relocation_attestation',
     'second_payment_invoice',
     'second_payment_reminder_25',
     'second_payment_reminder_due',
     'second_payment_reminder_weekly',
     'onboarding_welcome',
     'onboarding_form_reminder'
   );

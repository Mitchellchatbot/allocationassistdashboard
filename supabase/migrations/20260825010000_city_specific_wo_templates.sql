-- City-specific "Working Opportunity" doctor templates (team feedback: "Templates
-- specific to opportunities in Dubai, Abu Dhabi, etc."). One selectable
-- profile_sent doctor template per city, keyed doctor_city_<slug> so the
-- Templates tab groups them under their own category and the Send Profile dialog
-- offers them in the doctor-template picker. The team can edit the copy in-app;
-- these are sensible, non-fabricated starting points (they don't assert specific
-- hospital facts — the recruiter tailors specifics per send).
--
-- Idempotent: on conflict (key) do nothing, so re-running never duplicates or
-- clobbers a template the team has since edited.

do $$
declare
  cities text[] := array['Dubai', 'Abu Dhabi', 'Sharjah', 'Doha', 'Riyadh', 'Jeddah'];
  c    text;
  slug text;
begin
  foreach c in array cities loop
    slug := 'doctor_city_' || regexp_replace(lower(c), '[^a-z0-9]+', '_', 'g');

    insert into public.email_templates (key, name, flow_key, subject, body_text, body_html, variables, updated_at)
    values (
      slug,
      format('Doctor · By city · %s', c),
      'profile_sent',
      format('Working opportunities in %s - Allocation Assist.', c),
      format(
        E'Hi Dr. {{doctor_name}},\n\n'
        'I hope you are doing well.\n\n'
        'Based on your profile and training, we have recommended you to leading hospitals in %1$s. These are among the most relevant employers in the area for your specialty.\n\n'
        'We will help you negotiate the salary and allowance to secure your best offer. Please let us know if you hear from any of them by email, phone call, or LinkedIn — we will also update you as soon as we receive feedback.\n\n'
        'We wish you a wonderful day!\n\n'
        '{{signature}}',
        c
      ),
      format(
        '<p style="margin:0 0 10px;">Hi Dr. {{doctor_name}},</p>'
        '<p style="margin:0 0 10px;">I hope you are doing well 😊</p>'
        '<p style="margin:0 0 10px;">Based on your profile and training, we have recommended you to leading hospitals in <strong>%1$s</strong>. These are among the most relevant employers in the area for your specialty.</p>'
        '{{hospital_image}}'
        '<p style="margin:0 0 10px;">We will help you negotiate the salary and allowance to secure your best offer. Please let us know if you hear from any of them by email, phone call, or LinkedIn — we will also update you as soon as we receive feedback.</p>'
        '<p style="margin:0 0 10px;">We wish you a wonderful day!</p>'
        '{{signature}}',
        c
      ),
      '["doctor_name", "hospital_image", "signature"]'::jsonb,
      now()
    )
    on conflict (key) do nothing;
  end loop;
end $$;

-- Demo seed data for the Automations page.
-- Inserts a handful of realistic-looking flow_runs and events per flow so the
-- UI is populated immediately for the May 27 Wednesday check-in with Saif.
-- Safe to drop or re-run: every row carries metadata.seed = true so a future
-- cleanup is one DELETE.
--
-- DELETE FROM public.automation_flow_runs WHERE metadata->>'seed' = 'true';

do $$
declare
  v_now timestamptz := now();
  v_run_id uuid;
begin
  -- ── Onboarding ────────────────────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, doctor_phone, current_stage, status, started_at, last_event_at, metadata)
  values ('onboarding', 'Dr. Heena Sharma', 'heena.sharma@example.com', '+971501234567', 'wait_for_form', 'active', v_now - interval '2 days', v_now - interval '4 hours', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_first_payment',  'entered',    'First payment confirmed by Sarah (finance).', v_now - interval '2 days'),
    (v_run_id, 'send_onboarding_email',  'email_sent', 'Sent onboarding email with qualification form link.', v_now - interval '2 days' + interval '3 minutes'),
    (v_run_id, 'send_onboarding_email',  'email_opened', 'Doctor opened email (Mailgun event).', v_now - interval '1 day 23 hours'),
    (v_run_id, 'wait_for_form',          'entered',    'Waiting on form + document upload.', v_now - interval '4 hours');

  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, current_stage, status, started_at, last_event_at, metadata)
  values ('onboarding', 'Dr. Ahmad Khan', 'ahmad.khan@example.com', 'reminder_form', 'active', v_now - interval '6 days', v_now - interval '1 hour', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_first_payment', 'entered',       'First payment confirmed.', v_now - interval '6 days'),
    (v_run_id, 'send_onboarding_email', 'email_sent',    'Welcome email sent.', v_now - interval '6 days' + interval '2 minutes'),
    (v_run_id, 'wait_for_form',         'entered',       'Form not received after 3 days.', v_now - interval '3 days'),
    (v_run_id, 'reminder_form',         'reminder_sent', 'Reminder #1 sent.', v_now - interval '3 days' + interval '5 minutes'),
    (v_run_id, 'reminder_form',         'note',          'Doctor replied on WhatsApp — said docs coming Monday. Watch list.', v_now - interval '1 hour');

  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, current_stage, status, started_at, last_event_at, completed_at, metadata)
  values ('onboarding', 'Dr. Priya Menon', 'priya.menon@example.com', 'form_received', 'completed', v_now - interval '10 days', v_now - interval '8 days', v_now - interval '8 days', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_first_payment', 'entered',    'Payment confirmed.', v_now - interval '10 days'),
    (v_run_id, 'send_onboarding_email', 'email_sent', 'Onboarding email sent.', v_now - interval '10 days' + interval '1 minute'),
    (v_run_id, 'form_received',         'completed',  'All documents received.', v_now - interval '8 days');

  -- ── Profile Sent to Hospital ──────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('profile_sent', 'Dr. Heena Sharma', 'heena.sharma@example.com', 'American Hospital Dubai', 'awaiting_response', 'active', v_now - interval '3 days', v_now - interval '3 days', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_send_clicked', 'entered',    'Rodina sent profile to American Hospital.', v_now - interval '3 days'),
    (v_run_id, 'email_hospital',       'email_sent', 'Profile email sent to recruiter@americanhospital.ae.', v_now - interval '3 days' + interval '1 minute'),
    (v_run_id, 'email_doctor',         'email_sent', 'Doctor notified of introduction.', v_now - interval '3 days' + interval '1 minute'),
    (v_run_id, 'awaiting_response',    'entered',    'Waiting for hospital reply (7-day window).', v_now - interval '3 days' + interval '2 minutes');

  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('profile_sent', 'Dr. Yusuf Mahmoud', 'yusuf.m@example.com', 'NMC Royal Hospital', 'email_doctor', 'active', v_now - interval '2 hours', v_now - interval '90 minutes', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_send_clicked', 'entered',    'Mohammed sent profile to NMC Royal.', v_now - interval '2 hours'),
    (v_run_id, 'email_hospital',       'email_sent', 'Profile sent to NMC Royal (BCC: 3 other branches).', v_now - interval '2 hours' + interval '1 minute');

  insert into public.automation_flow_runs (flow_key, doctor_name, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('profile_sent', 'Dr. Linh Nguyen', 'Aster DM Healthcare', 'awaiting_response', 'paused', v_now - interval '5 days', v_now - interval '1 day', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message) values
    (v_run_id, 'awaiting_response', 'note', 'Hospital asked to defer review until after Eid.');

  -- ── Shortlist Confirmation ────────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('shortlist', 'Dr. Priya Menon', 'priya.menon@example.com', 'King Faisal Hospital, Riyadh', 'shortlist_complete', 'completed', v_now - interval '5 days', v_now - interval '5 days' + interval '5 minutes', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_shortlist_confirmed', 'entered',    'KFH confirmed shortlist.', v_now - interval '5 days'),
    (v_run_id, 'send_shortlist_email',        'email_sent', 'Shortlist confirmation email sent to doctor.', v_now - interval '5 days' + interval '2 minutes');

  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('shortlist', 'Dr. Yusuf Mahmoud', 'yusuf.m@example.com', 'Mediclinic City Hospital', 'send_shortlist_email', 'active', v_now - interval '20 minutes', v_now - interval '20 minutes', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message) values
    (v_run_id, 'trigger_shortlist_confirmed', 'entered', 'Mediclinic shortlisted Dr. Yusuf.');

  -- ── Interview ─────────────────────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('interview', 'Dr. Priya Menon', 'priya.menon@example.com', 'King Faisal Hospital, Riyadh', 'interview_complete', 'completed', v_now - interval '4 days', v_now - interval '4 days', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_interview_confirmed', 'entered',    'Interview confirmed for May 23 10:00 KSA.', v_now - interval '4 days'),
    (v_run_id, 'send_interview_email',        'email_sent', 'Interview confirmation + tips sent.', v_now - interval '4 days' + interval '3 minutes');

  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('interview', 'Dr. Carlos Reyes', 'carlos.reyes@example.com', 'Cleveland Clinic Abu Dhabi', 'send_interview_email', 'active', v_now - interval '40 minutes', v_now - interval '40 minutes', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message) values
    (v_run_id, 'trigger_interview_confirmed', 'entered', 'Interview confirmed for tomorrow 14:00 GST.');

  -- ── Relocation ────────────────────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('relocation', 'Dr. Priya Menon', 'priya.menon@example.com', 'King Faisal Hospital, Riyadh', 'send_attestation_email', 'active', v_now - interval '1 day', v_now - interval '1 hour', '{"seed": true, "city": "Riyadh"}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_offer_signed',    'entered',    'BoldSign signed event received.', v_now - interval '1 day'),
    (v_run_id, 'select_city_guide',       'entered',    'City = Riyadh. Selected guide: relocation-riyadh-v3.pdf.', v_now - interval '1 day' + interval '1 minute'),
    (v_run_id, 'send_relocation_email',   'email_sent', 'Riyadh relocation guide emailed.', v_now - interval '1 day' + interval '2 minutes'),
    (v_run_id, 'send_attestation_email',  'entered',    'Queued. Sending in 1 min.', v_now - interval '1 hour');

  insert into public.automation_flow_runs (flow_key, doctor_name, hospital, current_stage, status, started_at, last_event_at, completed_at, metadata)
  values ('relocation', 'Dr. Lena Schmidt', 'Saudi German Hospital Dubai', 'relocation_complete', 'completed', v_now - interval '14 days', v_now - interval '14 days', v_now - interval '14 days', '{"seed": true, "city": "Dubai"}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message) values
    (v_run_id, 'relocation_complete', 'completed', 'Relocation pack delivered.');

  -- ── Second Payment ────────────────────────────────────────────────────────
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('second_payment', 'Dr. Lena Schmidt', 'lena.schmidt@example.com', 'Saudi German Hospital Dubai', 'reminder_25_working', 'active', v_now - interval '20 days', v_now - interval '2 days', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_15_days',   'entered',       '15 days post-join reached.', v_now - interval '20 days'),
    (v_run_id, 'send_invoice',      'email_sent',    'Second invoice + payment link sent.', v_now - interval '20 days' + interval '1 minute'),
    (v_run_id, 'reminder_25_working','reminder_sent','25-working-day reminder sent.', v_now - interval '2 days');

  insert into public.automation_flow_runs (flow_key, doctor_name, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('second_payment', 'Dr. Omar Farah', 'King Faisal Hospital, Jeddah', 'reminder_weekly', 'active', v_now - interval '60 days', v_now - interval '5 days', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'send_invoice',         'email_sent',    'Initial invoice.', v_now - interval '60 days'),
    (v_run_id, 'reminder_25_working',  'reminder_sent', '25-day reminder.', v_now - interval '35 days'),
    (v_run_id, 'reminder_day_before',  'reminder_sent', 'Day-before-due reminder.', v_now - interval '20 days'),
    (v_run_id, 'reminder_weekly',      'reminder_sent', 'Weekly reminder #1 (post-due).', v_now - interval '12 days'),
    (v_run_id, 'reminder_weekly',      'reminder_sent', 'Weekly reminder #2 (post-due).', v_now - interval '5 days'),
    (v_run_id, 'reminder_weekly',      'note',          'Escalated to finance team. Mitchell will call hospital tomorrow.', v_now - interval '4 days');
end $$;

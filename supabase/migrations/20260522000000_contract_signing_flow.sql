-- Contract Signing flow — bridges Interview (Flow 4) and Relocation (Flow 6).
-- Today the contract envelope is sent via BoldSign from the Contract Builder
-- page; this migration adds the flow config so those sends become visible in
-- the Automations timeline. The boldsign-send + boldsign-webhook edge
-- functions will be updated separately to write into automation_flow_runs /
-- automation_flow_events for each envelope they create or update.

insert into public.automation_flow_configs (flow_key, name, description) values
  ('contract_signing', 'Contract Signing',
   'Hospital extends offer → Contract Builder generates the Service Agreement → BoldSign emails the doctor → contract gets signed. On signing, Zoho updates automatically (Lead_Status → Closed Won, DoB contact created) and the Relocation flow auto-fires.')
on conflict (flow_key) do nothing;

-- Demo seed data so the new tab isn't empty before real BoldSign envelopes
-- start writing here. Marked metadata.seed = true for easy cleanup:
--   DELETE FROM automation_flow_runs WHERE flow_key='contract_signing' AND metadata->>'seed'='true';

do $$
declare
  v_now    timestamptz := now();
  v_run_id uuid;
begin
  -- Mid-flow: doctor opened envelope but hasn't signed yet
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('contract_signing', 'Dr. Priya Menon', 'priya.menon@example.com', 'King Faisal Hospital, Riyadh', 'awaiting_signature', 'active', v_now - interval '2 days', v_now - interval '6 hours', '{"seed": true, "boldsign_envelope_id": "demo-env-priya-001"}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_offer_extended', 'entered',    'KFH confirmed they want to offer Dr. Priya.', v_now - interval '2 days'),
    (v_run_id, 'send_contract',          'email_sent', 'BoldSign envelope created and emailed.',    v_now - interval '2 days' + interval '15 minutes'),
    (v_run_id, 'awaiting_view',          'entered',    'BoldSign: delivered.',                       v_now - interval '2 days' + interval '20 minutes'),
    (v_run_id, 'awaiting_signature',     'entered',    'BoldSign: doctor opened the envelope.',     v_now - interval '6 hours');

  -- Almost-signed: just signed, terminal stage
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, completed_at, metadata)
  values ('contract_signing', 'Dr. Lena Schmidt', 'lena.schmidt@example.com', 'Saudi German Hospital Dubai', 'contract_signed', 'completed', v_now - interval '16 days', v_now - interval '14 days', v_now - interval '14 days', '{"seed": true, "boldsign_envelope_id": "demo-env-lena-001"}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message, occurred_at) values
    (v_run_id, 'trigger_offer_extended', 'entered',    'SGH extended offer.',                       v_now - interval '16 days'),
    (v_run_id, 'send_contract',          'email_sent', 'BoldSign envelope sent.',                   v_now - interval '16 days' + interval '5 minutes'),
    (v_run_id, 'contract_signed',        'completed',  'Doctor signed. Zoho Lead_Status flipped to Closed Won.', v_now - interval '14 days');

  -- Brand new: just initiated, contract still being prepared
  insert into public.automation_flow_runs (flow_key, doctor_name, doctor_email, hospital, current_stage, status, started_at, last_event_at, metadata)
  values ('contract_signing', 'Dr. Yusuf Mahmoud', 'yusuf.m@example.com', 'Mediclinic City Hospital', 'send_contract', 'active', v_now - interval '30 minutes', v_now - interval '30 minutes', '{"seed": true}')
  returning id into v_run_id;
  insert into public.automation_flow_events (run_id, stage_key, event_type, message) values
    (v_run_id, 'trigger_offer_extended', 'entered', 'Mediclinic offered Dr. Yusuf. Contract Builder opened.');
end $$;

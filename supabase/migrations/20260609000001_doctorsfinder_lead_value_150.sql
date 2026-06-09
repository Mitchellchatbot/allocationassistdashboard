-- Correct the DoctorsFinder lead value: $750 → $150 (15 000 cents).
-- It was backfilled to 75 000 in 20260605000000; the real per-lead value
-- for the DoctorsFinder inquiry form is $150. Drives the "Revenue from this
-- form" tile on Forms + the paid-lead pinning in My Workspace.

update public.forms
   set lead_value_cents = 15000
 where (name ilike '%doctorsfinder%' or name ilike '%doctors finder%');

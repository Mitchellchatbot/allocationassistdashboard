-- Remove the three auto-CC addresses Amir flagged on "Test SimplySolved Hospital".
-- test@hospital.ae (fake, bounced), plus ashraf.annas@allocationassist.com and
-- mile.yu@simplysolved.com. Verified (2026-08-06) that all three appeared ONLY in
-- this one hospital's cc_emails and nowhere as a primary_recruiter_email — so this
-- touches no real hospital. Idempotent: strips them wherever they still appear.
update hospitals
set cc_emails = coalesce(
  array(
    select e
    from unnest(cc_emails) e
    where lower(trim(e)) not in (
      'test@hospital.ae',
      'ashraf.annas@allocationassist.com',
      'mile.yu@simplysolved.com'
    )
  ),
  '{}'::text[]
)
where cc_emails && array[
  'test@hospital.ae',
  'ashraf.annas@allocationassist.com',
  'mile.yu@simplysolved.com'
]::text[];

-- Batch "header mode" — the Top-15 (and any) batch can frame its subject two
-- ways (Hasan, meeting 2026-07-20):
--   'recap'     → "This weeks available doctors - Allocation Assist Platform - Excited to work in <city>"
--   'specialty' → "<Specialty> available - Allocation Assist Platform - Excited to work in <city>"
-- <city> is the recipient hospital's city (each hospital gets its own subject).
-- NULL keeps the legacy template subject ("Available <specialty> — Allocation Assist").

alter table public.scheduled_batch_sends
  add column if not exists header_mode text
    check (header_mode is null or header_mode in ('recap', 'specialty'));

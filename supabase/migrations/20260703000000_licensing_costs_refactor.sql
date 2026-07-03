-- Refactor doctor_licensing_costs so it can hold IMPORTED licensing-team rows,
-- including ones whose "Customer Name" couldn't be matched to a doctor yet.
--
-- Before: one row per doctor (doctor_id NOT NULL, manual entry only).
-- After:  doctor_id is nullable — an unmatched import row sits here with
--         doctor_id = NULL and status = 'unmatched' until a human assigns it,
--         at which point doctor_id is set and status flips to 'matched'. Matched
--         rows keep flowing into the existing per-doctor ledger (LicensingSpend
--         on Doctors → Overview) exactly as before.
--
-- Backward compatible: existing manual rows keep doctor_id set and default to
-- source='manual', status='matched'.

alter table public.doctor_licensing_costs
  alter column doctor_id drop not null,
  add column if not exists customer_name_raw text,   -- original CSV "Customer Name" (audit + re-matching)
  add column if not exists officer            text,   -- licensing officer who paid
  add column if not exists other_currency     text,   -- raw "400 QAR" / "280 USD" when the AED amount was blank
  add column if not exists card_used          text,   -- ADCB FAZEE / WIO Plinky / Ramous FAB 0720
  add column if not exists source             text not null default 'manual',  -- 'manual' | 'csv_import'
  add column if not exists import_batch_id    uuid,   -- groups one uploaded file's rows
  add column if not exists status             text not null default 'matched', -- 'matched' | 'unmatched'
  add column if not exists match_confidence   text;   -- 'exact' | 'all-input-tokens' | 'all-candidate-tokens' | null

-- Fast lookup of the reconciliation queue (rows still needing a doctor).
create index if not exists doctor_licensing_costs_unmatched_idx
  on public.doctor_licensing_costs (status)
  where doctor_id is null;

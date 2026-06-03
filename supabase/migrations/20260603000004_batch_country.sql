-- Country-scoped batches (Ammar 2026-06-03)
--
-- Each daily batch should hit ONE country's hospitals, not all 95 globally
-- ("we sent two profiles to UAE and other two profiles to KSA and other
-- two to Qatar... so each country has different profiles every day").
--
-- A null country = legacy/all-countries behaviour, kept so existing rows
-- and one-off broadcasts still work. Going forward the picker will require
-- the user to choose a country at create time.

alter table public.scheduled_batch_sends
  add column if not exists country text;

create index if not exists scheduled_batch_sends_country_idx
  on public.scheduled_batch_sends (country)
  where country is not null;

comment on column public.scheduled_batch_sends.country is
  'ISO-or-display country name (UAE / Saudi Arabia / Qatar / Oman / etc.). When set, send-batch filters hospitals to those whose country matches. Null = all hospitals (legacy).';

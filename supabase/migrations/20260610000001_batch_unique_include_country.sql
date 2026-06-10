-- Batch creation "Create failed": the live-row unique index never learned
-- about the country column.
--
-- 20260525000002 created the index on (kind, scheduled_for, coalesce(specialty,'')),
-- then 20260603000004 added the `country` column for country-scoped batches
-- ("one batch per country per day") but DID NOT update the index. So a second
-- batch of the same kind+date for a DIFFERENT country (e.g. UAE already exists,
-- now Kuwait) violates the unique constraint — even though the app correctly
-- treats them as distinct. Rebuild the index to include country.

drop index if exists scheduled_batch_sends_kind_date_specialty_unique;

create unique index if not exists scheduled_batch_sends_kind_date_specialty_country_unique
  on public.scheduled_batch_sends (kind, scheduled_for, coalesce(specialty, ''), coalesce(country, ''))
  where status <> 'cancelled';

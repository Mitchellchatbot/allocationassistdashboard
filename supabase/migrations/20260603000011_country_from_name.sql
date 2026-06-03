-- Backfill hospital city + country from the `name` field (Ammar
-- 2026-06-03 follow-up).
--
-- The C1 city → country mapping only fixed rows whose `city` was
-- already populated. 60 hospitals had NULL city AND NULL country, so
-- nothing matched. Most of them carry the city as a substring of their
-- name ("Burjeel Royal Hospital, Abu Dhabi" / "King Faisal Specialist
-- Hospital, Riyadh" / etc).
--
-- This migration scans the name for known emirate / city keywords and
-- sets BOTH city and country in one pass when found. Order matters —
-- check more-specific city names first so "Al Ain" doesn't get caught
-- by a broader "Ain" match.

-- Helper: applies city + country only if BOTH are currently null,
-- using a case-insensitive substring match on the name.
do $$
declare
  row_count int;
begin
  -- UAE emirates (specific → general)
  update public.hospitals set city = 'Abu Dhabi', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%abu dhabi%';
  get diagnostics row_count = row_count; raise notice '[backfill] Abu Dhabi: % rows', row_count;

  update public.hospitals set city = 'Al Ain', country = 'UAE'
    where (city is null or country is null) and (lower(name) like '%al ain%' or lower(name) like '%al-ain%');
  get diagnostics row_count = row_count; raise notice '[backfill] Al Ain: % rows', row_count;

  update public.hospitals set city = 'Ras Al Khaimah', country = 'UAE'
    where (city is null or country is null) and (lower(name) like '%ras al khaimah%' or lower(name) like '%ras al-khaimah%' or lower(name) like '%ras-al-khaimah%' or lower(name) like '% rak %' or lower(name) like '% rak,%');
  get diagnostics row_count = row_count; raise notice '[backfill] RAK: % rows', row_count;

  update public.hospitals set city = 'Umm Al Quwain', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%umm al quwain%';
  get diagnostics row_count = row_count; raise notice '[backfill] UAQ: % rows', row_count;

  update public.hospitals set city = 'Sharjah', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%sharjah%';
  get diagnostics row_count = row_count; raise notice '[backfill] Sharjah: % rows', row_count;

  update public.hospitals set city = 'Ajman', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%ajman%';
  get diagnostics row_count = row_count; raise notice '[backfill] Ajman: % rows', row_count;

  update public.hospitals set city = 'Fujairah', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%fujairah%';
  get diagnostics row_count = row_count; raise notice '[backfill] Fujairah: % rows', row_count;

  update public.hospitals set city = 'Dubai', country = 'UAE'
    where (city is null or country is null) and lower(name) like '%dubai%';
  get diagnostics row_count = row_count; raise notice '[backfill] Dubai: % rows', row_count;

  -- Saudi Arabia (specific cities)
  update public.hospitals set city = 'Riyadh', country = 'Saudi Arabia'
    where (city is null or country is null) and lower(name) like '%riyadh%';
  get diagnostics row_count = row_count; raise notice '[backfill] Riyadh: % rows', row_count;

  update public.hospitals set city = 'Jeddah', country = 'Saudi Arabia'
    where (city is null or country is null) and (lower(name) like '%jeddah%' or lower(name) like '%jiddah%');
  get diagnostics row_count = row_count; raise notice '[backfill] Jeddah: % rows', row_count;

  update public.hospitals set city = 'Dammam', country = 'Saudi Arabia'
    where (city is null or country is null) and lower(name) like '%dammam%';
  get diagnostics row_count = row_count; raise notice '[backfill] Dammam: % rows', row_count;

  update public.hospitals set city = 'Khobar', country = 'Saudi Arabia'
    where (city is null or country is null) and (lower(name) like '%khobar%' or lower(name) like '%al khobar%');
  get diagnostics row_count = row_count; raise notice '[backfill] Khobar: % rows', row_count;

  update public.hospitals set city = 'Mecca', country = 'Saudi Arabia'
    where (city is null or country is null) and (lower(name) like '%mecca%' or lower(name) like '%makkah%');
  get diagnostics row_count = row_count; raise notice '[backfill] Mecca: % rows', row_count;

  update public.hospitals set city = 'Medina', country = 'Saudi Arabia'
    where (city is null or country is null) and (lower(name) like '%medina%' or lower(name) like '%madinah%');
  get diagnostics row_count = row_count; raise notice '[backfill] Medina: % rows', row_count;

  -- Qatar
  update public.hospitals set city = 'Doha', country = 'Qatar'
    where (city is null or country is null) and lower(name) like '%doha%';
  get diagnostics row_count = row_count; raise notice '[backfill] Doha: % rows', row_count;

  -- Oman
  update public.hospitals set city = 'Muscat', country = 'Oman'
    where (city is null or country is null) and lower(name) like '%muscat%';
  get diagnostics row_count = row_count; raise notice '[backfill] Muscat: % rows', row_count;

  update public.hospitals set city = 'Salalah', country = 'Oman'
    where (city is null or country is null) and lower(name) like '%salalah%';
  get diagnostics row_count = row_count; raise notice '[backfill] Salalah: % rows', row_count;

  update public.hospitals set city = 'Sohar', country = 'Oman'
    where (city is null or country is null) and lower(name) like '%sohar%';
  get diagnostics row_count = row_count; raise notice '[backfill] Sohar: % rows', row_count;

  -- Kuwait + Bahrain
  update public.hospitals set city = 'Kuwait City', country = 'Kuwait'
    where (city is null or country is null) and (lower(name) like '%kuwait city%' or lower(name) like '%kuwait,%' or lower(name) like '% kuwait %' or lower(name) like '%kuwait '  );
  get diagnostics row_count = row_count; raise notice '[backfill] Kuwait: % rows', row_count;

  update public.hospitals set city = 'Manama', country = 'Bahrain'
    where (city is null or country is null) and lower(name) like '%manama%';
  get diagnostics row_count = row_count; raise notice '[backfill] Manama: % rows', row_count;

  -- Country-only fallback when no city keyword landed but the name
  -- still carries the country.
  update public.hospitals set country = 'UAE'
    where country is null and (lower(name) like '%uae%' or lower(name) like '%u.a.e%' or lower(name) like '%emirates%');
  get diagnostics row_count = row_count; raise notice '[backfill] UAE fallback: % rows', row_count;

  update public.hospitals set country = 'Saudi Arabia'
    where country is null and (lower(name) like '%saudi%' or lower(name) like '% ksa %' or lower(name) like '%ksa,%' or lower(name) like '% ksa');
  get diagnostics row_count = row_count; raise notice '[backfill] KSA fallback: % rows', row_count;

  update public.hospitals set country = 'Qatar'
    where country is null and lower(name) like '%qatar%';
  get diagnostics row_count = row_count; raise notice '[backfill] Qatar fallback: % rows', row_count;

  update public.hospitals set country = 'Oman'
    where country is null and lower(name) like '%oman%';
  get diagnostics row_count = row_count; raise notice '[backfill] Oman fallback: % rows', row_count;

  update public.hospitals set country = 'Bahrain'
    where country is null and lower(name) like '%bahrain%';
  get diagnostics row_count = row_count; raise notice '[backfill] Bahrain fallback: % rows', row_count;

  -- Final tally
  declare unmapped_count int;
  begin
    select count(*) into unmapped_count from public.hospitals where country is null;
    raise notice '[backfill] DONE — % hospitals still unmapped', unmapped_count;
  end;
end $$;

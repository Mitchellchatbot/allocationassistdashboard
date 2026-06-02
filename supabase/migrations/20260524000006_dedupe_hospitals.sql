-- Dedupe hospitals + add unique constraint on name.
-- The original hospitals seed (20260522000001_hospitals_and_templates.sql) ran
-- twice during the timestamp-collision episode, leaving duplicate rows. There
-- was no UNIQUE constraint to prevent that.
--
-- Strategy:
--   1. Pick the canonical row per (name, city) — the OLDEST one (lowest id timestamp)
--   2. Update any references on automation_flow_runs.metadata->>'hospital_id'
--      that point at duplicates → make them point at the canonical row instead
--   3. Delete the duplicate rows
--   4. Add a unique constraint so future inserts can't collide

-- Step 1 + 2: Identify dupes (keep oldest), repoint flow_run metadata
with ranked as (
  select id, name, city, created_at,
         row_number() over (partition by name, coalesce(city,'') order by created_at asc) as rn
  from public.hospitals
),
dupes as (
  select id from ranked where rn > 1
),
canonical as (
  -- For each (name, city), the canonical id is the oldest
  select name, coalesce(city,'') as city, min(created_at) as min_created
  from public.hospitals
  group by name, coalesce(city,'')
),
remap as (
  -- Map: every dupe id → its canonical id
  select d.id as old_id, c.id as new_id
  from public.hospitals d
  join ranked r on r.id = d.id and r.rn > 1
  join public.hospitals c on c.name = d.name
                          and coalesce(c.city,'') = coalesce(d.city,'')
                          and c.created_at = (
                            select min(created_at) from public.hospitals
                            where name = d.name and coalesce(city,'') = coalesce(d.city,'')
                          )
)
update public.automation_flow_runs r
set metadata = jsonb_set(
  r.metadata,
  '{hospital_id}',
  to_jsonb((select new_id::text from remap where remap.old_id::text = r.metadata->>'hospital_id'))
)
where r.metadata->>'hospital_id' in (select old_id::text from remap);

-- Step 3: Delete the dupe rows now that nothing references them
with ranked as (
  select id, row_number() over (partition by name, coalesce(city,'') order by created_at asc) as rn
  from public.hospitals
)
delete from public.hospitals where id in (select id from ranked where rn > 1);

-- Step 4: Prevent future duplicates
alter table public.hospitals
  drop constraint if exists hospitals_name_city_unique;
alter table public.hospitals
  add constraint hospitals_name_city_unique unique (name, city);

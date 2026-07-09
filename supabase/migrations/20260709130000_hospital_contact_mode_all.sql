-- Add an 'all' contact_mode: send to EVERY eligible (checked) contact of the
-- hospital at once, all in the TO field, instead of one primary/cycle recipient.
-- Drop the existing inline check (auto-named) by looking it up, then re-add with
-- 'all' included.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.hospitals'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%contact_mode%';
  if cname is not null then
    execute format('alter table public.hospitals drop constraint %I', cname);
  end if;
end $$;

alter table public.hospitals
  add constraint hospitals_contact_mode_check
  check (contact_mode in ('primary', 'cycle', 'all'));

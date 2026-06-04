-- One-shot read-only probe. No schema changes. Logs hospitals + vacancies
-- counts + source breakdown so we can see what's real vs seeded.

do $$
declare
  hospital_count int;
  vacancy_count  int;
  r record;
begin
  select count(*) into hospital_count from public.hospitals;
  select count(*) into vacancy_count  from public.vacancies;
  raise notice '[probe] hospitals: %, vacancies: %', hospital_count, vacancy_count;

  raise notice '── hospitals by country ──';
  for r in
    select coalesce(country, '(no country)') as c, count(*) as n
    from public.hospitals group by c order by n desc
  loop
    raise notice '[probe]   % => %', r.c, r.n;
  end loop;

  raise notice '── hospitals notes tagging (seed vs real) ──';
  for r in
    select case
      when notes ilike '%seed%' then 'seed'
      when notes is null then 'no notes'
      else 'has notes'
    end as bucket, count(*) as n
    from public.hospitals group by bucket order by n desc
  loop
    raise notice '[probe]   % => %', r.bucket, r.n;
  end loop;

  raise notice '── vacancies by status ──';
  for r in
    select coalesce(status, '(no status)') as s, count(*) as n
    from public.vacancies group by s order by n desc
  loop
    raise notice '[probe]   % => %', r.s, r.n;
  end loop;

  raise notice '── vacancies recent (last 5) ──';
  for r in
    select hospital_name, specialty, priority, opened_at
    from public.vacancies
    order by created_at desc nulls last
    limit 5
  loop
    raise notice '[probe]   % | % | % | %', r.hospital_name, r.specialty, r.priority, r.opened_at;
  end loop;
end $$;

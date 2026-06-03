-- Normalise hospital.country values so the country-scoped batch
-- picker doesn't treat 'KSA' and 'Saudi Arabia' as separate countries
-- (post-backfill probe showed 35 hospitals marked 'KSA' which doesn't
-- match the picker's 'Saudi Arabia' option).

update public.hospitals set country = 'Saudi Arabia' where country in ('KSA', 'ksa', 'K.S.A.', 'Kingdom of Saudi Arabia');
update public.hospitals set country = 'UAE'          where country in ('United Arab Emirates', 'U.A.E.', 'u.a.e.', 'uae');
update public.hospitals set country = 'Qatar'        where country in ('QA', 'qa', 'qatar');
update public.hospitals set country = 'Oman'         where country in ('OM', 'om', 'Sultanate of Oman', 'oman');
update public.hospitals set country = 'Kuwait'       where country in ('KW', 'kw', 'State of Kuwait', 'kuwait');
update public.hospitals set country = 'Bahrain'      where country in ('BH', 'bh', 'Kingdom of Bahrain', 'bahrain');

do $$
declare row record;
begin
  raise notice '── post-normalise breakdown ──';
  for row in
    select coalesce(country, '(no country)') as c, count(*) as n
    from public.hospitals group by c order by n desc
  loop
    raise notice '[normalise]   % => %', row.c, row.n;
  end loop;
end $$;

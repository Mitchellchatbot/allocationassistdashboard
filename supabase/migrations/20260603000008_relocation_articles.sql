-- Per-emirate relocation guide URLs (Ammar 2026-06-03).
--
-- Ammar mentioned he forwarded city-specific relocation articles
-- (Dubai, Abu Dhabi, etc.) to Mitchell. Until those exact URLs
-- arrive, this table provides the lookup that send-flow-email can
-- use to set {{guide_link}} based on the run's hospital city.
--
-- Add new rows when Mitchell shares them. Update with placeholder
-- /relocation URLs on the AA website for now — the template body
-- already references {{guide_link}}, so swapping URLs in this table
-- updates every future relocation email without redeploying.

create table if not exists public.relocation_articles (
  city        text primary key,
  country     text,
  url         text not null,
  label       text,
  notes       text,
  updated_at  timestamptz not null default now()
);

insert into public.relocation_articles (city, country, url, label) values
  ('Dubai',          'UAE',          'https://www.allocationassist.com/relocation/dubai',          'Relocating to Dubai · A practical guide'),
  ('Abu Dhabi',      'UAE',          'https://www.allocationassist.com/relocation/abu-dhabi',      'Relocating to Abu Dhabi · A practical guide'),
  ('Sharjah',        'UAE',          'https://www.allocationassist.com/relocation/sharjah',        'Relocating to Sharjah · A practical guide'),
  ('Ras Al Khaimah', 'UAE',          'https://www.allocationassist.com/relocation/ras-al-khaimah', 'Relocating to Ras Al Khaimah · A practical guide'),
  ('Ajman',          'UAE',          'https://www.allocationassist.com/relocation/ajman',          'Relocating to Ajman · A practical guide'),
  ('Fujairah',       'UAE',          'https://www.allocationassist.com/relocation/fujairah',       'Relocating to Fujairah · A practical guide'),
  ('Al Ain',         'UAE',          'https://www.allocationassist.com/relocation/al-ain',         'Relocating to Al Ain · A practical guide'),
  ('Riyadh',         'Saudi Arabia', 'https://www.allocationassist.com/relocation/riyadh',         'Relocating to Riyadh · A practical guide'),
  ('Jeddah',         'Saudi Arabia', 'https://www.allocationassist.com/relocation/jeddah',         'Relocating to Jeddah · A practical guide'),
  ('Dammam',         'Saudi Arabia', 'https://www.allocationassist.com/relocation/dammam',         'Relocating to Dammam · A practical guide'),
  ('Doha',           'Qatar',        'https://www.allocationassist.com/relocation/doha',           'Relocating to Doha · A practical guide')
on conflict (city) do nothing;

alter table public.relocation_articles enable row level security;

drop policy if exists "service role full relocation_articles" on public.relocation_articles;
create policy "service role full relocation_articles"
  on public.relocation_articles
  for all to service_role using (true) with check (true);

drop policy if exists "authenticated read relocation_articles" on public.relocation_articles;
create policy "authenticated read relocation_articles"
  on public.relocation_articles
  for select to authenticated using (true);

comment on table public.relocation_articles is 'City-specific relocation guides (Ammar 2026-06-03). send-flow-email looks up by hospital city to populate {{guide_link}} in relocation_guide template.';

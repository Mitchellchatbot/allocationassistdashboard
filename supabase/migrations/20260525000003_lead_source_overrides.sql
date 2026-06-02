-- Meta attribution fix (separate item from the May 20 plan).
--
-- Yamima from Meta flagged that 9 leads currently tagged Lead_Source="XXX"
-- are actually from Meta campaigns. Rather than hardcode the reattribution,
-- this table holds an override per lead-id so the team can correct any
-- mis-attributed source going forward.
--
-- displaySource() in the client consults this table first and falls back to
-- the existing Lead_Source classifier when no override is set.

create table if not exists public.lead_source_overrides (
  lead_id          text primary key,
  override_source  text not null,
  note             text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists lead_source_overrides_source_idx on public.lead_source_overrides (override_source);

alter table public.lead_source_overrides enable row level security;

drop policy if exists "service role full source_overrides" on public.lead_source_overrides;
drop policy if exists "auth read source_overrides"         on public.lead_source_overrides;
drop policy if exists "auth write source_overrides"        on public.lead_source_overrides;

create policy "service role full source_overrides" on public.lead_source_overrides for all to service_role using (true) with check (true);
create policy "auth read source_overrides"  on public.lead_source_overrides for select to authenticated using (true);
create policy "auth write source_overrides" on public.lead_source_overrides for all    to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.lead_source_overrides;

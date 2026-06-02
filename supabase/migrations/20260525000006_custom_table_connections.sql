-- Connections can now target ANY allowlisted Supabase table, with the
-- column mapping stored on the row. Edge function picks `target_table`,
-- `key_column`, `column_map` when target_kind = 'custom_table'.

alter table public.sheet_connections
  drop constraint if exists sheet_connections_target_kind_check;

alter table public.sheet_connections
  add constraint sheet_connections_target_kind_check
  check (target_kind in (
    'hospitals', 'vacancies', 'unavailable_doctors',
    'placements', 'source_overrides', 'hospital_templates',
    'custom_table'
  ));

alter table public.sheet_connections
  add column if not exists target_table text,
  add column if not exists key_column   text,
  add column if not exists column_map   jsonb;

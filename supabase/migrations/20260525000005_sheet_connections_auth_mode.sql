-- Add an auth mode to sheet_connections so the team can choose between:
--   - "public_csv" (default, backward-compatible): sheet must be shared
--                  "Anyone with the link can view". csv_url is fetched
--                  directly.
--   - "service_account": sheet stays private. Shared only with the GCP
--                  service-account email. The edge function authenticates
--                  via a JWT signed with the SA's private key and uses the
--                  Google Sheets API to fetch values.
--
-- The Sheet ID + tab (gid) are stored explicitly so we can call the Sheets
-- API by ID without re-parsing the URL each tick.

alter table public.sheet_connections
  add column if not exists auth_mode  text not null default 'public_csv'
    check (auth_mode in ('public_csv', 'service_account'));

alter table public.sheet_connections
  add column if not exists sheet_id text;

alter table public.sheet_connections
  add column if not exists tab_gid  text;

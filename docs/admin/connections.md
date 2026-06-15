# Connections

The admin hub for wiring **Google Sheets into the dashboard's tables**. The team
maintains several operational lists in Sheets (hospitals, vacancies, unavailable
doctors, placements, source overrides, hospital email templates); a *connection*
keeps the matching dashboard table in sync on a schedule, so nobody has to
copy-paste CSVs.

> **At a glance**
> - **Who uses it:** admins.
> - **What it's for:** connect a Google Sheet to a table, set how often it pulls,
>   and run/monitor syncs.
> - **Where the data lives:** the `sheet_connections` table; syncs run via the
>   `sheets-sync` edge function; Google access via OAuth (`google_oauth_tokens`).
> - **The big idea:** the Sheet stays the source of truth; the dashboard mirrors it
>   automatically. (See [Data Sources & Sync](../01-data-sources-and-sync.md).)

## What you see

- **A Google connection card** — whether a Google account is linked (and which),
  with Connect/Disconnect.
- **The connections table** — one row per connection: a label, a **target** badge
  (Hospitals / Vacancies / Unavailable doctors / Placements / Source overrides /
  Templates), an auth-mode badge (OAuth / service account / public link), the sync
  cadence ("every 60 min"), the last-synced time, the last result ("5 created · 2
  updated · 1 unmatched"), and any error. Plus **Sync now**, **Pause/Resume**, and
  **Delete**.

## How to use it

1. **Connect Google** — authenticate once via OAuth so the dashboard can read your
   private Sheets/Drive (or use a public link-shared sheet instead).
2. **New connection** — give it a label, paste the Sheet URL (or pick from Drive),
   choose the **destination table**, set the cadence, and **Test parse** to dry-run
   it (it shows "would create X, update Y, Z unmatched") before saving.
3. **Sync now** — pull immediately; the row updates with the result.
4. **Pause / Resume** — stop a connection's auto-sync without deleting it (handy
   when a sheet's format is mid-fix).
5. **Watch for errors** — a red error badge + message on the row tells you a sync
   failed and why; fix the sheet and Sync now.

## How it works

- Each connection is a row in **`sheet_connections`** (label, sheet URL normalised
  to a CSV-export URL, `target_kind`, auth mode, `schedule_minutes`,
  `last_synced_at`, `last_summary`, `last_error`).
- **`sheets-sync`** (the edge function) does the work: it fetches the sheet (via
  OAuth, a service account, or the public CSV), parses it, and routes the rows to a
  **target-specific parser**:
  - *Hospitals* → upsert by name,
  - *Vacancies* → insert (handles both a flat layout and the team's nested
    section-header layout),
  - *Unavailable doctors* → update `doctor_lifecycle` (fuzzy-matching names to Zoho),
  - *Placements* → set milestone dates on `doctor_lifecycle`,
  - *Source overrides* → `lead_source_overrides`,
  - *Templates* → `email_templates` linked to a hospital.
- It stamps the connection with the result (or the error) so the row reflects
  reality.
- **Auto-sync:** the `tick-scheduler` periodically picks up active connections whose
  `schedule_minutes` is due and invokes `sheets-sync` — so each connection runs on
  its own cadence. Paused connections are skipped.
- **Auth:** OAuth tokens live server-side in `google_oauth_tokens` (never sent to
  the browser); the edge function mints short-lived access tokens to read Drive/
  Sheets.

## Reading a connection's health

Each row tells you everything at a glance:

- **Last synced** — how stale the mirror is; if it's older than the cadence, a sync
  may be failing or paused.
- **Last result** — "X created · Y updated · Z unmatched". *Unmatched* means rows in
  the sheet that couldn't be tied to an existing record (most common on Unavailable
  doctors / Placements, where a doctor name didn't match Zoho) — fix the name in
  the sheet and Sync now.
- **Error badge** — the sync threw; the message (truncated on the row) says why
  (e.g. the sheet isn't shared, a column is missing, or the tab moved). The
  connection keeps its last good data until the next successful sync.

## Auth modes

- **OAuth (recommended)** — reads your *private* Sheets and Excel files in Drive;
  authenticate once and the server holds the refresh token.
- **Service account** — for sheets shared with a GCP service identity.
- **Public link** — simplest: a link-shared sheet's CSV export, no auth, but the
  sheet is world-readable.

## Why it's built this way

- **Sheets as the editing surface** — the team is fast and comfortable in Google
  Sheets, and several of these lists change constantly. Rather than rebuild that
  editing experience, the dashboard ingests the sheets on a schedule.
- **One connection per sheet→table** — explicit targets (with purpose-built
  parsers) handle the team's real, messy sheet formats and keep each feed
  independent.
- **Per-connection cadence + pause** — some feeds want hourly, some rarely; pausing
  lets you stop a misbehaving feed without losing its config.
- **Test-parse before commit + visible last-sync/error** — syncs touch core tables,
  so admins get a dry-run and at-a-glance health on every row.
- **Admin-only** — these connections write to shared operational tables, so the
  page sits behind the admin gate.

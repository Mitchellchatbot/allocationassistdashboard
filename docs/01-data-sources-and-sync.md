# 01 — Data Sources & Sync

This is the map behind every "where does this come from?" question in the rest of
the docs. The dashboard's own Postgres database (in Supabase) is the hub, but most
of what it shows originates in an external system and is **synced in**. This page
covers every source, the table it lands in, the edge function that moves it, and
how/when the refresh happens.

A mental model first: the dashboard is a **system of engagement** sitting over
several **systems of record**. For each kind of data there is exactly one place
that "owns" it (where you go to change it permanently) and the dashboard either
mirrors it (read-only-ish) or acts as a controlled write-back path. Getting this
right saves a lot of confusion — e.g. editing a doctor's specialty in the
dashboard's profile editor writes *back to WordPress*, because WordPress owns it;
editing a lead's status happens in Zoho, because Zoho owns leads.

## The hub: Supabase

Supabase is four things in one and everything routes through it:

- **Postgres** — the operational database, ~28 core tables. Some tables are
  *mirrors* of an external source (e.g. `zoho_cache`, `wordpress_candidates`),
  some are *owned here* because no other system has them (e.g.
  `automation_flow_runs`, `notifications`, `email_templates`,
  `placement_attempts`). The "owned here" tables are the genuinely new value the
  dashboard adds.
- **Edge Functions** — ~43 Deno programs under `supabase/functions/`. They are the
  only things that talk to external APIs with secrets, so all syncing, sending,
  and AI work happens here, never in the browser.
- **Storage** — public buckets: `email-assets` (the logo + the profile-card
  icons), `relocation-guides` (per-city PDF packs), and candidate photos/CVs.
- **Auth** — login and user identity, joined to the `user_profiles` table (which
  carries each person's role, page access, and Slack handle).

External jobs don't run themselves: an **n8n** instance calls the sync functions
on a schedule (e.g. Zoho hourly), and Postgres **pg_cron** calls `tick-scheduler`
every ~5 minutes to advance time-based automation stages. Several functions can
also be triggered on demand from the UI (e.g. "Sync now" buttons).

## Zoho CRM → leads

- **Owns:** leads and contacts (prospective and signed doctors/hospitals).
- **Function:** `zoho-sync` pulls everything from Zoho CRM into the `zoho_cache`
  table; `zoho-proxy` makes live authenticated calls when fresh data is needed.
- **Refresh:** `zoho-sync` is meant to run hourly (triggered by n8n) after a
  one-time full populate. Auth uses `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN` secrets.
- **Why cached:** Zoho's API is rate-limited and slow to page through; caching the
  whole dataset locally makes the Sales screens instant and lets the dashboard do
  things Zoho can't (vector search, joins against vacancies, embeddings).
- **Derived data:** `embed-leads` reads `zoho_cache`, turns each lead into a text
  blob, generates OpenAI embeddings in batches, and upserts them into
  `lead_embeddings`. That powers `match_leads()` vector search (used to match
  doctors to vacancies). It's incremental — already-embedded leads are skipped.

## WordPress site → doctor profiles

- **Owns:** the canonical public doctor profile — photo, job title, specialty,
  sub-specialty, area of interest, languages, license status, CV, etc. These live
  as a "candidate" **Custom Post Type** with **ACF** (Advanced Custom Fields) on
  the AA WordPress site.
- **Function in:** `wordpress-candidates-sync` pulls the candidate CPT into the
  `wordpress_candidates` table (resolving the profile photo from a media ID to a
  real URL along the way).
- **Functions out (write-back):** `wordpress-candidate-upsert` (create/edit a
  profile), `wordpress-candidate-upload-photo`, `wordpress-candidate-upload-cv`,
  `wordpress-candidate-delete`, and `wordpress-candidates-link` (link a dashboard
  doctor id to a WP record). The dashboard's profile editor is a friendly front
  end over these — when you save, it writes to WordPress and re-mirrors.
- **Why WP is the source of truth:** the public website already renders these
  profiles for the world, so the profile must live there; the dashboard mirrors a
  copy for speed and for matching/sending, but the website is authoritative. This
  is why the introduction email and the dashboard's profile card pull from
  `wordpress_candidates` and why "View full profile" links to a tokenised page
  rather than the (login-walled) WP profile.

## Typeform & JotForm → doctor intake

- **Owns:** the raw doctor-intake submissions (the questionnaire a new doctor
  fills in).
- **Functions:** `typeform-webhook` and `jotform-webhook` receive submissions in
  real time (each form's webhook is wired to the corresponding endpoint). They
  write the raw submission to `form_responses` and build a
  `staged_doctor_profiles` row — a draft profile that the team reviews and then
  publishes to WordPress. `jotform-webhook` was specifically built to replace the
  old manual copy-from-JotForm-into-WordPress step.
- **Backfill:** `typeform-historical-sync` and `jotform-historical-sync` import
  past submissions. `typeform-file-proxy` and `jotform-file-proxy` serve uploaded
  files (CVs, certificates) that would otherwise be behind the form vendor's auth.
- **CV handling:** uploaded CVs land in `cv_uploads`; `cv-extract` uses AI to pull
  structured fields out of the document to pre-fill the staged profile.
- **Why staged first:** intake data is messy and human; staging lets the team
  clean/verify before it becomes a public WordPress profile. The forms feed the
  Forms screen (Growth) and the doctor-creation pipeline.

## Google Sheets & Drive → hospitals, vacancies, expenses

- **Owns:** several operational lists the team maintains in spreadsheets.
- **Function:** `sheets-sync` pulls a published Google Sheet as CSV and writes its
  rows into whichever AA table the **connection** targets — `hospitals`,
  `vacancies`, unavailable doctors, `placement_attempts`, `lead_source_overrides`,
  or hospital templates. Which sheet maps to which table is configured in
  `sheet_connections` (managed on the **Connections** admin screen).
- **Marketing expenses:** `sheets-ingest` is a sibling that receives raw 2D cell
  arrays from n8n (which reads the Digital Marketing sheet) and upserts parsed rows
  into `marketing_expenses` — one POST per tab. This feeds the Finance/Marketing
  spend numbers.
- **Drive:** `drive-list-files` lists Drive files (used where the team keeps shared
  documents); `google-oauth-callback` + `google_oauth_tokens` hold the Google auth
  needed for Drive/Sheets access.
- **Why sheets:** these lists change constantly and non-technical staff already
  maintain them in Sheets; rather than rebuild that editing experience, the
  dashboard ingests the sheets on a schedule. The "Hammad sheet → portal tab"
  decision is an example of pulling a maintained sheet straight into a screen.

## Meta Ads → ad performance (live, not stored)

- **Function:** `meta-ads` calls the Meta Graph API for campaign insights and ad
  creative thumbnails, using a long-lived system-user token
  (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`).
- **Refresh:** fetched live on demand when the Meta Ads screen loads — there's no
  local mirror table, because ad metrics are read-only and always wanted fresh.

## Fathom → call recordings

- **Function:** `fathom-webhook` receives call recordings/transcripts from Fathom
  and stores them in `fathom_calls`. It's a public endpoint authenticated by an
  HMAC-SHA256 signature over the raw body (`FATHOM_WEBHOOK_SECRET`), constant-time
  compared — so no shared bearer token is needed. `fathom-proxy` fetches
  recording media when the Calls screen needs it.

## Resend → email (out and in)

- **Out:** every outbound email (introductions, batch sends, reminders, the
  relocation pack) is sent through Resend by `send-flow-email` and `send-batch`.
- **In:** hospital replies are addressed to `reply-<run_id>@reply.allocationassist.com`;
  Resend receives them and the flow engine matches the `<run_id>` back to the
  originating `automation_flow_runs` row to advance the conversation. Inbound
  classification (is this a yes/interview/decline?) is done by Claude.

## Slack → notifications

- **Function:** the shared `_shared/notify.ts` helper writes every notification to
  the `notifications` table and, for the handful of kinds the team flagged as
  high-signal, also posts a Block Kit message to the Slack webhook
  (`SLACK_WEBHOOK_URL`). Slack carries doctor-intake form completions and
  pipeline milestones (shortlist, interview proposed, contract signed, hospital
  declined); everything else stays in the dashboard bell. See the Notifications &
  Slack systems doc for the full kind catalogue.

## AI providers → the smart bits

- **Anthropic (Claude):** rewriting doctor bios (`rewrite-bio`), summarising area
  of interest (`_shared/summarize.ts`), classifying hospital replies into pipeline
  actions (`classify-hospital-reply`, `stage-from-response`), and extracting CV
  fields (`cv-extract`).
- **OpenAI:** generating the lead embeddings (`embed-leads`) used for vector
  matching.

## Quick reference — table ↔ source

| Table | Source of truth | Synced by | Refresh |
|---|---|---|---|
| `zoho_cache` | Zoho CRM | `zoho-sync` | hourly (n8n) |
| `lead_embeddings` | derived from `zoho_cache` | `embed-leads` | on demand / incremental |
| `wordpress_candidates` | WordPress (candidate CPT) | `wordpress-candidates-sync` (+ upsert/upload write-back) | on demand / scheduled |
| `staged_doctor_profiles`, `form_responses` | Typeform / JotForm | `*-webhook`, `*-historical-sync` | real-time webhook |
| `cv_uploads` | form uploads | webhooks + `cv-extract` | real-time |
| `hospitals`, `vacancies`, `placement_attempts`, `lead_source_overrides`, hospital templates, unavailable doctors | Google Sheets | `sheets-sync` (via `sheet_connections`) | scheduled (n8n) |
| `marketing_expenses` | Digital Marketing sheet | `sheets-ingest` | scheduled (n8n) |
| `fathom_calls` | Fathom | `fathom-webhook` | real-time webhook |
| (live, no table) | Meta Graph API | `meta-ads` | on page load |
| `automation_flow_runs`, `automation_flow_events`, `automation_flow_configs` | **owned here** | the flow engine | live |
| `notifications` | **owned here** | `_shared/notify.ts` | live |
| `email_templates` | **owned here** (edited in-app) | Templates tab / `aa-diag set_template` | live |
| `doctor_lifecycle`, `contract_sends`, `shared_profile_tokens`, `relocation_articles`, `scheduled_batch_sends` | **owned here** | various flow steps | live |
| `user_profiles` | **owned here** (joined to Supabase Auth) | Settings screen | live |

> Tables marked **owned here** are the dashboard's genuine additions — there is no
> external system behind them, so the dashboard is their source of truth.

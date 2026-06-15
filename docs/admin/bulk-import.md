# Bulk Import

The admin tool for loading **master data** in bulk — the structured lists the team
gets from Saif (hospitals, vacancies, doctor availability, placements, and
attribution fixes). You paste a CSV (or upload a spreadsheet), preview it, and
commit; re-running the same data is safe.

> **At a glance**
> - **Who uses it:** admins.
> - **What it's for:** one-shot/periodic bulk loads of structured master data.
> - **Where it writes:** `hospitals`, `vacancies`, `doctor_lifecycle`,
>   `email_templates`, `lead_source_overrides` — directly (no edge function).
> - **Safe to re-run:** imports **upsert by a natural key**, so re-importing
>   updates/skips rather than duplicating.
> - **Sibling page:** [Import Data](import-data.md) is for analytics/activity feeds;
>   this one is for master data. Both are admin-only.

## The six tabs

| Tab | Writes to | Matched/deduped by |
|---|---|---|
| **Hospitals** | `hospitals` | hospital name (and it clears the 14 demo "seed" hospitals first) |
| **Hospital templates** | `email_templates` (+ links the hospital) | template key (hospital must already exist) |
| **Vacancies** | `vacancies` | inserted (stamped with your email as opener) |
| **Unavailable doctors** | `doctor_lifecycle` | `doctor_id` — names fuzzy-matched to Zoho |
| **Placements** | `doctor_lifecycle` | `doctor_id` — backfills signed/joined/approved/paid dates |
| **Source overrides** | `lead_source_overrides` | Zoho lead id (the Meta-attribution fix) |

## How to use it

1. **Pick the tab** for the kind of data you have; each shows a sample of the
   expected columns.
2. **Provide the data** — paste the CSV into the textarea, or upload a `.csv`/
   `.xlsx` (multi-sheet workbooks let you choose the tab).
3. **Preview** — see the first rows parsed and a row count; headers are
   fuzzy-matched (case/space/underscore-insensitive), so "Primary Recruiter Email"
   and `primary_recruiter_email` both work.
4. **Commit import** — runs the upsert; you get a summary ("N created, M updated, K
   skipped").
5. **Fix unmatched rows** — for Unavailable/Placements, names that don't match a
   Zoho doctor are reported; correct them in the sheet and re-import.

## How it works

- **CSV is parsed in the browser** (`parseCsvObjects` + `findHeader` for fuzzy
  columns); XLSX lazy-loads SheetJS so CSV-only users don't pay for it.
- **Writes go straight to Supabase** (no edge function), using **upsert on a
  natural key** so the operation is idempotent:
  - Hospitals upsert by name (and seed placeholders are deleted first so they don't
    linger);
  - `doctor_lifecycle` rows upsert by `doctor_id`;
  - source overrides upsert by lead id.
- **Zoho name-matching** bridges the gap between Saif's sheets (which have *names*)
  and the system's prefixed `doctor_id`s: a matcher indexes the cached Zoho leads +
  Doctors-on-Board, normalises names (strips titles/diacritics/mojibake), and
  matches exact → token-subset; misses are surfaced.
- **Fuzzy dates** are handled for availability ("Aug 2026", or freetext like "Not
  answering" stored as a status note).

## Re-import safety (the dedupe keys)

Because imports upsert on a natural key, running the same file twice is safe — it
updates or skips, never duplicates:

| Tab | Re-import behaviour |
|---|---|
| Hospitals | matched by **name** → updated; the 14 demo seed hospitals are removed on import |
| Vacancies | inserted (no key) — avoid re-pasting the same vacancy file |
| Unavailable / Placements | matched by **doctor_id** → milestone dates updated in place |
| Source overrides | matched by **lead id** → override updated |

## Fuzzy inputs it tolerates

- **Headers** — case, spaces, and underscores are ignored, so export quirks don't
  break the parse; a genuinely missing required column errors clearly.
- **Names** — "Dr." prefixes, accents, and even mojibake are normalised before
  matching to Zoho.
- **Dates** — real dates *and* freetext: "Aug 2026" parses to a date; "Not
  answering" / "later" are kept as a status note on the availability record.

## Why it's built this way

- **Idempotent upserts** — Saif sends refreshed exports regularly; accidentally
  re-importing last week's file should update/skip, never duplicate. Natural-key
  upserts guarantee that.
- **Tabs over one mega-importer** — each master sheet has its own shape and target;
  separate tabs make the destination obvious and let each have purpose-built
  parsing.
- **Name-matching to Zoho** — doctor records live in Zoho with opaque ids, so
  matching by name at import time (and reporting misses) is the practical bridge.
- **Admin-only, direct writes** — these are core operational tables, so the page is
  gated to admins; direct upserts (rather than an edge function) keep it simple for
  a manual, one-at-a-time admin task.

> **Note:** Bulk Import is the *manual* counterpart to [Connections](connections.md)
> — Connections keeps the same kinds of tables in sync automatically from a live
> sheet; Bulk Import is for a one-off paste when you just need to load a file now.

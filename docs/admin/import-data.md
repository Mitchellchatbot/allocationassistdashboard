# Import Data

The admin tool for loading **analytics & activity feeds** from spreadsheets — call
logs, team call sessions, the weekly sales tally, Meta lead exports, and marketing
spend. You drag in a file, it auto-parses the (often messy) format, you preview,
and it batch-imports with a progress bar.

> **At a glance**
> - **Who uses it:** admins.
> - **What it's for:** bulk-load high-volume analytics/activity data from CSV/XLSX.
> - **Where it writes:** `call_log`, `doctor_sessions`, `weekly_sales`, `meta_leads`,
>   `marketing_expenses` — directly (no edge function).
> - **Sibling page:** [Bulk Import](bulk-import.md) handles *master data* (hospitals,
>   vacancies…); this one handles *analytics/activity*. Both admin-only.

## The five tabs

| Tab | Writes to | Feeds |
|---|---|---|
| **Call Log** | `call_log` | the call history shown on doctor rows (Follow-ups, Doctor Progress) |
| **Doctor Sessions** | `doctor_sessions` | the same call-history timeline (team sessions) |
| **Weekly Sales** | `weekly_sales` | the call-quality overlay on [Team Performance](../growth/team-performance.md) |
| **Meta Leads** | `meta_leads` | Meta attribution + cost metrics on [Meta Ads](../growth/meta-ads.md) / [Marketing](../growth/marketing.md) |
| **Marketing Spend** | `marketing_expenses` | spend on [Finance](../growth/finance.md) / Marketing (same table `sheets-ingest` feeds) |

## How to use it

1. **Pick the tab** for your data; each shows the columns it expects.
2. **Drop a file** (drag-and-drop or browse) — `.csv` or `.xlsx`. Multi-sheet
   workbooks use the first sheet.
3. **Preview** — the first rows render so you can sanity-check the parse; an error
   banner appears if the format isn't recognised.
4. **Import** — runs in batches of 200 rows with a live "X / Y" progress bar.
5. **Import another** — when done you get a success card; load the next file.

## How it works

- **Format-specific parsers** handle each source's quirks (these aren't clean
  tables):
  - *Call Log / Doctor Sessions* track a "current date" as they walk the rows
    (dates appear once, then apply to the rows beneath) and detect a status cell by
    keyword.
  - *Weekly Sales* reads a **pivot** — team members as rows (with three sub-rows:
    full call / good call / sale) against date columns.
  - *Meta Leads* finds the Typeform header row and maps columns by keyword, even
    stripping emoji and `{{template}}` junk from the headers.
  - *Marketing Spend* scans the wide "Digital Marketing" layout for repeated "Date"
    headers and reads each category's 3-column group, skipping subtotals.
- **CSV via Papa.parse; XLSX lazy-loads SheetJS** (so CSV-only users don't pay the
  ~700 KB cost).
- **Writes go directly to Supabase** in 200-row batched **upserts**:
  - most tables use `ignoreDuplicates` so re-importing the same file skips rather
    than double-counting;
  - *Meta Leads* upserts on `phone`; *Marketing Spend* upserts on a composite key
    (date + category + amount + description) so the same expense can't be counted
    twice.

## Re-import safety (the dedupe keys)

| Tab | Dedupe |
|---|---|
| Call Log · Doctor Sessions · Weekly Sales | `ignoreDuplicates` (identical rows are skipped) |
| Meta Leads | upsert on **phone** (the same person re-submitting updates their row) |
| Marketing Spend | upsert on **date + category + amount + description** (the same expense can't be double-counted) |

## Things worth knowing

- **The preview is your safety check** — these spreadsheets are irregular, so always
  glance at the first rows before importing; if the columns look wrong, the parser
  misread the layout (usually a moved header row).
- **Big files are fine** — the 200-row batching + progress bar handle thousands of
  rows without timing out.
- **Where the data shows up** — nothing changes on the analytics screens until you
  import; afterwards, Call Log/Sessions appear in doctor call histories, Weekly
  Sales in the Team Performance overlay, Meta Leads in the Meta attribution, and
  Marketing Spend in Finance/Marketing.

## Why it's built this way

- **One tab per source format** — a single importer would need fragile
  format-detection; separate tabs let each have a tailored parser for its real
  export shape.
- **Heuristic parsing over rigid schemas** — these spreadsheets vary (interspersed
  date rows, pivots, emoji headers), so the parsers are forgiving by design; the
  preview lets you catch problems before committing.
- **Batched, idempotent upserts** — big files (1,000s of rows) import efficiently
  with progress feedback, and re-imports are safe (dedupe keys prevent
  double-counting).
- **Admin-only, direct writes** — these tables back reporting; loading them is an
  occasional admin task, so it's gated and kept simple (no edge function).

> **Note:** Marketing Spend here is the *manual* path into `marketing_expenses` —
> the same table the automated `sheets-ingest` job fills from the Digital Marketing
> sheet. Use this when you just need to load a file now; use the scheduled pipeline
> for ongoing sync.

# Forms

The intake desk — every submission from the public forms (Typeform, JotForm,
Elementor) in one place, with the tools to triage them: track outreach, link them
to Zoho, and turn a doctor's intake into a draft profile. The same screen is
embedded as the **Responses** tab inside Doctors (showing only the doctor-intake
forms).

> **At a glance**
> - **Who uses it:** the sales/intake team (and HI, for doctor intake).
> - **What it's for:** review incoming submissions, work outreach on them, and stage
>   doctor profiles for WordPress.
> - **Where the data lives:** `forms` + `form_responses`, fed by the
>   `typeform-webhook` / `jotform-webhook` functions; staging writes to
>   `staged_doctor_profiles`.
> - **Three kinds of form:** doctor-intake (→ WordPress), free-signal leads
>   (→ Zoho), and paid leads (DoctorsFinder, $150/lead — revenue, no Zoho).

## What you see

- **A tab per form**, each with a provider badge and a KPI strip (total, last 7d /
  30d; for paid forms a revenue tile; for free forms an "uncontacted in Zoho" /
  "unqualified" count).
- **Search + filters:** full-text search (⌘F), a Live/Archived toggle, a date
  filter, an **outreach lifecycle** filter (New / Contacted / Qualified / Declined /
  Closed, plus "Uncontacted in Zoho" and "My queue"), and — for JotForm — an "In
  WordPress / Not in WP" filter.
- **The submission feed** — each row shows the person, the first couple of answers,
  badges ("in Zoho", "in WordPress", paid-lead $150), and the time. Expand a row
  for the full record.
- **The expanded row** is the working surface: an **outreach panel** (status pills,
  "Mark contacted now", call/email/WhatsApp shortcuts, owner, notes, follow-up
  date), a **Zoho block** (linked lead's status, or "Create Zoho lead"), the **full
  answers** (with downloadable CVs/files and parsed phone/DoB), and a **WordPress**
  action ("Send to staging" or a link if already there).

## How to use it

1. **Triage daily** — filter to "Uncontacted in Zoho" (free forms) or scan the
   doctor-intake feed; the newest are on top.
2. **Work a submission** — expand it, hit **Mark contacted now**, jot a note, set a
   follow-up date, and move the status pill as you go.
3. **Link to Zoho** — if a free-signal lead never matched, **Create Zoho lead**
   backfills it; if it matched, you can change its `Lead_Status` right here.
4. **Stage a doctor** — on a JotForm intake, **Send to staging** runs the full
   pipeline (Zoho match + photo extraction + CV download/parse) and creates a draft
   profile; then finish and publish it in **Doctors → Profiles**.
5. **Housekeep** — archive what you're done with (recoverable), export the loaded
   set to CSV, or backfill history with "Sync history".

## How it works

- **Submissions arrive** via each provider's webhook (`typeform-webhook`,
  `jotform-webhook`), which validates the signature, flattens the answers into
  `form_responses`, and attempts an email/phone match to a Zoho lead (setting
  `doctor_id` to `lead:…` when found). A `new_form_submission` notification fires —
  and pings **Slack** only for doctor-intake forms.
- **Outreach status** (`new → contacted → qualified → declined → closed`) lives on
  the `form_responses` row, *separate* from Zoho's `Lead_Status`. That's the one
  unified tracking layer across all form types — including paid leads that never
  touch Zoho and intake doctors that go to WordPress instead.
- **Staging** ("Send to staging") calls `stage-from-response`, which does the exact
  same work as a live webhook: enrich from Zoho, pull the photo from the JotForm
  payload, download the CV and queue `cv-extract` (AI) to parse it, and insert a
  `staged_doctor_profiles` row. Files are served through `jotform-file-proxy` /
  `typeform-file-proxy` (the raw provider URLs are auth-gated).
- **Search** is server-side (ILIKE across a `search_text` column) with pagination,
  so the ~20k-row table never loads into the browser; a row auto-expands when your
  search matched inside its answers.

## Why it's built this way

- **Intake ≠ profile** — Forms is purely intake/triage; profile *quality* work
  (editing, publishing) happens in Doctors → Profiles. Routing every intake through
  staging enforces review before anything hits the public website.
- **One outreach layer over many form types** — free leads, paid leads, and doctor
  intake behave differently in Zoho/WordPress, so a form-scoped outreach status
  gives the team a single, consistent way to track follow-up regardless of type.
- **Doctor-intake shows WP, not Zoho** — intake doctors aren't leads; the team's
  real question is "is this profile already on the website?", so that's the badge
  and filter they get.
- **Soft archive, not delete** — submissions are an audit trail; archiving hides
  them from the live feed while keeping the record.

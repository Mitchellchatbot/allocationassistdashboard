# Doctors

The single hub for everything about a doctor: the intake forms they submit, where
they sit in the recruitment pipeline, and their public profile. It unifies three
screens that used to be separate (`/leads-pipeline`, `/doctor-profiles`,
`/wp-candidates`) under one URL with one search bar.

> **At a glance**
> - **Who uses it:** the HI and Sales teams.
> - **What it's for:** review new doctor sign-ups, track each doctor's progress,
>   and create/edit the profile that gets sent to hospitals.
> - **Where the data lives:** intake → Supabase (`staged_doctor_profiles`,
>   `form_responses`); pipeline → **Zoho** (cached); profiles → **WordPress**
>   (mirrored in `wordpress_candidates`).
> - **The golden rule:** a profile's *source of truth is WordPress*. Editing it
>   here writes back to WordPress.

## The three tabs

| Tab | What it shows | Backed by |
|---|---|---|
| **Responses** | Incoming Typeform/JotForm submissions, auto-staged into draft profiles | `form_responses`, `staged_doctor_profiles` |
| **Doctor Progress** | The recruitment pipeline — what stage each doctor is at | Zoho leads (cached in `zoho_cache`) |
| **Profiles** | The canonical WordPress doctor profiles (the ~1,200 on the website) | `wordpress_candidates` |

The active tab and your search term both live in the URL (`?tab=…&q=…`), so links
are shareable and search persists as you switch tabs.

---

## How to use it

### Tab 1 — Responses

New doctor intake (from Typeform/JotForm) lands here as draft profiles awaiting
review. This is the front door of the "create a profile" workflow; the heavy
lifting (editing + publishing) happens on the **Profiles** tab's staging area.
(Full intake mechanics are in the Forms doc.)

### Tab 2 — Doctor Progress (the pipeline)

**What you see**

- A **"Where doctors are right now"** strip across the top — a card per pipeline
  stage (Not Contacted → Attempted → Initial Call → …) with live counts and a
  tooltip explaining each stage.
- A **doctor table** below: ID, doctor, specialty, current step, From → To
  (origin → destination country), license type, sales consultant, days-in-step,
  and a computed status badge (**On Track / Needs Attention / Delayed / Closed**).
- Rich filtering: free-text search, plus dropdowns/pills for stage, recruiter,
  and status.

**Common workflows**

1. **Move a doctor to a new stage** — click the *Current Step* dropdown on the
   row, pick the new status. It updates **Zoho** in the background and shows a ✓.
   The change is applied instantly (optimistic) and also written through so it
   survives a reload.
2. **Link a doctor to a vacancy** — expand the row → **Link to vacancy** → pick
   the open position. The doctor then appears in that vacancy's candidate panel
   for the HI team.
3. **Read the call history** — expand a row to see a merged timeline of call logs
   and team sessions (date, outcome, notes) for that doctor.

> **Why the status badge isn't from Zoho:** On Track / Delayed is computed *here*
> from how many days the doctor has sat in their current stage — so it's always
> live without a Zoho round-trip.

### Tab 3 — Profiles (the canonical record)

This is the editor for the profile that hospitals actually receive.

**What you see**

- A KPI snapshot: **Total · Published · Private · Drafts · Linked to AA (%)**.
- Search (scans *every* field) + filter chips for status (Published/Private/Draft)
  and license (DHA/DOH/MOH/SCFHS/QCHP).
- A **staging area** for profiles not yet on WordPress (from intake or "New
  profile"), each with Save-as-draft / Publish / Delete.
- The candidate list; click any row to open the full **profile editor**.

**Common workflows**

1. **Create a new profile** — **New profile** drops a row into staging and opens
   the editor. Nothing touches WordPress until you **Publish**.
2. **Edit any field inline** — click a field (name, specialty, salary, an
   Education/Experience entry…), type, and blur/Enter to save. Each save is a
   *partial* write so you never clobber other fields. You get a spinner → green ✓.
3. **Upload a photo / CV** — click the avatar's camera, or **Upload Resume**. The
   file goes to the WordPress media library and attaches to the profile.
4. **Rewrite the bio with AI** — the ✨ menu offers presets (shorten, tighten,
   professionalize); you preview the result side-by-side before applying.
5. **Publish a staged profile** — **Publish** (live) or **Save as draft** (review
   state on WP). If a CV is still being read by the AI extractor, you're warned
   before publishing so you don't ship a half-parsed profile.
6. **Link to an AA doctor** — paste a `doctor_id` (e.g. `lead:12345`) to connect
   the profile to its Zoho record. Most link automatically (see below).
7. **Sync from WordPress** — pulls the latest from the website and reports how
   many were added / removed / auto-linked.

---

## How it works

### The `doctor_id` scheme

A doctor is referenced by a **prefixed id** so the system always knows which Zoho
module they live in:

- `lead:<zohoId>` — a **Zoho Lead** (an active prospect with the full pipeline).
- `dob:<zohoId>` — a **Zoho Contact** ("Doctor on Board", further down the
  funnel).
- `staged:<uuid>` — a draft profile in `staged_doctor_profiles`, before it's
  published to WordPress.

This is why lookups (photos, matching, sending) try both `lead:` and `dob:` — the
same person can be referenced either way depending on how far along they are.

### Where each tab's data comes from

- **Doctor Progress** reads the **`zoho_cache`** table, not Zoho's live API. The
  table is filtered and paginated entirely in the browser, so searching and
  scrolling never hit Zoho (and never hit its rate limits). Status changes write
  back to Zoho via `zoho-proxy`. (See [Data Sources & Sync](../01-data-sources-and-sync.md).)
- **Profiles** reads **`wordpress_candidates`** (a mirror of the WordPress
  "candidate" custom post type), with a realtime subscription so edits show up
  immediately. Every edit calls an edge function that writes to WordPress ACF
  fields: `wordpress-candidate-upsert` (fields), `…-upload-photo`, `…-upload-cv`,
  `…-delete`, and `wordpress-candidates-sync` (pull) / `…-link` (link).

### The create → publish → sync loop

1. **Intake** (Typeform/JotForm) or **New profile** → a row in
   `staged_doctor_profiles`. If a CV was attached, `cv-extract` reads it with AI
   and merges fields (bio, years, education) back onto the draft (~10–30s).
2. **Edit** the draft inline until it's clean.
3. **Publish** → `wordpress-candidate-upsert` creates the WordPress profile; the
   CV and photo upload too; the staging row is removed.
4. **Sync** (cron or the Sync button) → `wordpress-candidates-sync` pulls all
   published profiles back into `wordpress_candidates` and **auto-links** new ones
   to their Zoho record by email + name (setting the `lead:`/`dob:` id).

### Why WordPress is the source of truth

The public website already renders these profiles for the world, so the profile
*must* live there. The dashboard keeps a fast local mirror for searching, matching
and sending — but the website is authoritative. That's the reason edits write back
to WordPress rather than just updating the local table, and why "View full
profile" in the introduction email points at a tokenised page rather than the
(login-walled) WordPress profile.

### Auto-linking (WP ↔ Zoho)

When profiles sync, unlinked WordPress candidates are matched to Zoho by email and
normalised name, and stamped with the right `lead:`/`dob:` id. You can always
override this manually in the editor's *Link to AA doctor* field.

---

## Good to know

- **Search is instant** because both the pipeline and the profiles are filtered in
  memory over cached data — there's no server round-trip per keystroke.
- **Staging is a safety gate:** nothing reaches the public website without an
  explicit Publish.
- **Photos from JotForm** are served through a proxy edge function (the raw
  JotForm URLs are auth-gated and return HTML, not an image).
- **A doctor can appear in all three tabs** at different points — as a Response
  (just signed up), in Progress (being worked), and in Profiles (ready to send).

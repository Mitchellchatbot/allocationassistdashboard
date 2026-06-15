# Vacancies

The list of open hospital roles AA is trying to fill — and the matchmaker that
ranks which doctors fit each one. It's the bridge between a hospital's need and the
doctors in the system: a vacancy is the "demand" side, a doctor profile is the
"supply" side, and this page scores how well they pair.

> **At a glance**
> - **Who uses it:** the HI team owns vacancies; Sales sees them while working a
>   doctor.
> - **What it's for:** track open roles, and for each one see the best-matched
>   doctors (auto-ranked) plus any manually linked leads.
> - **Where the data lives:** `vacancies` + `vacancy_lead_links` tables. Vacancies
>   are added manually or imported from a **Google Sheet** (`sheets-sync`).
> - **The clever bit:** a scoring engine ranks every published doctor against a
>   vacancy in real time.

## How to use it

**What you see**

- A table of vacancies: hospital, specialty, priority (high/medium/low), days
  open (with an overdue flag past the target), status (open/filled/closed), and
  who opened it.
- Four KPI pills: **Open · High priority · Stale > 14 days · Filled (last 30d)**.
- Search + filters by status and priority.

**Common workflows**

1. **Log a vacancy** — *New vacancy* → pick/type the hospital, pick a specialty
   (searchable, custom allowed), set priority + an optional target-fill days +
   notes. It's stamped with your email as the opener.
2. **See the best-matched doctors** — click a vacancy to open its detail sheet:
   - **Onboarded doctors** tab — published profiles auto-scored and ranked into
     **Strong / Decent / Long-shot** tiers (top 50). Expand a doctor for the full
     score breakdown, contact, licenses, and experience.
   - **Leads** tab — doctors the team has *manually* linked from the pipeline.
3. **Link a doctor** — from the Onboarded tab's *Link* button, or from the doctor
   side (the Doctors → Progress tab's "Link to vacancy"). Either way the doctor
   appears in this vacancy's Leads tab for the HI team to action.
4. **Close the loop** — mark a vacancy **Filled** or **Closed** (auto-stamps the
   date); reopen if needed.

> **Heads up:** the system also pings the team (Slack + bell) when a *fresh*
> doctor strongly matches a *fresh* open vacancy — so good pairings surface even
> if nobody's looking at this page.

## How it works

### Where vacancies come from

- **Manual** — the *New vacancy* dialog writes to the `vacancies` table.
- **Google Sheet** — `sheets-sync` ingests a published sheet (configured on the
  Connections screen). It tolerates two layouts: a flat
  Hospital/Specialty/Priority CSV, or Ammar's existing format with hospital
  section headers and specialty rows beneath, including a "# vacancies" count.

### The link model

`vacancy_lead_links` is a many-to-many join (one doctor ↔ many vacancies, one
vacancy ↔ many doctors), unique per `(vacancy_id, doctor_id)` so you can't
double-link. Each link records who linked it and (if it came from a flow) the run
id.

### The matching score (out of 100)

A doctor is scored against a vacancy by combining several signals. **Specialty is
a gate** — if it doesn't match at all, the doctor is hidden:

| Signal | Max points | Notes |
|---|---|---|
| **Specialty** | 50 | exact = 50; same group = 40; partial/parent overlap = 30–35 |
| **Regional license fit** | 25 | doctor's license matches the hospital's emirate/country (Dubai→DHA, Abu Dhabi→DOH, Saudi→SCFHS, Qatar→QCHP…) |
| **Extra licenses** | +10 | other regional licenses held |
| **Training country** | 7 | trained in the hospital's country, or a top-source country (US/UK/CA/AU) |
| **Years of experience** | 5 | 8+ years = full |
| **Notice ↔ urgency** | 3 | short notice + high-priority vacancy |

**Tiers:** ≥70 = **Strong**, ≥40 = **Decent**, >0 = **Long-shot**, 0 = hidden. The
practical effect (a deliberate design choice): *right specialty + right regional
license alone clears 75 → Strong*, which matches the team's intuition for "this is
a real candidate."

The doctor's data for scoring is assembled from the richest source available, in
order: **WordPress profile → Zoho Doctor-on-Board → Zoho Lead → legacy
doctor_profiles**. Specialty matching uses the website's ~135-specialty list (not
Zoho's free-text), with sub-specialties checked before parents so "Interventional
Cardiologist" beats a generic "Cardiology" match.

### Two directions of matching

- **Vacancy → doctors** (this page's detail sheet): scores the whole published
  pool against one vacancy, returns the top 50.
- **Doctor → vacancies** (on the Doctor Profiles page): scores all open vacancies
  against one doctor.

### Auto-match notifications

`tick-scheduler` (every ~5 min) pairs recently-opened vacancies with
recently-onboarded doctors (at least one side < 14 days old), scores them, and for
any pair ≥ 50 writes a `vacancy_match` notification. It also fires the 3-day (then
weekly) "this vacancy is still open" nudge to the opener.

## Why it's built this way

- **Vacancy as the unit of demand** — it's the thing both teams rally around;
  cross-team visibility (HI owns, Sales sees) is intentional.
- **Onboarded auto, leads manual** — published profiles are cheap to score live,
  so they're always ranked; the Leads tab is hand-curated by the team as the
  pipeline progresses (it stopped auto-populating per Ammar's 2026-06-03 call).
- **Specialty is half the score** — per the team's spec: get the specialty right
  first, then licenses and the rest layer on top. A wrong specialty is disqualifying, not just low-scoring.

# Reports

The HI team's scoreboard — what's in the pipeline, what's converting, and where
each placement stands from shortlist all the way to the final payment. It pulls
together the automation flows, the placement records, and the doctor/hospital
data into one operational view, and it's where the team **logs placement
milestones** (the dates that drive the payment clock).

> **At a glance**
> - **Who uses it:** the HI team and management.
> - **What it's for:** see pipeline + outcome numbers, track every placement, and
>   log signed/joined/paid dates.
> - **Where the data lives:** `automation_flow_runs` + `doctor_lifecycle` +
>   **`placement_attempts`** (the per-doctor-per-hospital record that replaced the
>   old "Hammad" Google sheet).
> - **Design choice:** the page is **summary-first** — headline numbers and a
>   trend chart are always visible; everything else is collapsible.

## What you see

The page is a stack of sections, most collapsed by default:

- **KPI strip (always on):** *Pipeline* (Profile sends · Shortlisted · Interviews
  · Offered) and *Outcomes* (Signed · Joined · Paid). Each tile is clickable to
  drill into recent records.
- **Weekly trend chart:** shortlisted / interviews / signed by week — spot
  drop-off early.
- **Doctors on the way:** signed-but-not-yet-joined doctors, oldest first, with an
  alert past 14 days.
- **Top of funnel** (collapsible): form submissions + outreach coverage,
  independent of the date filter.
- **Weekly / monthly recap** (collapsible): the *change* vs the prior period
  (deltas only — the absolute numbers live in the KPI strip).
- **Pipeline health / Operations** (collapsible): contract e-sign funnel, CV
  backlog, batch-send status, candidate-pool counts.
- **Breakdowns** (collapsible): by team member, by hospital (with a
  warming/cooling relationship score), the **Placements** table, and a per-doctor
  rollup.

**Filters** across the top: date range (7/30/90 days), hospital, team member,
specialty.

## How to use it

### Reading the numbers

- Click any **KPI tile** to flip it and see the 8 most recent records + a link to
  the full list in Automations or Doctor Profiles.
- Use the **date range** to scope the KPI strip, trend, recap, and breakdown
  tables. (Top-of-funnel is all-time on purpose.)
- The **hospital relationship score** (0–100) and warming/cooling badge flag which
  accounts are gaining or losing momentum versus the prior period.

### The Placements workflow (the important one)

The **Placements** table tracks each `(doctor, hospital)` pairing through
Shortlisted → Interviewed → Offered → Signed → Joined → Paid.

1. **Open a placement** — click a row to edit it.
2. **Log a milestone** — set the date for each stage as it happens.
3. **Watch the payment clock** — once you set **Joined**, the row shows the
   target invoice-paid date (**joined + 45 days**); it turns red when overdue.
4. **Add placements** — *New placement* → pick the doctor (Zoho leads or Doctors
   on Board) → pick the hospital. Or **import a CSV** in the old Hammad-sheet
   format (it auto-links rows to Zoho by name; unmatched rows get a "Re-link"
   button).
5. **Jump straight to a doctor** — the *Track placement* button in an Automations
   run deep-links here (`/reports?placement=<doctorId>`) with that doctor
   pre-selected.

> **Setting "Joined" does real work:** it automatically creates the **Second
> Payment** flow run (starting its 15-day timer), so logging the join date is what
> arms the invoice pipeline — not just a record-keeping step.

## How it works

### Two placement tables (and why)

- **`placement_attempts`** — one row per `(doctor, hospital)` pair. This is the
  source of truth, because a single doctor can be in play at several hospitals at
  once (the old Hammad sheet showed exactly that — one doctor shortlisted at four
  hospitals the same day). A per-doctor record can't represent that; a per-attempt
  record can.
- **`doctor_lifecycle`** — one row per doctor (signed_at / joined_at / paid_at /
  eligible_for_sending). A database trigger **forward-syncs** the earliest
  relevant dates from `placement_attempts` into here, so older per-doctor features
  (status badges, the Second Payment trigger, hiding signed doctors from blasts)
  keep working.

### The 45-day payment clock

AA invoices when a doctor **joins**; the invoice is due **45 days** later. So the
clock starts on `joined_at`. When the join date lands (manual edit, CSV import, or
a flow), `ensureSecondPaymentRun()` creates a `second_payment` run at
`trigger_15_days`; `tick-scheduler` later advances it to send the invoice at the
15-day mark, then runs the reminder cadence until Finance marks it paid. The
Placements table surfaces the countdown so overdue invoices are obvious.

### Where the metrics come from

`useReportingMetrics` reads `automation_flow_runs`, `doctor_lifecycle`, and
related tables (paginated in 1,000-row batches to get past the API's row cap), and
the aggregation logic in `hospital-reporting.ts` computes the KPIs, team rows,
hospital rows (incl. the health score), and weekly trend buckets. The Operations
panels read recent rows from `contract_sends`, `cv_uploads`,
`scheduled_batch_sends`, and the candidate tables. Almost everything here is
*derived* from data the rest of the dashboard already produces — Reports doesn't
own much itself, except the placement records you log.

## Why it's built this way

- **Summary-first** (the 2026-06-08 restructure) — the always-on KPI strip + trend
  are the canonical home for "the big numbers"; everything else starts collapsed
  with a badge (e.g. "10 CVs pending") so the team expands only what they need.
- **Deltas in the recap, absolutes in the KPIs** — avoids the same number appearing
  five times; the recap's job is *direction* (up/down), not re-counting.
- **Per-attempt placements** — the only model that matches reality (one doctor,
  many hospitals) and the one Saif's team already used in the Hammad sheet.
- **Joining date triggers payment** — tying the Second Payment flow to the logged
  join date keeps the money pipeline automatic and consistent with AA's 45-day
  terms.

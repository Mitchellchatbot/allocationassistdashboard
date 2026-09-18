# Reports

The HI team's scoreboard — what's in the pipeline, what's converting, and where
each placement stands from shortlist all the way to the final payment. It reads
the placement records (the imported sheet + the Processing page's stage
marking) and the hospital/vacancy data into one view, and it's where the team
**logs placement milestones** (the dates that drive the payment clock).

> **At a glance**
> - **Who uses it:** the HI team and management.
> - **What it's for:** see pipeline + outcome numbers one week, month or year at
>   a time, track every placement, and log signed/joined/paid dates.
> - **Where the data lives:** **`placement_attempts`** (the per-doctor-per-hospital
>   record that replaced the old "Hammad" Google sheet), plus `hospitals` (who
>   represents each account) and `vacancies` (open roles).
> - **Design choice:** answer-first — a plain-English headline, then the detail.
>   Long explanations live behind hover cards and the ⓘ icons.

## Choosing the period

- The **Weekly · Monthly · Yearly** pill (top right) sets the period for every
  panel on the page. *Yearly* is the last 12 months against the 12 before.
- The **round arrows** on either side of the report step one period back or
  forward, with a slide. The **← →** keys do the same.
- **Hover an arrow** and it opens into a *jump-to* grid of every week / month /
  year, each with a small bar for that period's signings — so December back to
  January is one click. The grid has its own ‹ › to page through years.
- The **period chip** ("This month · September 2026") opens the same grid on
  click (handy on touch screens), and **Back to now** returns to the current
  period.
- Period, offset and tab live in the URL (`?per=weekly&off=-3&view=team`), so a
  link opens exactly the view you're looking at.

## What you see

Four tabs, one question each (hover a tab for it):

- **Overview — how are we doing?**
  - **Summary:** a one-sentence headline and four tiles (Shortlisted,
    Interviewed, Signed, Relocated) vs the period before. Hover a tile for the
    most recent doctors behind it.
  - **Worth a look:** hospitals with open roles but nothing moving in 30+ days,
    45-day payments overdue or due this week, and specialties with open roles
    but no placements. Click one to jump to its section.
  - **Specialties getting jobs:** a tile map — tile size is doctors placed,
    each tile shows its change and open roles. Callouts name the top,
    fastest-growing and falling-behind specialties.
  - **Trend:** pick a stage to chart it against the same weeks/months a year
    earlier (best and quietest pinned), or switch to the **heatmap** to see
    every stage at once. The selected week/month is shaded.
  - **How doctors move from shortlist to paid**, **By region**, and **Average
    lifecycle**.
- **Team — who's delivering?** One card per rep (ranked by signings), then the
  team table; open a row to see that rep's hospitals. Credit follows the
  hospital's representative.
- **Hospitals — which accounts are moving?** Account health (Moving / Slowing /
  Idle-but-hiring), the per-hospital table with a status dot, open vacancies,
  and data quality.
- **Detail** — **All metrics** (six tiles with drill-downs), the **Placements**
  ledger, and the per-doctor breakdown.

The **Jump to** panel on the right lists every section across all four tabs and
highlights the one you're scrolled to.

## How to use it

### Reading the numbers

- Every count is **distinct doctors** — one doctor shortlisted at three
  hospitals counts once (the per-hospital table is the deliberate exception).
- Hover almost anything — tiles, stages, heatmap cells, status dots, payment
  badges — for the detail behind it.
- Click any **All metrics** tile to flip it and see the 8 most recent records +
  a link to the full list.
- Hospital **status** is measured from the last movement up to the end of the
  selected period: within 14 days *Moving*, 15–30 *Slowing*, over 30 *Idle*.

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

`usePlacementAttempts` reads `placement_attempts` (paginated in 1,000-row
batches to get past the API's row cap). `placement-reporting.ts` holds the
counting rules (distinct doctors, the relocated → joined fallback), and
`report-period.ts` turns the Weekly / Monthly / Yearly selection into date
windows and trend buckets. `usePlacementReporting` adds `hospitals` (the rep
behind each account) and `vacancies` (open roles). Nothing on the page is
derived from the sends machinery — Reports measures placement, not outbound
email.

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

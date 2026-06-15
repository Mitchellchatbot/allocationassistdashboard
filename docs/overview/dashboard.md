# Dashboard (Home)

The landing screen — a quick, business-wide read on how doctor placements and the
overall operation are performing, plus your pending actions. It's the
"everyone-can-see-the-state-of-things" view: where leads come from, how they
convert, what revenue that implies, and how long placements take.

> **At a glance**
> - **Who uses it:** everyone, especially management — it's the first screen on
>   login.
> - **What it's for:** a fast, high-level pulse of the business (channels, funnel,
>   revenue, placement speed) + a pending-actions feed.
> - **Where the data lives:** mostly **Zoho** (cached) — leads and deals — plus the
>   notifications feed.
> - **Not the same as Reports:** Dashboard is the *business* pulse for everyone;
>   Reports is the *HI delivery* detail (placements, the payment clock) for the HI
>   team. (See [Reports](../hospital-introduction/reports.md).)

## What you see

- **Greeting + pending actions** — a personal greeting and a **Pending Actions**
  card: the live feed of things needing attention (the same signals that drive the
  notification bell and Slack). This is the one actionable widget on an otherwise
  read-only page.
- **Top channels by conversions** — the marketing channels that produced the most
  *converted* doctors (Doctors-on-Board) in the period, with the **revenue** each
  channel implies (conversions × a per-doctor fee). Answers "where are our paying
  doctors coming from?"
- **Lead → placement funnel** — the conversion funnel with per-stage drop-off, so
  you can see where leads stall.
- **Recent deals** — the latest closed placements with amounts.
- **Placement cycle** — how long placements take, shown as the 5 *most typical*
  (closest-to-average) cases plus the average across all measured placements.
- **Trend chart** — activity over time.

A **currency toggle** (AED/USD) in the header reformats every money figure on the
page.

## How to use it

1. **Read it top to bottom for a 30-second status.** Channels (where doctors come
   from) → funnel (where they stall) → deals/cycle (what's closing and how fast).
2. **Action the pending items.** The Pending Actions card is the only thing here
   that needs you — click through to handle each.
3. **Toggle currency** if you're reporting in USD vs AED.
4. **Use it as a jumping-off point**, not a working screen — for doing the work,
   go to My Workspace (your tasks), Automations (the pipelines), or Reports (the HI
   detail).

> **Why the revenue is an estimate:** the channel revenue is *conversions × a fixed
> per-doctor fee*, not summed invoices — it's a directional "which channel pays
> off," not the finance ledger. For real money, see Finance.

## How it works

- The numbers come from **`useFilteredData`** over the **`zoho_cache`** table —
  the same cached Zoho leads/deals the rest of the app uses, filtered to the
  selected period. So the Dashboard never calls Zoho live; it reads the local
  mirror (fast, no rate limits). See [Data Sources & Sync](../01-data-sources-and-sync.md).
- **Conversions** are counted as Zoho **Doctors-on-Board** rows in the period;
  channel attribution comes from the lead's source field (with
  `lead_source_overrides` cleaning up messy source values).
- **Placement cycle** is derived from placement dates; the "most typical" sample
  picks the rows nearest the average so a couple of outliers don't skew the
  picture.
- **Pending Actions** reads the `notifications` feed — the same store the bell and
  Slack pull from (see the Notifications & Slack systems doc).
- Everything except Pending Actions is **read-only and derived** — the Dashboard
  owns no data of its own; it's a presentation layer over Zoho + notifications.

## Why it's separate from Reports

Both are "metrics" screens, but they serve different people and questions:

- **Dashboard** = the *whole business* at a glance (lead sources, revenue, funnel,
  placement speed) — for anyone, especially leadership.
- **Reports** = the *HI department's* operational detail (pipeline counts,
  per-hospital/per-doctor breakdowns, and the placement records + 45-day payment
  clock the team actively logs).

Keeping them apart means the home screen stays a clean executive summary while the
HI team gets a dense working report elsewhere.

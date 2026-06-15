# Team Performance

The sales team's leaderboard — how many calls each consultant made, how their leads
are converting, and an optional call-quality overlay. It's the management view of
*the people*, where Sales Tracker is the view of *the pipeline*.

> **At a glance**
> - **Who uses it:** sales managers.
> - **What it's for:** compare consultants on activity and conversion; track active
>   campaigns; audit self-logged calls.
> - **Where the data lives:** **Zoho** (calls + leads by owner), the `weekly_sales`
>   table (a manually uploaded quality overlay), and `worker_entries` (self-logged
>   calls).
> - **Curated roster:** only the actual sales reps are shown (Abraham, Asser, Asim),
>   defined in one place (`sales-team.ts`).

## What you see

- **The leaderboard** — one row per rep, ranked, showing:
  - **Calls (Zoho)** — the headline activity metric (outbound calls logged in Zoho
    in the date range),
  - **Leads** and **Contacted**,
  - **Conversion rate** (colour-coded),
  - **Full Calls / Good Calls / Good-Call %** — the optional quality overlay from
    the uploaded weekly CSV (shows "—" if not uploaded),
  - a **performance** mini-bar.
- **A call-volume chart** — grouped bars per rep: Calls (Zoho), Full Sales Calls,
  Good Calls.
- **An active campaigns table** — Zoho campaigns with channel, doctors reached, and
  status (read-only).
- **A worker activity panel** (admin) — KPIs + charts over the `worker_entries`
  self-logged call data, filterable by worker/status.

A date-range picker scopes the metrics.

## How to use it

1. **Daily standup** — glance at Calls (Zoho) and conversion rate; spot who's ahead
   and who's lagging.
2. **Weekly review** — set the range to 7 days and compare Calls vs Leads
   (efficiency), and Zoho calls vs the uploaded Full Calls to catch reps not logging
   in Zoho.
3. **Quality check** — read Good-Call % (if the CSV is uploaded) to separate
   effort from effectiveness.
4. **Audit self-logged calls** (admin) — use the worker panel to verify
   `worker_entries` against Zoho.
5. **Campaigns** — scroll to the campaigns table for a read-only status of what's
   running (campaign management itself happens in Zoho).

## How it works

- **Calls + leads + conversion** come from the cached **Zoho** data, aggregated by
  each lead/call's `Owner`. Calls are the count of outbound Zoho call activities in
  the window; conversion rate is closed-won-style outcomes ÷ that rep's leads.
- **The quality overlay** is the `weekly_sales` table — a CSV the team uploads
  (member, date, full_sales_calls, good_calls, sales_count). It's filtered by date
  and merged into each rep's row by first name. It's *optional*: missing data just
  shows "—".
- **Self-logged calls** come from `worker_entries` (logged in the Worker Dashboard);
  they fold into the same rep rows and power the admin analytics panel.
- **The roster is fixed** — only members listed in `sales-team.ts` (Abraham,
  Asser, Asim) appear, so ex-reps, HI specialists, and admin accounts don't clutter
  the board. Add/remove a rep there and the page follows.
- Everything is **client-side re-aggregation** over cached data, so changing the
  date range is instant (no refetch).

## What each metric counts, precisely

| Column | Exactly what it is |
|---|---|
| **Calls (Zoho)** | Outbound Zoho call activities logged by that rep (matched on `Owner`) in the date range. The headline — auto-logged, so it's the trustworthy one. |
| **Leads** | Zoho leads owned by the rep. |
| **Contacted** | Their leads past "Not Contacted". |
| **Conversion rate** | Closed-won-style outcomes ÷ their leads, colour-coded (green ≥40 %, blue ≥20 %, else orange). |
| **Full Calls / Good Calls / Good-Call %** | From the uploaded `weekly_sales` CSV, merged by first name; optional quality overlay (shows "—" if no upload). |

Three data sources feed one row: **Zoho** (the auto-logged activity + pipeline),
the **weekly CSV** (the team's own quality tally), and **`worker_entries`**
(calls reps log themselves in the Worker Dashboard, which also power the admin
analytics panel at the bottom). They're combined per rep so a rep with only
self-logged activity still shows up.

## Why it's built this way

- **Zoho headline, CSV overlay** — Zoho calls are auto-logged and trustworthy, so
  they're the headline; the uploaded CSV is an optional quality audit (does our
  perception of "good calls" match the activity?). Two sources mean neither is a
  single point of failure.
- **Curated roster** — earlier versions swept in every Zoho lead-owner (including
  non-sales roles); pinning to an explicit roster keeps the leaderboard about the
  actual sales team.
- **Activity vs effectiveness** — separating Calls (effort) from Conversion and
  Good-Call % (quality) lets managers coach on the right thing.
- **Team Performance vs Sales Tracker** — same Zoho data, different lens:
  Performance ranks *people* (calls, good-call %, leaderboard); the
  [Sales Tracker](../sales/sales-tracker.md) reports *pipeline health* (stages,
  funnel, conversion). Managers use Performance for 1:1s and standups; the Tracker
  for pipeline reviews.

# Sales Tracker

The management scoreboard for the sales team — how many leads each recruiter is
working, how well they're converting, and where the pipeline is healthy or
stalling. It's a **read-only oversight dashboard**: you look here to see
performance; you *work* leads on the Follow-ups and Doctor Progress screens.

> **At a glance**
> - **Who uses it:** sales leadership and team leads.
> - **What it's for:** team + pipeline performance at a glance, sliced by date.
> - **Where the data lives:** **Zoho** (cached in `zoho_cache`) — leads, calls,
>   deals, and Doctors-on-Board (conversions).
> - **Read-only:** no lead is changed here; this is reporting.

## What you see

- **Five KPI cards** (each expands for a breakdown):
  - **Total Leads Managed** — all sales-owned leads in the date range → top 5
    recruiters by volume.
  - **Active in Pipeline** — leads still moving (excludes Unqualified / Not
    Interested) → stage breakdown.
  - **Lead Conversion Rate** — % that reached "Initial Sales Call Completed" or
    "High Priority Follow up".
  - **Qualified Contact Rate** — % of qualified leads contacted at least once
    (green ≥70 %, blue ≥40 %, else amber).
  - **Urgent Follow-ups** — leads in "High Priority Follow up" → top 8 with SLA
    breach flags.
- **Team Outreach** — calls made, emails sent, follow-ups needed.
- **Conversion at each step** — the funnel: Applied→Contacted→Initial
  Call→High Priority→Deals, each bar colour-coded by rate.
- **Stage distribution** — the top pipeline stages with counts.
- **Recruiter performance table** — one row per consultant: total leads,
  contacted, contact %, conversion % — sorted by conversion, best first.

A global **date-range** picker scopes everything.

## How to use it

1. **Pick a period** (week/month/quarter) to scope the whole page.
2. **Scan the KPIs**, then click any card to drill into the breakdown (per-recruiter
   or per-stage).
3. **Read the recruiter table** to see who's converting and who needs support.
4. **Watch Urgent Follow-ups** — leads past the 2-day SLA on "High Priority" are
   flagged; that's where to push the team.
5. To actually *act* on a lead, go to **Follow-ups** (status changes, call history)
   or **Doctors → Progress**.

## How it works

- Everything comes through `useFilteredData()` → `useZohoData()`, which reads the
  **`zoho_cache`** table (synced from Zoho by `zoho-sync`, see
  [Data Sources & Sync](../01-data-sources-and-sync.md)). So the page is fast and
  never hits Zoho's API limits; numbers are as fresh as the last sync.
- **Stages** come from Zoho's `Lead_Status` field, normalised to friendly labels
  (e.g. "Not Contacted" → "New Application").
- **Conversions** are counted as Zoho **Doctors-on-Board** (Contacts) created in
  the period — the canonical "this lead became a placement" signal.
- **Recruiter rollups** group leads by their Zoho `Owner`, computing contact % and
  conversion % per person.
- **The 2-day SLA** on "High Priority Follow up" is computed from how long a lead
  has sat in-stage; breaches sort to the top of the Urgent card.

## What each number means, precisely

Because these drive performance conversations, the exact definitions matter:

| Metric | Exactly how it's counted |
|---|---|
| **Total Leads Managed** | Every sales-owned Zoho lead created in the date range, any status. |
| **Active in Pipeline** | Leads whose status is *not* "Unqualified" and *not* "Not Interested". |
| **Lead Conversion Rate** | Share of leads that reached "Initial Sales Call Completed" or "High Priority Follow up" — the two statuses the team treats as a real conversion (a scheduled "Contact in Future" is a *defer*, so it deliberately doesn't count). |
| **Qualified Contact Rate** | Of the *qualified* leads (active pipeline), the share contacted at least once (status past "Not Contacted"). |
| **Contact %** (recruiter table) | Per consultant: leads moved past "Not Contacted" ÷ their active leads. |
| **Conversion %** (recruiter table) | Per consultant: their converted leads ÷ their total — this is the column the table sorts on. |
| **Urgent Follow-ups** | Leads currently in "High Priority Follow up"; any sitting there **> 2 days** are flagged as SLA-breached. |

A note on dates: leads and calls are filtered by their Zoho `Created_Time`; closed
deals by `Closing_Date`; open deals are always shown (they're current pipeline
state, not period-bound). So changing the range reshapes "how many came in / closed
this period" without hiding the live pipeline.

## How it differs from the Dashboard and Reports

Three "numbers" screens, three jobs: the **Dashboard** is the whole-business pulse
for leadership (channels, revenue, funnel); **Reports** is the HI department's
delivery detail (placements, payment clock); **Sales Tracker** is specifically the
*sales team's* performance and pipeline. Same cached Zoho data underneath,
different lens on top.

## Why it's built this way

- **Read-only on purpose** — mixing reporting with editing invites accidental
  changes. The Tracker answers "how are we doing?"; Follow-ups answers "what do I
  do next?".
- **Cached, not live** — sales screens need to be instant and Zoho's API is
  slow/rate-limited, so the dashboard works off the local mirror.
- **It feeds the Hospital Introduction side** — every conversion the Tracker
  counts becomes a doctor the HI team can introduce, which is why "Doctors on
  Board" is the conversion metric rather than a deal stage.

# Marketing

The channel scoreboard — which marketing sources bring in doctors, how far those
doctors get in the pipeline, and what each channel costs per result. It answers
"where should we put the next marketing dirham?"

> **At a glance**
> - **Who uses it:** marketing + leadership.
> - **What it's for:** rank channels by volume, conversion, and cost-efficiency.
> - **Where the data lives:** **Zoho** leads + Doctors-on-Board (cached), spend from
>   **Zoho Books** vendor bills (falling back to the `marketing_expenses` sheet), with
>   **Meta** spend pulled live from the Meta API.
> - **Key idea:** every channel is scored on the same funnel — leads → qualified →
>   converted — against its spend.

## What you see

- **Three flip KPI cards:** *Most Revenue Generated* (each converted doctor's
  actual Zoho Books invoices, with the flat fee as a fallback), *Best Cost / Conversion* (lowest spend-per-conversion wins),
  and *Best Closing Rate* (converted ÷ qualified). Each flips to show the top
  contenders and the exact formula.
- **The channel performance table** — one row per channel (Meta, Google Ads,
  Website/SEO, Referrals, Dave…): Converted, Leads, Qualified, Closing Rate, Cost /
  Qualified, Cost / Conversion. Sortable; legacy channels (no lead in 180 days) are
  badged.
- **A drill-down** — click a channel to see its doctors split into *Contacted* vs
  *To Reach*, with links into Doctor Progress filtered to that source.
- **Lead Trend** — leads, qualified and conversions per day / week / month (weekly
  by default), with an optional channel filter. A chart plus a newest-first table
  with the change vs the previous period, the average per period and the best
  period. Answers "how many leads did we get each week?".
- **Charts:** doctors acquired by channel, contacted-vs-uncontacted (click a bar to
  get the list of uncontacted doctors to call), and a spend-allocation donut.

A date-range picker scopes everything.

## How to use it

1. **Pick a window** (30/90 days / all-time).
2. **Read the KPI cards** for the headline winners on revenue, cost, and closing.
3. **Sort the table** by Cost / Conversion to find your most efficient channels —
   but check the volume; a channel with one cheap conversion isn't a strategy.
4. **Drill into a channel** to get its uncontacted doctors and hand them to the
   sales team (the links carry the source filter into Doctor Progress).
5. **Ignore "legacy" badges in the rankings** — those channels haven't produced a
   lead in 6 months and are excluded from the winner cards so stale data doesn't
   mislead.

## How it works

- **Leads + conversions** come from the cached **Zoho** data (`zoho_cache`).
  "Converted" = a **Doctor-on-Board** row created in the window; channel is the
  lead's `Lead_Source`.
- **Qualified** means a lead reached "Initial Sales Call Completed" or "High
  Priority Follow up" — "Contact in Future" is a defer and deliberately doesn't
  count (this mirrors how the team tallies by hand).
- **Spend** comes from **Zoho Books** vendor bills classified to a channel (falling
  back to `marketing_expenses`, the Digital Marketing Google Sheet, when Books is
  unavailable) — **except Meta**, whose spend is pulled **live** from the Meta API
  so it reflects the platform's real numbers, and **Website/SEO**, which is the
  monthly retainer model Finance also uses.
- **Channel names are normalised** (`channel-mapping.ts`): Meta = Facebook +
  Instagram, Google Ads = AdWords/SEM, Website/SEO = organic/SEO/website, etc., so
  spend, leads, and conversions line up under one canonical channel.
- **The Meta attribution override:** if a lead's email/phone matches a Meta
  form submission (`meta_leads`), it's re-attributed to Meta regardless of what was
  typed in `Lead_Source` — fixing the common "came from a Meta form but logged as
  Website" miscategorisation.
- **Revenue** is the sum of each converted doctor's **actual Zoho Books invoices**.
  Doctors not invoiced yet fall back to the shared constant
  (`REVENUE_PER_CONVERSION_AED` = AED 20,000, ≈ USD 5,446.56 at the AED peg).

## Reading the Lead Trend

- **Leads** are grouped by the day the lead was created in Zoho; **Converted** by the
  day its Doctor-on-Board record was created. Both are real event dates.
- **Qualified is a cohort, not an event.** Zoho only stores a lead's *current*
  status, not when it changed, so "qualified" for a week means "leads that arrived
  that week and are qualified today". A recent week reads low until its leads have
  been called, so weeks that ended in the last 21 days are faded and starred
  ("still maturing"). Don't read that as a drop. A true "qualified on Tuesday"
  number would need the Zoho sync to start recording status changes, and that
  history would only exist from then on.
- **Partial periods** (cut by the date range, or the current week still in progress)
  have faded leads bars and a *partial* tag, and are left out of the average and the
  "best" pick, so a 3-day stub doesn't look like a collapse.
- **Empty weeks show as zero**, not skipped, so gaps are visible.
- **Channel filter** uses the same attribution as the table (including the Meta
  override for junk sources), so filtering to a channel counts the same leads as
  its row. One difference: the table's Meta *Qualified* uses the form-side count
  from `meta_leads`, while the trend always uses Zoho status.
- Weeks start on **Monday**. Days are cut at midnight in the viewer's browser
  time zone, the same as the date-range picker and every other count on the page.
- The logic is in `src/lib/marketing-trend.ts` (tested in
  `src/test/marketing-trend.test.ts`).

## Reading the channel table (column by column)

| Column | What it means |
|---|---|
| **Converted** | Doctors-on-Board created in the window attributed to this channel (and its % of all conversions). |
| **Leads** | Raw Zoho leads from this channel in the window. |
| **Qualified** | Leads that reached "Initial Sales Call Completed" or "High Priority Follow up". |
| **Closing Rate** | Converted ÷ Qualified (capped at 100 %; handles pre-vetted referrals where conversions exceed qualified leads). |
| **Cost / Qualified** | Channel spend ÷ qualified leads ("—" if no spend recorded). |
| **Cost / Conversion** | Channel spend ÷ conversions ("—" if no spend). |

Low-volume channels (under ~5 % of leads, plus the "Undefined" bucket) are hidden
by default to keep the table scannable — a toggle reveals them. Rows with no
recorded spend sort to the bottom of the cost columns rather than showing a
misleading "0".

## Why it's built this way

- **One funnel for every channel** — comparing channels only makes sense if they're
  scored identically (leads → qualified → converted → cost), so the page enforces
  that.
- **Live Meta spend, sheet spend elsewhere** — Meta changes minute-to-minute and is
  transparent via its API; other channels rely on receipts the team logs in the
  sheet. Using the best source for each keeps the numbers honest.
- **Attribution override + qualified definition** — both exist to make the
  dashboard match reality rather than messy manual `Lead_Source` entry, so cost
  metrics aren't inflated or misfiled.
- **Legacy badge** — keeps old channels visible (transparency) but out of the
  winner cards (accuracy).

> **Related:** [Meta Ads](meta-ads.md) is the deep-dive on the Meta channel;
> [Finance](finance.md) turns the same spend + conversions into revenue/profit.

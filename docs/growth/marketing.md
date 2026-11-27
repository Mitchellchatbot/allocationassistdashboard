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
- **Best Days of the Week** — which weekday brings the most leads, qualified leads
  and conversions. Three tiles name the winning day for each. Below them, a
  **calendar**: Monday–Sunday columns, one row per week (newest first), each cell
  showing the date and that day's count, shaded darker the busier the day. A
  *Week total* column answers "how many did we get that week", and a pinned
  *Average* row shows each weekday's average, best in bold. A Leads / Qualified /
  Converted switch picks which number the calendar shows. Optional channel filter.
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

## Reading Best Days of the Week

- **The tiles and the Average row are averages per day**, not totals. A 30-day range holds five of two
  weekdays and four of the rest, so totals would give those two a ~25% head start.
  Hover an average for the total and how many of that day were counted; hover a
  calendar day for all three of its numbers.
- **Greyed-out calendar days** are outside the counted span (before the first lead
  in the range, after the range end, or in the future) — they're blank, not zero.
  A week with such days is tagged *partial*, since its total covers fewer days.
- Counting starts at the first lead in the range (so "All time" doesn't divide by
  every day since 2000) and stops at today.
- **Leads** and **Qualified** use the day the lead came in. Qualified = the lead's
  status today is "Initial Sales Call Completed" or "High Priority Follow up"; Zoho
  doesn't record when a lead became qualified, so this answers "which day's leads
  turn out best", not "which day the team qualifies most".
- **Converted** uses the day the Doctor-on-Board record was created in Zoho, which is
  when the team logged it, not necessarily the day the doctor signed. Expect
  weekend conversions to be near zero for that reason.
- **Channel filter** uses the same attribution as the table (including the Meta
  override for junk sources). One difference: the table's Meta *Qualified* uses the
  form-side count from `meta_leads`; this card always uses Zoho status.
- Days are cut at midnight in the viewer's browser time zone, the same as the
  date-range picker. Logic: `src/lib/marketing-weekdays.ts` (tested in
  `src/test/marketing-weekdays.test.ts`).

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

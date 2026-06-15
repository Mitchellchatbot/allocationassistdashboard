# Marketing

The channel scoreboard — which marketing sources bring in doctors, how far those
doctors get in the pipeline, and what each channel costs per result. It answers
"where should we put the next marketing dirham?"

> **At a glance**
> - **Who uses it:** marketing + leadership.
> - **What it's for:** rank channels by volume, conversion, and cost-efficiency.
> - **Where the data lives:** **Zoho** leads + Doctors-on-Board (cached), spend from
>   the `marketing_expenses` table, with **Meta** spend pulled live from the Meta
>   API.
> - **Key idea:** every channel is scored on the same funnel — leads → qualified →
>   converted — against its spend.

## What you see

- **Three flip KPI cards:** *Most Revenue Generated* (converted doctors × the
  per-placement fee), *Best Cost / Conversion* (lowest spend-per-conversion wins),
  and *Best Closing Rate* (converted ÷ qualified). Each flips to show the top
  contenders and the exact formula.
- **The channel performance table** — one row per channel (Meta, Google Ads,
  Website/SEO, Referrals, Dave…): Converted, Leads, Qualified, Closing Rate, Cost /
  Qualified, Cost / Conversion. Sortable; legacy channels (no lead in 180 days) are
  badged.
- **A drill-down** — click a channel to see its doctors split into *Contacted* vs
  *To Reach*, with links into Doctor Progress filtered to that source.
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
- **Spend** comes from `marketing_expenses` (categorised entries, ingested from the
  Digital Marketing Google Sheet) — **except Meta**, whose spend is pulled **live**
  from the Meta API so it reflects the platform's real numbers.
- **Channel names are normalised** (`channel-mapping.ts`): Meta = Facebook +
  Instagram, Google Ads = AdWords/SEM, Website/SEO = organic/SEO/website, etc., so
  spend, leads, and conversions line up under one canonical channel.
- **The Meta attribution override:** if a lead's email/phone matches a Meta
  form submission (`meta_leads`), it's re-attributed to Meta regardless of what was
  typed in `Lead_Source` — fixing the common "came from a Meta form but logged as
  Website" miscategorisation.
- **Revenue** uses a shared constant (`REVENUE_PER_CONVERSION_AED` ≈ AED 18,362.50,
  i.e. USD 5,000 at the AED peg) so Marketing and Finance rank channels with the
  same fee. It's an *estimate* (conversions × fee), not summed invoices.

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

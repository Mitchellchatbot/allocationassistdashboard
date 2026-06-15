# Meta Ads

The live performance dashboard for Meta (Facebook + Instagram) advertising — spend,
reach, clicks, and which ads actually produce qualified doctors. It pulls **live**
from the Meta API and cross-references form submissions to show the true
cost-per-result.

> **At a glance**
> - **Who uses it:** marketing.
> - **What it's for:** see what the Meta ad budget is buying, down to the individual
>   creative, in real time.
> - **Where the data lives:** **live** from the Meta Graph API (spend, impressions,
>   creatives); **form submissions** from the `meta_leads` table; **qualification +
>   conversion** cross-referenced from Zoho.
> - **Honest cost metric:** cost-per-lead is computed from *form submissions*, not
>   Meta's own lead reporting (which is unreliable for this account).

## What you see

- **A token panel** (only if needed) to paste/refresh the Meta access token.
- **KPI cards:** Total Spend, Impressions, Reach, Link Clicks + CTR, Frequency,
  CPM, Leads-from-Ads, and Leads-from-Forms — each flips to its top-5 campaigns.
- **A cost funnel:** *Cost per Lead (forms)*, *Cost per Qualified*, and *Cost per
  Conversion* — the three stages of efficiency.
- **Charts:** daily spend & clicks, spend by platform (FB vs IG), and an
  age/gender breakdown.
- **Drill-down tables:** per-creative (with thumbnails, three view modes:
  Performance / Cost / Reach), per-adset, and per-campaign. Click a leads count to
  see the **actual people** behind it.

## How to use it

1. **Set the date range**, then read the KPI cards for the headline spend/reach.
2. **Use the cost funnel** to see where money converts: form submission → qualified
   → placed. A low cost-per-lead but high cost-per-qualified means the ads attract
   the wrong people.
3. **Work the per-creative table** in *Cost* view to find your cheapest qualified
   leads, then in *Performance* view to see which creatives produce the most.
4. **Preview an ad** (thumbnail) to see the creative + a *Leads* tab listing the
   real people who submitted, with their Zoho qualification/placement status.
5. **Compare campaigns and adsets** to decide where to shift budget.

## How it works

- **Live Meta data:** `useMetaAdsApi` calls the Meta Graph API for spend,
  impressions, reach, CTR, campaigns, adsets, and creatives. Nothing is cached in
  our DB — ad metrics change constantly and are always wanted fresh. The token is
  resolved from (in priority) a local override → an env var → a fallback.
- **Form leads:** `meta_leads` stores the actual lead-form submissions (with
  email/phone and the `utm_campaign` / `utm_content` tags). This is the reliable
  signal — Meta's own `actions.lead` under-reports for this account, so the page
  back-fills leads by matching campaign/creative tags to form rows.
- **Qualification + conversion:** form leads are joined to **Zoho** on email/phone.
  *Qualified* = reached "Initial Sales Call Completed" or "High Priority Follow up";
  *Converted* = a Doctor-on-Board row with `Lead_Source` = Meta in the window.
- **Attribution** links each ad/adset/campaign to its leads (via `utm_content` /
  `utm_campaign`), which is what powers the "see the actual people" drill-downs.
- **Currency:** amounts come back in AED and respect the global AED/USD toggle.

## The three cost metrics, precisely

The funnel cards each divide the same Meta spend by a different denominator:

| Metric | Spend ÷ … | Source of the denominator |
|---|---|---|
| **Cost per Lead (forms)** | form submissions | `meta_leads` (the reliable signal) |
| **Cost per Qualified** | qualified form leads | form leads joined to Zoho, status = "Initial Sales Call Completed" or "High Priority Follow up" |
| **Cost per Conversion** | placements | Zoho Doctors-on-Board with `Lead_Source` = Meta in the window |

Reading them together tells you *where the money leaks*: a cheap cost-per-lead but
an expensive cost-per-qualified means the ads pull volume but not fit; a good
cost-per-qualified but a bad cost-per-conversion means good leads aren't closing.

## Why Meta's own lead numbers aren't trusted

Meta's Insights API reports leads via its pixel/lead events, which under-report (or
return zero) for this account's setup. The dashboard instead counts **actual form
submissions** captured in `meta_leads`, then back-fills per-campaign and
per-creative leads by matching the `utm_campaign` / `utm_content` tags. Because
those rows carry email and phone, they can be joined to Zoho to follow a single
click all the way to a placement — something Meta's reporting can't do on its own.

## Why it's built this way

- **Live, not cached** — ad performance is real-time money; caching would add
  staleness and overhead for no benefit. Direct API calls are fast enough.
- **Forms as the source of truth for leads** — Meta's lead reporting is unreliable
  for this account, and form rows give us email/phone to join to Zoho, so we can
  follow a click all the way to a placement. That's why "Cost per Lead (forms)" is
  the headline number.
- **Three cost stages** — marketing efficiency is a funnel; showing cost-per-lead,
  -qualified, and -conversion reveals exactly where the drop-off (and the wasted
  spend) is.
- **Creative-level detail** — the real optimisation lever is "which creative
  works," so the per-creative table (with three focused view modes to stay
  readable) is the heart of the page.

> **Related:** [Marketing](marketing.md) places Meta alongside every other channel;
> [Finance](finance.md) rolls Meta spend into the P&L.

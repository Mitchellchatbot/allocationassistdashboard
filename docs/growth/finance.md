# Finance

The money view — revenue vs marketing spend vs profit, by month and by channel.
It turns the same conversions and spend the rest of the dashboard tracks into a
simple P&L and ROI picture for leadership.

> **At a glance**
> - **Who uses it:** leadership / finance.
> - **What it's for:** see what's being spent, what it's bringing in, and the
>   profit/ROI by channel.
> - **Where the data lives:** spend from `marketing_expenses` (ingested from the
>   Digital Marketing Google Sheet); revenue from **Zoho** conversions.
> - **Important:** revenue is **estimated** — conversions × a fixed per-placement
>   fee — not summed invoices. (For the actual ledger, that's the accountant's job;
>   placeholders are shown until payroll/other costs land.)

## What you see

- **A period banner + currency toggle (AED/USD)** up top — so a multi-month total
  is never mistaken for a monthly figure.
- **KPI cards:** Marketing Spend (period total + monthly average), Leads Generated
  (with growth vs prior period), Cost per Conversion (with an "exclude Meta"
  toggle), Cost per Qualified, plus top channel, biggest single expense, spend
  growth, and transaction count.
- **Monthly spend by channel** — a channel × month table (the CEO view of where the
  budget goes).
- **A Profit & Loss table** — Revenue (conversions × fee), Marketing spend, Payroll
  (placeholder), Other opex (placeholder), and Profit (revenue − spend for now).
- **Charts:** revenue vs spend vs profit, monthly spend trend, spend by channel,
  channel mix, and ROI by channel.
- **A spend breakdown** — click a channel to expand its individual transactions.

## How to use it

1. **Confirm the period + currency** in the banner before reading any number.
2. **Read the P&L** top to bottom: conversions → revenue, then spend, then profit.
3. **Check Cost per Conversion**, toggling **Exclude Meta** — Meta's spend is large
   enough to skew the blended figure, so this shows what the other channels cost in
   isolation.
4. **Use the channel × month table + ROI chart** to see which channels earn their
   keep over time.
5. **Drill into a channel's transactions** to spot outliers or test charges.
6. **Switch AED/USD** for reporting; every figure reformats instantly.

## How it works

- **Spend** lives in the `marketing_expenses` table, ingested by `sheets-ingest`
  from the Digital Marketing Google Sheet (one row per expense; totals are computed
  in the dashboard, not stored). Re-imports are idempotent. Categories are
  normalised to canonical channels (Meta, Google Ads, LinkedIn…).
- **Revenue** = **conversions × `REVENUE_PER_CONVERSION_AED`** (AED 20,000 ≈
  USD 5,446.56 at the peg). Conversions are **Zoho Doctors-on-Board** rows in the
  period — the single source of truth for placements. The fee constant is shared
  with the Marketing page so both rank channels identically.
- **Qualified** (for cost-per-qualified) = leads at "Initial Sales Call Completed"
  or "High Priority Follow up" (not "Contact in Future").
- **Currency** is the global `CurrencyProvider` (AED↔USD at 3.6725); values are
  stored in AED and converted on display only.
- **Payroll / other opex** are intentional placeholders ("—") — the P&L structure
  ships now and fills in when the accountant delivers those numbers, so profit today
  is revenue minus *marketing* spend.

## The numbers, precisely

- **Revenue** = conversions × `REVENUE_PER_CONVERSION_AED` (AED 20,000). It's
  an estimate, not invoices — and the page labels totals "(period total)" so a
  multi-month figure is never misread as monthly.
- **Profit (today)** = Revenue − Marketing spend. Payroll and other operating
  costs are shown as "—" placeholders until the accountant supplies them; the row
  exists now so the P&L is structurally complete.
- **Cost per Conversion, Exclude-Meta toggle:** normally spend ÷ all conversions.
  With the toggle on, *both* sides drop Meta — `(spend − Meta spend) ÷ (conversions
  − Meta conversions)` — so Meta's large budget doesn't drown out how the other
  channels perform.
- **Spend growth** compares the period to the one before it (red if up, green if
  down), and the channel × month table shows where the budget moved over time.

## Why it's built this way

- **Estimated revenue, on purpose** — AA bills in stages over time, so a clean
  "summed invoices" number isn't readily available in the CRM; a conversions × fee
  estimate gives leadership a consistent, directional revenue/ROI read. The page is
  explicit that it's an estimate.
- **Spend from a sheet** — the team already maintains marketing spend in a Google
  Sheet (and Zoho's campaigns module isn't populated here), so the dashboard ingests
  that sheet rather than rebuilding expense entry.
- **Exclude-Meta toggle** — one dominant channel can hide how the others perform;
  the toggle keeps the blended number *and* the isolated view available.
- **Period banner** — a real lesson learned (a 3-month total once got read as
  monthly), so the date range and "(period total)" labels are made loud.
- **Finance vs Marketing vs Dashboard** — Finance is the *money* P&L; Marketing is
  the *channel* deep-dive (same spend + fee constant); the Dashboard is the
  *one-glance* business pulse. Shared constants keep them consistent.

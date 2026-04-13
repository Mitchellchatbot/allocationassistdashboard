# Allocation Assist Dashboard — Data Sources Cheatsheet

**Last updated:** April 2026  
**Prepared for:** Internal reference

---

## How Data Gets Into the Dashboard

| Source | What it feeds | Refresh rate |
|---|---|---|
| **Zoho CRM** | All recruitment metrics — leads, deals, calls, campaigns | Cached hourly in Supabase |
| **Supabase `meta_leads` table** | Meta Leads page | Synced from Google Sheet via n8n (on new row) |
| **Not yet connected** | Spend, ROI, region data, operational KPIs | — |

---

## Dashboard (Home Page)

| Card / Chart | Data Source | Notes |
|---|---|---|
| Qualified Active | Zoho CRM — Leads | Leads in active statuses, not unqualified |
| Lead → Placement | Zoho CRM — Leads + Deals | Closed Won deals ÷ total leads |
| Pipeline Value | Zoho CRM — Deals | Sum of open deal amounts |
| Closed Revenue | Zoho CRM — Deals | Sum of Closed Won deal amounts in AED |
| Avg. Time to Place | Zoho CRM — Deals | Days from deal created to closing date (Closed Won only) |
| Qualification Rate | Zoho CRM — Leads | Qualified leads ÷ total leads |
| Doctor Applications Over Time (chart) | Zoho CRM — Leads | Grouped by month using `Created_Time`; shows Applied, Qualified, Placed lines |
| How Doctors Move Through the Process (funnel) | Zoho CRM — Leads | Grouped by `Lead_Status` field |
| Where Doctors Come From (channel bars) | Zoho CRM — Leads | `Lead_Source` field, normalised into clean channel names |
| Performance by Region | ⚠️ Not connected | Zoho has no destination country field — shows empty |
| Recent Activity (feed) | Zoho CRM — Calls | 7 most recent calls by timestamp |

---

## Doctor Progress

| Card / Chart | Data Source | Notes |
|---|---|---|
| Stage count strip (top) | Zoho CRM — Leads | Count per `Lead_Status` |
| All Doctors table | Zoho CRM — Leads | Live search hits Zoho API directly; loads 100 first, then 50 per scroll |

---

## Sales Tracker

| Card / Chart | Data Source | Notes |
|---|---|---|
| Doctor Pipeline (stage boxes) | Zoho CRM — Leads | Count per `Lead_Status` |
| Doctors Placed | Zoho CRM — Deals | Count of `Closed Won` deals |
| Success Rate | Zoho CRM — Deals + Leads | Closed Won ÷ total deals |
| Avg. Time to Place | Zoho CRM — Deals | Days between deal `Created_Time` and `Closing_Date` |
| Calls Made | Zoho CRM — Calls | Outbound calls only |
| Emails Sent | Zoho CRM — Leads (email sub-requests) | Sampled from 30 most recently contacted leads |
| Follow-ups Needed | Zoho CRM — Leads | Count with `Lead_Status = High Priority Follow up` |
| Conversion at Each Step (bars) | Zoho CRM — Leads + Deals | Calculated ratios at each pipeline stage |
| Top Recruiters table | Zoho CRM — Deals + Calls | Deals grouped by `Owner` (placements, revenue); calls grouped by `Owner` |

---

## Team Performance

| Card / Chart | Data Source | Notes |
|---|---|---|
| Top Performing Recruiters table | Zoho CRM — Deals + Leads | Placements and revenue from Deals; doctors managed from Leads |
| Active Campaigns table | Zoho CRM — Campaigns module | Campaign name, budget, status; reach stats not available in Zoho CRM |
| Worker Activity panel | Internal | Based on hardcoded worker name map; tracks internal team logins |

---

## Marketing

| Card / Chart | Data Source | Notes |
|---|---|---|
| Channel cards (doctors per source) | Zoho CRM — Leads | `Lead_Source` field, normalised |
| Doctors Acquired by Channel (bar chart) | Zoho CRM — Leads | Same as above |
| Money Spent vs Doctors Placed (chart) | ⚠️ Spend not connected | Placement count is real (Zoho); spend shows $0 |
| Which Channels Give Best Returns (table) | ⚠️ Spend/ROI not connected | Doctor counts are real; spend, CPL, ROI columns show $0 |

---

## Finance

| Card / Chart | Data Source | Notes |
|---|---|---|
| Placement Revenue | Zoho CRM — Deals | Sum of Closed Won deal `Amount` in AED |
| Marketing Spend | ⚠️ Not connected | Shows N/A — no spend source wired up |
| Cost per Placement | ⚠️ Not connected | Shows N/A — needs spend data |
| Return on Investment | ⚠️ Not connected | Shows N/A — needs spend data |
| ROI by Channel (chart) | ⚠️ Not connected | Empty — no spend data |

---

## Operations & Roadmap

| Card / Chart | Data Source | Notes |
|---|---|---|
| Operational Health KPIs | ⚠️ Not connected | No live data source — shows empty |
| Growth Plan / Roadmap | ⚠️ Not connected | No live data source — shows empty |
| Current Delays & Issues | Zoho CRM — Leads | High Priority follow-ups, in-progress licenses (DOH/DHA/MOH), uncontacted leads |

---

## Meta Leads

| Card / Chart | Data Source | Notes |
|---|---|---|
| Total Leads | Supabase — `meta_leads` table | Count of all rows in selected date range |
| Tracked via Ads | Supabase — `meta_leads` table | Rows where `utm_campaign` is not null |
| Campaigns | Supabase — `meta_leads.utm_campaign` | Distinct campaign names |
| Top Country | Supabase — `meta_leads.location` | Most common origin country |
| Top Ad Creatives (ranked list) | Supabase — `meta_leads.utm_content` | Creative name from UTM content tag; numeric ad IDs filtered out |
| Leads by Campaign (bar chart) | Supabase — `meta_leads.utm_campaign` | Lead count per campaign name |
| Platform breakdown (pie chart) | Supabase — `meta_leads.utm_source` | Normalised into Facebook, Instagram, Google, YouTube, Other |
| Leads by Country (bar chart) | Supabase — `meta_leads.location` | Free-text location field from lead form |
| Top Specialities (ranked list) | Supabase — `meta_leads.speciality` | Comma-separated field — each speciality counted individually |

---

## What's Not Connected Yet

| Missing Data | Where It Would Appear | What's Needed |
|---|---|---|
| Ad spend (Meta) | Finance ROI, Marketing spend/CPL | Meta Ads API token (`META_ACCESS_TOKEN` secret in Supabase) |
| Ad spend (other channels) | Marketing channel ROI | Manual input or ad platform APIs |
| Destination/region | Dashboard region card, doctor table | Zoho field not populated; needs CRM data entry |
| Operational KPIs | Operations page health cards | Manual targets or internal tooling |
| Roadmap progress | Operations page roadmap | Manual updates |

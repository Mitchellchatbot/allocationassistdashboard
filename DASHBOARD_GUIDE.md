# Allocation Assist Dashboard — User Guide

**Last updated:** April 2026

---

## What Is This Dashboard?

This dashboard gives your recruitment team a live view of every doctor in your pipeline — from the moment they apply to the moment they're placed. It pulls real data from **Zoho CRM** and presents it in one place, so you don't need to dig through Zoho manually.

---

## Getting Started

### Logging In
Go to the dashboard URL and sign in with your credentials. The login is protected — only team members with an account can access it.

### Navigation
The sidebar on the left lets you jump between sections. Click the hamburger icon (top-left) to collapse it and get more screen space.

### Time Range Filter
The dropdown in the top bar (**This Week / This Month / This Quarter / This Year**) filters most of the data on every page. Change it to zoom in or out on any time period.

> **Note:** The doctor table and pipeline funnel always show the full current state regardless of time range — only counts and KPI numbers change.

### Syncing Data
Click the **"Synced X ago"** button in the top bar to pull the latest data from Zoho CRM immediately. The dashboard normally refreshes automatically every hour. If numbers look stale, hit sync.

---

## Pages

### Dashboard (Home)

Your high-level summary. Open it for a quick health check at the start of the day.

**KPI Cards (top row)** — click any card to flip it and see a breakdown:

| Card | What it shows | Expanded view |
|---|---|---|
| Qualified Active | Doctors currently in the active pipeline | Count per Lead Status |
| Lead → Placement | Overall conversion rate from lead to placement | Conversion % at each stage |
| Pipeline Value | Total AED value of open deals | Top 5 open deals |
| Closed Revenue | Revenue from Closed Won deals | List of closed deals |
| Avg. Time to Place | Average days from deal creation to close | Individual deal durations |
| Qualification Rate | % of leads that are qualified (not rejected) | Qualified / Unqualified / Not Interested breakdown |

**Charts:**
- **Doctor Applications Over Time** — monthly trend of how many doctors applied, got qualified, and got placed
- **How Doctors Move Through the Process** — funnel showing how many are at each stage right now
- **Where Doctors Come From** — bar chart of lead sources (Instagram, Referrals, etc.) with a 1W / 1M / 3M / 1Y filter
- **Recent Activity** — latest 6 calls logged in Zoho

---

### Doctor Progress

A searchable table of every doctor in your Zoho CRM.

- **Search bar** — finds by name in real time (searches across all leads, not just the page)
- **Status / Specialty filters** — narrow down the list
- **Click a doctor's name** — expands a row showing their full call log history from the imported sheet
- **Scroll to load more** — loads 50 at a time

> The "All Doctors" count shows your total lead count. If it says 3,000, that's how many are in Zoho.

---

### Sales Tracker

Focused on recruiter activity and pipeline health.

**KPI Cards** — click to expand:

| Card | What it shows | Expanded view |
|---|---|---|
| Total Leads Managed | All leads in the system | Top 5 recruiters by lead count |
| Active in Pipeline | Doctors in active statuses | Breakdown by stage |
| Contact Rate | % of leads that have been contacted | Contact rate per recruiter |
| Urgent Follow-ups | Leads flagged "High Priority Follow up" | List of those leads with age |

**Stage Distribution** — compact top-5 strip showing doctor counts at each stage.

**Team Outreach** — total outbound calls made, emails sent, and follow-ups needed.

**Conversion at Each Step** — bar chart showing what % make it through each transition (Applied → Contacted → Initial Call → Deals → Placement).

**Recruiter Performance table** — one row per recruiter showing leads assigned, how many they've contacted, outbound calls made, and their contact rate %.

---

### Marketing

Shows which channels are bringing in doctors and how well those doctors are being engaged.

**Date filter** — 1W / 1M / 3M / 1Y; all charts update to that window.

**Channel cards** — one per lead source (Instagram, Facebook, LinkedIn, etc.) showing doctor count and contact rate.

**Charts:**
- **Doctors Acquired by Channel** — bar chart of volume per source
- **Contact Rate by Channel** — horizontal bar chart showing what % of doctors from each source have been contacted

**Channel Breakdown table** — Doctors / Contacted / Contact Rate % per channel. No fake spend or ROI columns — those aren't tracked in Zoho.

---

### Team Performance

Recruiter rankings and campaign overview.

**Top Performing Recruiters table:**
- Ranked by leads managed
- Shows: leads assigned, how many contacted, contact rate %, and a performance score bar
- Top 3 get a trophy icon

**Active Campaigns table** — pulled from Zoho's Campaigns module. Shows campaign name, channel, doctors reached, and status. If no campaign data exists, shows an empty state rather than a table of dashes.

**Worker Activity panel** — shows internal team login history and activity based on the worker name map.

---

### Finance

Revenue metrics from Zoho Deals.

| Card | What it shows |
|---|---|
| Placement Revenue | Total AED value of Closed Won deals |
| Marketing Spend | Not connected yet — awaiting Meta API key |
| Cost per Placement | Not connected yet — needs spend data |
| Return on Investment | Not connected yet — needs spend data |

> Once the Meta Ads API key is added, the spend and ROI cards will populate automatically.

---

### Operations

License tracking and active issues.

**License Pipeline** — three cards showing DOH, DHA, and MOH license status across all doctors:
- **Approved** — license confirmed
- **In Progress** — application submitted, waiting
- **Not Applied** — no license activity

Each card has a stacked bar showing the proportion at a glance.

**Current Delays & Issues** — flip cards for each active bottleneck (click to reveal affected doctors):
- High Priority Follow-ups
- License Applications In Progress
- Contact Attempts with No Response
- New Applications Not Yet Contacted

---

### Meta Leads

Tracks doctors who came in through Meta advertising campaigns (Facebook / Instagram ads).

Data comes from a **Google Sheet** that's synced into the database. This is separate from Zoho.

| Section | What it shows |
|---|---|
| KPI cards | Total leads, tracked via ads, unique campaigns, top country |
| Top Ad Creatives | Ranked list of which ad creatives brought in the most leads |
| Leads by Campaign | Bar chart per campaign name |
| Platform breakdown | Facebook vs Instagram vs other |
| Leads by Country | Where the applicants are from |
| Top Specialities | What specialties are applying most |

**Date filter** — narrows everything to a specific time window.

---

### Worker Dashboard

A personal view for individual recruiters. Shows the leads assigned to the logged-in recruiter and their call log history.

---

## Interactive Features

### Expandable KPI Cards
KPI cards on the **Dashboard** and **Sales** pages can be clicked to flip open and show a breakdown. Click again to close. The card uses a 3D flip animation — the front shows the summary, the back shows the detail.

### Bottleneck Flip Cards (Operations)
Each issue card on the Operations page flips to show a scrollable list of the affected doctors, with their name, recruiter, and specialty. Click again to flip back.

### AI Insights
Click the **"AI Insights"** button (bottom-right, on every page) to get a Claude-generated summary of what the current data is telling you — top recruitment trends, who needs attention, and where things are moving well.

---

## Notifications (Bell Icon)

The bell in the top bar shows **live alerts** computed from your actual Zoho data:
- Doctors needing urgent follow-up
- License applications in progress
- Leads uncontacted for over 30 days

Click any alert to mark it as read. These refresh each time the data syncs.

---

## Where Data Comes From

| Data | Source | Updates |
|---|---|---|
| Leads, Deals, Calls, Campaigns | Zoho CRM | Cached hourly in Supabase; click Sync for instant refresh |
| Meta ad leads | Google Sheet → Supabase | Synced automatically when a new row is added (via n8n) |
| Ad spend, ROI | Not connected | Needs Meta Ads API key added to Supabase secrets |
| Region/destination | Not connected | Zoho field not populated — needs data entry in CRM |

---

## What's Not Connected Yet

| Missing data | Where it would appear | What's needed |
|---|---|---|
| Meta ad spend | Finance page (ROI, CPL, Spend cards) | `META_ACCESS_TOKEN` secret in Supabase |
| Doctor destination country | Region breakdowns | Fill the destination field in Zoho CRM |
| Operational KPIs (response time, etc.) | Would appear on Operations | Requires a live data source (e.g. internal tooling) |

---

## Common Questions

**"Why does the doctor count say 3,000 but I can only see 100 in the table?"**
The table loads 100 doctors at first and 50 more each time you scroll down. The number in the header reflects the full count. Use the search bar to find a specific doctor instantly without scrolling.

**"The numbers look wrong / outdated."**
Click the **"Synced X ago"** button in the top bar to force a fresh pull from Zoho.

**"A recruiter's name doesn't appear in the table."**
Recruiter performance is based on the **Owner** field in Zoho leads. If a recruiter doesn't have leads assigned to them in Zoho, they won't appear.

**"Why is Closed Revenue always AED 0?"**
This company sources doctors but doesn't close the final placement deal — that's done by the client. Closed Won deals in Zoho are rarely used. The metric is accurate; it's just that deals aren't typically marked Closed Won in your workflow.

**"The call log shows 'No entries found' for a doctor."**
The call log comes from an imported CSV sheet, not Zoho. If the doctor's name in the sheet doesn't closely match their name in Zoho, the records won't link. The search is fuzzy but requires at least a partial name match.

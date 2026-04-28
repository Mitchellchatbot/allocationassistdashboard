# Allocation Assist Dashboard — Client Guide

> A complete walkthrough of every page, feature, and concept in the dashboard. Designed to be searched with **Ctrl+F** (or **Cmd+F** on Mac). Every concept is anchored — you can link directly to any section using its heading.

---

## Table of Contents

1. [What This Dashboard Does](#1-what-this-dashboard-does)
2. [Quick Start (60 seconds)](#2-quick-start-60-seconds)
3. [The Top Toolbar](#3-the-top-toolbar)
   - [3.1 Sidebar Toggle & Breadcrumbs](#31-sidebar-toggle--breadcrumbs)
   - [3.2 Sync Button (refreshing Zoho)](#32-sync-button-refreshing-zoho)
   - [3.3 Search (Cmd+K)](#33-search-cmdk)
   - [3.4 Date Range Picker](#34-date-range-picker)
   - [3.5 Currency Toggle (AED / USD)](#35-currency-toggle-aed--usd)
   - [3.6 Export](#36-export)
   - [3.7 Notifications Bell](#37-notifications-bell)
4. [The Sidebar](#4-the-sidebar)
5. [The Pages](#5-the-pages)
   - [5.1 Dashboard (Home)](#51-dashboard-home)
   - [5.2 Sales Tracker](#52-sales-tracker)
   - [5.3 Marketing](#53-marketing)
   - [5.4 Doctor Progress](#54-doctor-progress)
   - [5.5 Team Performance](#55-team-performance)
   - [5.6 Finance](#56-finance)
   - [5.7 Meta Ads](#57-meta-ads)
   - [5.8 Contracts](#58-contracts)
   - [5.9 Follow-ups](#59-follow-ups)
   - [5.10 Settings](#510-settings)
   - [5.11 Worker Portal](#511-worker-portal)
   - [5.12 Import Data](#512-import-data)
6. [Key Concepts (the language of the dashboard)](#6-key-concepts)
   - [6.1 Lead Status](#61-lead-status)
   - [6.2 Qualified vs Converted vs Contacted](#62-qualified-vs-converted-vs-contacted)
   - [6.3 Channels](#63-channels)
   - [6.4 Campaigns](#64-campaigns)
   - [6.5 Cost-per metrics (CPL, CPQL, CPC, CPP)](#65-cost-per-metrics)
   - [6.6 Pipeline & Funnel](#66-pipeline--funnel)
   - [6.7 License Types (DOH, DHA, MOH)](#67-license-types)
7. [The AI Assistant](#7-the-ai-assistant)
   - [7.1 What it knows](#71-what-it-knows)
   - [7.2 Example questions](#72-example-questions)
   - [7.3 Tips for asking good questions](#73-tips-for-asking-good-questions)
8. [Universal Search](#8-universal-search)
9. [Data & Sync](#9-data--sync)
   - [9.1 Where the data comes from](#91-where-the-data-comes-from)
   - [9.2 Refreshing Zoho data](#92-refreshing-zoho-data)
   - [9.3 Re-indexing leads for the AI](#93-re-indexing-leads-for-the-ai)
   - [9.4 Importing data manually (CSV)](#94-importing-data-manually-csv)
10. [Roles & Permissions](#10-roles--permissions)
    - [10.1 Role definitions](#101-role-definitions)
    - [10.2 Adding a user](#102-adding-a-user)
    - [10.3 Removing a user](#103-removing-a-user)
11. [Common Recipes](#11-common-recipes)
    - [11.1 Find a specific doctor](#111-find-a-specific-doctor)
    - [11.2 Pull uncontacted leads in one channel](#112-pull-uncontacted-leads-in-one-channel)
    - [11.3 Compare this month vs last month](#113-compare-this-month-vs-last-month)
    - [11.4 See which campaign brought the most qualified doctors](#114-see-which-campaign-brought-the-most-qualified-doctors)
    - [11.5 Identify the cheapest channel](#115-identify-the-cheapest-channel)
12. [Troubleshooting](#12-troubleshooting)
13. [Glossary](#13-glossary)
14. [Advanced / Admin Reference](#14-advanced--admin-reference)
    - [14.1 Updating the Meta access token](#141-updating-the-meta-access-token)
    - [14.2 Deep-link URL parameters](#142-deep-link-url-parameters)
    - [14.3 Where data lives (technical)](#143-where-data-lives-technical)

---

## 1. What This Dashboard Does

The Allocation Assist Dashboard pulls live data from your **Zoho CRM**, **Meta Ads (Facebook & Instagram)**, and **Supabase** (form submissions, marketing expenses, contracts) into a single view.

It answers the questions you ask every day:

- Which **marketing channel** brings the most doctors?
- Who needs **follow-up** today?
- How much did we **spend per qualified lead** this quarter?
- Which **campaign** has the lowest cost per conversion?
- Where in the **pipeline** are doctors getting stuck?

Everything updates automatically. No spreadsheets. No exports. No "let me get back to you on that".

> ![Dashboard home page overview — KPI cards, applications-over-time chart, sidebar visible](img/01_dashboard_overview.png)
> _Screenshot: home page overview_

See [Section 9 — Data & Sync](#9-data--sync) for where each piece of data comes from.

---

## 2. Quick Start (60 seconds)

1. Go to your dashboard URL and **log in** with your work email.
2. The page that appears depends on your role — admins see the [Dashboard](#51-dashboard-home), workers see the [Worker Portal](#511-worker-portal), etc. See [Section 10 — Roles](#10-roles--permissions).
3. Use the **sidebar on the left** to switch pages. See [Section 4](#4-the-sidebar).
4. Use the **top toolbar** for global controls — date range, currency, search, sync. See [Section 3](#3-the-top-toolbar).
5. Press **Cmd+K** (or Ctrl+K on Windows) anywhere to open the universal search — type any doctor name, channel, metric, or page. See [Section 8](#8-universal-search).
6. Click the **AI Assistant button** bottom-right to ask any question in plain English. See [Section 7](#7-the-ai-assistant).

> ![Login screen — email and password fields](img/02_login.png)
> _Screenshot: login screen_

---

## 3. The Top Toolbar

The header bar sits across the top of every page. From left to right:

> ![Top toolbar with all controls labelled](img/03_toolbar.png)
> _Screenshot: top toolbar_

### 3.1 Sidebar Toggle & Breadcrumbs

The icon furthest left collapses or expands the [sidebar](#4-the-sidebar). The breadcrumbs (e.g. **Home › Marketing**) show where you are.

### 3.2 Sync Button (refreshing Zoho)

Click **"Synced X minutes ago"** to pull the latest data from Zoho CRM right now. Most pages auto-sync once an hour, but if you've just updated a lead in Zoho and want it reflected here, hit Sync.

A spinning icon means a sync is in progress. The label updates when it finishes.

> ![Sync button in two states: idle and spinning](img/04_sync_button.png)
> _Screenshot: sync button states_

See also: [Section 9.2 — Refreshing Zoho data](#92-refreshing-zoho-data).

### 3.3 Search (Cmd+K)

Click the **Search** button (or press **Cmd+K** / **Ctrl+K**) to open universal search. Type anything — a doctor name, a metric name, a page name. See [Section 8](#8-universal-search) for full details.

### 3.4 Date Range Picker

Sets the time window everything else on the page filters by. Defaults to **This Year**.

Presets:
- **Today** — just today
- **This Week** — Monday to now
- **This Month** — first of the month to now
- **This Quarter** — start of current quarter to now
- **This Year** — Jan 1 to now (the default)
- **Custom** — pick any two dates

The label inside the picker updates to show what's selected.

> ![Date range dropdown open showing all preset options](img/05_date_picker.png)
> _Screenshot: date picker dropdown_

When you change the date, every chart, KPI, and table on the current page recalculates instantly.

### 3.5 Currency Toggle (AED / USD)

Two-button pill: **AED** | **USD**. Switches every monetary value across the entire dashboard between Dirhams and US Dollars. Conversion is at the standard AED↔USD peg (3.6725 AED = 1 USD).

The toggle affects:
- KPI cards on every page
- Channel economics tables
- Meta Ads cost-per metrics
- Finance transactions list
- Campaign winner cards
- The AI assistant's responses

> ![Currency toggle in AED state and in USD state side-by-side](img/06_currency_toggle.png)
> _Screenshot: currency toggle states_

### 3.6 Export

Downloads the current page's data as a spreadsheet. Useful for sharing with people who don't have dashboard access.

### 3.7 Notifications Bell

Shows up to 5 real-time alerts based on your data. Examples:

- "X doctors have High Priority Follow-up status"
- "Y leads uncontacted for over 30 days"
- "Z license applications still in progress"

The number badge shows unread alerts. Click the bell to see them, click an alert to jump to the relevant filter, or click **Mark all as read**.

> ![Notifications dropdown open showing 3-5 alerts](img/07_notifications.png)
> _Screenshot: notifications panel_

---

## 4. The Sidebar

The vertical navigation on the left lists every page available to you. Pages are filtered by your **role** — see [Section 10.1](#101-role-definitions).

Default order:
1. [Dashboard](#51-dashboard-home)
2. [Sales Tracker](#52-sales-tracker)
3. [Marketing](#53-marketing)
4. [Doctor Progress](#54-doctor-progress)
5. [Team Performance](#55-team-performance)
6. [Finance](#56-finance)
7. [Meta Ads](#57-meta-ads)
8. [Follow-ups](#59-follow-ups)

At the bottom (admins only):
- [Contract Builder](#58-contracts)
- [Import Data](#512-import-data)
- [Settings](#510-settings)

Your account / sign-out controls live below those.

> ![Sidebar fully expanded with all pages visible and the user account block at the bottom](img/08_sidebar.png)
> _Screenshot: sidebar_

---

## 5. The Pages

### 5.1 Dashboard (Home)

The top-level summary. Six clickable KPI cards, an applications-over-time chart, and a [doctor pipeline funnel](#66-pipeline--funnel).

**KPI cards** (each one flips when clicked — front shows the headline number, back shows the breakdown):

| Card | What it shows | Back face |
|---|---|---|
| Qualified Active | Leads currently in qualified stages | Distribution by Lead_Status |
| Lead → Placement | Conversion percentage | Five-step conversion funnel |
| Pipeline Value | Total value of open deals | Top 5 open deals by amount |
| Qualified Leads | Leads passing qualification | List of qualified leads + uncontacted callout |
| Avg. Time to Place | Days from lead created to closed | Individual deals with cycle days |
| Qualification Rate | % qualified out of all leads | Qualified / Unqualified / Not Interested split |

> ![Dashboard with all 6 KPI cards visible — one of them flipped to show the back](img/09_dashboard_kpis.png)
> _Screenshot: KPI cards including one flipped_

**Applications Over Time** — area chart of new leads, qualified leads, and placed leads per month over the last ~9 months.

**Doctor Pipeline** — funnel showing the count at each pipeline stage (see [6.6](#66-pipeline--funnel)).

### 5.2 Sales Tracker

Recruiter-focused view. KPI cards show total leads managed, active in pipeline, contact rate, and urgent follow-ups. Below: top recruiters by performance, conversion stages, and the urgent follow-ups list.

> ![Sales Tracker page](img/10_sales.png)
> _Screenshot: Sales Tracker_

The "Urgent Follow-ups" section lists every High Priority lead with their owner, days in stage, and an SLA-breach indicator (red if older than 7 days).

### 5.3 Marketing

The marketing analytics page. Sections, top to bottom:

1. **Campaign Winners** — three flippable cards (see [Section 6.4](#64-campaigns)): Most Qualified Leads, Lowest Cost / Qualified Lead, Lowest Cost / Conversion. **Click any card to flip it** and see the formula and inputs.
2. **Channel Winner Cards** — Best Channel by volume, Lowest Cost Per Lead, Lowest Cost / Qualified, Best Conversion Rate.
3. **Channel KPI grid** — every channel as a small card with: total leads, contacted (% of total), qualified (%), converted (%). Channels with fewer than 10 leads are hidden by default — click **Show smaller channels** at the top right to reveal them. Clicking any card opens a panel below listing the doctors from that channel.
4. **Doctors Acquired by Channel** (left) and **Contacted vs Still to Reach** (right) — flippable bar charts.
5. **Leads by Source with Spend overlay** — links lead volume to advertising spend per channel.
6. **Channel Economics table** — the full per-channel breakdown: Spend, Leads, Cost / Lead, Qualified, Cost / Qualified, Cost / Conversion, Conversion Rate. **Rows are clickable** — click to drill into that channel's leads. Hover any row to reveal an "Uncontacted →" shortcut.
7. **Channel Breakdown table** — flat summary of every channel with absolute counts and percentages.

> ![Marketing page top section — Campaign Winners + Channel Winners](img/11_marketing_top.png)
> _Screenshot: Marketing top_

> ![Marketing channel KPI grid + bar charts](img/12_marketing_grid.png)
> _Screenshot: Marketing channel grid_

> ![Channel Economics table with one row hovered showing the Uncontacted shortcut](img/13_marketing_economics.png)
> _Screenshot: Channel Economics_

See [Section 6.5 — Cost-per metrics](#65-cost-per-metrics) for what CPL, CPQL, and Cost/Conversion mean.

### 5.4 Doctor Progress

Every doctor in the pipeline, grouped by stage. The "Where Doctors Are Right Now" workflow strip across the top shows the count at each stage. Below: a paginated table of all leads with name, specialty, current stage, recruiter owner, license, days in stage, and a status indicator (on-track / delayed / at-risk).

> ![Doctor Progress page with the workflow strip and table](img/14_doctor_progress.png)
> _Screenshot: Doctor Progress_

The table supports search and URL-based filtering — see [Section 14.2 — Deep-link URL parameters](#142-deep-link-url-parameters).

### 5.5 Team Performance

Recruiter rankings. Each recruiter has: total leads owned, contact rate %, qualified count, placed count. Sortable columns. Useful for comparing workload and effectiveness.

> ![Team Performance page](img/15_team.png)
> _Screenshot: Team Performance_

### 5.6 Finance

Money in, money out. Sections:

1. **KPI cards** — Total Spend, Cost Per Lead, Cost Per Qualified, Top Channel, Biggest Expense, Spend Growth, Avg Monthly, Transaction Count, Revenue (Closed Won), Profit, ROAS, Cost Per Placement. Each flips when clicked to show the breakdown and formula.
2. **Channel Winners** — same cards as on Marketing (see [5.3](#53-marketing)).
3. **Channel Economics table** — same as on Marketing.
4. **Spend over time** chart — monthly spend line.
5. **All Transactions** — every expense, sortable by date, channel, and amount. Search bar filters by description or channel.
6. **Full Breakdown by Channel** — count of transactions, average per transaction, total, and percentage of total per category.

> ![Finance page top — KPI grid and Channel Economics](img/16_finance_top.png)
> _Screenshot: Finance top_

> ![Finance All Transactions table with search and sort headers](img/17_finance_transactions.png)
> _Screenshot: Finance transactions_

The currency toggle ([3.5](#35-currency-toggle-aed--usd)) changes every value here.

### 5.7 Meta Ads

Live performance from the Facebook Marketing API plus form submission analytics.

**Top section — Live Ad Performance:**

1. **8 KPI cards** — Total Spend, Impressions, Reach, Link Clicks, Frequency, CPM, Leads from Ads, Leads from Forms. Every card flips for detail.
2. **Cost-per-funnel KPIs** — Cost Per Lead (forms), Cost Per Qualified, Cost Per Placement.
3. **Campaign Winners** — same flippable cards as Marketing, scoped to Meta data. See [5.3](#53-marketing).
4. **Account chips** — every connected ad account with currency and lifetime spend.
5. **Daily Spend & Clicks** chart.
6. **Spend by Platform** (Facebook vs Instagram) and **Impressions by Age & Gender**.
7. **Top Ads by Leads** — table of best-performing ad creatives with thumbnails. Click **Preview** on any row to see the actual ad.
8. **Campaigns** table — every campaign with objective, spend, impressions, CTR, leads. Click **View Ads** to see the creatives inside that campaign.
9. **Actions & Conversions** — every event Meta tracks (link clicks, page engagements, purchases, etc.).

**Lead Form Submissions section** (data from the Supabase `meta_leads` table):

- KPI cards: Total Leads, Tracked via Ads, Campaigns, Top Country
- **Leads by Campaign** — bar chart from utm_campaign
- **Platform** (utm_source) — pie chart of Facebook / Instagram / Google / etc.
- **Leads by Country** — top countries
- **Top Specialities** — most common specialties

> ![Meta Ads top KPIs and cost-per-funnel cards](img/18_meta_top.png)
> _Screenshot: Meta Ads KPIs_

> ![Meta Ads campaigns table with View Ads buttons](img/19_meta_campaigns.png)
> _Screenshot: Meta Ads campaigns_

> ![Ad preview modal opened from the Top Ads list](img/20_meta_ad_preview.png)
> _Screenshot: ad preview_

The 30D / 90D / 180D / 1Y / All time-range toggle at the top of this page is **independent** of the global date picker — it controls only the Meta API window.

### 5.8 Contracts

Internal contract storage. Search bar (under the input — uses the universal search pattern), list of contracts with doctor name, hospital, status, value, specialty, dates. Admin-only.

> ![Contracts page](img/21_contracts.png)
> _Screenshot: Contracts_

### 5.9 Follow-ups

Every lead currently in a "needs action" state — High Priority, Contact in Future, or aged Not Contacted. Each has a quick "Mark contacted" / "Reschedule" action.

> ![Follow-ups page](img/22_follow_ups.png)
> _Screenshot: Follow-ups_

### 5.10 Settings

Admin-only. Three tabs:

- **Profile** — your own account.
- **Users** — see [Section 10.2](#102-adding-a-user). Lists every user, their role, allowed pages, and a delete button. The **+ Add User** button opens a dialog.
- **Integrations** — Zoho token, Meta Ads token. **Updating the Meta token** is covered in [Section 14.1](#141-updating-the-meta-access-token).

> ![Settings page Users tab](img/23_settings_users.png)
> _Screenshot: Settings Users tab_

### 5.11 Worker Portal

For users with the **Worker** role. Two functions:

1. **Upload records** — submit your call logs / activity for the day.
2. **See previous records** — view your history.

Workers cannot see any other page.

> ![Worker portal](img/24_worker.png)
> _Screenshot: Worker Portal_

### 5.12 Import Data

Admin-only. Lets you bulk-import three things via CSV/spreadsheet paste:

- **Call logs** → `call_log` table
- **Doctor sessions** → `doctor_sessions` table
- **Meta leads** → `meta_leads` table

Header mapping is automatic — the importer reads your column names (even with emoji and `{{field:...}}` template variables) and maps them to the right database columns. See [Section 9.4](#94-importing-data-manually-csv).

> ![Import Data page with the dropdown showing the three import types](img/25_import.png)
> _Screenshot: Import Data_

---

## 6. Key Concepts

### 6.1 Lead Status

Every lead in Zoho has a `Lead_Status` field. The dashboard groups them into five buckets:

| Bucket | Statuses included |
|---|---|
| Not Contacted | "Not Contacted" |
| Attempted | "Attempted to Contact" |
| Active in pipeline | Not Contacted, Attempted to Contact, Initial Sales Call Completed, Contact in Future, High Priority Follow up |
| Qualified | Initial Sales Call Completed, High Priority Follow up, Closed Won |
| Converted | High Priority Follow up, Closed Won |
| Disqualified | Unqualified Leads, Not Interested |
| Deferred | Contact in Future |

**"Contact in Future" is NOT qualified** — it means the recruiter chose to defer the conversation, not that the lead passed qualification. It's grouped under "Deferred" instead.

Note that **Qualified is a superset of Converted** — every converted lead was qualified at some point. See [6.2](#62-qualified-vs-converted-vs-contacted).

### 6.2 Qualified vs Converted vs Contacted

Three terms that get confused often. Here's the clean definition:

- **Contacted** — the team has reached out at least once. Anything except "Not Contacted" status.
- **Qualified** — the lead passed the initial sales call. They're a real prospect. Statuses: `Initial Sales Call Completed`, `High Priority Follow up`, `Closed Won`.
- **Converted** — the lead is actively progressing toward placement, or has been placed. Statuses: `High Priority Follow up`, `Closed Won`.
- **"Contact in Future"** is a special case: the lead has been spoken to but the recruiter chose to defer the conversation. It is NOT counted as qualified or converted. It still appears on the [Follow-ups page](#59-follow-ups) so the team doesn't lose track of it.

Mathematical relationship: **`Total ⊇ Contacted ⊇ Qualified ⊇ Converted`**. Each one is a subset of the previous.

### 6.3 Channels

Where a lead came from. Comes from the Zoho `Lead_Source` field. The dashboard normalizes raw values into clean canonical names:

| Raw values from Zoho | Becomes |
|---|---|
| `Facebook_Mobile_Feed`, `Facebook_Stories`, `Facebook` | Facebook |
| `Instagram_Stories`, `Instagram_Feed`, `Instagram_Reels`, `ig`, `Instagram` | Instagram |
| `google` | Google |
| `Website/SEO`, `Website Landing Page`, `Website Booking Page`, `Website LinkedIn` | Website / SEO |
| `LinkedIn` | LinkedIn |
| `Go Hire` | Go Hire |
| `Referral` | Referrals |
| `xxxxx`, blank, weird values | Uncategorized |

This normalization is what lets us match Zoho leads to marketing spend categories — see [Section 6.5](#65-cost-per-metrics).

### 6.4 Campaigns

A campaign is a specific Meta Ads campaign. Pulled from two places:

- **Meta API** — campaign name, status, objective, spend, impressions, leads, etc.
- **`meta_leads.utm_campaign`** — the campaign ID/name attached to each form submission.

The dashboard joins these two by normalized name (lowercase, alphanumeric only) so a campaign called "MM | CBO Scale | Instant Experience" matches its corresponding `utm_campaign` rows even if formatting differs slightly.

The Campaign Winners cards on Marketing and Meta Ads use this join to compute per-campaign qualified leads and cost-per metrics. See [Section 5.3](#53-marketing).

### 6.5 Cost-per metrics

Four interlocking ratios that measure marketing efficiency:

| Metric | Formula | What it tells you |
|---|---|---|
| **CPL** (Cost Per Lead) | Spend ÷ total leads | What it costs to put any lead in the funnel |
| **CPQL** (Cost Per Qualified Lead) | Spend ÷ qualified leads | What it costs to get a real prospect |
| **Cost / Conversion** | Spend ÷ converted leads | What it costs to get someone who's progressing |
| **CPP** (Cost Per Placement) | Spend ÷ Closed Won deals | What it costs to actually place a doctor |

CPL is the easiest to optimize but least meaningful — cheap leads that never qualify are wasted money. CPQL is more honest. CPP is the gold standard but requires enough closed deals to be statistically reliable (often there are too few).

Lower numbers are better for all of these.

### 6.6 Pipeline & Funnel

Everywhere you see a "pipeline" or "funnel", it's the Zoho `Lead_Status` distribution sorted by stage progression. The standard order:

1. Not Contacted
2. Attempted to Contact
3. Initial Sales Call Completed
4. Contact in Future
5. High Priority Follow up
6. Closed Won (or Closed Lost / Not Interested / Unqualified Leads as terminal states)

The width of each bar in the funnel = the count of leads currently in that stage.

> ![Funnel chart on the Dashboard page](img/26_funnel.png)
> _Screenshot: pipeline funnel_

### 6.7 License Types

UAE health authorities each license doctors separately:

- **DOH** — Department of Health (Abu Dhabi)
- **DHA** — Dubai Health Authority
- **MOH** — Ministry of Health (Federal — Sharjah, Ajman, Fujairah, etc.)

Every Zoho lead has three columns — `Has_DOH`, `Has_DHA`, `Has_MOH` — each holding `Yes`, `No`, or `In Progress`. The Dashboard's License Pipeline section breaks these down for all leads.

---

## 7. The AI Assistant

### 7.1 What it knows

The AI assistant (sparkles button bottom-right) is a chat interface backed by Claude. It has access to:

- **Every Zoho lead** with name, status, recruiter, source, specialty, nationality, license status, contact info, created date.
- **Every Zoho deal** with stage, amount, source, owner, closing date.
- **Recruiter performance** — total leads, contact rate, qualified count, placed count.
- **License pipeline** counts (DOH/DHA/MOH).
- **Contracts** from Supabase.
- **Live Meta Ads data** — when you're on the Meta Ads page, the assistant gets the campaign list, ad spend, top ads, platform breakdowns automatically.
- **Which page you're on** — answers are tailored to the page's context.

### 7.2 Example questions

Click the **AI Assistant** button (or use the prompt chips on the empty chat) and ask anything:

**Lead lookup:**
- "What's the status of Dr. Ahmed Hassan?"
- "Show me all leads owned by Sarah from Facebook"
- "Which Pakistani doctors are in screening?"

**Channel performance:**
- "What's my best marketing channel?"
- "Compare CPL between LinkedIn and Facebook"
- "Which channel has the highest qualification rate?"

**Pipeline:**
- "Where are leads getting stuck?"
- "How many leads have been uncontacted for over 30 days?"
- "Give me 5 actionable insights for today"

**Recruiter:**
- "Who has the most high-priority follow-ups?"
- "Compare contact rates across recruiters"
- "Which recruiter has the lowest contact rate?"

**Finance:**
- "What's our total ad spend this month vs last month?"
- "What's the cost per qualified lead by channel?"
- "How many Closed Won deals do we have?"

**License:**
- "How many doctors have DOH in progress?"
- "Show DHA-licensed doctors in the active pipeline"

**Meta Ads (when on the Meta Ads page):**
- "Which campaign has the lowest CPQL?"
- "What's the breakdown of leads by platform this week?"

> ![AI assistant panel open with example question and a markdown response including a chart](img/27_ai_assistant.png)
> _Screenshot: AI assistant in action_

### 7.3 Tips for asking good questions

- **Be specific about time** — say "this month", "last quarter", or "Q1 2026". The AI parses these.
- **Mention the recruiter or status by name** — "Sarah's leads", "high priority follow-ups".
- **Use natural language** — no need for SQL or jargon.
- **Ask for charts** — the AI will draw bar / pie / line charts inline when relevant.
- **Reset the chat** — the rotating-arrow icon at the top of the panel clears the conversation.
- **Re-index leads** — the **"Index leads"** button at the top of the panel rebuilds the AI's lead database. Run it after big imports.

---

## 8. Universal Search

Press **Cmd+K** (Mac) or **Ctrl+K** (Windows) anywhere in the dashboard — or click the **Search** button in the top toolbar.

Searches across:

- **Pages** — type "marketing", "settings", "meta" to jump straight there.
- **Doctors / Leads** — type any name, specialty, status, recruiter, source, email, phone, nationality.
- **Deals** — by deal name, stage, source.
- **Channels** — "Facebook", "SEO", "LinkedIn".
- **Recruiters** — by name.
- **Transactions** — by category.
- **Metrics** — type "leads by source", "impressions", "cpql", "uncontacted", "best channel" — opens the page where that metric lives.

**Fuzzy matching is on** — typos and partial words still work:
- `marktng` → Marketing
- `ahmd hssan` → Ahmed Hassan
- `fb` → Facebook
- `cpqa` → Cost Per Qualified Lead

Results group by type. Hit Enter on any result to navigate. Hit Esc to close.

> ![Universal search dialog open with results grouped by Pages, Metrics, Doctors, Channels](img/28_search.png)
> _Screenshot: universal search_

---

## 9. Data & Sync

### 9.1 Where the data comes from

| Data | Source | How it gets in |
|---|---|---|
| Doctors (leads) | Zoho CRM | Hourly auto-sync + manual sync button |
| Deals | Zoho CRM | Hourly auto-sync |
| Recruiters / Owners | Zoho CRM (lead.Owner) | Same as leads |
| Marketing spend | Supabase `marketing_expenses` | Manual import (CSV) |
| Form submissions | Supabase `meta_leads` | Form automation (n8n / Make) |
| Meta Ads spend & campaigns | Facebook Marketing API | Live (every page load) |
| Contracts | Supabase `contracts` | Manual entry on Contracts page |
| Users / Roles | Supabase `user_profiles` | Settings → Users tab |

### 9.2 Refreshing Zoho data

Click the **"Synced X minutes ago"** button in the top toolbar. The icon spins while syncing — usually 5–15 seconds.

If sync fails, the icon stops spinning and the timestamp doesn't update. Most common cause: an expired Zoho refresh token. An admin needs to re-authenticate in Settings → Integrations.

> ![Sync button mid-sync with spinner active](img/29_sync_active.png)
> _Screenshot: sync in progress_

### 9.3 Re-indexing leads for the AI

The AI panel has its own **"Index leads"** button at the top. Click it to push every lead through the embedding pipeline so the AI can do semantic search. The progress shows count as it runs.

Re-index after:
- A big batch of new leads in Zoho
- Major status updates across many leads
- The AI starts giving stale answers about specific doctors

### 9.4 Importing data manually (CSV)

Go to **Import Data** in the sidebar (admin only). Pick the table:

- **Call logs**
- **Doctor sessions**
- **Meta leads**

Paste your spreadsheet into the textarea (copy from Google Sheets, Excel, etc.). Click **Parse**. Review the preview. Click **Import**. Done.

The importer **automatically maps your column headers** even if they:
- contain emoji
- have form-template variables like `{{field:e02ed2d6-...}}`
- vary in case
- are in slightly different orders

If a column doesn't map, it's silently dropped — only known fields are imported.

> ![Import Data page after pasting data, showing preview and Import button](img/30_import_preview.png)
> _Screenshot: import preview_

---

## 10. Roles & Permissions

### 10.1 Role definitions

| Role | Pages they can see |
|---|---|
| **Admin** | Everything |
| **Sales** | Dashboard, Sales Tracker, Marketing, Doctor Progress, Team Performance |
| **Finance** | Dashboard, Finance |
| **Worker** | Worker Portal only |
| **Custom** | Whatever pages were checked in the Add User dialog |

Roles are enforced at two levels:
1. **The sidebar** — pages the user can't access don't appear.
2. **The route** — even if a user types the URL directly (e.g. `/finance`), they're redirected to a page they can access.

### 10.2 Adding a user

1. Sign in as an admin.
2. Open **Settings** (gear icon, bottom of sidebar).
3. Go to the **Users** tab.
4. Click **+ Add User**.
5. Fill out:
   - Full name
   - Email
   - Password (the user can change this later)
   - Role (Admin / Sales / Finance / Worker / Custom)
   - If Custom: tick the pages you want them to access
6. Click **Save**.

The user gets created in Supabase Auth + `user_profiles`. They can log in immediately.

> ![Add User dialog](img/31_add_user.png)
> _Screenshot: Add User dialog_

### 10.3 Removing a user

In **Settings → Users**, click the trash icon on their row. Their auth record AND their profile row get deleted. They can no longer log in.

---

## 11. Common Recipes

### 11.1 Find a specific doctor

**Fastest:** Press **Cmd+K**, type their name, hit Enter. You land on Doctor Progress with that name pre-filtered.

**Alternative:** Open the AI Assistant and ask `"What's the status of Dr. [Name]?"`.

### 11.2 Pull uncontacted leads in one channel

1. Go to [Marketing](#53-marketing).
2. Click the channel KPI card you want (e.g. Facebook).
3. The expand panel below shows every doctor from that channel.
4. Click **Pull uncontacted →** at the top right of the panel.

This deep-links you to Doctor Progress with `?source=Facebook&stage=Not%20Contacted` — instant filtered list.

### 11.3 Compare this month vs last month

1. Set the global date picker to **This Month**.
2. Note the KPI numbers.
3. Switch the date picker to **Last Month** (use Custom if needed).
4. Note the KPI numbers again.

Or just ask the AI: `"How many leads did we get this month vs last month?"`.

### 11.4 See which campaign brought the most qualified doctors

Go to [Marketing](#53-marketing) (or [Meta Ads](#57-meta-ads)). The first card under **Campaign Winners** is **Most Qualified Leads**. Click it to flip and see the breakdown of total leads, qualified count, and qualification rate.

### 11.5 Identify the cheapest channel

Look at the **Channel Winner Cards** on [Marketing](#53-marketing). The **Lowest Cost Per Lead** card highlights the cheapest channel by raw CPL. The **Lowest Cost / Qualified Lead** card is more meaningful — it factors in lead quality.

For deep analysis, scroll down to the **Channel Economics table** and sort by `Cost / Qual.`

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows infinite spinner | Auth profile fetch hung | Hard refresh (Cmd+Shift+R). If still stuck, check console for errors and share with admin. |
| Campaign Winners shows "Not enough campaign data" | meta_leads has no qualified leads in the date range, or RLS blocks reads | Widen the date range; check Supabase RLS policy on `meta_leads`. |
| Cost Per Lead shows "—" | Meta API reports 0 leads (some accounts track `purchase` instead of `lead`) | Already handled — falls back to form-leads count. If still empty, check the Meta token. |
| Closed Revenue shows AED 0 | Closed Won deals have `Amount = null` in Zoho | Fix the Amount in Zoho on those deals. |
| AI gives stale answers | Lead embeddings out of date | Click **Index leads** in the AI panel header. |
| Universal search returns nothing | Zoho data hasn't loaded yet | Wait for the sync to finish, then try again. |
| Currency toggle has no effect on a card | That card uses a hard-coded "AED" literal | Send a screenshot to your admin — easy fix. |
| Top toolbar buttons missing on mobile | Hidden by media query for narrow screens | Sync, Export, and Search are desktop-only. The notifications bell and date picker remain. |

If something is broken and not in this table, ask the AI assistant — it has access to error logs.

---

## 13. Glossary

| Term | Meaning |
|---|---|
| AED | UAE Dirham (default currency). Pegged to USD at 3.6725 AED = 1 USD. |
| Active in pipeline | A lead with status Not Contacted, Attempted, Initial Sales Call Completed, Contact in Future, or High Priority Follow up. |
| Auth | Authentication. The login system. |
| Channel | The marketing source a doctor came from (Facebook, LinkedIn, SEO, etc.). |
| Closed Won | A deal that resulted in a placement — revenue earned. |
| Closed Lost | A deal that didn't close. |
| Contacted | A lead the team has reached at least once. |
| Converted | A lead actively progressing toward placement. |
| CPL | Cost Per Lead. |
| CPQL | Cost Per Qualified Lead. |
| CPP | Cost Per Placement. |
| CRM | Customer Relationship Management. Zoho is your CRM. |
| CTR | Click-Through Rate. Clicks ÷ impressions. |
| DHA | Dubai Health Authority. |
| DOH | Department of Health (Abu Dhabi). |
| Embeddings | Numerical representations of leads used by the AI for semantic search. |
| Funnel | A visualization of stage-by-stage progression from cold lead to placement. |
| Lead | A doctor in your CRM. |
| Lead_Source | The channel a lead came from. |
| Lead_Status | The current stage a lead is in. |
| MOH | Ministry of Health (UAE Federal). |
| Pipeline | All leads currently in the funnel (not yet placed and not yet disqualified). |
| Placement | A successful doctor placement at a hospital. Same as Closed Won. |
| Qualified | A lead that has passed the initial sales call. |
| Recruiter | A team member who owns leads. Maps to the Zoho `Owner` field. |
| RLS | Row-Level Security. Supabase's permission model. |
| ROAS | Return On Ad Spend. Revenue ÷ ad spend. |
| ROI | Return On Investment. |
| SEO | Search Engine Optimization. Organic search traffic. |
| Sync | Pulling fresh data from Zoho into the dashboard. |
| USD | US Dollar (alternate display currency). |
| utm_campaign | A query parameter on a marketing URL identifying the campaign. |
| utm_source | A query parameter identifying the platform (fb, ig, google). |
| Workflow strip | The horizontal pipeline visualization on Doctor Progress. |
| Zoho | The CRM system holding all your lead and deal data. |

---

## 14. Advanced / Admin Reference

### 14.1 Updating the Meta access token

Meta access tokens expire every ~60 days. When the token expires, the Meta Ads page shows an error.

1. Generate a new token at [developers.facebook.com](https://developers.facebook.com) with the `ads_read` permission.
2. Open **Meta Ads** in the dashboard.
3. The token error banner will have an input field — paste the new token, click **Save**.

The token is stored in browser localStorage so each admin can use their own. The page hardcodes a fallback token in the build for non-admin users.

### 14.2 Deep-link URL parameters

You can link directly to a filtered view by appending query params to the URL.

**Doctor Progress (`/leads-pipeline`):**

| Param | Example | What it does |
|---|---|---|
| `q` | `?q=Ahmed` | Search the lead list |
| `stage` | `?stage=High%20Priority%20Follow%20up` | Filter by Lead_Status |
| `recruiter` | `?recruiter=Sarah` | Filter by Owner name |
| `source` | `?source=Facebook` | Filter by channel |

Combine them: `/leads-pipeline?source=Facebook&stage=Not%20Contacted` — show every uncontacted Facebook lead.

These are the URLs the [Universal Search](#8-universal-search) and the [Marketing](#53-marketing) drill-down buttons generate.

### 14.3 Where data lives (technical)

| Table / Source | Purpose | Owner |
|---|---|---|
| `zoho_cache` | Cached snapshot of all Zoho leads + deals | Auto-populated by `zoho-sync` edge function |
| `meta_leads` | Form submissions with utm tracking | Filled by your form automation |
| `meta_leads_pipeline` | View on top of `meta_leads` | Auto |
| `marketing_expenses` | Spend by channel and date | Imported manually |
| `contracts` | Contract records | Manual entry on /contracts |
| `user_profiles` | Roles + allowed pages | `create-user` / `delete-user` edge functions |
| `lead_embeddings` | AI search index | `embed-leads` edge function |
| `worker_entries` | Worker portal call logs | Worker Portal |
| `doctor_sessions` | Doctor session imports | Import Data page |
| `weekly_sales` | Pre-aggregated weekly sales | Built from Zoho deals |

The dashboard reads from Supabase via the anon role for browsing. Edge functions run with the service role key for writes and admin operations. Authenticated reads on `meta_leads` require an RLS policy — see [Section 12 — Troubleshooting](#12-troubleshooting).

---

_End of guide. If you found a gap, tell your admin or ask the AI Assistant — both can fix things faster than you'd expect._

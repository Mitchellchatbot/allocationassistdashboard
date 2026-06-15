# 00 — Overview & Architecture

## What this dashboard is

Allocation Assist (AA) is a healthcare recruitment business: it places doctors
into hospitals across the UAE, Saudi Arabia, Qatar, and the wider Gulf. The
business has two halves that feed each other — a **growth/sales** half that finds
and signs up doctors and hospitals, and a **delivery** half (called **Hospital
Introduction**, or **HI**) that actually introduces a doctor to a hospital and
shepherds the placement from first email all the way to a signed offer, the
doctor's relocation, and the final payment.

This dashboard is the single operating surface for both halves. Before it existed,
the work lived in a sprawl of disconnected tools — Zoho CRM for leads, a WordPress
site for public doctor profiles, Typeform and JotForm for intake, Google Sheets
for hospitals/vacancies/expenses, Gmail for the actual introduction emails, Slack
for nudges, and a lot of manual copy-paste between them. The dashboard does not
replace those systems; it sits *on top* of them, pulls their data into one place,
adds the automation and reporting they lack, and pushes changes back where they
belong. Think of it as the **system of engagement** layered over several
**systems of record**.

The most important thing to internalise before reading anything else: **most of
the data you see is not "owned" by the dashboard.** A doctor's profile is owned by
WordPress. A lead is owned by Zoho. A hospital list is owned by a Google Sheet.
The dashboard mirrors them, works with them, and writes back to them — but if you
want to permanently change one of those things, you usually change it at the
source. The Data Sources & Sync doc ([01](01-data-sources-and-sync.md)) maps
exactly which system owns which data and how often the mirror refreshes.

## The five functional areas (and why they're grouped that way)

The left sidebar groups every screen into five sections. The grouping is
deliberate — it follows the lifecycle of a placement and the team that owns each
stage, which is the answer to most "why is this over here?" questions:

1. **Overview** — just the **Dashboard** home screen: a cross-cutting summary
   (pending actions, notifications, headline numbers) so anyone can see the state
   of the business at a glance without opening every section.

2. **Hospital Introduction** — the core product and the reason the dashboard
   exists: **My Workspace, Doctors, Automations, Vacancies, Batch Sends,
   Reports**. This is the delivery engine. A doctor's profile is prepared, matched
   to a hospital's vacancy, introduced by email, and then an automated multi-stage
   flow carries the conversation forward (hospital reply → interview → offer →
   contract → relocation → payment). Everything in this section either prepares a
   profile, sends it, or tracks what happens after.

3. **Sales** — **Sales Tracker, Follow-ups, Calls, Contract Builder**: the team
   that converts leads into signed doctors and hospitals. This is "upstream" of
   HI — it produces the doctors and relationships that HI then introduces.

4. **Growth** — **Marketing, Meta Ads, Forms, Team Performance, Finance**: the
   top of the funnel and the back office. Where leads come from (ad spend, forms),
   how the team is performing, and what it all costs.

5. **Admin** — **Connections, Bulk Import, Import Data, Settings**: the plumbing.
   Wiring up the external data sources, loading data in bulk, and managing who can
   see what.

The split also maps to **page-level access control**: a sales rep doesn't need the
HI delivery screens, an HI operator doesn't need ad-spend reports, and only admins
touch the Admin section. Roles are enforced per page (see the Auth & roles doc in
a later batch), which is *why* the features are bucketed this way rather than
thrown into one flat list.

## The technology, in plain terms

- **Frontend:** a React + TypeScript single-page app built with Vite, styled with
  Tailwind and shadcn/ui components, deployed on **Railway**
  (`allocationassistdashboard-production.up.railway.app`). This is what you click.
- **Backend:** **Supabase** provides four things at once — a **Postgres database**
  (the operational store, ~28 core tables), **Edge Functions** (small Deno
  programs, ~43 of them, that do all the server-side work: syncing, sending email,
  classifying replies, talking to external APIs), **Storage** (buckets for the
  email logo, relocation-guide PDFs, candidate photos/CVs, and the profile-card
  icons), and **Auth** (login + user identity).
- **Email:** **Resend** sends every outbound email and receives hospital replies
  (replies route to a `reply-<id>@reply.allocationassist.com` address that the
  flow engine parses).
- **Chat:** **Slack** receives the high-signal notifications (a doctor completing
  an intake form, a hospital shortlisting a candidate, an interview being
  proposed, a contract being signed).
- **External systems of record:** **Zoho CRM** (leads/contacts), the **WordPress**
  site (public doctor profiles), **Typeform** and **JotForm** (doctor intake),
  **Google Sheets/Drive** (hospitals, vacancies, marketing expenses, the Hammad
  sheet), **Meta** (ad insights), and **Fathom** (call recordings/transcripts).
- **AI:** **Anthropic (Claude)** and **OpenAI** power the smart bits — rewriting
  doctor bios, summarising "area of interest", classifying hospital replies into
  pipeline actions, extracting fields from uploaded CVs, and generating the lead
  embeddings used for matching.
- **Orchestration:** an external **n8n** instance triggers the periodic syncs
  (e.g. Zoho hourly), and Postgres **pg_cron** triggers the in-app scheduler
  (`tick-scheduler`) every ~5 minutes to advance time-based automation stages.

## The end-to-end data flow (the one-paragraph version)

A lead enters **Zoho** (often from a **Meta** ad via a **form**). The Sales team
works it in the **Sales/Calls/Follow-ups** screens. When a doctor signs up, their
profile is created — via a **Typeform/JotForm** intake that lands in
`staged_doctor_profiles` and is published to the **WordPress** "candidate" profile
(photo, specialty, area of interest, CV). The HI team then opens **Doctors**,
picks a candidate, and either **Batch Sends** them to many hospitals or runs a
single **Profile Sent** introduction to one hospital — which mints an automation
**flow run**. From there the **flow engine** (`automation_flow_runs` +
`send-flow-email` + `tick-scheduler`) drives the rest: it sends the introduction,
waits for the hospital's reply (parsed back in via **Resend** inbound and
classified by **Claude**), and advances through interview → offer-signed →
relocation guide + attestation → second payment, firing **Slack** notifications
and dashboard bell alerts at the moments the team needs to act. **Reports** and
**Team Performance** read the resulting `placement_attempts`, `doctor_lifecycle`,
and event tables to show what happened and who did it.

## How to read the rest of these docs

Start with [Data Sources & Sync](01-data-sources-and-sync.md) — it's the map of
"where does this number come from?" that every feature page leans on. After that,
the feature pages can be read in any order, but the **Hospital Introduction**
cluster is the heart of the product and the densest, so it's documented first.

### Glossary

- **HI** — Hospital Introduction; the core delivery workflow and its sidebar
  section.
- **Lead** — a prospective doctor or hospital in Zoho, before they're a signed
  candidate.
- **Candidate / doctor profile** — a doctor's record. The canonical version lives
  on the **WordPress** site (a "candidate" custom post type with ACF fields);
  the dashboard mirrors it in `wordpress_candidates`.
- **CPT / ACF** — WordPress terms: Custom Post Type (the "candidate" record) and
  Advanced Custom Fields (the structured fields on it, like `area_of_interest`).
- **Flow / flow run** — one instance of an automation pipeline for one doctor↔
  hospital pairing, stored in `automation_flow_runs`. It moves through **stages**.
- **Stage** — a single step in a flow (e.g. `email_hospital`, `awaiting_response`,
  `send_relocation_email`). Some stages send an email, some wait for a reply, some
  wait for a timer.
- **Profile Sent** — the flagship flow: introducing one doctor to one hospital.
- **Batch Send** — introducing one doctor (or a set) to many hospitals at once.
- **Shared profile** — a public, tokenised web page showing a doctor's profile,
  linked from the introduction email (hospitals can't see the WordPress profile
  without logging in, so this is the public view).
- **Tick / scheduler** — `tick-scheduler`, the cron job that advances time-based
  flow stages (reminders, overdue chases, payment timers).

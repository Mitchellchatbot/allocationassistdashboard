# Allocation Assist Dashboard — Documentation

This is the complete reference for the Allocation Assist internal dashboard: what
every feature does, **how to use it**, and **how it works** (where the data comes
from, why a feature lives where it does, and what happens behind the button).

It is written for two audiences at once:

- **Operators** (the HI, Sales, and Growth teams) who need to know *how to use*
  each screen day to day.
- **Maintainers** (whoever edits the code next) who need to know *how it works* —
  the tables, edge functions, external systems, and design decisions behind each
  feature.

Every feature page therefore has the same two sections:

1. **How to use it** — the operator's guide: what the screen is for, the buttons,
   the workflows, the gotchas.
2. **How it works** — the engineering view: the data sources, tables, edge
   functions, sync jobs, and the *why* behind the design.

---

## How the docs are organised

The layout mirrors the dashboard's own left sidebar, because the sidebar grouping
*is* the team's mental model of the product. Two foundational documents come
first — read them before the feature pages, because every feature page assumes
you know the architecture and where data lives.

### Foundations (read first)

- [00 — Overview & Architecture](00-overview-and-architecture.md) — what the
  dashboard is, the five functional areas, the tech stack, the end-to-end data
  flow, and the glossary.
- [01 — Data Sources & Sync](01-data-sources-and-sync.md) — every external system
  the dashboard reads from or writes to (Zoho, WordPress, Typeform/JotForm, Google
  Sheets, Meta, Fathom, Resend, Slack, the AI providers), which table each one
  feeds, and how/when it refreshes.

### Feature pages (grouped like the sidebar)

> Pages are checked off as they're written. Unchecked = scheduled for a later
> batch.

**Overview**
- [x] [Dashboard (home)](overview/dashboard.md)

**Hospital Introduction** — the core product
- [x] [My Workspace](hospital-introduction/my-workspace.md)
- [x] [Doctors](hospital-introduction/doctors.md) (responses, pipeline, profiles)
- [x] [Automations](hospital-introduction/automations.md) (the email flows, templates, the engine)
- [x] [Vacancies](hospital-introduction/vacancies.md)
- [x] [Batch Sends](hospital-introduction/batch-sends.md)
- [x] [Reports](hospital-introduction/reports.md)

**Sales**
- [ ] Sales Tracker
- [ ] Follow-ups
- [ ] Calls
- [ ] Contract Builder

**Growth**
- [ ] Marketing
- [ ] Meta Ads
- [ ] Forms
- [ ] Team Performance
- [ ] Finance

**Admin**
- [ ] Connections
- [ ] Bulk Import
- [ ] Import Data
- [ ] Settings (users, roles, page access)

**Systems & cross-cutting** (not single screens, but the machinery several
features share)
- [ ] Authentication, roles & page access
- [ ] Notifications & Slack
- [ ] The email engine (send-flow-email, send-batch, templates, the profile card)
- [ ] Edge-functions catalogue
- [ ] Public pages (Shared Profile, Worker Dashboard)

---

## Build plan (batches)

There is a lot here and we are not cutting depth, so it's produced in batches.
Target: **≥750 words of real explanation per feature.**

- **Batch 1:** README + Overview & Architecture + Data Sources & Sync. *Done.*
- **Batch 2:** Hospital Introduction core — Doctors, Automations. *Done.*
- **Batch 3:** Hospital Introduction — Vacancies, Batch Sends, Reports. *Done.*
- **Batch 3b:** My Workspace + Dashboard. *Done.* (Overview + Hospital
  Introduction clusters complete.) Also added in-app **ⓘ help buttons** on each
  documented page's header, deep-linking to its doc.
- **Batch 4:** Sales — Sales Tracker, Follow-ups, Calls, Contract Builder.
- **Batch 5:** Growth — Marketing, Meta Ads, Forms, Team Performance, Finance.
- **Batch 6:** Admin — Connections, Bulk Import, Import Data, Settings.
- **Batch 7:** Systems — Auth & roles, Notifications & Slack, Email engine,
  Edge-functions catalogue, public pages.

Batch order can be reshuffled — tell me which area you want next.

---

## Conventions used in these docs

- **"HI"** = Hospital Introduction, the core business workflow (introducing a
  doctor to a hospital and managing everything that follows).
- File references are written as `path:line` so they're findable in the repo.
- "Edge function" always means a Supabase Edge Function (Deno) under
  `supabase/functions/`.
- "The flow engine" means the automation system in `automation_flow_runs` +
  `send-flow-email` + `tick-scheduler` (see the Automations page).
- When a doc says a value is "the source of truth", it means that's the system you
  edit to change it everywhere — the dashboard reflects it but doesn't own it.

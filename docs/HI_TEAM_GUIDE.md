# Hospital Introduction — Team Guide

> A walkthrough of the dashboard for the 4 HI team members (Rodaina,
> Mohamed, Sohaila, Ishak). Stick this on a second monitor for the
> first week. After that, hit the **Tour** button in the top bar to
> replay any section.

---

## Table of contents

1. [Your first morning](#1-your-first-morning)
2. [The 6 flows, in order](#2-the-6-flows-in-order)
3. [Where each thing lives](#3-where-each-thing-lives)
4. [The Run Detail Sheet — your main work surface](#4-the-run-detail-sheet--your-main-work-surface)
5. [Sending a profile](#5-sending-a-profile)
6. [Batch sends (Daily Duo, Tuesday 15, Specialty of the day)](#6-batch-sends)
7. [Placements — tracking who joined when](#7-placements--tracking-who-joined-when)
8. [Reassigning a doctor to a different teammate](#8-reassigning)
9. [The AI Assistant — when you're stuck](#9-the-ai-assistant)
10. [End-of-day checklist](#10-end-of-day-checklist)
11. [Glossary](#11-glossary)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Your first morning

When you log in, you'll land on **My Workspace** (`/my-workspace`). That
page is your home base — it's filtered to **only** the work assigned to
you.

You'll see four sections:

| Section | What's in it |
|---|---|
| **Hero strip** | Greeting + counts: total tasks / action-now / stale 7d+ |
| **Tasks waiting on you** | Pipeline rows where you're the bottleneck. Click any row to open it. |
| **My doctors** | Doctors with an active flow assigned to you |
| **My vacancies** | Open roles you opened or own (via a hospital you're responsible for) |
| **Recent activity** | What happened on your runs in the last 7 days |

**Start of every day**: scroll the "Tasks waiting on you" list. Anything
in the **Stale (no activity 7d+)** bucket needs a nudge — open the row
and either fire the next email or leave a note explaining why it's
parked.

---

## 2. The 6 flows, in order

Each doctor moves through these flows. The system emails them and the
hospital automatically; you only step in at the **manual stages**
(marked 🟡 below).

| # | Flow | What happens | When you act |
|---|---|---|---|
| 1 | **Profile Sent** | We email the hospital + notify the doctor. Hospital replies → we classify. | 🟡 Click **Send Profile** to start. 🟡 Confirm shortlist if hospital says yes (suggestion appears as a yellow card). |
| 2 | **Shortlist** | Doctor gets a confirmation email saying they're shortlisted. | Automatic once you confirm in Profile Sent's suggestion card. |
| 3 | **Interview** | Tips + confirmation email goes to the doctor with date / time / format. | 🟡 Log the interview details — date, time, video link. |
| 4 | **Contract** | The **hospital** sends their offer letter (not us). We track milestones. | 🟡 Open Placements (Reports → Placements). Log when offered / when signed / agreed start date. |
| 5 | **Relocation** | Doctor gets the city-specific relocation guide + attestation info. | 🟡 Pick the city when the run sheet asks. |
| 6 | **Second Payment** | Invoice goes 15d after `joined_at` + reminders. 45-day clock to AA's payment. | 🟡 Update `joined_at` in Placements when the doctor actually starts. |

> **What happened to Onboarding?** Sales now sends that intake email
> from Zoho the moment a lead converts to a Doctor on Board. We don't
> double-send.

---

## 3. Where each thing lives

| Page | URL | What you do here |
|---|---|---|
| **Dashboard** | `/` | Cross-team KPIs + Pending Actions bucket (team-wide) |
| **My Workspace** | `/my-workspace` | Your stuff, only your stuff |
| **Automations** | `/automations` | The 6 flow tabs + the **Queues** tab |
| **Doctor Profiles** | `/doctor-profiles` | Edit doctor profiles, see lifecycle + vacancy matches, upload a CV |
| **Vacancies** | `/vacancies` | Open hospital roles. Click row to see candidates |
| **Batches** | `/batches` | Daily Duo / Tuesday 15 / Specialty of the day |
| **Reports** | `/reports` | KPIs + weekly recap + **Placements** + Per-doctor + Hospital health |

⌨️ **Press ⌘K (or Ctrl+K)** anywhere to jump to a doctor, hospital,
vacancy, template, or page by name. Empty search shows your recent items.

---

## 4. The Run Detail Sheet — your main work surface

Clicking ANY row anywhere (Workspace tasks, Pending Actions, Queues,
flow tabs) opens the **Run Detail Sheet** on the right. This is where
~90% of your interactions happen.

Inside it:
- **Timeline** — every email sent, every reply, every note. Scroll up
  to see the whole history.
- **Yellow suggestion card** (if any) — e.g. "Hospital looks
  interested. Mark shortlisted?" Two buttons: **Mark shortlisted** or
  **Not shortlisted**.
- **Action button** for the current stage — e.g. "Send Profile" on
  `email_hospital`, "Pick city" on `select_city_guide`.
- **Reassign** button — hand the run off to another HI member.
- **Add note** — log a phone call, free text. Surfaces in the timeline.

---

## 5. Sending a profile

1. Go to **Automations → Profile Sent**.
2. Click the **Send Profile** button at the top.
3. **Step 1** — pick the doctor. The list ranks by readiness.
4. **Step 2** — pick the hospital(s). Filter by specialty match by
   default. Multi-select is fine.
5. **Step 3** — preview the email exactly as it'll appear in the
   hospital's inbox. Send.

Each hospital you selected becomes its OWN run. The system tracks them
separately (one hospital might shortlist, another might decline).

> The email contains a "**View full profile**" button that links to a
> tokenised AA-website preview. Hospitals click it to see the doctor's
> full bio without a login. View counts are tracked — you can see in
> Reports whether the hospital opened it.

---

## 6. Batch sends

Three recurring blasts. Each is **country-scoped** — create one batch
per country per day, not one big batch to all 95 hospitals.

| Kind | When | What |
|---|---|---|
| **Daily Duo** | Mon-Fri | 2 doctors → all hospitals in the chosen country |
| **Tuesday 15** | Tue | 15 mixed-specialty doctors → all hospitals in the country |
| **Specialty of the day** | Wed-Fri | 1 doctor of today's rotation specialty → all hospitals |

**To create one:**

1. Go to `/batches` → **New batch**.
2. Pick **Kind** + **Country** + **Date**.
3. Click **Create & pick doctors**.
4. Use **Auto-pick top N** (recommended) or hand-pick from the ranked
   candidate list.
5. Click **Send now** when ready.

**Specialty rotation**: the queue is on `/batches` → cursor card. It
cycles through the AA website's ~67 specialties. The cursor
auto-advances every time you send a Specialty-of-the-day batch.

---

## 7. Placements — tracking who joined when

Replaces the old "Hammad sheet" Google sheet. Lives on **Reports →
Placements**.

One row per doctor with a placement happening. Columns:

| Column | What |
|---|---|
| Doctor | Name |
| Hospital | Where they placed |
| Shortlisted | Date hospital confirmed shortlist |
| Interviewed | Date interview happened |
| Offered | Date hospital sent the offer letter |
| Signed | Date doctor signed the offer |
| Start date | Agreed first day at hospital |
| Joined | Actual first day — starts the **45-day clock** |
| 45-day clock | Pill: Paid / N days left / Due in 15d / Overdue |

**Click any row** to open the milestone editor. Set or correct any date.

The 45-day clock starts on `joined_at` and counts down to the date AA's
invoice has to be paid by. **Pay attention to amber + rose pills** —
those need a payment chase.

---

## 8. Reassigning

You can hand any run off to another HI member:

- From the **Run Detail Sheet** header → **Reassign** dropdown.
- From any **Queues** row → overflow menu → **Reassign**.

The list shows the 4 HI members + **Unassigned**. Picking a new
assignee updates everywhere immediately and logs a note in the
timeline.

Hospital owner > picker — if the run was auto-assigned via
`hospitals.owner_email` and you reassign, that override sticks
permanently for that run.

---

## 9. The AI Assistant

Bottom-right floating button → **AI Assistant**.

It knows:
- Every page + button on the dashboard.
- The full HI workflow (this guide).
- Your live data — who's stuck, which hospitals are cooling off, how
  many shortlists in the last 7 days, etc.

Good questions to try:
- "What's stuck right now in my workspace?"
- "Why didn't Dr X's contract send?"
- "Which hospitals haven't replied in 14+ days?"
- "How do I link a lead to a vacancy?"
- "Show me how to send a profile."

If a feature isn't built yet the AI will tell you — it won't make stuff
up. If it's wrong about something, ping Shaheer / Mitchell.

---

## 10. End-of-day checklist

Before logging off:

- [ ] **Workspace → Stale (7d+) bucket is 0** OR every stale row has a
      recent note explaining why.
- [ ] **Queues → Profiles waiting to send**: anything that should have
      gone out today has gone out.
- [ ] **Placements**: any milestone that happened today is logged
      (offered / signed / joined).
- [ ] **Recap (Reports)**: glance at "This week" counts — if signs/joins
      are 0 by Wednesday, check why.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Run** | One instance of a flow for a specific doctor (+ hospital, on Profile Sent). |
| **Stage** | Where the run is in the flow (e.g. `email_hospital`, `awaiting_response`). |
| **Stale** | Active run with no event in 7+ days. |
| **Active** | Run is in flight; system or you can advance it. |
| **Completed** | Run is done. |
| **`assigned_to`** | Who's responsible for the next action. Auto-derived from `hospitals.owner_email`; editable via Reassign. |
| **`created_by`** | Who started the run. Never changes. |
| **Canonical specialty** | The AA-website list (~67 entries). Free-text Zoho specialties resolve to these via fuzzy match. |
| **Suggestion** | Yellow card on a run (e.g. shortlist, interview times). System's hint, you confirm. |
| **45-day clock** | Pill on Placements showing days until AA's invoice deadline (joined_at + 45 days). |

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| "I can't find a doctor" | ⌘K → type their name. Indexed across runs, profiles, vacancies, leads. |
| "Profile preview looks wrong" | Profile Sent dialog → step 3 → check the doctor's profile completion in `/doctor-profiles`. The merge fields come from there. |
| "Hospital reply didn't auto-classify" | Open the run → click **Hospital replied?** → paste the reply text. The AI classifies and shows the suggestion. |
| "I marked shortlisted but the doctor didn't get an email" | Check the run's timeline. If the shortlist run didn't fire, ping support — there might be a send-flow-email error logged. |
| "Batch send said no hospitals" | The selected country has no hospitals with a recruiter email + that country set. Go to Automations → Hospitals → search "—" to find rows missing a country. |
| "I can't see another teammate's work" | Working as intended. HI members see only their assigned runs. Switch the **Mine / All** toggle in Queues if you need to look at the team-wide pool (admins always see All). |
| "I need a CV uploaded" | Doctor Profiles → click the doctor → click **Upload CV**. Or send them a tokenised link from the same page. |
| "Tour stopped halfway" | Hit the **Tour** button in the top bar to replay from the start. |

---

*Last updated: 2026-06-03. If anything in this guide doesn't match what
you see on screen, the dashboard is the source of truth — ping Shaheer
+ Mitchell.*

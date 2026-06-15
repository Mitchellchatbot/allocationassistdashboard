# Automations

The engine that runs every hospital-facing email conversation — from the first
introduction all the way to relocation and final payment. Instead of the team
hand-sending each step, a doctor↔hospital pairing becomes a **flow run** that
moves through **stages**, sending the right email at the right time and waiting on
the right signals.

> **At a glance**
> - **Who uses it:** the HI team.
> - **What it's for:** send and track the multi-step email pipeline that follows a
>   profile introduction.
> - **The big pieces:** *flows* (the pipelines), *runs* (one pipeline for one
>   doctor↔hospital), *stages* (the steps), and the *engine* (`send-flow-email` +
>   `tick-scheduler`).
> - **The golden rule:** **nothing sends blind.** Every manual email shows a
>   preview first; you confirm before it goes.

## The big idea in 30 seconds

- A **run** lives in `automation_flow_runs` and has a `current_stage`.
- A **stage** is one step. Some stages **send an email**, some **wait for a
  reply**, some **wait for a timer**, some are **terminal** (the run is done).
- `send-flow-email` renders and sends a stage's email, then advances the run to
  the next stage.
- `tick-scheduler` runs every ~5 minutes and pushes along any stage that's waiting
  on a timer (reminders, overdue chases, payment clocks).
- Hospital replies come back, get **classified by AI**, and either advance the
  flow or surface a suggestion for the team to confirm.

---

## The flows (the placement lifecycle)

Six flows are live, in this order — they mirror the journey of a placement:

| Flow | Starts when | What it does | Ends when |
|---|---|---|---|
| **Profile Sent** | Team sends a profile to a hospital | Emails the hospital the candidate (+ notifies the doctor), then waits for a reply | Hospital responds, or team closes it |
| **Shortlist** | Team clicks *Mark shortlisted* | Tells the doctor they've been shortlisted | Email sent |
| **Interview** | Team logs an interview (date/time/format) | Sends the doctor confirmation + interview tips | Email sent |
| **Contract Check-in** | Team clicks *Mark offer extended* | Nudges doctor + hospital while we wait for the doctor to sign | Team clicks *Mark signed* |
| **Relocation** | A contract is signed | Sends the city-specific relocation guide, then the attestation info | Both emails sent |
| **Second Payment** | 15 days after the joining date | Invoice + payment link, then escalating reminders | Finance marks it paid |

> A 7th flow, **Onboarding**, still exists in the code but is hidden — Sales now
> sends the intake form from Zoho, so AA's version is redundant. Old runs still
> render; no new ones start.

**How they chain:** a positive hospital reply on **Profile Sent** leads the team
to **Shortlist** → **Interview** → **Contract** → **Relocation** → **Second
Payment**. Each flow's trigger dialog pre-filters to doctors who finished the
previous flow, so you're always working the right list.

---

## How to use it

### The flow board

Each flow has a tab showing a diagram of its stages and a table of its current
runs (doctor, current stage + progress, hospital, status, last activity). Click
any run to open the **run detail sheet**.

### Sending an email — the golden rule

Any time you send (the current stage's *Send now*, a relocation guide, an
attestation, a shortlist/interview email), a **preview dialog** opens first
showing the exact rendered email (from, to, subject, body). Only **Confirm**
actually sends. This is deliberate — it makes every send intentional and prevents
shipping the wrong template or a half-filled profile.

### The run detail sheet — what you can do

- **Send now / Resend** — preview + send the current stage's email.
- **Hospital replied?** (Profile Sent runs) — paste the hospital's reply; AI
  classifies it and either advances the flow or surfaces a suggestion (below).
- **Reassign** — change which HI team member owns the run (affects the From /
  Reply-To address).
- **Track placement** — jump to Reports → Placements with this doctor open.
- **Add notes** — log context on any stage (useful when replies land in a personal
  inbox the parser can't see).

**Flow-specific panels appear when relevant:**

- **Shortlist suggestion** (yellow card) — when the classifier thinks the hospital
  is interested. You confirm only if you've *actually* been told shortlist (often
  it's by phone). Confirm → the Shortlist run is created and the email sends.
- **Interview time picker** — when the hospital proposed times in their reply, pick
  a slot → preview the tips email → confirm. The Interview run is created.
- **Contract check-in** (green card) — *Has the doctor signed?* Pick the signed
  date → **Mark signed**. This records the signature, fires a Slack ping, and
  opens the Relocation flow.
- **Relocation** — pick the city, then a two-step: **Send relocation guide**, then
  **Send attestation info** (each previewed). The run pauses between them on
  purpose so you can review the attestation copy.
- **Second Payment** — fill in the payment link + invoice number; they appear on
  the invoice and reminder emails when they fire.

### Triggering a flow manually

Use the trigger dialog (e.g. *Send profile*, *Mark interview confirmed*). You pick
the doctor (pre-filtered to the previous stage), the hospital, any extra data
(interview time, joining date…), preview the first email, and confirm. For a
profile sent to several hospitals, each hospital gets its **own run** and is
**BCC'd** so they can't see each other.

### Editing templates

The **Email Templates** tab edits the subject/body of every stage email. They use
`{{tokens}}` (doctor name, hospital, city, payment link, the profile card, the
signature, …). Edits take effect on the next send; runs already in flight keep the
copy they started with.

### "Run scheduler now"

A button that triggers `tick-scheduler` on demand (instead of waiting for the
5-minute cron) — handy for testing reminders and payment timers. It reports how
many runs it inspected, sent, skipped, and errored.

---

## How it works

### The three tables

- **`automation_flow_runs`** — one row per doctor↔hospital pipeline, with its
  `current_stage`, `status`, `assigned_to`, and a `metadata` blob (city,
  interview time, invoice details, classifier suggestions…).
- **`automation_flow_events`** — the timeline: every `email_sent`, note, error,
  and stage entry.
- **`automation_flow_configs`** — per-flow overrides (enable/disable a flow,
  tweak a stage's subject or delay).

### `send-flow-email` — the dispatcher

A hardcoded `STAGE_ROUTES` map says, for each sendable stage: which **template**
to render, the **next stage** to advance to, whether it's **terminal**, and
whether to **auto-continue** (immediately fire the next email — used for bundled
pairs like the hospital + doctor emails on Profile Sent). On send it:

1. Loads the run and resolves the **sender** from `assigned_to`.
2. **Refuses to double-send** — if the stage already has an `email_sent` event it
   returns "already sent" (reminders are the exception; they're allowed to repeat).
3. Loads the email template and builds the **token map** from the doctor's profile
   (WordPress → legacy → staged fallback), attaching relocation PDFs and minting a
   shared-profile link where relevant.
4. **Refuses to ship PLACEHOLDER copy** — a safety gate so an unedited seed
   template never reaches a hospital.
5. Picks the **recipient** (hospital recruiter for the intro stage, the doctor
   otherwise), sends via **Resend**, writes the `email_sent` event, and advances
   the stage.

### Replies: the two routing modes

- **Personal routing** — if the run is owned by a known HI member, the Reply-To is
  *their* mailbox, so replies land in their Gmail. (The dashboard parser can't see
  these; the team captures context via run notes.)
- **Parser routing** — otherwise the Reply-To is
  `reply-<run_id>@reply.allocationassist.com`. **Resend Inbound** receives it, the
  `inbound-hospital-reply` function matches the `<run_id>` back to the run, and the
  reply is classified.

**Classification** (`classify-hospital-reply`, Claude): a reply is sorted into
*shortlisted*, *proposing_interview* (with the time slots parsed out),
*declined*, *needs_more_info*, or *unclear*. Crucially, "shortlisted" only
**suggests** a shortlist — it never auto-sends the doctor a congratulations email,
because hospitals usually confirm by phone. The team confirms manually.

### `tick-scheduler` — the timers

Every ~5 minutes it advances stages that are waiting on time:

| Stage | Fires when |
|---|---|
| `wait_for_form` | 3 days with no form |
| `awaiting_response` | 7 days, no hospital reply → team chase notification |
| `awaiting_signature` | 5 days → signature reminder to doctor + hospital |
| `trigger_15_days` | joining date + 15 days → second-payment invoice |
| `reminder_25_working` / `reminder_day_before` / `reminder_weekly` | payment cadence until paid |
| `interview_complete` | 72h post-interview → team follow-up notification |

It also handles non-flow chores: vacancy match/follow-up alerts, "signed but not
joined" chases, overdue-payment escalations, and the scheduled batch sends.

### Notifications

Milestone signals (shortlist suggested, interview proposed, contract signed,
hospital declined) write to the `notifications` table and ping **Slack**. Routine
chases stay in the dashboard bell only. (See the Notifications & Slack systems
doc.)

---

## Why it's built this way (the decisions worth knowing)

- **Preview-before-send everywhere** — accidental sends to hospitals are
  expensive; a forced preview makes every send deliberate.
- **Shortlist never auto-advances** — avoids emailing a doctor "you're
  shortlisted!" when the hospital only asked for more CV detail.
- **Contract is tracking-only** — the offer is between hospital and doctor; AA just
  logs the signature and moves onboarding forward (no contract is sent by AA).
- **Relocation is split into two previewable emails** — so the team can review the
  country-specific attestation copy on its own rather than firing it blind.
- **Multi-hospital sends are BCC'd** — hospitals don't see they're competing for
  the same candidate.
- **Reminders are idempotent but allowed to repeat** — normal stages can't
  double-send; reminder stages intentionally loop until resolved.

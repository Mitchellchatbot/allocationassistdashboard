# My Workspace

Your personal home base — everything on *your* plate, in one place, ordered so the
most urgent work sits at the top. Where Automations shows *all* runs and Reports
shows *team* metrics, My Workspace answers a single question: **"what do I need to
do right now?"** It's scoped to the signed-in user (admins can see the whole
team's work).

> **At a glance**
> - **Who uses it:** every HI team member, as their daily starting screen.
> - **What it's for:** see your assigned tasks, leads to contact, follow-ups due,
>   and profile/CV work — and jump straight into each.
> - **Where the data lives:** it's a *view*, not a new data source — it filters the
>   existing flow runs, leads, staged profiles, and CV records to the things
>   assigned to you.
> - **Scoped vs all:** normally scoped to you; an admin/unscoped view shows all
>   active work across the team.

## What you see

A hero strip with four live counters, then the work itself:

| Counter | Means |
|---|---|
| **Action now** | Flow runs assigned to you waiting on a manual step *right now* (send a profile, schedule an interview, pick a relocation city, mark signed…) |
| **Follow-ups due** | Overdue follow-ups on your leads |
| **Leads to contact** | Uncontacted leads + overdue follow-ups assigned to you (paid leads pinned to the top) |
| **CVs to chase** | Doctors whose CV you still need to collect/upload |

Below the counters, the actual queues:

- **Leads to contact & follow-ups due** — your outreach list, with paid leads
  pinned and flagged so money-in-hand opportunities don't slip.
- **Tasks awaiting action** — your active flow runs, grouped by the kind of step
  they're waiting on (so all the "send profile" tasks sit together, all the "pick
  interview time" tasks together, etc.).
- **Queued profile & CV work** — staged profiles waiting to be finished/published,
  plus CVs to chase.

## How to use it

1. **Start your day here.** The four counters tell you instantly whether anything
   needs you. A red **Action now** means a flow is stuck on a manual step.
2. **Work top-down.** The page is deliberately ordered with the actionable work
   above the fold — clear the red items first.
3. **Click any row to jump in.** A task row opens the relevant run (in
   Automations); a lead row takes you to the doctor; profile work deep-links into
   **Doctors → Profiles** (pre-filtered by name) so you can finish and publish.
4. **Paid leads first.** They're pinned and flagged on purpose — a paid lead that
   isn't being worked is the most expensive thing to drop.

> **First-time tour:** new HI users get a short guided tour the first time they
> land here, pointing out the counters and queues.

## How it works

- A single hook (`useMyWorkspace`) assembles the page from **owner-scoped**
  datasets: the flow runs whose `assigned_to` is you, your leads (from the Zoho
  cache), your staged profiles, and your CV-chase list. Nothing here is a new
  table — it's a focused lens over data the rest of the dashboard already owns.
- **"Action now"** is computed from flow runs sitting on a manual stage (the same
  stages that show a button in the Automations run sheet). That's why clearing a
  task here and refreshing drops the counter — the run has moved on.
- **Scoping** is the core idea: `scoped` true → filtered to your email; an
  unscoped/admin view widens it to all active work, with the page copy changing to
  say so. Assignment is set by the **Reassign** control on a run (in Automations),
  so My Workspace reflects whoever currently owns each run.
- **Deep-links out** keep the page thin: rather than re-implement editing, rows
  route to the canonical screen (Automations for runs, Doctors → Profiles for
  profile/CV work) carrying the right filter in the URL.

## Why it exists (vs Automations and Reports)

These three screens look at the same underlying work from different angles, on
purpose:

- **My Workspace** — *"what's mine, and what's urgent?"* (personal, action-first).
- **Automations** — *"the full state of every pipeline"* (all runs, all stages).
- **Reports** — *"how are we doing?"* (team and outcome metrics).

Splitting them means an operator isn't wading through everyone's runs to find
their own next action, and management isn't digging through individual task lists
to read the numbers.

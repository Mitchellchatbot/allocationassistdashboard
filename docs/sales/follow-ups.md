# Follow-ups

The sales team's daily work queue — the leads that need a callback, split into the
two action lists that matter, with one-click status changes and the call history
right there. Where Sales Tracker *reports* on performance, Follow-ups is where
recruiters actually **work the leads**.

> **At a glance**
> - **Who uses it:** sales recruiters, every day.
> - **What it's for:** clear the "needs a callback" queue and keep lead statuses up
>   to date.
> - **Where the data lives:** **Zoho** leads (cached); call history from the
>   `call_log` + `doctor_sessions` tables.
> - **Writes back:** changing a status here updates **Zoho** directly.

## What you see

- **Two tabs** with live counts:
  - **High Priority** (red) — leads in "High Priority Follow up"; these owe a
    callback.
  - **Contact in Future** (blue) — deferred leads to revisit.
- **Search + recruiter filter** — find a doctor by name, or narrow to one
  consultant's leads.
- **An SLA notice** (High Priority tab) — "must be actioned within 2 days; leads
  past SLA are shown first."
- **Lead cards** — each row shows the doctor, recruiter, specialty, country, and
  "days in stage" (red if past SLA), with a **status dropdown** on the right.
  Expand a card to see the doctor's **call history**.

## How to use it

1. **Start on High Priority.** Breached-SLA leads are sorted to the top — work
   those first.
2. **Open a lead's history** — click the name to expand and review past calls/notes
   before you ring, so you don't repeat yourself.
3. **Change the status** — use the dropdown to move the lead (e.g. to "Initial
   Sales Call Completed" or "Contact in Future"). It saves to Zoho immediately; a
   green "Updated" badge confirms it.
4. **Filter to yourself** (or a teammate) with the recruiter dropdown to focus on
   your own list.
5. An empty queue shows an "All clear" check — that's the goal.

## How it works

- Leads come from `useZohoData()` (the cached Zoho leads); the two tabs simply
  filter on `Lead_Status`. Search and the recruiter filter are applied in the
  browser, so the list is instant.
- **Call history** is fetched on demand when you expand a lead. It merges two
  tables matched by the doctor's name:
  - `call_log` — imported/bulk call records,
  - `doctor_sessions` — team call sessions (date, outcome, notes, meeting type).
  Both render as one chronological timeline with colour-coded outcome badges.
- **Status changes** call Zoho through the `zoho-proxy` edge function
  (`PUT /Leads/{id}`), then patch both the in-memory cache and the `zoho_cache`
  row so the change sticks across reloads and shows up on the Sales Tracker after
  the next read.
- **The 2-day SLA** is computed from days-in-stage; breaches get a red badge and
  sort first on the High Priority tab.

## The statuses you can set

From the dropdown a lead can move to any Zoho `Lead_Status`: **High Priority
Follow up**, **Contact in Future**, **Initial Sales Call Completed**, **Not
Contacted**, **Attempted to Contact**, **Unqualified**, or **Not Interested**.
Moving a lead *out* of the current tab's status makes it drop off that list on the
next render — which is exactly how you "clear" the queue: action it, set the right
status, and it leaves.

## How the call history is matched (and why by name)

When you expand a lead, the timeline is built from two tables queried in parallel
and merged chronologically:

- **`call_log`** — bulk/imported call records.
- **`doctor_sessions`** — team-logged call sessions (with extras like
  qualifications, call state, and meeting type).

They're matched to the lead by a **normalised doctor name** (honorifics like "Dr."
stripped, lower-cased, fuzzy `ilike`) because Zoho's API doesn't reliably expose a
lead's email/phone — so name is the dependable join key. Outcome badges are
colour-coded (high potential / converted = green, follow-up = blue, minimal =
amber, declined = red, unsure = grey) so you can read a doctor's history at a
glance before calling.

## What happens when you change a status (under the hood)

The change is **optimistic and write-through**: the row shows a spinner, the call
goes to Zoho via `zoho-proxy` (`PUT /Leads/{id}`), and on success the dashboard
patches *both* the in-memory query cache *and* the `zoho_cache` row. That dual
patch is why the change survives a refresh and why it's already reflected on the
Sales Tracker and Doctor Progress screens — they all read the same cache. On
failure you get a red error for a few seconds and the lead keeps its old status.

## Why it's built this way

- **Two tabs, not a big list** — recruiters care about exactly two queues (hot vs
  deferred); separating them keeps the day focused.
- **History on tap** — matching call records by name (Zoho often doesn't expose
  email/phone via the API) means a recruiter sees the full context before calling.
- **Write-through to Zoho** — Zoho stays the source of truth for lead status; the
  dashboard is a faster front end over it, and the dual cache-patch keeps every
  other screen (Sales Tracker, Doctor Progress) consistent.
- **Execution vs reporting** — pairing this with the read-only Sales Tracker means
  the people doing the work and the people watching the numbers each get a screen
  built for their job.

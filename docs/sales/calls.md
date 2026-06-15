# Calls

The sales team's call archive — every recorded sales meeting (via **Fathom**) with
its AI summary, action items, and a searchable transcript, all in one place so
reps can review what was said without leaving the dashboard.

> **At a glance**
> - **Who uses it:** the sales reps (Abraham, Asser, Asim) and their leads.
> - **What it's for:** find and review past sales calls — summary, action items,
>   full transcript.
> - **Where the data lives:** the `fathom_calls` table, fed by Fathom (webhooks +
>   sync) through the `fathom-proxy` / `fathom-webhook` edge functions.
> - **Read-only:** calls flow in automatically; you review, you don't edit.

## What you see

- **KPI tiles:** total calls, total talk time, average call length, and how many
  calls had external guests.
- **A calls table:** date, title, host (the rep), participant count, duration, and
  an "Open in Fathom" link. Duration shows a spinner while Fathom back-fills it.
- **Search + host filter:** search runs across title, summary, transcript, and host;
  the host dropdown narrows to one rep.
- **A sync control:** "Sync now", plus an auto-sync indicator ("auto-sync · Xs
  ago").
- **A call detail drawer** (click any row): the metadata, the **AI summary**, the
  **action items**, and the **transcript** — with its own search box to jump to a
  moment or speaker.

## How to use it

1. **Find a call** — search by doctor/topic or filter to a rep, then scan the table.
2. **Open it** — click the row to read the AI summary and action items first
   (fastest way to recall what happened).
3. **Search the transcript** — type in the drawer's transcript box to jump to the
   exact exchange; segments show speaker + timestamp.
4. **Open in Fathom** — for full playback (audio/video), follow the link to
   Fathom.
5. **Sync if needed** — calls usually arrive automatically; hit "Sync now" if you
   just finished a call and want it immediately.

## How it works

- **Calls arrive two ways:** Fathom posts a webhook when a meeting completes
  (`fathom-webhook`), and a background **auto-sync** (every ~10 min) plus a manual
  "Sync now" back-fill anything missed. Both write to the `fathom_calls` table via
  `fathom-proxy`.
- **Enrichment:** if a call lands without its duration, the function fetches the
  per-meeting detail asynchronously — that's the "fetching" spinner you see in the
  duration column until it resolves.
- **Scoped to the sales reps:** the host list is filtered to the sales team
  (Abraham, Asser, Asim) by name/email, so HI/ops calls don't clutter the view.
- **Stored for speed:** summaries, action items, and transcripts are cached in the
  table, so searching across them is instant and works offline of Fathom. The
  KPI counts are computed across the full table (not just the visible page).
- **Authenticity:** the Fathom webhook is verified by an HMAC signature over the
  raw request body — no shared bearer token needed.

## The sync strategy, in detail

Three mechanisms keep the archive complete without hammering Fathom:

1. **Webhook (instant):** when a meeting completes, Fathom POSTs to
   `fathom-webhook`, which upserts the call by `fathom_id` (idempotent, so repeats
   don't duplicate).
2. **Auto-sync (safety net):** roughly every 10 minutes the page asks `fathom-proxy`
   for anything since the last known call (minus a 24-hour overlap to catch
   late-arriving recordings). It pauses while the browser tab is hidden, and it
   skips the very first run when the table already has data — so it never floods
   Fathom's API on load.
3. **Enrich (back-fill):** some calls arrive without a duration; a background pass
   fetches the per-meeting detail and fills it in. That's the "fetching" spinner in
   the duration column; it stops once every row has a duration (or makes no
   progress for a minute).

If Fathom rate-limits (HTTP 429), the function retries a few times with
exponential backoff.

## Reading a transcript

In the detail drawer the transcript is shown as **segments** — each with the
speaker's name and a timestamp — so you can scan who said what. The search box
filters segments live, which is the fastest way to jump to a specific moment (e.g.
search "salary" to find the compensation discussion). If a call's segmented
transcript isn't available, it falls back to the plain-text transcript. The
summary and action items above it are Fathom's AI output, cached in the row so
they load instantly.

## A note on the KPI counts

The visible table caps at the most recent 500 calls for speed, but the KPI tiles
(total calls, talk time, average length, external-guest count) are computed across
the **entire** table, so the headline numbers are accurate even when the list is
truncated. When you're searching, the KPIs reflect the filtered set; with no
search, they reflect the full archive.

## Why it's built this way

- **A reference, not a funnel** — there's deliberately no "link this call to a
  doctor" action here. The page is an archive reps consult; the actual lead
  workflow lives in Zoho (Follow-ups / Doctor Progress). Keeping Calls read-only
  keeps it simple and fast.
- **Webhook + sync belt-and-braces** — webhooks are instant but can be missed
  (clock skew, late arrivals), so a periodic sync guarantees nothing falls
  through; the first sync is skipped when the table already has data to avoid
  hammering Fathom's API.
- **Sales-only hosts** — per the team's call, only the three reps appear, so the
  archive stays relevant to the people who use it.

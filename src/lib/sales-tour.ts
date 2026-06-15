/**
 * Guided product tour for the Sales section — in-depth training.
 *
 * Pattern: per page, spotlight the sidebar entry ("where it lives"), navigate in
 * and spotlight the key element, then concept slides for the deeper behaviours.
 * The provider handles route navigation + retries the target until it mounts;
 * the sidebar force-expands every section while a tour runs so the sidebar
 * spotlights always land.
 *
 * Bump SALES_TOUR_ID whenever you add/remove steps or rewrite the copy.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const SALES_TOUR_ID = "sales-tour-v3";

export const SALES_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Sales — full walkthrough",
    body:   "We'll visit all four sales screens and the things that matter on each: watching performance, working leads, reviewing calls, and sending contracts. About 4 minutes. Every page also has an ⓘ help button for the full written guide, and you can replay this any time from the Tour button up top.",
  },

  // ── Sales Tracker ───────────────────────────────────────────────────
  {
    target: "sidebar-sales",
    title:  "Sales Tracker — the scoreboard",
    body:   "Management's read-only view of team and pipeline performance. You don't work individual leads here — that happens in Follow-ups. This is the screen for watching how the team and the funnel are doing over a chosen period. Let's look inside.",
    placement: "right",
  },
  {
    route: "/sales",
    target: "sales-kpis",
    title:  "The five KPIs",
    body:   "Leads Managed, Active in Pipeline, Lead Conversion Rate, Qualified-Contact Rate, and Urgent Follow-ups. Click any card to flip it open for a per-recruiter breakdown. All five respect the date range at the top of the page.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Definitions that matter",
    body:   "'Qualified' means a lead reached 'Initial Sales Call Completed' or 'High Priority Follow up' — a scheduled 'Contact in Future' is a deferral and does NOT count. 'Conversion' means a Doctor-on-Board record was created. The numbers read from the cached Zoho data, so they're as fresh as the last sync — no live API hit, which is why the page loads instantly.",
  },
  {
    placement: "center",
    title:  "The recruiter leaderboard",
    body:   "Below the KPIs is the funnel — stage-by-stage drop-off so you can see where leads stall — and a leaderboard with one row per consultant (contact % and conversion %, best-first). This is the screen for 1:1s and pipeline reviews. The actual dialling and status-changing happens next door in Follow-ups.",
  },

  // ── Follow-ups ──────────────────────────────────────────────────────
  {
    target: "sidebar-follow-ups",
    title:  "Follow-ups — your work queue",
    body:   "Where recruiters actually clear the 'needs a callback' list. This is the execution surface that the Tracker reports on — if the Tracker is the scoreboard, this is the field.",
    placement: "right",
  },
  {
    route: "/follow-ups",
    target: "followups-tabs",
    title:  "Two queues: Hot vs Deferred",
    body:   "'High Priority' (red — owes a callback within ~2 days; the most overdue float to the top) and 'Contact in Future' (deferred conversations). Search by name, or filter to a single recruiter to focus on your own list. Rows are ordered by who's been waiting longest, so you always work the most-neglected lead first.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Work a lead end-to-end",
    body:   "Expand any lead to see its full call history — merged from the call_log and doctor_sessions tables, matched by name, with colour-coded outcomes — so you never repeat a call you've already made. Change the status dropdown and it writes straight back to Zoho, instantly updating the Tracker and Doctor Progress too.",
  },

  // ── Calls ───────────────────────────────────────────────────────────
  {
    target: "sidebar-calls",
    title:  "Calls — the recording archive",
    body:   "Every recorded sales call (captured via Fathom) for the three reps — Abraham, Asser and Asim — each with its AI summary, action items, and a fully searchable transcript.",
    placement: "right",
  },
  {
    route: "/calls",
    target: "calls-toolbar",
    title:  "Find any call",
    body:   "Search across titles, summaries and transcripts at once, or filter by host. Calls arrive automatically (a Fathom webhook plus a background auto-sync); 'Sync now' pulls the latest on demand. The KPI tiles count across the entire archive, not just the page you're looking at.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Reviewing a call",
    body:   "Click a row to open the detail panel: read the AI summary and action items first to get the gist in seconds, then search inside the transcript (each segment shows speaker + timestamp) to jump to a moment — e.g. search 'salary' to land on the comp discussion. 'Open in Fathom' gives you the full recording.",
  },

  // ── Contract Builder ────────────────────────────────────────────────
  {
    target: "sidebar-contracts",
    title:  "Contract Builder",
    body:   "Build and e-sign Allocation Assist's OWN service agreement with a doctor, via BoldSign. Keep this distinct from the hospital's offer letter — that's a separate thing the Automations 'Contract' flow only tracks. This page is specifically AA's fee agreement with the doctor.",
    placement: "right",
  },
  {
    route: "/contracts",
    placement: "center",
    title:  "Send a contract in a few clicks",
    body:   "Search for a doctor, or pick one from 'Suggested next contracts', which surfaces who just cleared a pipeline stage. Adjust the fee terms and the live preview updates as you type; optionally set the placement hospital, then hit Send for Signature. The doctor signs from their email — no login required.",
  },
  {
    placement: "center",
    title:  "What signing triggers",
    body:   "When the doctor signs, BoldSign's webhook fires automatically: the signed contract is recorded, a Zoho 'Doctor on Board' record is created, and the Relocation flow kicks off — jumping straight to the city guide if you set the hospital (so the doctor doesn't get a redundant 'which city?' email). The Sent Contracts table tracks every send's status — Sent → Viewed → Signed — live.",
  },

  {
    placement: "center",
    title:  "That's Sales",
    body:   "Remember the ⓘ help button on each page for the full written guide, and the AI Assistant for questions about your live data ('who haven't I called back this week?'). Now go convert some leads.",
  },
];

/**
 * Guided product tour for the Sales section — in-depth training.
 *
 * Pattern: per page, spotlight the sidebar entry ("where it lives"), navigate in
 * and spotlight the key element, then concept slides for the deeper behaviours.
 * The provider handles route navigation + retries the target until it mounts.
 *
 * Bump SALES_TOUR_ID whenever you add/remove steps.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const SALES_TOUR_ID = "sales-tour-v2";

export const SALES_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Sales — full walkthrough",
    body:   "We'll visit all four sales screens and the bits that matter on each: tracking performance, working leads, reviewing calls, and sending contracts. ~4 minutes. Replay any time from the Tour button up top.",
  },

  // ── Sales Tracker ───────────────────────────────────────────────────
  {
    target: "sidebar-sales",
    title:  "Sales Tracker — the scoreboard",
    body:   "Management's read-only view of team + pipeline performance. You don't work individual leads here — that's Follow-ups. This is where you watch how the team and the funnel are doing. Let's look inside.",
    placement: "right",
  },
  {
    route: "/sales",
    target: "sales-kpis",
    title:  "The five KPIs",
    body:   "Leads Managed, Active in Pipeline, Lead Conversion Rate, Qualified-Contact Rate, and Urgent Follow-ups. Click any card to flip it open for a per-recruiter breakdown. Everything respects the date range up top.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Definitions that matter",
    body:   "‘Qualified’ = a lead reached ‘Initial Sales Call Completed’ or ‘High Priority Follow up’ — a scheduled ‘Contact in Future’ is a defer and doesn't count. ‘Conversion’ = a Doctor-on-Board was created. The numbers come from the cached Zoho data, so they're as fresh as the last sync (no live API hit).",
  },
  {
    placement: "center",
    title:  "The recruiter leaderboard",
    body:   "Below the KPIs sits the funnel (stage-by-stage drop-off) and a leaderboard — one row per consultant with contact % and conversion %, sorted best-first. This is the screen for 1:1s and pipeline reviews; the doing happens in Follow-ups.",
  },

  // ── Follow-ups ──────────────────────────────────────────────────────
  {
    target: "sidebar-follow-ups",
    title:  "Follow-ups — your work queue",
    body:   "Where recruiters actually clear the ‘needs a callback’ list. This is the execution surface that the Tracker reports on.",
    placement: "right",
  },
  {
    route: "/follow-ups",
    target: "followups-tabs",
    title:  "Two queues: Hot vs Deferred",
    body:   "‘High Priority’ (red — owes a callback within 2 days; breaches sort to the top) and ‘Contact in Future’ (deferred). Search by name or filter to one recruiter to focus your own list.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Work a lead end-to-end",
    body:   "Expand a lead to see its call history — merged from the call_log and doctor_sessions tables, matched by name, with colour-coded outcomes — so you don't repeat a call. Change the status dropdown and it writes straight back to Zoho (and instantly updates the Tracker + Doctor Progress).",
  },

  // ── Calls ───────────────────────────────────────────────────────────
  {
    target: "sidebar-calls",
    title:  "Calls — the recording archive",
    body:   "Every recorded sales call (via Fathom) for the three reps (Abraham, Asser, Asim), with its AI summary, action items, and a searchable transcript.",
    placement: "right",
  },
  {
    route: "/calls",
    target: "calls-toolbar",
    title:  "Find any call",
    body:   "Search across titles, summaries, and transcripts, or filter by host. Calls flow in automatically (Fathom webhook + a background auto-sync); ‘Sync now’ pulls the latest immediately. The KPI tiles count across the whole archive, not just the visible page.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Reviewing a call",
    body:   "Click any row to open the detail panel: read the AI summary and action items first, then search inside the transcript (segments show speaker + timestamp) to jump to a moment — e.g. search ‘salary’ to find the comp discussion. ‘Open in Fathom’ gives you the full recording.",
  },

  // ── Contract Builder ────────────────────────────────────────────────
  {
    target: "sidebar-contracts",
    title:  "Contract Builder",
    body:   "Build and e-sign Allocation Assist's OWN service agreement with a doctor (via BoldSign). Important: this is AA's contract — a different thing from the hospital's offer letter, which the Automations ‘Contract Check-in’ flow only tracks.",
    placement: "right",
  },
  {
    route: "/contracts",
    placement: "center",
    title:  "Send a contract in a few clicks",
    body:   "Search a doctor (or pick one from ‘Suggested next contracts’, which surfaces who just cleared a pipeline stage). Tweak the fee terms — the live preview updates as you type — optionally set the placement hospital, then Send for Signature. The doctor signs without needing a login.",
  },
  {
    placement: "center",
    title:  "What signing triggers",
    body:   "When the doctor signs, BoldSign's webhook fires: the contract is recorded, a Zoho ‘Doctor on Board’ contact is created, and the Relocation flow kicks off (jumping straight to the city guide if you set the hospital). The Sent Contracts table tracks every send's status (Sent → Viewed → Signed) live.",
  },

  {
    placement: "center",
    title:  "That's Sales",
    body:   "Every page also has an ⓘ help button (top-left of the title) that opens its full written guide, and the AI Assistant can answer specifics about your live data. Now go convert some leads.",
  },
];

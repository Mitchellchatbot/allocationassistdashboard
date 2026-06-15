/**
 * Guided product tour for the Sales section.
 *
 * Same pattern as the HI tour: per page, spotlight the sidebar entry ("where it
 * lives"), then navigate in and spotlight the one thing you'll use first. The
 * provider handles route navigation + retries the target until it mounts.
 *
 * Bump SALES_TOUR_ID whenever you add/remove steps so people who dismissed an
 * older version get the new walkthrough.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const SALES_TOUR_ID = "sales-tour-v1";

export const SALES_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Sales",
    body:   "A quick tour of the four sales screens — tracking performance, working leads, reviewing calls, and sending contracts. ~2 minutes. Replay any time from the Tour button up top.",
  },

  // ── Sales Tracker ───────────────────────────────────────────────────
  {
    target: "sidebar-sales",
    title:  "Sales Tracker — the scoreboard",
    body:   "Management's read-only view of team + pipeline performance. You don't work leads here; you watch how the team is doing. Let's look inside.",
    placement: "right",
  },
  {
    route: "/sales",
    target: "sales-kpis",
    title:  "The KPIs",
    body:   "Five cards: leads managed, active pipeline, conversion rate, qualified-contact rate, and urgent follow-ups. Click any card to expand a per-recruiter breakdown. Everything respects the date range up top. Below these: the funnel and the recruiter leaderboard.",
    placement: "auto",
  },

  // ── Follow-ups ──────────────────────────────────────────────────────
  {
    target: "sidebar-follow-ups",
    title:  "Follow-ups — your work queue",
    body:   "Where recruiters actually work leads that need a callback. This is the execution surface (the Tracker is just reporting).",
    placement: "right",
  },
  {
    route: "/follow-ups",
    target: "followups-tabs",
    title:  "Two queues: Hot vs Deferred",
    body:   "‘High Priority’ (red, owes a callback within 2 days — breaches sort to the top) and ‘Contact in Future’ (deferred). Click a lead to see its call history; use the status dropdown to move it — that saves straight to Zoho.",
    placement: "bottom",
  },

  // ── Calls ───────────────────────────────────────────────────────────
  {
    target: "sidebar-calls",
    title:  "Calls — the recording archive",
    body:   "Every recorded sales call (via Fathom) with its AI summary, action items, and a searchable transcript — for the three reps (Abraham, Asser, Asim).",
    placement: "right",
  },
  {
    route: "/calls",
    target: "calls-toolbar",
    title:  "Find & review any call",
    body:   "Search across titles, summaries, and transcripts, or filter by host. Calls flow in automatically (Fathom webhook + auto-sync); ‘Sync now’ pulls the latest. Click any row to read the summary and jump around the transcript.",
    placement: "bottom",
  },

  // ── Contract Builder ────────────────────────────────────────────────
  {
    target: "sidebar-contracts",
    title:  "Contract Builder",
    body:   "Build and e-sign Allocation Assist's own service agreement with a doctor (via BoldSign). Note: this is AA's contract — different from the hospital's offer letter that the Automations ‘Contract Check-in’ flow tracks.",
    placement: "right",
  },
  {
    route: "/contracts",
    placement: "center",
    title:  "Send a contract in a few clicks",
    body:   "Search a doctor (or pick one from ‘Suggested next contracts’), tweak the fee terms (the preview updates live), optionally set the placement hospital, then Send for Signature. When the doctor signs, it auto-creates their Zoho record and kicks off the Relocation flow. The Sent Contracts table tracks status live.",
  },

  {
    placement: "center",
    title:  "That's Sales",
    body:   "Stuck on something specific? Open the ⓘ help button on any page for the full guide, or ask the AI Assistant. Now go convert some leads.",
  },
];

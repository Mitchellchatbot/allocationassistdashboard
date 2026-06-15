/**
 * Tour registry — maps each dashboard section to its guided training tour.
 *
 * The topbar "Tour" button and any first-visit prompts look up the tour for the
 * CURRENT route here, so every section gets its own walkthrough (modelled on the
 * Hospital Introduction tour). Add a new section tour by importing its steps and
 * adding an entry below.
 */
import type { TourStep } from "@/components/OnboardingTour";
import { HI_TOUR_ID, HI_TOUR_STEPS } from "./hi-onboarding-tour";
import { SALES_TOUR_ID, SALES_TOUR_STEPS } from "./sales-tour";
import { GROWTH_TOUR_ID, GROWTH_TOUR_STEPS } from "./growth-tour";
import { ADMIN_TOUR_ID, ADMIN_TOUR_STEPS } from "./admin-tour";

export interface SectionTour {
  id:    string;
  label: string;
  steps: TourStep[];
}

interface Section {
  paths: string[];
  tour:  SectionTour;
}

const SECTIONS: Section[] = [
  {
    paths: ["/sales", "/follow-ups", "/calls", "/contracts"],
    tour:  { id: SALES_TOUR_ID, label: "Sales", steps: SALES_TOUR_STEPS },
  },
  {
    paths: ["/marketing", "/meta-ads", "/forms", "/team", "/finance"],
    tour:  { id: GROWTH_TOUR_ID, label: "Growth", steps: GROWTH_TOUR_STEPS },
  },
  {
    paths: ["/connections", "/import-bulk", "/import", "/settings"],
    tour:  { id: ADMIN_TOUR_ID, label: "Admin", steps: ADMIN_TOUR_STEPS },
  },
  {
    // Hospital Introduction — the original tour.
    paths: ["/", "/my-workspace", "/automations", "/doctors", "/vacancies", "/batches", "/reports"],
    tour:  { id: HI_TOUR_ID, label: "Hospital Introduction", steps: HI_TOUR_STEPS },
  },
];

/** The tour for the section a path belongs to, or null if none yet. */
export function tourForPath(pathname: string): SectionTour | null {
  for (const s of SECTIONS) if (s.paths.includes(pathname)) return s.tour;
  return null;
}

// ── Personalised onboarding tour ────────────────────────────────────────────
//
// The mandatory first-login tour is BUILT from the pages a user can actually
// reach (their allowed_pages), not a fixed section tour. Two reasons:
//   1. Access is à-la-carte — someone might have /sales + /calls but not the
//      rest of the Sales group. A fixed tour would navigate to a page they're
//      blocked from, the route-guard would bounce them, and the tour would
//      derail. Building from allowed_pages means every step lands.
//   2. It gives each person a walkthrough of exactly THEIR dashboard, then the
//      universal tools (search, notifications, AI, docs) everyone shares.

export const ONBOARDING_TOUR_ID = "onboarding-mandatory-v1";

// One intro step per page, keyed by the bare route used in allowed_pages.
// Targets reuse the data-tour anchors already on each page; pages without a
// single clean anchor (Doctors, Contract Builder) use a centred slide.
const PAGE_INTRO_STEPS: Record<string, TourStep> = {
  "/":            { route: "/",                  target: "dashboard-pending", placement: "auto",
    title: "Dashboard", body: "Your team-wide overview: the key numbers and a shared to-do list of everything that needs a human, bucketed by urgency. Click any row to open it." },
  "/my-workspace":{ route: "/my-workspace",      target: "workspace-tasks",   placement: "auto",
    title: "My Workspace", body: "Your home base, scoped to just you: the doctors and tasks assigned to you. Start here each day, and click a task to jump straight to it." },
  "/doctors":     { route: "/doctors?tab=profiles",                            placement: "center",
    title: "Doctors", body: "Every doctor in one place: where they sit in the pipeline (Doctor Progress) and their profile, the record we put in front of hospitals. Click any profile to edit it inline." },
  "/automations": { route: "/automations",       target: "automations-flows", placement: "bottom",
    title: "Automations", body: "Six email flows that carry a doctor from the first hospital intro to payment. The system sends the emails, you just step in at the manual moments like picking a city or confirming a shortlist." },
  "/vacancies":   { route: "/vacancies",         target: "vacancies-table",   placement: "auto",
    title: "Vacancies", body: "The open roles hospitals are filling. Click any row for a ranked list of matching doctors, scored from the onboarded roster." },
  "/batches":     { route: "/batches",           target: "batches-rotation",  placement: "auto",
    title: "Batch Sends", body: "Country-by-country broadcasts to hospital recruiters: the daily picks, the Tuesday top 15, and the specialty of the day." },
  "/reports":     { route: "/reports",           target: "reports-filters",   placement: "bottom",
    title: "Reports", body: "How things are tracking, plus the placements tracker (one row per doctor-and-hospital pair). Filter by hospital, person, specialty, or date." },
  "/forms":       { route: "/forms",             target: "forms-tabs",        placement: "bottom",
    title: "Forms", body: "Every submission from the public forms. Triage outreach, link to Zoho, and stage doctor profiles for the website." },
  "/sales":       { route: "/sales",             target: "sales-kpis",        placement: "auto",
    title: "Sales Tracker", body: "The scoreboard for the team and the pipeline: five KPIs plus a recruiter leaderboard. It's read-only, the actual lead work happens in Follow-ups." },
  "/follow-ups":  { route: "/follow-ups",        target: "followups-tabs",    placement: "bottom",
    title: "Follow-ups", body: "The callback queue. Two tabs (High Priority and Contact in Future). Expand a lead to see its call history and change its status, which writes straight back to Zoho." },
  "/calls":       { route: "/calls",             target: "calls-toolbar",     placement: "bottom",
    title: "Calls", body: "Every recorded sales call with an AI summary, action items, and a searchable transcript. Search across all of them or filter by host." },
  "/contracts":   { route: "/contracts",                                      placement: "center",
    title: "Contract Builder", body: "Build and send our service agreement for a doctor to e-sign. Pick a doctor, adjust the fee terms with a live preview, then send for signature." },
  "/marketing":   { route: "/marketing",         target: "marketing-kpis",    placement: "auto",
    title: "Marketing", body: "Which channels bring in doctors and how cost-efficiently, all scored on the same funnel. Click a channel to drill into its doctors." },
  "/meta-ads":    { route: "/meta-ads",          target: "metaads-overview",  placement: "bottom",
    title: "Meta Ads", body: "Live ad performance from the Meta API, joined to real form submissions, down to which creatives actually produce qualified doctors." },
  "/team":        { route: "/team",              target: "team-leaderboard",  placement: "auto",
    title: "Team Performance", body: "How each sales rep is doing: calls, leads, and conversion, one row per rep." },
  "/finance":     { route: "/finance",           target: "finance-banner",    placement: "bottom",
    title: "Finance", body: "Revenue, spend, and profit by channel for the chosen period and currency. Revenue is an estimate (conversions times a fixed fee), not summed invoices." },
  "/connections": { route: "/connections",       target: "connections-list",  placement: "auto",
    title: "Connections", body: "Links Google Sheets to dashboard tables so data stays in sync on a schedule. Each row shows its last result and any errors." },
  "/import-bulk": { route: "/import-bulk",        target: "bulkimport-tabs",   placement: "bottom",
    title: "Bulk Import", body: "One-off bulk loads of master data (hospitals, vacancies, placements). Paste a CSV, preview, then commit. Re-running is safe, it upserts rather than duplicating." },
  "/import":      { route: "/import",            target: "importdata-tabs",   placement: "bottom",
    title: "Import Data", body: "Bulk-load the analytics feeds: call logs, doctor sessions, the weekly sales tally, Meta leads, and marketing spend." },
  "/settings":    { route: "/settings",          target: "settings-tabs",     placement: "bottom",
    title: "Settings", body: "Set your Slack handle so alerts @-mention you, and manage your own notification preferences." },
};

// Order pages walk in (HI first, then Sales, Growth, Admin) so a mixed-access
// user still gets a logical tour.
const ONBOARDING_PAGE_ORDER: string[] = [
  "/", "/my-workspace", "/doctors", "/automations", "/vacancies", "/batches", "/reports", "/forms",
  "/sales", "/follow-ups", "/calls", "/contracts",
  "/marketing", "/meta-ads", "/team", "/finance",
  "/connections", "/import-bulk", "/import", "/settings",
];

// Tools everyone shares, shown after the page walkthrough. Their anchors live
// in the topbar / sidebar and exist on every dashboard page.
const UNIVERSAL_STEPS: TourStep[] = [
  { target: "topbar-search", placement: "bottom",
    title: "Universal Search (⌘K)", body: "One index across doctors, hospitals, vacancies, templates and more. Jump anywhere in two keystrokes." },
  { target: "topbar-notifications", placement: "bottom",
    title: "Notifications", body: "Replies to your sends, doctor uploads, hospital responses, and signatures. The badge counts unread only." },
  { target: "ai-floating-button", placement: "left",
    title: "AI Assistant", body: "Ask anything in plain English (“what's stuck right now”, “how do I send a profile”). It knows the system and your live data, and gives real next steps. When in doubt, ask it first." },
  { target: "sidebar-docs", placement: "right",
    title: "Documentation", body: "A full written guide for every feature, both how to use it and how it works behind the scenes. There's also a little “i” button next to most page titles that jumps straight to that page's guide." },
  { target: "topbar-tour-button", placement: "bottom",
    title: "Replay anytime", body: "This button re-runs the walkthrough for whatever section you're on. Handy after today, or when something new ships." },
];

/** True if a user has at least one page we can actually tour — used to avoid
 *  trapping a user (e.g. an unusual access set) in an empty mandatory tour. */
export function hasOnboardingContent(allowedPages: string[]): boolean {
  return ONBOARDING_PAGE_ORDER.some(p => allowedPages.includes(p) && !!PAGE_INTRO_STEPS[p]);
}

/** Build a personalised onboarding tour from the pages this user can reach. */
export function buildOnboardingTour(allowedPages: string[]): SectionTour {
  const pageSteps = ONBOARDING_PAGE_ORDER
    .filter(p => allowedPages.includes(p) && !!PAGE_INTRO_STEPS[p])
    .map(p => PAGE_INTRO_STEPS[p]);

  const steps: TourStep[] = [
    {
      placement: "center",
      title: "Welcome aboard, let's get you set up",
      body: "A quick required walkthrough of the pages you'll use, plus the search, the AI assistant, and the documentation. Just a couple of minutes and you're in. You can go Back anytime.",
    },
    ...pageSteps,
    ...UNIVERSAL_STEPS,
    {
      placement: "center",
      title: "That's everything",
      body: "You've seen the pages you'll use day to day. Lean on the AI Assistant and the docs whenever you're stuck, and you can replay any section's tour from the Tour button up top.",
    },
  ];

  return { id: ONBOARDING_TOUR_ID, label: "Getting started", steps };
}

/**
 * Guided product tour for the Growth section (Marketing, Meta Ads, Forms,
 * Team Performance, Finance). Same pattern as the HI/Sales tours.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const GROWTH_TOUR_ID = "growth-tour-v1";

export const GROWTH_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Growth",
    body:   "A quick tour of the top-of-funnel + back-office screens: where leads come from, the ad spend behind them, incoming form submissions, team performance, and the money. ~2 minutes.",
  },

  // ── Marketing ───────────────────────────────────────────────────────
  {
    target: "sidebar-marketing",
    title:  "Marketing — the channel scoreboard",
    body:   "Which sources bring in doctors and how cost-efficiently. Every channel is scored on the same funnel: leads → qualified → converted, against its spend.",
    placement: "right",
  },
  {
    route: "/marketing",
    target: "marketing-kpis",
    title:  "Channel winners",
    body:   "Most revenue, best cost-per-conversion, best closing rate — click a card to see the contenders + the formula. Below: the full channel table (sortable) and drill-downs into each channel's doctors.",
    placement: "auto",
  },

  // ── Meta Ads ────────────────────────────────────────────────────────
  {
    target: "sidebar-meta-ads",
    title:  "Meta Ads — live ad performance",
    body:   "Real-time spend, reach, and which ads actually produce qualified doctors — pulled live from the Meta API and joined to form submissions.",
    placement: "right",
  },
  {
    route: "/meta-ads",
    target: "metaads-overview",
    title:  "Spend → leads → placements",
    body:   "KPI cards (spend, reach, CTR…) and a cost funnel: cost-per-lead (from forms), cost-per-qualified, cost-per-conversion. Scroll down for per-creative, per-adset, and per-campaign tables — click any leads count to see the real people.",
    placement: "bottom",
  },

  // ── Forms ───────────────────────────────────────────────────────────
  {
    target: "sidebar-forms",
    title:  "Forms — the intake desk",
    body:   "Every submission from the public forms (Typeform/JotForm). Triage outreach, link to Zoho, and stage doctor profiles for WordPress. (Doctor-intake forms also show as the ‘Responses’ tab inside Doctors.)",
    placement: "right",
  },
  {
    route: "/forms",
    placement: "center",
    title:  "Working a submission",
    body:   "Pick a form's tab, filter the feed (try ‘Uncontacted in Zoho’), and expand a row to track outreach, link/create a Zoho lead, download CVs, and ‘Send to staging’ to start a WordPress profile. Paid leads ($150) are badged.",
  },

  // ── Team Performance ────────────────────────────────────────────────
  {
    target: "sidebar-team",
    title:  "Team Performance — the leaderboard",
    body:   "How each sales consultant is doing: calls, leads, conversion, and an optional call-quality overlay. The people view (Sales Tracker is the pipeline view).",
    placement: "right",
  },
  {
    route: "/team",
    target: "team-leaderboard",
    title:  "Calls, conversion & quality",
    body:   "One row per rep — Calls (Zoho, the headline), Leads, Conversion %, and Full/Good calls from the uploaded weekly CSV. Only the actual sales reps appear. Below: the call-volume chart and active campaigns.",
    placement: "auto",
  },

  // ── Finance ─────────────────────────────────────────────────────────
  {
    target: "sidebar-finance",
    title:  "Finance — revenue vs spend",
    body:   "The money view: revenue (estimated as conversions × the per-placement fee), marketing spend, profit, and ROI by channel.",
    placement: "right",
  },
  {
    route: "/finance",
    target: "finance-banner",
    title:  "Mind the period + currency",
    body:   "Every figure is for the stated date range, in the stated currency (toggle AED/USD up top). Below: KPIs, the channel × month spend table, a P&L, and ROI charts. Revenue here is an estimate, not invoices.",
    placement: "bottom",
  },

  {
    placement: "center",
    title:  "That's Growth",
    body:   "Each page has an ⓘ help button for the full guide, and the AI Assistant can answer specifics. Done!",
  },
];

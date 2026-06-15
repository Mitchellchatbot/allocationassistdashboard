/**
 * Guided product tour for the Growth section — in-depth training.
 * Marketing, Meta Ads, Forms, Team Performance, Finance.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const GROWTH_TOUR_ID = "growth-tour-v2";

export const GROWTH_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Growth — full walkthrough",
    body:   "The top-of-funnel and back-office: where leads come from, the ad spend behind them, incoming form submissions, team performance, and the money. We'll hit each page and its key behaviours. ~5 minutes.",
  },

  // ── Marketing ───────────────────────────────────────────────────────
  {
    target: "sidebar-marketing",
    title:  "Marketing — the channel scoreboard",
    body:   "Which sources bring in doctors and how cost-efficiently. Every channel is scored on the same funnel — leads → qualified → converted — against its spend, so they're comparable.",
    placement: "right",
  },
  {
    route: "/marketing",
    target: "marketing-kpis",
    title:  "Channel winners",
    body:   "Most Revenue, Best Cost-per-Conversion, Best Closing Rate — click a card to flip it and see the contenders + the exact formula. Below sits the full sortable channel table (Converted / Leads / Qualified / Closing rate / Cost-per-qualified / Cost-per-conversion).",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Two things to know about attribution",
    body:   "Spend comes from the marketing_expenses table — except Meta, which is pulled live from the Meta API so it's accurate. And a lead whose email/phone matches a Meta form is re-attributed to Meta regardless of what was typed in Lead_Source, fixing the ‘came from a Meta form but logged as Website’ problem. Click a channel row to drill into its doctors (contacted vs still-to-reach).",
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
    title:  "Spend, reach & the cost funnel",
    body:   "KPI cards (spend, impressions, reach, CTR, CPM…) plus a cost funnel: Cost-per-Lead (from forms), Cost-per-Qualified, and Cost-per-Conversion. Reading them together shows where the money leaks — cheap leads but expensive qualified = wrong audience.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Down to the creative",
    body:   "Scroll for per-creative, per-adset, and per-campaign tables (three view modes: Performance / Cost / Reach). Click any leads count to open the real people behind it, with their Zoho status. Note: lead counts come from actual form submissions (meta_leads), not Meta's own under-reporting.",
  },

  // ── Forms ───────────────────────────────────────────────────────────
  {
    target: "sidebar-forms",
    title:  "Forms — the intake desk",
    body:   "Every submission from the public forms (Typeform/JotForm/Elementor). Triage outreach, link to Zoho, and stage doctor profiles for WordPress. (Doctor-intake forms also appear as the ‘Responses’ tab inside Doctors.)",
    placement: "right",
  },
  {
    route: "/forms",
    target: "forms-tabs",
    title:  "A tab per form",
    body:   "Switch forms here. Each shows KPIs (and a $150 revenue tile for paid DoctorsFinder leads), a search box (⌘F), and an outreach-lifecycle filter — start with ‘Uncontacted in Zoho’ for your daily triage.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Working a submission",
    body:   "Expand a row to track outreach (Mark contacted, notes, follow-up date), link or create a Zoho lead, and download CVs. For doctor intake, ‘Send to staging’ runs the full pipeline (Zoho match + photo + CV parse) and creates a draft profile — you then finish and publish it in Doctors → Profiles.",
  },

  // ── Team Performance ────────────────────────────────────────────────
  {
    target: "sidebar-team",
    title:  "Team Performance — the leaderboard",
    body:   "How each sales consultant is doing — the people view (Sales Tracker is the pipeline view). Only the actual sales reps appear (curated roster).",
    placement: "right",
  },
  {
    route: "/team",
    target: "team-leaderboard",
    title:  "Calls, conversion & quality",
    body:   "One row per rep: Calls (Zoho — the auto-logged headline metric), Leads, Conversion %, plus Full/Good calls from the optional weekly CSV overlay (shows ‘—’ if not uploaded). Below: the call-volume chart and the read-only active-campaigns table.",
    placement: "auto",
  },

  // ── Finance ─────────────────────────────────────────────────────────
  {
    target: "sidebar-finance",
    title:  "Finance — revenue vs spend",
    body:   "The money view: revenue, marketing spend, profit, and ROI by channel.",
    placement: "right",
  },
  {
    route: "/finance",
    target: "finance-banner",
    title:  "Mind the period + currency",
    body:   "Every figure is for the stated date range, in the stated currency (toggle AED/USD up top) — the banner exists because a 3-month total once got read as monthly. Below: KPIs, the channel × month spend table, a P&L, and ROI charts.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "How the money is computed",
    body:   "Revenue is an ESTIMATE — conversions (Zoho Doctors-on-Board) × a fixed per-placement fee — not summed invoices. Spend is ingested from the Digital Marketing Google Sheet. Payroll/other costs are placeholders until the accountant supplies them, so today's profit = revenue − marketing spend. Use the ‘exclude Meta’ toggle on Cost-per-Conversion to see the other channels in isolation.",
  },

  {
    placement: "center",
    title:  "That's Growth",
    body:   "Each page has an ⓘ help button for the full written guide, and the AI Assistant can answer specifics. Done!",
  },
];

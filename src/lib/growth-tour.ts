/**
 * Guided product tour for the Growth section — in-depth training.
 * Marketing, Meta Ads, Forms, Team Performance, Finance.
 *
 * Bump GROWTH_TOUR_ID whenever you add/remove steps or rewrite the copy.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const GROWTH_TOUR_ID = "growth-tour-v3";

export const GROWTH_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Growth — full walkthrough",
    body:   "The top-of-funnel and the back office: where leads come from, the ad spend behind them, incoming form submissions, how the team is performing, and the money. We'll hit each page and its key behaviours — about 5 minutes. Each page has an ⓘ help button for the full written guide.",
  },

  // ── Marketing ───────────────────────────────────────────────────────
  {
    target: "sidebar-marketing",
    title:  "Marketing — the channel scoreboard",
    body:   "Which sources bring in doctors, and how cost-efficiently. Every channel is scored on the SAME funnel — leads → qualified → converted — against its spend, so you can compare Meta, referrals, the website and the rest on a level playing field.",
    placement: "right",
  },
  {
    route: "/marketing",
    target: "marketing-kpis",
    title:  "Channel winners",
    body:   "Three headline cards — Most Revenue, Best Cost-per-Conversion, Best Closing Rate — click one to flip it and see the runners-up plus the exact formula. Below sits the full sortable channel table: Converted, Leads, Qualified, Closing rate, Cost-per-qualified, Cost-per-conversion.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Two things to know about attribution",
    body:   "First, spend comes from the marketing_expenses table — EXCEPT Meta, which is pulled live from the Meta API so it's always accurate. Second, a lead whose email or phone matches a Meta form is re-attributed to Meta no matter what Lead_Source said — fixing the classic 'came from a Meta ad but logged as Website' problem. Click any channel row to drill into its doctors (contacted vs still-to-reach).",
  },

  // ── Meta Ads ────────────────────────────────────────────────────────
  {
    target: "sidebar-meta-ads",
    title:  "Meta Ads — live ad performance",
    body:   "Real-time spend, reach, and — most importantly — which ads actually produce QUALIFIED doctors. Pulled live from the Meta API and joined to your real form submissions, scoped to the Allocation Assist ad account only.",
    placement: "right",
  },
  {
    route: "/meta-ads",
    target: "metaads-overview",
    title:  "Spend, reach & the cost funnel",
    body:   "KPI cards (spend, impressions, reach, CTR, CPM…) plus a cost funnel: Cost-per-Lead (from forms), Cost-per-Qualified, and Cost-per-Conversion. Read them together to spot where money leaks — cheap leads but expensive qualified usually means the wrong audience is filling in the form.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Down to the creative",
    body:   "Scroll for per-creative, per-adset and per-campaign tables (three view modes: Performance / Cost / Reach). Click any leads count to open the real people behind it with their Zoho status. Lead counts come from actual form submissions (the meta_leads table), not Meta's own under-reporting — and a reconciliation line shows how many leads are attributed vs untagged so nothing hides.",
  },

  // ── Forms ───────────────────────────────────────────────────────────
  {
    target: "sidebar-forms",
    title:  "Forms — the intake desk",
    body:   "Every submission from the public forms — Typeform, JotForm, Elementor. This is where you triage outreach, link submissions to Zoho, and stage doctor profiles for WordPress. (Doctor-intake forms also show up as the 'Responses' tab inside Doctors.)",
    placement: "right",
  },
  {
    route: "/forms",
    target: "forms-tabs",
    title:  "A tab per form",
    body:   "Switch between forms here. Each shows its KPIs (plus a $150 revenue tile for paid DoctorsFinder leads), a search box (⌘F), and an outreach-lifecycle filter — start your daily triage on 'Uncontacted in Zoho' to see exactly who still needs a first touch.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Working a submission",
    body:   "Expand a row to track outreach (Mark contacted, add notes, set a follow-up date), link to an existing Zoho lead or create a new one, and download CVs. For doctor intake, 'Send to staging' runs the whole pipeline — Zoho match, photo, CV parse — and creates a draft profile you then finish and publish in Doctors → Profiles.",
  },

  // ── Team Performance ────────────────────────────────────────────────
  {
    target: "sidebar-team",
    title:  "Team Performance — the leaderboard",
    body:   "How each sales consultant is doing — the PEOPLE view, where the Sales Tracker is the pipeline view. Only the actual sales reps appear here (a curated roster), so the numbers aren't diluted by non-sales staff.",
    placement: "right",
  },
  {
    route: "/team",
    target: "team-leaderboard",
    title:  "Calls, conversion & quality",
    body:   "One row per rep: Calls (from Zoho — the auto-logged headline metric), Leads, Conversion %, plus Full/Good call counts from the optional weekly CSV overlay (shows '—' until that's uploaded). Below the table: a call-volume chart and the read-only active-campaigns view.",
    placement: "auto",
  },

  // ── Finance ─────────────────────────────────────────────────────────
  {
    target: "sidebar-finance",
    title:  "Finance — revenue vs spend",
    body:   "The money view: revenue, marketing spend, profit, and ROI by channel — the bottom line behind everything else in Growth.",
    placement: "right",
  },
  {
    route: "/finance",
    target: "finance-banner",
    title:  "Mind the period + currency",
    body:   "Every figure is for the stated date range, in the stated currency (toggle AED/USD up top). This banner exists for a reason — a 3-month total once got misread as a monthly figure. Below it: the KPIs, the channel × month spend table, a P&L, and the ROI charts.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "How the money is computed",
    body:   "Revenue is an ESTIMATE — conversions (Zoho Doctors-on-Board) × a fixed per-placement fee — not summed invoices, so treat it as directional. Spend is ingested from the Digital Marketing Google Sheet. Payroll and other costs are placeholders until the accountant supplies them, so today's profit = revenue − marketing spend. Use the 'exclude Meta' toggle on Cost-per-Conversion to judge the other channels on their own.",
  },

  {
    placement: "center",
    title:  "That's Growth",
    body:   "Each page has an ⓘ help button for the full written guide, and the AI Assistant can answer specifics about your live numbers. Done!",
  },
];

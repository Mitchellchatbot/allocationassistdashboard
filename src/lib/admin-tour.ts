/**
 * Guided product tour for the Admin section — in-depth training.
 * Connections, Bulk Import, Import Data, Settings. Admin-only.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const ADMIN_TOUR_ID = "admin-tour-v2";

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Admin — full walkthrough",
    body:   "The plumbing: wiring up data sources, loading data in bulk, and managing who can see what. Admin-only. We'll cover each page and how it works underneath. ~4 minutes.",
  },

  // ── Connections ─────────────────────────────────────────────────────
  {
    target: "sidebar-connections",
    title:  "Connections — keep sheets in sync",
    body:   "Wire a Google Sheet to a dashboard table (hospitals, vacancies, placements, source overrides, templates). The sheet stays the source of truth; the dashboard pulls fresh rows on a schedule and parses them in.",
    placement: "right",
  },
  {
    route: "/connections",
    target: "connections-list",
    title:  "Your connections at a glance",
    body:   "Each row shows the target table, the cadence, the last-synced time, the last result (‘X created · Y updated · Z unmatched’), and any error — with Sync now / Pause / Delete. ‘Unmatched’ usually means a doctor name didn't match Zoho; fix it in the sheet and re-sync.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Adding one (and how it runs)",
    body:   "Connect Google once, then ‘New connection’: paste the sheet, pick the destination, set a cadence, and Test-parse before saving. Behind the scenes the sheets-sync function fetches the CSV and routes rows to a table-specific parser; the scheduler re-runs each active connection on its own cadence. This is the automated twin of Bulk Import.",
  },

  // ── Bulk Import ─────────────────────────────────────────────────────
  {
    target: "sidebar-import-bulk",
    title:  "Bulk Import — master data",
    body:   "One-off bulk loads of the structured lists from Saif: hospitals, vacancies, doctor availability, placements, and attribution fixes.",
    placement: "right",
  },
  {
    route: "/import-bulk",
    target: "bulkimport-tabs",
    title:  "A tab per sheet",
    body:   "Each tab targets one table and shows the columns it expects. Paste a CSV (or upload XLSX), Preview, then Commit — you get a created/updated/skipped summary.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Why re-running is safe",
    body:   "Imports upsert on a natural key (hospital name, doctor_id, lead id), so re-importing last week's file updates or skips rather than duplicating. Headers are fuzzy-matched (case/spaces/underscores), and doctor names fuzzy-match to Zoho — any that don't are reported so you can fix them in the sheet.",
  },

  // ── Import Data ─────────────────────────────────────────────────────
  {
    target: "sidebar-import",
    title:  "Import Data — analytics feeds",
    body:   "Bulk-load activity/analytics data: call logs, doctor sessions, the weekly sales tally, Meta lead exports, and marketing spend.",
    placement: "right",
  },
  {
    route: "/import",
    target: "importdata-tabs",
    title:  "Drag, preview, import",
    body:   "Pick the tab for your file and drop a CSV/XLSX; a format-specific parser reads it — even messy pivots and emoji-laden Typeform headers. Imports run in batches with a progress bar, and dedupe (e.g. Meta Leads by phone, expenses by date+category+amount) so re-imports don't double-count.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Where it shows up",
    body:   "Nothing changes on the analytics screens until you import. Afterwards: Call Log + Doctor Sessions feed the call histories on leads, Weekly Sales feeds the Team Performance overlay, Meta Leads feed Meta attribution, and Marketing Spend feeds Finance/Marketing.",
  },

  // ── Settings ────────────────────────────────────────────────────────
  {
    target: "sidebar-settings",
    title:  "Settings — people & access",
    body:   "Your own notification preferences and — for admins — user management: who's on the team and what each person can see.",
    placement: "right",
  },
  {
    route: "/settings",
    target: "settings-tabs",
    title:  "Notifications & Users",
    body:   "Notifications: set your Slack handle so alerts @-mention you (and admins can test the Slack webhook). Users (admin): add people, pick a role — which presets their page access — or go custom, and edit/remove access later.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "The access model (it gates everything)",
    body:   "Each person's role + allowed_pages drive BOTH the route guard and the sidebar — so ‘what a role can do’ lives in one place. User changes go through admin-checked functions (you can't strip your own admin role or delete yourself). Documentation and the Notifications tab are always available to everyone.",
  },

  {
    placement: "center",
    title:  "That's Admin",
    body:   "Each page has an ⓘ help button for the full written guide. You're set.",
  },
];

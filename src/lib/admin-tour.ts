/**
 * Guided product tour for the Admin section — in-depth training.
 * Connections, Bulk Import, Import Data, Settings. Admin-only.
 *
 * Bump ADMIN_TOUR_ID whenever you add/remove steps or rewrite the copy.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const ADMIN_TOUR_ID = "admin-tour-v3";

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Admin — full walkthrough",
    body:   "The plumbing behind the dashboard: wiring up data sources, loading data in bulk, and managing who can see what. Admin-only. We'll cover each page and how it works underneath — about 4 minutes. Every page has an ⓘ help button for the full written guide.",
  },

  // ── Connections ─────────────────────────────────────────────────────
  {
    target: "sidebar-connections",
    title:  "Connections — keep sheets in sync",
    body:   "Wire a Google Sheet to a dashboard table — hospitals, vacancies, placements, source overrides, templates. The sheet stays the single source of truth; the dashboard pulls fresh rows on a schedule and parses them in, so the team edits a familiar spreadsheet and the portal just stays current.",
    placement: "right",
  },
  {
    route: "/connections",
    target: "connections-list",
    title:  "Your connections at a glance",
    body:   "Each row shows its target table, the cadence, the last-synced time, the last result ('X created · Y updated · Z unmatched'), and any error — with Sync now / Pause / Delete. 'Unmatched' almost always means a doctor name didn't line up with Zoho; fix the name in the sheet and re-sync.",
    placement: "auto",
  },
  {
    placement: "center",
    title:  "Adding one (and how it runs)",
    body:   "Connect Google once, then 'New connection': paste the sheet, pick the destination table, set a cadence, and Test-parse before saving so you see exactly what will land. Under the hood, the sheets-sync function fetches the CSV and routes each row to a table-specific parser, and the scheduler re-runs every active connection on its own cadence. Think of this as the automated twin of Bulk Import.",
  },

  // ── Bulk Import ─────────────────────────────────────────────────────
  {
    target: "sidebar-import-bulk",
    title:  "Bulk Import — master data",
    body:   "One-off bulk loads of the structured lists from Saif: hospitals, vacancies, doctor availability, placements, and attribution fixes. Use this for the big reference data the rest of the dashboard leans on.",
    placement: "right",
  },
  {
    route: "/import-bulk",
    target: "bulkimport-tabs",
    title:  "A tab per sheet",
    body:   "Each tab targets one table and lists the columns it expects. Paste a CSV (or upload an XLSX), hit Preview to check the parse, then Commit — you get a created / updated / skipped summary so you know exactly what happened.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Why re-running is safe",
    body:   "Imports upsert on a natural key (hospital name, doctor_id, lead id), so re-importing last week's file updates or skips rows rather than duplicating them. Headers are fuzzy-matched (case, spaces, underscores all forgiven) and doctor names fuzzy-match to Zoho — anything that doesn't match is reported back so you can correct it in the sheet.",
  },

  // ── Import Data ─────────────────────────────────────────────────────
  {
    target: "sidebar-import",
    title:  "Import Data — analytics feeds",
    body:   "Bulk-load the activity and analytics data: call logs, doctor sessions, the weekly sales tally, Meta lead exports, and marketing spend. These are the feeds that power the Sales, Team and Finance screens.",
    placement: "right",
  },
  {
    route: "/import",
    target: "importdata-tabs",
    title:  "Drag, preview, import",
    body:   "Pick the tab for your file and drop a CSV/XLSX; a format-specific parser reads it — even messy pivot layouts and emoji-laden Typeform headers. Imports run in batches with a progress bar and dedupe as they go (Meta Leads by phone, expenses by date + category + amount) so re-imports never double-count.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Where it shows up",
    body:   "Nothing moves on the analytics screens until you import. After you do: Call Log + Doctor Sessions feed the call histories on each lead, Weekly Sales feeds the Team Performance overlay, Meta Leads feed Meta attribution, and Marketing Spend feeds Finance and Marketing. If a chart looks empty, the feed behind it probably hasn't been imported yet.",
  },

  // ── Settings ────────────────────────────────────────────────────────
  {
    target: "sidebar-settings",
    title:  "Settings — people & access",
    body:   "Your own notification preferences, and — for admins — user management: who's on the team and what each person is allowed to see.",
    placement: "right",
  },
  {
    route: "/settings",
    target: "settings-tabs",
    title:  "Notifications & Users",
    body:   "Notifications: set your Slack handle so alerts @-mention you (admins can also fire a test through the Slack webhook). Users (admin only): add a person, pick a role — which presets their page access — or go fully custom, and edit or revoke that access later.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "The access model (it gates everything)",
    body:   "Each person's role + allowed_pages drive BOTH the route guard and the sidebar — so 'what a role can do' is defined in exactly one place. All user changes run through admin-checked functions (you can't strip your own admin role or delete yourself, by design). Documentation and the Notifications tab are always available to everyone.",
  },

  {
    placement: "center",
    title:  "That's Admin",
    body:   "Each page has an ⓘ help button for the full written guide, and the AI Assistant can walk you through any of this. You're set.",
  },
];

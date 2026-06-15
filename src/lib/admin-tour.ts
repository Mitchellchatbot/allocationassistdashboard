/**
 * Guided product tour for the Admin section (Connections, Bulk Import, Import
 * Data, Settings). Same pattern as the other section tours.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const ADMIN_TOUR_ID = "admin-tour-v1";

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to Admin",
    body:   "The plumbing: wiring up data sources, loading data in bulk, and managing who can see what. Admin-only. ~2 minutes.",
  },

  // ── Connections ─────────────────────────────────────────────────────
  {
    target: "sidebar-connections",
    title:  "Connections — keep sheets in sync",
    body:   "Wire a Google Sheet to a dashboard table (hospitals, vacancies, placements…). The dashboard pulls fresh rows on a schedule and parses them into the right table.",
    placement: "right",
  },
  {
    route: "/connections",
    placement: "center",
    title:  "One connection per sheet → table",
    body:   "Connect Google once, then ‘New connection’: paste the sheet, pick the destination, set a cadence, and Test-parse before saving. Each row shows last-synced, the result (created/updated/unmatched), and any error — with Sync now / Pause / Delete.",
  },

  // ── Bulk Import ─────────────────────────────────────────────────────
  {
    target: "sidebar-import-bulk",
    title:  "Bulk Import — master data",
    body:   "One-off bulk loads of structured lists from Saif (hospitals, vacancies, availability, placements). Paste a CSV, preview, commit — re-running is safe (upsert by key).",
    placement: "right",
  },
  {
    route: "/import-bulk",
    target: "bulkimport-tabs",
    title:  "A tab per sheet",
    body:   "Each tab targets one table with its own sample format. Headers are fuzzy-matched; doctor names fuzzy-match to Zoho. Preview shows the first rows before you commit, and you get a created/updated/skipped summary.",
    placement: "bottom",
  },

  // ── Import Data ─────────────────────────────────────────────────────
  {
    target: "sidebar-import",
    title:  "Import Data — analytics feeds",
    body:   "Bulk-load activity/analytics data: call logs, doctor sessions, the weekly sales tally, Meta lead exports, marketing spend.",
    placement: "right",
  },
  {
    route: "/import",
    target: "importdata-tabs",
    title:  "Drag, preview, import",
    body:   "Pick the tab for your file, drop a CSV/XLSX, and the format-specific parser reads it (even messy pivots and emoji headers). Imports run in batches with a progress bar, and dedupe so re-imports don't double-count.",
    placement: "bottom",
  },

  // ── Settings ────────────────────────────────────────────────────────
  {
    target: "sidebar-settings",
    title:  "Settings — people & access",
    body:   "Your own notification preferences (Slack handle) and — for admins — user management: who's on the team and what each person can see.",
    placement: "right",
  },
  {
    route: "/settings",
    target: "settings-tabs",
    title:  "Roles & page access",
    body:   "Notifications: set your Slack handle so alerts @-mention you. Users (admin): add people, pick a role (which presets their pages) or go custom, and edit/remove access. This page-access model is what gates every screen + the sidebar.",
    placement: "bottom",
  },

  {
    placement: "center",
    title:  "That's Admin",
    body:   "Each page has an ⓘ help button for the full guide. You're set.",
  },
];

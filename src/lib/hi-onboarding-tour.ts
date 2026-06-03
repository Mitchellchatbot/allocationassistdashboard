/**
 * Guided product tour for the Hospital Introduction module.
 *
 * Pattern per major section:
 *   1. "outside" — spotlight the sidebar entry so the user learns the
 *      navigation glyph + where it lives.
 *   2. "inside" — navigate to that page and spotlight one or two things
 *      that are useful in the first session (the data the user needs,
 *      the action they'll take most).
 *
 * The provider handles route navigation; targets that take a moment to
 * mount (lazy-loaded chunks, react-query first-load) are retried for
 * ~2s before the overlay gives up and centres the tooltip.
 *
 * Bump HI_TOUR_ID whenever you add/remove steps so anyone who already
 * dismissed an earlier version gets the new walkthrough on next visit.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const HI_TOUR_ID = "hi-onboarding-v5";

export const HI_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to the Hospital Introduction module",
    body:   "Quick guided tour — we'll visit every page you'll use and point at the bits that matter. ~3 minutes. Replay any time from the Tour button up top.",
  },

  // ── Dashboard ───────────────────────────────────────────────────────
  {
    target: "sidebar-dashboard",
    title:  "Dashboard — team-wide overview",
    body:   "The home view. KPIs across the whole HI team plus a cross-cutting to-do list. Useful for managers; HI members usually live in My Workspace instead.",
    placement: "right",
  },
  {
    route: "/",
    target: "dashboard-pending",
    title:  "Pending Actions",
    body:   "The team's actionable inbox, bucketed by urgency. 'Stale' is anything with no activity in 7+ days. 'Action needed' is anything where a flow is waiting on a manual click. Click any row to open the run detail sheet on the right.",
    placement: "auto",
  },
  {
    route: "/",
    target: "dashboard-kpis",
    title:  "KPI snapshot",
    body:   "Six cards covering channel mix, pipeline value, sign-rate, and revenue. Click a card to expand its full breakdown. The date-range above scopes every number here.",
    placement: "auto",
  },

  // ── My Workspace ────────────────────────────────────────────────────
  {
    target: "sidebar-my-workspace",
    title:  "My Workspace — your home base",
    body:   "What's on YOUR plate, scoped automatically to runs assigned to you (via the hospital owner, or because you triggered the run). HI members land here by default at login.",
    placement: "right",
  },
  {
    route: "/my-workspace",
    target: "workspace-tasks",
    title:  "Tasks waiting on you",
    body:   "Pipeline rows where you're the bottleneck — pick a city for a relocation, confirm a shortlist, chase a contract. Stale ones (7d+) get an amber flag. Clicking a row jumps you straight into Automations with the run detail sheet open.",
    placement: "auto",
  },
  {
    route: "/my-workspace",
    target: "workspace-grid",
    title:  "Your doctors + your vacancies",
    body:   "Two columns: doctors with an active flow assigned to you, and the vacancies you opened (or own via a hospital you're responsible for). One click jumps you into either page filtered to that record.",
    placement: "auto",
  },

  // ── Doctor Profiles ─────────────────────────────────────────────────
  {
    target: "sidebar-doctor-profiles",
    title:  "Doctor Profiles",
    body:   "The standardised profile we send to hospitals — name, specialty, license region, summary. Auto-extracted from the doctor's CV by Claude when they upload it, then editable.",
    placement: "right",
  },
  {
    route: "/doctor-profiles",
    target: "doctor-profile-card",
    title:  "Profile card + completion %",
    body:   "The completion bar tells you who's ready to send. License pills show where they're licensed (UAE / Saudi / Qatar). 'View Journey' opens a full timeline of stages, emails, and replies.",
    placement: "auto",
  },
  {
    route: "/doctor-profiles",
    target: "doctor-lifecycle",
    title:  "Lifecycle timeline",
    body:   "Full per-doctor history across the 6 flows — profile-sent, shortlisted, interviewed, offered, signed, joined. Plus an Upload CV button right above this card (use it when a doctor sends their CV via WhatsApp — Claude extracts the profile fields automatically).",
    placement: "auto",
  },
  {
    route: "/doctor-profiles",
    target: "doctor-matches",
    title:  "Best-fit vacancies",
    body:   "Live ranked match between this doctor and every open vacancy — Strong / Decent / Long-shot. Specialty + license region drive the score. 'Link to vacancy' feeds them into the profile-sent flow.",
    placement: "auto",
  },

  // ── Automations ─────────────────────────────────────────────────────
  {
    target: "sidebar-automations",
    title:  "Automations — the heart of HI",
    body:   "Six email flows that walk a doctor from first hospital intro to first payment. The system sends the templated emails automatically; the team only steps in at the manual-action stages. Let's go look inside.",
    placement: "right",
  },
  {
    route: "/automations",
    target: "automations-flows",
    title:  "The 6 flows, one tab each",
    body:   "Profile Sent (intro to hospital), Shortlist (hospital interested), Interview (scheduling + tips), Contract (track milestones on Placements), Relocation (city-specific guide), Second Payment (45-day clock + reminders). Onboarding was removed — Sales sends the intake form from Zoho when a lead converts.",
    placement: "bottom",
  },
  {
    route: "/automations",
    target: "automations-admin",
    title:  "Queues, Hospitals, Templates, Default Editor",
    body:   "Queues = every active run sitting at a manual-action stage, split by what's needed (profile to send, city to pick, contract to send, etc). Hospitals = recruiter directory. Templates = editable email library. Default Flow Editor = stage delays + subjects per flow.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Opening a run",
    body:   "Clicking any row anywhere (Workspace, Queues, Pending Actions) opens the Run Detail Sheet. Inside: the full timeline, the suggestion cards (e.g. 'Hospital looks interested — Mark shortlisted?'), the manual-action button for the current stage, and Reassign.",
  },
  {
    placement: "center",
    title:  "Manual shortlist",
    body:   "Hospitals rarely write 'shortlisted' explicitly — usually a phone call. When the reply classifier thinks they're interested, a yellow card appears on the run with two buttons: Mark shortlisted / Not shortlisted. The system never advances automatically; you confirm.",
  },
  {
    placement: "center",
    title:  "Sending a profile",
    body:   "Send Profile picks the doctor, multi-selects hospitals (filtered by specialty match), and previews the email. Each hospital recipient gets their own tokenised 'View full profile' link — they can open the AA-website profile without a login, and you see view counts.",
  },

  // ── Vacancies ───────────────────────────────────────────────────────
  {
    target: "sidebar-vacancies",
    title:  "Vacancies",
    body:   "Open hospital roles. New vacancies usually come in by email reply from a hospital — once logged, they become target slots for matching doctors.",
    placement: "right",
  },
  {
    route: "/vacancies",
    target: "vacancies-table",
    title:  "Click any row for ranked matches",
    body:   "Each vacancy opens a side sheet with TWO tabs: Onboarded doctors (auto-scored from the ~1k AA roster, Strong/Decent/Long-shot tiers) and Leads (filled by Sales as they speak with prospects — empty by default). Specialty fuzzy-matches: a 'Retinal Specialist' doctor matches an 'Ophthalmology' vacancy.",
    placement: "auto",
  },

  // ── Batches ─────────────────────────────────────────────────────────
  {
    target: "sidebar-batches",
    title:  "Batch Sends",
    body:   "Country-scoped broadcasts (UAE / KSA / Qatar / Oman / Kuwait / Bahrain). Daily Duo (Mon-Fri, 2 profiles per country). Tuesday Top 15 (mixed specialties). Specialty of the Day (Wed-Fri). Each batch hits ONLY its country's hospitals — create one per country per day.",
    placement: "right",
  },
  {
    route: "/batches",
    target: "batches-rotation",
    title:  "Today's specialty + the queue",
    body:   "The rotation cursor cycles through the 67 canonical specialties from the AA website (not the old Zoho-bucketed list). Auto-advances after every Specialty-of-day send. The same specialty also biases Daily Duo + Tuesday picks so a day's sends stay on one theme.",
    placement: "auto",
  },

  // ── Reports ─────────────────────────────────────────────────────────
  {
    target: "sidebar-reports",
    title:  "Reports",
    body:   "KPI strip, weekly + monthly recap, Placements tracker (replaces the Hammad sheet — one row per (doctor, hospital) pair, so the same doctor sent to 4 hospitals = 4 rows), per-doctor breakdown, hospital relationship health.",
    placement: "right",
  },
  {
    route: "/reports",
    target: "reports-filters",
    title:  "Slice by anything",
    body:   "Filter by hospital, HI team member, specialty, date range. Below this: KPI strip → weekly/monthly recap (deltas vs prior period) → Trend chart → Placements (per doctor×hospital pair, with bulk-import-from-CSV + 'New placement' picker that pulls doctors from Zoho) → Per-doctor table → Hospital relationships.",
    placement: "bottom",
  },

  // ── Topbar — universal across pages ─────────────────────────────────
  {
    target: "topbar-search",
    title:  "Universal Search — ⌘K",
    body:   "Index of doctors, hospitals, flow stages, vacancies, templates. Jumps you anywhere in two keystrokes. Empty-state shows your recent items so the most likely next click is one keypress away.",
    placement: "bottom",
  },
  {
    target: "topbar-notifications",
    title:  "Notifications",
    body:   "Replies to your sends, doctor uploads, hospital responses, contract signatures. HI members only see notifications addressed to them; admin sees the team-wide stream. The badge count is unread-only.",
    placement: "bottom",
  },
  {
    target: "ai-floating-button",
    title:  "AI Assistant",
    body:   "Ask anything — 'what's stuck right now', 'how do I link a lead to a vacancy', 'which hospitals are cooling off', 'why didn't Dr X's contract send'. It knows the full system AND your live data and answers with concrete next steps + clickable references.",
    placement: "left",
  },
  {
    target: "topbar-tour-button",
    title:  "Replay this tour any time",
    body:   "Tap here to run this walkthrough again. Useful when a new flow ships or when you're showing the module to a new HI hire.",
    placement: "bottom",
  },

  {
    placement: "center",
    title:  "You're set",
    body:   "When you're stuck on a specific page, ask the AI — it's the fastest way to learn. Now go close some hospital introductions.",
  },
];

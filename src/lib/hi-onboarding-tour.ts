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

export const HI_TOUR_ID = "hi-onboarding-v3";

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
    body:   "Full per-doctor history across the 7 flows — when they were onboarded, profile-sent, shortlisted, interviewed, offered, joined. This is your 'open up a lead and see their progress' view.",
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
    body:   "Seven email flows that walk a doctor from first contact to first payment. The system sends the templated emails automatically; the team only steps in at the manual-action stages. Let's go look inside.",
    placement: "right",
  },
  {
    route: "/automations",
    target: "automations-flows",
    title:  "The 7 flows, one tab each",
    body:   "Onboarding (CV + intake form), Profile Sent (intro to hospital), Shortlist (hospital interested), Interview (scheduling + post), Contract (BoldSign offer), Relocation (visa + flight + city pick), and Second Payment. The pill on each tab shows how many runs are live in it.",
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
    body:   "Clicking any row anywhere (Workspace, Queues, dashboard Pending Actions) opens the Run Detail Sheet. Inside it: the timeline of every email + reply, who it's assigned to, a Reassign button to hand it off to another HI member, and the manual-action button for the stage it's parked at (Send Profile / Pick City / Send Contract).",
  },
  {
    placement: "center",
    title:  "Sending a profile",
    body:   "Send Profile picks the doctor, lets you multi-select hospitals (filtered by specialty match by default), and previews the exact email each hospital will receive. Hit send and the system records one run per hospital, ready to track replies.",
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
    body:   "Each vacancy opens a side sheet with doctor matches ranked Strong / Decent / Long-shot. Same scoring as the doctor → vacancy match. 'Link doctor' here is the inverse path: it feeds the chosen doctor straight into Profile Sent for this hospital.",
    placement: "auto",
  },

  // ── Batches ─────────────────────────────────────────────────────────
  {
    target: "sidebar-batches",
    title:  "Batch Sends",
    body:   "Three recurring broadcasts to the 95-hospital list. Daily Duo (Mon-Fri, 2 profiles). Tuesday Top 15 (mixed specialties). Specialty of the Day (Wed-Fri rotation through ranked specialty groups). The picker biases toward the rotation specialty so the daily picks stay coherent.",
    placement: "right",
  },
  {
    route: "/batches",
    target: "batches-rotation",
    title:  "Today's specialty + the queue",
    body:   "The rotation cursor auto-advances after every Specialty-of-day send. You can hand-pick which specialty groups cycle and edit the queue order. The same specialty also feeds into Daily Duo + Tuesday batches so a single day's sends stay on one theme.",
    placement: "auto",
  },

  // ── Reports ─────────────────────────────────────────────────────────
  {
    target: "sidebar-reports",
    title:  "Reports",
    body:   "Per-HI-member KPIs, hospital relationship health, conversion-rate by stage. Useful for managers and for spotting which hospitals are cooling off.",
    placement: "right",
  },
  {
    route: "/reports",
    target: "reports-filters",
    title:  "Slice by anything",
    body:   "Filter by hospital, HI team member (the four of you are pinned at the top), specialty, date range. Numbers update everywhere on the page. URL params persist so you can share a filtered view with a teammate.",
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

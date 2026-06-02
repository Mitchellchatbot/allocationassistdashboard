/**
 * Guided product tour for the Hospital Introduction module.
 *
 * Steps alternate between:
 *   - "outside" stops that spotlight a sidebar entry to introduce the
 *     section
 *   - "inside" stops that navigate INTO that section and highlight key
 *     elements on the actual page so the user sees what they'll work with
 *
 * The provider handles the route navigation; targets that take a moment
 * to mount (lazy-loaded chunks, react-query first-load) are retried for
 * ~2s before the overlay gives up and centres the tooltip.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const HI_TOUR_ID = "hi-onboarding-v2";

export const HI_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to the Hospital Introduction module",
    body:   "2-minute walkthrough — we'll visit every section and you'll see the key bits inside each. You can replay this any time from the Tour button in the header.",
  },

  // ── My Workspace ────────────────────────────────────────────────────
  {
    target: "sidebar-my-workspace",
    title:  "My Workspace — your home base",
    body:   "Everything assigned to you across the doctor pipeline. Let's open it.",
    placement: "right",
  },
  {
    route: "/my-workspace",
    target: "workspace-tasks",
    title:  "Tasks waiting on you",
    body:   "Active runs where you're the bottleneck — pick a city, confirm a shortlist, chase a contract. Stale ones (7d+ no activity) get flagged. Click any row to open the run detail sheet.",
    placement: "auto",
  },
  {
    route: "/my-workspace",
    target: "workspace-grid",
    title:  "Your doctors + your vacancies",
    body:   "Two columns: the doctors with active flows assigned to you, and the vacancies you opened or own via a hospital you're responsible for. One click jumps you into either.",
    placement: "auto",
  },

  // ── Doctor Profiles ──────────────────────────────────────────────────
  {
    target: "sidebar-doctor-profiles",
    title:  "Doctor Profiles",
    body:   "The standardised profile we send to hospitals. CV upload auto-extracts experience, education, license info via Claude. Completion % tells you who's ready.",
    placement: "right",
  },

  // ── Automations ──────────────────────────────────────────────────────
  {
    target: "sidebar-automations",
    title:  "Automations — 7 email flows",
    body:   "Onboarding → Profile Sent → Shortlist → Interview → Contract → Relocation → Second Payment. Let's look inside.",
    placement: "right",
  },
  {
    route: "/automations",
    target: "automations-flows",
    title:  "One tab per flow",
    body:   "Each flow has its own stages (trigger → email → wait → reminder → terminal). The tab pill shows how many active runs sit in that flow.",
    placement: "bottom",
  },
  {
    route: "/automations",
    target: "automations-admin",
    title:  "Queues, Hospitals, Templates, Editor",
    body:   "Queues surfaces every active run at a manual-action stage — the team's actual to-do list. Hospitals is the recruiter directory. Templates is the editable email library. Default Flow Editor is where you tune stage delays and subjects.",
    placement: "bottom",
  },

  // ── Vacancies ────────────────────────────────────────────────────────
  {
    target: "sidebar-vacancies",
    title:  "Vacancies",
    body:   "Open hospital roles waiting to be filled.",
    placement: "right",
  },
  {
    route: "/vacancies",
    target: "vacancies-table",
    title:  "Click any row for matches",
    body:   "Each vacancy expands into a side sheet with ranked doctor matches — Strong fits, Decent fits, Long shots. Linking a doctor here feeds them straight into the profile-sent flow.",
    placement: "auto",
  },

  // ── Batch Sends ──────────────────────────────────────────────────────
  {
    target: "sidebar-batches",
    title:  "Batch Sends",
    body:   "Three recurring blasts to all 95 hospitals: Daily duo (Mon-Fri, 2 profiles), Tuesday top 15 (mixed), and Specialty of the day (Wed-Fri rotation).",
    placement: "right",
  },
  {
    route: "/batches",
    target: "batches-rotation",
    title:  "Today's pick + the rotation queue",
    body:   "The cursor auto-advances after every specialty-of-day send. You can also pick which specialties cycle and edit the queue. The picker for Daily duo / Tuesday batches also biases toward today's rotation specialty.",
    placement: "auto",
  },

  // ── Reports ──────────────────────────────────────────────────────────
  {
    target: "sidebar-reports",
    title:  "Reports",
    body:   "Per-team-member KPIs + hospital relationship health.",
    placement: "right",
  },
  {
    route: "/reports",
    target: "reports-filters",
    title:  "Slice by anything",
    body:   "Filter by hospital, by HI team member (the four of you are pinned at the top), by specialty, by date range. Numbers update everywhere on the page.",
    placement: "bottom",
  },

  // ── Search + AI ──────────────────────────────────────────────────────
  {
    target: "topbar-search",
    title:  "Universal search — ⌘K",
    body:   "Jump anywhere in seconds. Doctors by name, hospitals, flow stages, vacancies, templates — all indexed. Press Cmd/Ctrl+K from any page.",
    placement: "bottom",
  },
  {
    target: "ai-floating-button",
    title:  "AI Assistant",
    body:   "Ask anything — 'what's stuck right now', 'how do I link a lead to a vacancy', 'which hospitals are cooling off'. It knows the full system + your data and answers with concrete steps.",
    placement: "left",
  },

  {
    placement: "center",
    title:  "You're set",
    body:   "Click the Tour button in the header any time to replay this. When you're stuck on a specific page, ask the AI — it's the fastest way to learn. Now go close some hospital introductions.",
  },
];

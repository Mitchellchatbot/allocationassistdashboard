/**
 * Step-by-step product tour for the Hospital Introduction module.
 *
 * Each step targets an element via `data-tour="<id>"`. Targets that don't
 * exist on the current page are skipped gracefully (the overlay falls
 * back to centered text), but ideally every step's target IS visible —
 * the tour auto-launches from /my-workspace where most of these targets
 * sit in the sidebar.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const HI_TOUR_ID = "hi-onboarding-v1";

export const HI_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to the Hospital Introduction module",
    body:   "Quick 2-minute tour of everything you'll use day-to-day — your workspace, the seven automation flows, the doctor pipeline, and the AI assistant. You can replay this any time from the header.",
  },
  {
    target: "sidebar-my-workspace",
    title:  "My Workspace — your home base",
    body:   "Tasks assigned to you, the doctors you own, the vacancies you're responsible for, and recent activity. Everything is scoped to you, so the list is what's on YOUR plate (not the whole team's).",
    placement: "right",
  },
  {
    target: "sidebar-doctor-profiles",
    title:  "Doctor Profiles",
    body:   "Build the standardised profile we send to hospitals. CVs auto-extract experience, education, license info via Claude. Profile completion % tells you who's ready to be sent.",
    placement: "right",
  },
  {
    target: "sidebar-automations",
    title:  "Automations — 7 email flows",
    body:   "Onboarding → Profile Sent → Shortlist → Interview → Contract → Relocation → Second Payment. Each fires automatically based on lifecycle events. The 'Queues' tab inside surfaces every run waiting on a manual click.",
    placement: "right",
  },
  {
    target: "sidebar-vacancies",
    title:  "Vacancies — open hospital roles",
    body:   "Hospitals tell us what they need. Click any vacancy to see ranked doctor matches with strong / decent / long-shot tiers. Linking a doctor here feeds them into the profile-sent flow.",
    placement: "right",
  },
  {
    target: "sidebar-batches",
    title:  "Batch Sends",
    body:   "Three recurring blasts: Daily duo (Mon-Fri, 2 doctors to all 95 hospitals), Tuesday top 15, and Specialty of the day (Wed-Fri rotation through ~57 specialties). Auto-pick top N ranks doctors by readiness.",
    placement: "right",
  },
  {
    target: "sidebar-reports",
    title:  "Reports",
    body:   "Per-team-member metrics (shortlists, interviews, offers, signed) and per-hospital relationship health. Filter by HI member, hospital, date range, specialty.",
    placement: "right",
  },
  {
    target: "topbar-search",
    title:  "Universal search — ⌘K",
    body:   "Jump anywhere in seconds. Search doctors by name, hospitals, flow stages, vacancies, templates — everything is indexed. Press Cmd/Ctrl+K from any page.",
    placement: "bottom",
  },
  {
    target: "ai-floating-button",
    title:  "AI Assistant",
    body:   "Ask the AI anything — 'what's stuck right now', 'how do I link a lead to a vacancy', 'which hospitals are cooling off'. It knows the full system, your data, and answers with concrete steps.",
    placement: "left",
  },
  {
    placement: "center",
    title:  "You're set",
    body:   "Click the spark icon in the header any time to replay this tour. When you need help on a specific page, just ask the AI — it's the fastest way to learn. Let's go.",
  },
];

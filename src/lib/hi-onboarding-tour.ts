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
 * ~2s before the overlay gives up and centres the tooltip. While a tour
 * is active the sidebar force-expands every section so the sidebar-<slug>
 * spotlights always have a target.
 *
 * Bump HI_TOUR_ID whenever you add/remove steps or materially rewrite the
 * copy, so anyone who already dismissed an earlier version gets the new
 * walkthrough on next visit.
 */
import type { TourStep } from "@/components/OnboardingTour";

export const HI_TOUR_ID = "hi-onboarding-v6";

export const HI_TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title:  "Welcome to the Hospital Introduction module",
    body:   "This is the engine that walks a doctor from a first hospital intro all the way to their second payment. We'll visit every page you'll use and point at the bits that matter — about 3 minutes. You can replay it any time from the Tour button at the top-right, and every page has its own ⓘ help button for the full written guide.",
  },

  // ── Dashboard ───────────────────────────────────────────────────────
  {
    target: "sidebar-dashboard",
    title:  "Dashboard — team-wide overview",
    body:   "The home view: KPIs across the WHOLE HI team plus a cross-cutting to-do list. It's the manager's cockpit. If you're an HI member working your own doctors, you'll spend your day in My Workspace instead — but the Dashboard is where leadership sees how the team is tracking.",
    placement: "right",
  },
  {
    route: "/",
    target: "dashboard-digest",
    title:  "Portal digest — the AI briefing",
    body:   "A daily AI summary of everything across the portal: pipeline, operations, and — most importantly — what needs attention now (stale runs, stuck contracts, overdue follow-ups). Switch it to weekly or monthly, and hit refresh for an up-to-the-minute version. It only covers the areas you have access to.",
    placement: "auto",
  },
  {
    route: "/",
    target: "dashboard-kpis",
    title:  "KPI snapshot",
    body:   "Six cards covering channel mix, pipeline value, sign-rate and revenue. Click a card to flip it open for the full breakdown behind the headline number. Everything here respects the date range selector at the top of the page — change it and every figure recomputes.",
    placement: "auto",
  },

  // ── My Workspace ────────────────────────────────────────────────────
  {
    target: "sidebar-my-workspace",
    title:  "My Workspace — your home base",
    body:   "The same idea as the Dashboard, but scoped to just YOU — runs assigned to you because you own the hospital, or because you started the run. HI members land here automatically at login. If you only check one screen each morning, make it this one.",
    placement: "right",
  },
  {
    route: "/my-workspace",
    target: "workspace-tasks",
    title:  "Tasks waiting on you",
    body:   "Pipeline rows where YOU are the bottleneck — pick a relocation city, confirm a shortlist, send a contract. Anything untouched for 7+ days gets an amber 'stale' flag so nothing rots. Click a row and you jump straight into Automations with that run's detail sheet already open.",
    placement: "auto",
  },
  {
    route: "/my-workspace",
    target: "workspace-grid",
    title:  "Your doctors + your vacancies",
    body:   "Two columns: doctors with an active flow assigned to you, and the vacancies you opened (or own via a hospital you're responsible for). One click takes you into either the Doctors or Vacancies page already filtered to that record — no hunting.",
    placement: "auto",
  },

  // ── Doctors hub (Progress + Profiles in one page) ───────────────────
  {
    target: "sidebar-doctors",
    title:  "Doctors hub",
    body:   "Every doctor view in one place. Two tabs at the top: Doctor Progress (where each doctor sits in the Zoho pipeline) and Profiles (the canonical record we put in front of hospitals). One search bar filters whichever tab you're on — name, specialty, location.",
    placement: "right",
  },
  {
    route: "/doctors?tab=profiles",
    title:  "Profiles — click any row to edit inline",
    body:   "A profile opens as a fully-editable card — hover any field (name, specialty, photo, education, bio…) to change it, and it saves straight to WordPress, which is what the public AA website and your hospital emails read from. New profiles auto-link to a Zoho lead whenever the email matches.",
    placement: "auto",
  },

  // ── Automations ─────────────────────────────────────────────────────
  {
    target: "sidebar-automations",
    title:  "Automations — the heart of HI",
    body:   "Six email flows that carry a doctor from first hospital intro to first payment. The system sends the templated emails on schedule; you only step in at the handful of manual-action stages. Everything else — timing, reminders, reply-watching — runs itself. Let's look inside.",
    placement: "right",
  },
  {
    route: "/automations",
    target: "automations-flows",
    title:  "The 6 flows, one tab each",
    body:   "Profile Sent (intro to hospital) → Shortlist (hospital's interested) → Interview (scheduling + prep tips) → Contract (milestone tracking on Placements) → Relocation (city-specific guide + attestation) → Second Payment (45-day clock with reminders). Onboarding was retired — Sales now sends the intake form from Zoho the moment a lead converts.",
    placement: "bottom",
  },
  {
    route: "/automations",
    target: "automations-admin",
    title:  "Queues, Hospitals, Templates, Default Editor",
    body:   "Four admin tabs. Queues = every run sitting at a manual stage, grouped by what it needs (profile to send, city to pick, contract to send…). Hospitals = the recruiter directory. Templates = the editable email library. Default Flow Editor = the per-stage delays and subject lines for each flow.",
    placement: "bottom",
  },
  {
    placement: "center",
    title:  "Opening a run",
    body:   "Clicking a row ANYWHERE — Workspace, Queues, Pending Actions — opens the same Run Detail Sheet. Inside you get the full timeline, suggestion cards ('Hospital looks interested — Mark shortlisted?'), the manual-action button for the current stage, and a Reassign control to hand the run to a teammate.",
  },
  {
    placement: "center",
    title:  "Manual shortlist — you stay in control",
    body:   "Hospitals almost never write 'shortlisted' — it's usually a phone call. When the reply classifier senses interest, a yellow card appears on the run with two buttons: Mark shortlisted / Not shortlisted. The system NEVER advances the doctor on its own; a human always confirms the real-world outcome.",
  },
  {
    placement: "center",
    title:  "Sending a profile",
    body:   "Send Profile picks the doctor, lets you multi-select hospitals (filtered to specialty matches), and previews the exact email. Each hospital gets its own tokenised 'View full profile' link — they open the AA-website profile with no login, and you can see how many times each one viewed it.",
  },

  // ── Vacancies ───────────────────────────────────────────────────────
  {
    target: "sidebar-vacancies",
    title:  "Vacancies",
    body:   "The open roles hospitals are trying to fill. Most arrive as an email reply from a hospital; once logged, each vacancy becomes a target slot you can match doctors against.",
    placement: "right",
  },
  {
    route: "/vacancies",
    target: "vacancies-table",
    title:  "Click any row for ranked matches",
    body:   "A vacancy opens a side sheet with two tabs: Onboarded doctors (auto-scored from the ~1,000-strong AA roster into Strong / Decent / Long-shot tiers) and Leads (filled by Sales as they speak to prospects — empty by default). Specialties fuzzy-match, so a 'Retinal Specialist' surfaces for an 'Ophthalmology' vacancy.",
    placement: "auto",
  },

  // ── Batches ─────────────────────────────────────────────────────────
  {
    target: "sidebar-batches",
    title:  "Batch Sends",
    body:   "Country-scoped broadcasts — UAE, KSA, Qatar, Oman, Kuwait, Bahrain. Daily Duo (Mon–Fri, 2 profiles per country), Tuesday Top 15 (mixed specialties), and Specialty of the Day (Wed–Fri). Each batch reaches ONLY that country's hospital recruiters, so you create one per country per day.",
    placement: "right",
  },
  {
    route: "/batches",
    target: "batches-rotation",
    title:  "Today's specialty + the queue",
    body:   "The rotation cursor walks the canonical specialty list pulled from the AA website (not the old Zoho buckets), auto-advancing after each Specialty-of-the-Day send. That same specialty also nudges the Daily Duo and Tuesday picks, so a day's sends stay on one coherent theme.",
    placement: "auto",
  },

  // ── Reports ─────────────────────────────────────────────────────────
  {
    target: "sidebar-reports",
    title:  "Reports",
    body:   "The HI scoreboard: a KPI strip, weekly + monthly recaps, the Placements tracker (this is what replaced Hammad's spreadsheet), a per-doctor breakdown, and hospital-relationship health.",
    placement: "right",
  },
  {
    route: "/reports",
    target: "reports-filters",
    title:  "Slice by anything",
    body:   "Filter by hospital, HI team member, specialty, or date range, and everything below re-scopes. Note the Placements table has one row per (doctor, hospital) PAIR — the same doctor sent to four hospitals shows as four rows — with bulk CSV import and a 'New placement' picker that pulls doctors straight from Zoho.",
    placement: "bottom",
  },

  // ── Topbar — universal across pages ─────────────────────────────────
  {
    target: "topbar-search",
    title:  "Universal Search — ⌘K",
    body:   "One index across doctors, hospitals, flow stages, vacancies and templates — jump anywhere in two keystrokes. Opening it with nothing typed shows your recent items, so the most likely next click is already one keypress away.",
    placement: "bottom",
  },
  {
    target: "topbar-notifications",
    title:  "Notifications",
    body:   "Replies to your sends, doctor uploads, hospital responses, contract signatures. HI members see only what's addressed to them; admins see the whole team stream. The red badge counts unread only — clear it by opening the items.",
    placement: "bottom",
  },
  {
    target: "ai-floating-button",
    title:  "AI Assistant",
    body:   "Ask it anything in plain English — 'what's stuck right now', 'how do I link a lead to a vacancy', 'which hospitals are cooling off', 'why didn't Dr X's contract send'. It knows both how the system works AND your live data, and answers with concrete next steps plus clickable links.",
    placement: "left",
  },
  {
    target: "topbar-tour-button",
    title:  "Replay this tour any time",
    body:   "This button re-runs the walkthrough whenever you need it — handy when a new flow ships, or when you're onboarding a new HI hire. Each section of the dashboard (Sales, Growth, Admin) has its own tour here too; the button always launches the one for the page you're on.",
    placement: "bottom",
  },

  {
    placement: "center",
    title:  "You're set",
    body:   "When you get stuck on a specific page, the fastest help is the AI Assistant or that page's ⓘ button. Now go close some hospital introductions.",
  },
];

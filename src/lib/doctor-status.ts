/**
 * Phase 4 — Per-doctor status lifecycle.
 *
 * The 7 Hospital Introduction flows fire independently; the team wanted one
 * authoritative status per doctor that summarises "where are they in the
 * pipeline right now?" — so they don't have to read 7 flow rows to figure
 * out the answer.
 *
 * This module derives that status purely from the doctor's flow runs (no
 * extra DB columns to keep in sync). Status ordering follows the natural
 * pipeline progression — the highest-ranked status across all runs wins, so
 * a doctor who has a `relocation` run active OUTRANKS their earlier
 * `onboarding` completion.
 *
 * Source of truth: meeting with Saif Ullah, May 20 2026 — the lifecycle
 * stages listed under Phase 4 of the spec.
 */
import type { FlowRun, RunStatus } from "@/hooks/use-automation-flows";
import type { FlowKey } from "@/lib/automation-flows";

export type DoctorStatus =
  | "lead"
  | "onboarding"
  | "awaiting_profile_send"
  | "profile_sent"
  | "shortlisted"
  | "interview_scheduled"
  | "offer_extended"
  | "contracted"
  | "relocating"
  | "joined"
  | "approved"
  | "placed"
  | "paused"           // explicit "unavailable" override from doctor_lifecycle
  | "dropped_off";

export interface DoctorStatusInfo {
  status:     DoctorStatus;
  /** Human label for the badge / tooltip. */
  label:      string;
  /** One-line context — e.g. "Profile sent to Saudi German Hospital · 3d ago". */
  detail:     string;
  /** Tailwind classes for the badge (bg / text / border). */
  cls:        string;
  /** The most relevant run that contributed to this status, when applicable. */
  drivingRun: FlowRun | null;
}

// Higher rank wins when a doctor has multiple runs. Order mirrors the
// pipeline left-to-right.
const RANK: Record<DoctorStatus, number> = {
  lead:                  0,
  onboarding:            10,
  awaiting_profile_send: 20,
  profile_sent:          30,
  shortlisted:           40,
  interview_scheduled:   50,
  offer_extended:        60,
  contracted:            70,
  relocating:            80,
  joined:                85,
  approved:              92,
  placed:                95,
  paused:                -2,  // explicit unavailable override
  dropped_off:           -1,  // distinct lane — only set if every flow is stuck/failed
};

const LABELS: Record<DoctorStatus, string> = {
  lead:                  "Lead",
  onboarding:            "Onboarding",
  awaiting_profile_send: "Ready to send",
  profile_sent:          "Profile sent",
  shortlisted:           "Shortlisted",
  interview_scheduled:   "Interview",
  offer_extended:        "Offer extended",
  contracted:            "Contracted",
  relocating:            "Relocating",
  joined:                "Joined",
  approved:              "Joined · approved",
  placed:                "Placed",
  paused:                "Unavailable",
  dropped_off:           "Stalled",
};

const CLASSES: Record<DoctorStatus, string> = {
  lead:                  "bg-slate-100 text-slate-700 border-slate-200",
  onboarding:            "bg-sky-100 text-sky-800 border-sky-200",
  awaiting_profile_send: "bg-indigo-100 text-indigo-800 border-indigo-200",
  profile_sent:          "bg-blue-100 text-blue-800 border-blue-200",
  shortlisted:           "bg-violet-100 text-violet-800 border-violet-200",
  interview_scheduled:   "bg-purple-100 text-purple-800 border-purple-200",
  offer_extended:        "bg-amber-100 text-amber-800 border-amber-200",
  contracted:            "bg-teal-100 text-teal-800 border-teal-200",
  relocating:            "bg-cyan-100 text-cyan-800 border-cyan-200",
  joined:                "bg-lime-100 text-lime-800 border-lime-200",
  approved:              "bg-emerald-100 text-emerald-900 border-emerald-300",
  placed:                "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused:                "bg-orange-100 text-orange-800 border-orange-300",
  dropped_off:           "bg-rose-100 text-rose-800 border-rose-200",
};

/** Lifecycle facts that override flow-derived status. */
export interface LifecycleFacts {
  joined_at?:             string | null;
  approved_at?:           string | null;
  paid_at?:               string | null;
  unavailable?:           boolean;
  unavailable_reason?:    string | null;
  available_check_in_at?: string | null;
}

/** Map a (flow_key, status) pair to the doctor status it implies. Active
 *  flows imply the in-progress status; completed flows imply readiness for
 *  the next phase. */
function statusFromRun(r: FlowRun): DoctorStatus | null {
  const isActive    = r.status === "active";
  const isCompleted = r.status === "completed";

  switch (r.flow_key as FlowKey) {
    case "onboarding":
      if (isActive)    return "onboarding";
      if (isCompleted) return "awaiting_profile_send";
      return null;
    case "profile_sent":
      // Active profile_sent run → profile is out. Completed means the team
      // closed it manually OR a reply arrived (which would have triggered
      // shortlist, so a higher-rank status would already win).
      if (isActive)    return "profile_sent";
      if (isCompleted) return "profile_sent";
      return null;
    case "shortlist":
      if (isActive || isCompleted) return "shortlisted";
      return null;
    case "interview":
      if (isActive || isCompleted) return "interview_scheduled";
      return null;
    case "contract_signing":
      if (isActive)    return "offer_extended";
      if (isCompleted) return "contracted";
      return null;
    case "relocation":
      if (isActive)    return "relocating";
      if (isCompleted) return "relocating";  // still in the "between signed and joined" gap
      return null;
    case "second_payment":
      // Reaching this flow means joining_date passed; once paid (completed)
      // they're fully placed.
      if (isCompleted) return "placed";
      if (isActive)    return "placed";  // they've joined; invoice is the only remaining touchpoint
      return null;
  }
  return null;
}

/** Given every flow run for a doctor + (optionally) their lifecycle row,
 *  return the single canonical status. Lifecycle facts override the
 *  flow-derived state at the milestone points the team explicitly marks
 *  (joined, approved, paid, unavailable). */
export function deriveDoctorStatus(runs: FlowRun[], lifecycle?: LifecycleFacts | null): DoctorStatusInfo {
  // Lifecycle overrides take priority — these are explicit team marks.
  if (lifecycle) {
    if (lifecycle.unavailable) {
      const checkIn = lifecycle.available_check_in_at;
      return {
        status: "paused",
        label:  LABELS.paused,
        detail: checkIn ? `Pause · check in ${shortDate(checkIn)}` : "Marked unavailable",
        cls:    CLASSES.paused,
        drivingRun: null,
      };
    }
    if (lifecycle.paid_at) {
      return {
        status: "placed",
        label:  LABELS.placed,
        detail: `Paid · ${relativeAge(lifecycle.paid_at)}`,
        cls:    CLASSES.placed,
        drivingRun: null,
      };
    }
    if (lifecycle.approved_at) {
      return {
        status: "approved",
        label:  LABELS.approved,
        detail: `Approved · Slack archive due · ${relativeAge(lifecycle.approved_at)}`,
        cls:    CLASSES.approved,
        drivingRun: null,
      };
    }
    if (lifecycle.joined_at) {
      return {
        status: "joined",
        label:  LABELS.joined,
        detail: `Joined ${shortDate(lifecycle.joined_at)} · second-payment 15d`,
        cls:    CLASSES.joined,
        drivingRun: null,
      };
    }
  }
  if (runs.length === 0) {
    return {
      status: "lead",
      label:  LABELS.lead,
      detail: "No flow runs yet",
      cls:    CLASSES.lead,
      drivingRun: null,
    };
  }

  let best: { status: DoctorStatus; run: FlowRun } | null = null;
  for (const r of runs) {
    const s = statusFromRun(r);
    if (!s) continue;
    if (!best || RANK[s] > RANK[best.status]) {
      best = { status: s, run: r };
    } else if (RANK[s] === RANK[best.status]) {
      // tiebreaker: more recent activity wins
      if (new Date(r.last_event_at).getTime() > new Date(best.run.last_event_at).getTime()) {
        best = { status: s, run: r };
      }
    }
  }

  // Stalled detection: every active run is >14 days old with no progression.
  if (best) {
    const allStale = runs.every(r =>
      r.status !== "active" ||
      (Date.now() - new Date(r.last_event_at).getTime()) / 86_400_000 > 14
    );
    const anyActive = runs.some(r => r.status === "active");
    if (anyActive && allStale && best.status !== "placed") {
      return {
        status: "dropped_off",
        label:  LABELS.dropped_off,
        detail: `No movement >14d on ${best.run.flow_key.replace("_", " ")}`,
        cls:    CLASSES.dropped_off,
        drivingRun: best.run,
      };
    }
  }

  if (!best) {
    return {
      status: "lead",
      label:  LABELS.lead,
      detail: "No flow runs yet",
      cls:    CLASSES.lead,
      drivingRun: null,
    };
  }

  return {
    status: best.status,
    label:  LABELS[best.status],
    detail: detailFor(best.status, best.run),
    cls:    CLASSES[best.status],
    drivingRun: best.run,
  };
}

function detailFor(status: DoctorStatus, run: FlowRun): string {
  const rel = relativeAge(run.last_event_at);
  const hosp = run.hospital ? ` · ${run.hospital}` : "";
  const ranStatus: RunStatus = run.status;

  switch (status) {
    case "onboarding":            return `Onboarding · ${rel}`;
    case "awaiting_profile_send": return `Onboarding complete${rel ? ` · ${rel}` : ""}`;
    case "profile_sent":          return `Profile sent${hosp} · ${rel}`;
    case "shortlisted":           return `Shortlisted${hosp} · ${rel}`;
    case "interview_scheduled":   return `Interview${hosp} · ${rel}`;
    case "offer_extended":        return `Contract ${ranStatus === "completed" ? "signed" : "out"}${hosp} · ${rel}`;
    case "contracted":            return `Contract signed${hosp} · ${rel}`;
    case "relocating":            return `Relocation pack${hosp} · ${rel}`;
    case "placed":                return `Placed${hosp} · ${rel}`;
    default:                      return rel;
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function relativeAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

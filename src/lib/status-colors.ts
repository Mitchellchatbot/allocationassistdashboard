/**
 * Single source of truth for status / priority colors across the dashboard.
 * Replaces ad-hoc inline `className="bg-amber-100 text-amber-800 …"` blocks
 * that drifted from page to page.
 *
 * Usage:
 *   const c = statusColor("active");
 *   <Badge className={`${c.bg} ${c.text} ${c.border}`}>active</Badge>
 *
 * If a status isn't in the map, a neutral slate set is returned so badges
 * still render rather than crashing.
 */

export type StatusKind =
  // automation_flow_runs.status
  | "active" | "completed" | "paused" | "failed" | "cancelled"
  // vacancies.status
  | "open" | "filled" | "closed"
  // priority
  | "high" | "medium" | "low"
  // generic
  | "new" | "draft" | "sent" | "error";

export interface StatusColor {
  bg:     string;
  text:   string;
  border: string;
}

const NEUTRAL: StatusColor = {
  bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200",
};

const MAP: Record<StatusKind, StatusColor> = {
  active:    { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  paused:    { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200"   },
  failed:    { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-200"    },
  cancelled: { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200"   },

  open:      { bg: "bg-sky-100",     text: "text-sky-800",     border: "border-sky-200"     },
  filled:    { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  closed:    { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200"   },

  high:      { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-200"    },
  medium:    { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200"   },
  low:       { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200"   },

  new:       { bg: "bg-sky-100",     text: "text-sky-800",     border: "border-sky-200"     },
  draft:     { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-200"   },
  sent:      { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  error:     { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-200"    },
};

export function statusColor(status: string | null | undefined): StatusColor {
  if (!status) return NEUTRAL;
  return MAP[status.toLowerCase() as StatusKind] ?? NEUTRAL;
}

/** Convenience: one string with bg + text + border classes glued. */
export function statusClasses(status: string | null | undefined): string {
  const c = statusColor(status);
  return `${c.bg} ${c.text} ${c.border}`;
}

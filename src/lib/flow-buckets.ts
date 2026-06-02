/**
 * Shared flow-run bucketing logic — used by:
 *   - PendingActionsCard on the main dashboard (team-wide)
 *   - MyTasksCard on My Workspace (scoped to assigned_to = me)
 *
 * "Buckets" are the meta-groupings of runs by what kind of attention
 * they need, not what flow they belong to:
 *   - action   → team is the bottleneck right now (pick a city, chase contract)
 *   - stale    → nothing has moved in 7+ days
 *   - waiting  → expected to be waiting (profile sent, hospital hasn't replied)
 *
 * Empty buckets are dropped so callers can render only what's relevant.
 */
import { AlertCircle, Clock, Mail } from "lucide-react";
import type { FlowRun } from "@/hooks/use-automation-flows";

export interface FlowBucket {
  key:    "action" | "stale" | "waiting";
  label:  string;
  icon:   React.ComponentType<{ className?: string }>;
  cls:    string;
  blurb:  string;
  runs:   FlowRun[];
}

export function groupRunsIntoBuckets(items: FlowRun[]): FlowBucket[] {
  const now = Date.now();
  const stale:   FlowRun[] = [];
  const action:  FlowRun[] = [];
  const waiting: FlowRun[] = [];

  for (const r of items) {
    const ageDays = (now - new Date(r.last_event_at).getTime()) / 86_400_000;

    if (r.flow_key === "relocation" && r.current_stage === "select_city_guide") {
      action.push(r); continue;
    }
    if (r.flow_key === "contract_signing" &&
        (r.current_stage === "awaiting_view" || r.current_stage === "awaiting_signature") &&
        ageDays > 3) {
      action.push(r); continue;
    }
    if (ageDays > 7) { stale.push(r); continue; }
    if (r.flow_key === "profile_sent" && r.current_stage === "awaiting_response") {
      waiting.push(r); continue;
    }
  }

  return ([
    { key: "action",  label: "Needs action now",         icon: AlertCircle, cls: "bg-rose-50/40 border-rose-200",   blurb: "Pick a city · chase a contract", runs: action  },
    { key: "stale",   label: "Stale (no activity 7d+)",  icon: Clock,       cls: "bg-amber-50/40 border-amber-200", blurb: "Nothing's happened in a week",   runs: stale   },
    { key: "waiting", label: "Awaiting hospital reply",  icon: Mail,        cls: "bg-blue-50/40 border-blue-200",   blurb: "Profile sent, no response yet",  runs: waiting },
  ] as FlowBucket[]).filter(b => b.runs.length > 0);
}

/**
 * Team handoff — shared vocabulary.
 *
 * A "handoff" is a BULK reassignment of a person's active flow runs to a
 * teammate, qualified with a reason and a duration. It sits alongside the
 * single-run Reassign dropdown (ReassignButton), which is unchanged — this
 * is the heavier path used for leave cover, escalation and permanent
 * ownership transfer.
 *
 * Reason keys are stored (not labels) so the audit payload stays stable and
 * groupable if the wording ever changes. Both the dialog and the mutation
 * import from here so the two can't drift.
 *
 * Storage note: nothing here needs a migration. The audit record rides
 * `automation_flow_events.payload` (jsonb, previously written as `{}` by
 * reassignment) and the temporary-handoff state rides
 * `automation_flow_runs.metadata.handoff` (jsonb, already used for arbitrary
 * per-run state like the relocation city and invoice details).
 */

export type HandoffReason =
  | "leave_absence"
  | "hospital_owner_override"
  | "escalation"
  | "workload_balancing"
  | "temporary_coverage"
  | "other";

export type HandoffType = "temporary" | "permanent";

export const HANDOFF_REASONS: Array<{ key: HandoffReason; label: string }> = [
  { key: "leave_absence",           label: "Leave / absence" },
  { key: "hospital_owner_override", label: "Hospital owner override" },
  { key: "escalation",              label: "Escalation" },
  { key: "workload_balancing",      label: "Workload balancing" },
  { key: "temporary_coverage",      label: "Temporary coverage" },
  { key: "other",                   label: "Other" },
];

export function handoffReasonLabel(key: string | null | undefined): string {
  return HANDOFF_REASONS.find(r => r.key === key)?.label ?? "Unspecified";
}

/** The `metadata.handoff` blob written on a TEMPORARY handoff. Permanent
 *  handoffs write nothing here — they're a plain ownership change with
 *  nothing to revert. `tick-scheduler`'s runHandoffReturnSweep reads this. */
export interface HandoffMeta {
  batch_id:       string;
  /** Who the run goes BACK to when ends_at passes. */
  original_owner: string | null;
  /** Who is covering until then. The sweep only reverts if the run is still
   *  assigned to this person — a later deliberate reassignment wins. */
  covering:       string | null;
  reason:         HandoffReason;
  reason_note?:   string | null;
  starts_at:      string | null;
  ends_at:        string;
}

/** Stage key used for every handoff event so the timeline can be filtered. */
export const HANDOFF_STAGE_KEY = "handoff";

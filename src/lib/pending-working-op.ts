/**
 * Pending working-opportunity emails — the backlog created by "Hospital only".
 *
 * The Send-Profile wizard can now hold back the doctor's working-opportunity
 * email (send_mode "hospital"): the hospital intro goes out and the run parks
 * at `email_doctor` without firing. That's a deliberate deferral, not a
 * finished send — so the doctor is *owed* an email and somebody has to
 * remember. This module derives that list so the UI can show it.
 *
 * Detection is metadata-driven rather than "any run sitting at email_doctor",
 * because a perfectly healthy multi-hospital send ALSO parks its non-first
 * runs there: SendProfileDialog marks one run send_doctor_email:true and the
 * rest false so the doctor gets ONE consolidated email instead of N. Those
 * runs are covered, not owed. Only `send_mode === "hospital"` means held back.
 *
 * Unit of work is the BATCH, not the run: batch_id is minted per doctor, and
 * a multi-hospital send owes that doctor a single consolidated email listing
 * every hospital — not one per hospital.
 */
import type { FlowRun } from "@/hooks/use-automation-flows";

export interface PendingWorkingOp {
  /** Stable list key — the batch id when there is one, else the run id. */
  key:           string;
  /** The run to fire. Already parked at email_doctor, so invoking
   *  send-flow-email on it sends the working-opportunity email. */
  runId:         string;
  /** The other runs in the batch, also parked. The consolidated email covers
   *  them, so they get resolved alongside `runId` rather than fired. */
  siblingRunIds: string[];
  doctorId:      string | null;
  doctorName:    string;
  /** Null/empty means the send WILL fail — surfaced as a warning in the UI. */
  doctorEmail:   string | null;
  speciality:    string | null;
  /** Hospitals this one email covers, in send order. */
  hospitals:     string[];
  /** When the intro went out and the run parked — i.e. waiting since. */
  waitingSince:  string;
  createdBy:     string | null;
  assignedTo:    string | null;
}

const PROFILE_FLOW = "profile_sent";
const DOCTOR_STAGE = "email_doctor";

const meta = (r: FlowRun): Record<string, unknown> => r.metadata ?? {};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** A run whose working-opportunity email was deliberately held back. */
export function isPendingWorkingOp(run: FlowRun): boolean {
  return run.flow_key === PROFILE_FLOW
    && run.status === "active"
    && run.current_stage === DOCTOR_STAGE
    && meta(run).send_mode === "hospital";
}

/** Hospital names this pending email should mention. Prefers the snapshot the
 *  consolidated renderer uses (metadata.batch_hospitals) so the list matches
 *  the email; falls back to the runs' own hospital column. */
function hospitalNames(group: FlowRun[]): string[] {
  const snapshot = group
    .map(r => meta(r).batch_hospitals)
    .find(v => Array.isArray(v) && v.length > 0) as Array<{ name?: unknown }> | undefined;
  const names = snapshot
    ? snapshot.map(h => str(h?.name)).filter((n): n is string => !!n)
    : group.map(r => str(r.hospital)).filter((n): n is string => !!n);
  return [...new Set(names)];
}

export function derivePendingWorkingOps(runs: FlowRun[]): PendingWorkingOp[] {
  const groups = new Map<string, FlowRun[]>();
  for (const r of runs) {
    if (!isPendingWorkingOp(r)) continue;
    const batchId = str(meta(r).batch_id);
    const key = batchId ? `batch::${batchId}` : `run::${r.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r); else groups.set(key, [r]);
  }

  const out: PendingWorkingOp[] = [];
  for (const [key, unsorted] of groups) {
    // Oldest first so "the run to fire" is deterministic across refetches and
    // waitingSince reflects when the batch actually parked.
    const group = [...unsorted].sort((a, b) => a.started_at.localeCompare(b.started_at));
    // Fire the run carrying the consolidated hospital snapshot when there is
    // one — that's the render that lists every hospital in a single email.
    const lead = group.find(r => Array.isArray(meta(r).batch_hospitals) && (meta(r).batch_hospitals as unknown[]).length > 0)
      ?? group[0];
    out.push({
      key,
      runId:         lead.id,
      siblingRunIds: group.filter(r => r.id !== lead.id).map(r => r.id),
      doctorId:      lead.doctor_id,
      doctorName:    lead.doctor_name,
      doctorEmail:   str(lead.doctor_email),
      speciality:    str(meta(lead).doctor_speciality),
      hospitals:     hospitalNames(group),
      // The whole batch parks together; take the latest so a retried leg
      // doesn't make the row look older than it is.
      waitingSince:  group.reduce((acc, r) => (r.last_event_at > acc ? r.last_event_at : acc), group[0].last_event_at),
      createdBy:     lead.created_by,
      assignedTo:    lead.assigned_to,
    });
  }

  // Longest-waiting first — this is a backlog, so the top of the list is the
  // thing most overdue.
  return out.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
}

/** Case-insensitive match across the fields the Doctors search bar covers. */
export function matchesPendingQuery(p: PendingWorkingOp, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.doctorName, p.doctorEmail, p.speciality, p.createdBy, p.assignedTo, ...p.hospitals]
    .some(v => (v ?? "").toLowerCase().includes(needle));
}

import { describe, it, expect } from "vitest";
import {
  isPendingWorkingOp,
  derivePendingWorkingOps,
  matchesPendingQuery,
} from "@/lib/pending-working-op";
import type { FlowRun } from "@/hooks/use-automation-flows";

/**
 * The whole point of this module is telling two identical-looking runs apart:
 * a run parked at email_doctor because the dispatcher HELD BACK the working-
 * opportunity email (owed), versus a run parked at email_doctor because a
 * sibling in its batch is sending ONE consolidated email for the whole batch
 * (covered). Both sit at the same stage with send_doctor_email:false. Only
 * metadata.send_mode separates them, so these assertions are the guard.
 */
function run(over: Partial<FlowRun> & { id: string }): FlowRun {
  return {
    flow_key:      "profile_sent",
    doctor_id:     "doc-1",
    doctor_name:   "Dr. Amina Rashid",
    doctor_email:  "amina@example.com",
    doctor_phone:  null,
    current_stage: "email_doctor",
    status:        "active",
    hospital:      "Saudi German Hospital",
    started_at:    "2026-09-01T09:00:00.000Z",
    last_event_at: "2026-09-01T09:01:00.000Z",
    completed_at:  null,
    metadata:      { send_mode: "hospital", batch_id: "batch-1" },
    created_by:    "asser@allocationassist.com",
    assigned_to:   "asser@allocationassist.com",
    reassigned_at: null,
    reassigned_by: null,
    ...over,
  } as FlowRun;
}

describe("isPendingWorkingOp — owed vs. covered", () => {
  it("flags a deliberately held-back doctor leg", () => {
    expect(isPendingWorkingOp(run({ id: "r1" }))).toBe(true);
  });

  it("does NOT flag a consolidation sibling (the false-positive that matters)", () => {
    // A healthy multi-hospital "both" send parks its non-first runs at
    // email_doctor with send_doctor_email:false. The doctor still gets the
    // consolidated email from the marked run, so nothing is owed.
    expect(isPendingWorkingOp(run({
      id: "r2",
      metadata: { send_mode: "both", batch_id: "b", send_doctor_email: false },
    }))).toBe(false);
  });

  it("ignores runs that already sent, moved on, or aren't profile sends", () => {
    expect(isPendingWorkingOp(run({ id: "r3", current_stage: "awaiting_response" }))).toBe(false);
    expect(isPendingWorkingOp(run({ id: "r4", status: "completed" }))).toBe(false);
    expect(isPendingWorkingOp(run({ id: "r5", flow_key: "relocation" as FlowRun["flow_key"] }))).toBe(false);
    expect(isPendingWorkingOp(run({ id: "r6", current_stage: "email_hospital" }))).toBe(false);
  });

  it("ignores a doctor-only send, which fires immediately rather than parking", () => {
    expect(isPendingWorkingOp(run({ id: "r7", metadata: { send_mode: "doctor" } }))).toBe(false);
  });
});

describe("derivePendingWorkingOps — one email per batch, not per hospital", () => {
  it("collapses a multi-hospital hold into a single owed email", () => {
    const rows = derivePendingWorkingOps([
      run({ id: "a", hospital: "Saudi German Hospital", metadata: {
        send_mode: "hospital", batch_id: "batch-1", send_doctor_email: false,
        batch_hospitals: [{ name: "Saudi German Hospital" }, { name: "Burjeel" }],
      } }),
      run({ id: "b", hospital: "Burjeel", started_at: "2026-09-01T09:00:05.000Z", metadata: {
        send_mode: "hospital", batch_id: "batch-1", send_doctor_email: false,
      } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].hospitals).toEqual(["Saudi German Hospital", "Burjeel"]);
    // The run carrying the snapshot is the one that renders the consolidated
    // email, so it must be the one we fire.
    expect(rows[0].runId).toBe("a");
    expect(rows[0].siblingRunIds).toEqual(["b"]);
  });

  it("keeps different doctors' batches apart", () => {
    const rows = derivePendingWorkingOps([
      run({ id: "a", metadata: { send_mode: "hospital", batch_id: "batch-1" } }),
      run({ id: "b", doctor_id: "doc-2", doctor_name: "Dr. Omar Haddad",
            metadata: { send_mode: "hospital", batch_id: "batch-2" } }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.doctorName).sort()).toEqual(["Dr. Amina Rashid", "Dr. Omar Haddad"]);
  });

  it("falls back to run.hospital when there's no consolidated snapshot", () => {
    const rows = derivePendingWorkingOps([run({ id: "a", metadata: { send_mode: "hospital" } })]);
    expect(rows[0].hospitals).toEqual(["Saudi German Hospital"]);
    // No batch_id → the run stands alone rather than grouping with others.
    expect(rows[0].key).toBe("run::a");
  });

  it("sorts longest-waiting first — this is a backlog", () => {
    const rows = derivePendingWorkingOps([
      run({ id: "new", metadata: { send_mode: "hospital", batch_id: "b2" },
            last_event_at: "2026-09-07T09:00:00.000Z" }),
      run({ id: "old", metadata: { send_mode: "hospital", batch_id: "b1" },
            last_event_at: "2026-08-20T09:00:00.000Z" }),
    ]);
    expect(rows.map(r => r.runId)).toEqual(["old", "new"]);
  });

  it("surfaces a missing doctor address rather than hiding the row", () => {
    // The row must still appear — it's owed — but with a null address so the
    // UI can warn that sending will fail.
    const rows = derivePendingWorkingOps([run({ id: "a", doctor_email: "  " })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].doctorEmail).toBeNull();
  });
});

describe("matchesPendingQuery", () => {
  const [row] = derivePendingWorkingOps([run({ id: "a" })]);
  it("matches doctor, hospital and sender, case-insensitively", () => {
    expect(matchesPendingQuery(row, "amina")).toBe(true);
    expect(matchesPendingQuery(row, "SAUDI")).toBe(true);
    expect(matchesPendingQuery(row, "asser@")).toBe(true);
    expect(matchesPendingQuery(row, "")).toBe(true);
  });
  it("rejects a non-match", () => {
    expect(matchesPendingQuery(row, "cardiology")).toBe(false);
  });
});

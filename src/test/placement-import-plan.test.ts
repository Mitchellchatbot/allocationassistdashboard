import { describe, it, expect } from "vitest";
import { planPlacementImport, type PlacementAttempt, type UpsertAttemptInput } from "@/hooks/use-placement-attempts";

const row = (over: Partial<PlacementAttempt> = {}): PlacementAttempt => ({
  id: "row-1", doctor_id: "dob:1", doctor_name: "Ali Khan", doctor_specialty: null,
  hospital_id: null, hospital_name: "NMC Abu Dhabi",
  shortlisted_at: null, interviewed_at: null, offered_at: null, signed_at: null,
  start_date: null, joined_at: null, relocated_at: null, paid_at: null,
  notes: null, source: "csv_import", manual_edited_at: null, created_by: null,
  created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z", ...over,
});

const sheet = (over: Partial<UpsertAttemptInput> = {}): UpsertAttemptInput => ({
  doctor_id: "dob:1", doctor_name: "Ali Khan", hospital_name: "NMC Abu Dhabi", source: "csv_import", ...over,
});

/** A sheet whose week headers run through June. */
const JUNE = { authoritativeFrom: "2026-06-01T00:00:00.000Z", authoritativeTo: "2026-06-30T00:00:00.000Z" };

describe("planPlacementImport", () => {
  it("fills stages the row is missing", () => {
    const plan = planPlacementImport([sheet({ interviewed_at: "2026-06-10T00:00:00.000Z" })], [row({ shortlisted_at: "2026-06-01T00:00:00.000Z" })], JUNE);
    expect(plan.updates[0].filled).toEqual(["interviewed_at"]);
    expect(plan.updates[0].merged.interviewed_at).toBe("2026-06-10T00:00:00.000Z");
  });

  it("corrects a date inside a month the sheet speaks for", () => {
    const plan = planPlacementImport(
      [sheet({ shortlisted_at: "2026-06-20T00:00:00.000Z" })],
      [row({ shortlisted_at: "2026-06-12T00:00:00.000Z" })],
      JUNE,
    );
    expect(plan.updates[0].corrected).toEqual(["shortlisted_at"]);
    expect(plan.updates[0].merged.shortlisted_at).toBe("2026-06-20T00:00:00.000Z");
  });

  it("clears a stage the sheet no longer records in its own month", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-06-02T00:00:00.000Z" })], [row({
      shortlisted_at: "2026-06-02T00:00:00.000Z", interviewed_at: "2026-06-12T00:00:00.000Z",
    })], JUNE);
    expect(plan.updates[0].cleared).toEqual(["interviewed_at"]);
    expect(plan.updates[0].merged.interviewed_at).toBeNull();
  });

  it("leaves other months alone", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-06-20T00:00:00.000Z" })], [row({
      shortlisted_at: "2026-06-20T00:00:00.000Z", signed_at: "2026-03-04T00:00:00.000Z",
    })], JUNE);
    expect(plan.unchanged).toBe(1);
    expect(plan.updates).toEqual([]);
  });

  it("still takes an earlier date from any month — a journey starts once", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-02-03T00:00:00.000Z" })], [row({ shortlisted_at: "2026-06-12T00:00:00.000Z" })], JUNE);
    expect(plan.updates[0].merged.shortlisted_at).toBe("2026-02-03T00:00:00.000Z");
  });

  it("changes nothing outside the weeks the sheet covers, even when dates disagree", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-06-20T00:00:00.000Z" })], [row({ shortlisted_at: "2026-06-12T00:00:00.000Z" })]);
    expect(plan.unchanged).toBe(1);
  });

  it("never touches a row a person edited in the app", () => {
    const edited = planPlacementImport([sheet({ shortlisted_at: "2026-06-20T00:00:00.000Z" })], [row({
      shortlisted_at: "2026-06-12T00:00:00.000Z", manual_edited_at: "2026-06-15T00:00:00.000Z",
    })], JUNE);
    expect(edited).toMatchObject({ updates: [], protected: 1 });

    const marked = planPlacementImport([sheet({ joined_at: null })], [row({
      joined_at: "2026-06-30T00:00:00.000Z", source: "flow_marked",
    })], JUNE);
    expect(marked).toMatchObject({ updates: [], protected: 1 });
  });

  it("matches a journey whatever spacing the hospital had, and is a no-op the second time", () => {
    const rows = [sheet({ hospital_name: "NMC Abu Dhabi", shortlisted_at: "2026-06-02T00:00:00.000Z", interviewed_at: "2026-06-11T00:00:00.000Z" })];
    const before = [row({ hospital_name: "NMC  Abu   Dhabi", shortlisted_at: "2026-06-02T00:00:00.000Z" })];
    const first = planPlacementImport(rows, before, JUNE);
    expect(first.updates[0].filled).toEqual(["interviewed_at"]);

    const after = [{ ...before[0], ...first.updates[0].merged }];
    expect(planPlacementImport(rows, after, JUNE)).toMatchObject({ inserts: [], updates: [], unchanged: 1 });
  });

  it("adds a journey it has never seen", () => {
    const plan = planPlacementImport([sheet({ hospital_name: "SKMC Fujairah", shortlisted_at: "2026-06-02T00:00:00.000Z" })], [row()], JUNE);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].hospital_name).toBe("SKMC Fujairah");
  });
});

describe("timestamps from the database vs the parser", () => {
  // Postgres returns "…T00:00:00+00:00"; the parser produces "…T00:00:00.000Z".
  // Compared as text those differ, which once made every date look wrong.
  const PG = "2026-06-12T00:00:00+00:00";
  const ISO = "2026-06-12T00:00:00.000Z";

  it("treats the same instant in either format as unchanged", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: ISO })], [row({ shortlisted_at: PG })], JUNE);
    expect(plan).toMatchObject({ updates: [], unchanged: 1 });
  });

  it("still sees a genuinely earlier date across formats", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-02-03T00:00:00.000Z" })], [row({ shortlisted_at: PG })], JUNE);
    expect(plan.updates[0].merged.shortlisted_at).toBe("2026-02-03T00:00:00.000Z");
  });
});

describe("the span a sheet speaks for", () => {
  // September's sheet opens with the last week of August. It speaks for that
  // week, not for all of August — whose own sheet holds the rest of the month.
  const SEPT = { authoritativeFrom: "2026-08-31T00:00:00.000Z", authoritativeTo: "2026-09-20T00:00:00.000Z" };

  it("leaves earlier August dates alone", () => {
    const plan = planPlacementImport([sheet({ interviewed_at: "2026-09-09T00:00:00.000Z" })], [row({
      shortlisted_at: "2026-08-10T00:00:00.000Z",
    })], SEPT);
    expect(plan.updates[0].cleared).toEqual([]);
    expect(plan.updates[0].merged.shortlisted_at).toBe("2026-08-10T00:00:00.000Z");
  });

  it("still corrects the last days of August, which it does cover", () => {
    const plan = planPlacementImport([sheet({ shortlisted_at: "2026-09-01T00:00:00.000Z" })], [row({
      shortlisted_at: "2026-08-31T00:00:00.000Z",
    })], SEPT);
    expect(plan.updates[0].corrected).toEqual(["shortlisted_at"]);
  });
});

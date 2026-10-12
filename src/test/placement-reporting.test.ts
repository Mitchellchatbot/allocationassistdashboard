/**
 * Tests for the Reports page's counting rules.
 *
 * These exist because the page's whole premise is that every panel reconciles:
 * the KPI tiles, the trend chart and the per-hospital table all read
 * placement_attempts and must agree. The rules that make that true are subtle
 * enough to regress silently — distinct-doctor counting, the relocated
 * fallback chain, the inclusive end-of-day window — so they're pinned here.
 */
import { describe, it, expect } from "vitest";
import {
  computeStageTotals, computeTrendBuckets, computeHospitalActivity,
  priorRangeOf, pctChange, startOfWeek, inRange, stageAt, STAGES,
  computeEventTotals, weekEndingOf, type EventRow,
  type ReportingFilters, type DateRange,
} from "@/lib/placement-reporting";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

/** A placement row with everything blank except what a test cares about. */
function attempt(p: Partial<PlacementAttempt>): PlacementAttempt {
  return {
    id: Math.random().toString(36).slice(2),
    doctor_id: "d1", doctor_name: "Dr One", doctor_specialty: null,
    hospital_id: null, hospital_name: "General",
    shortlisted_at: null, interviewed_at: null, offered_at: null,
    signed_at: null, start_date: null, joined_at: null,
    relocated_at: null, paid_at: null,
    notes: null, source: "test", created_by: null,
    created_at: "2026-01-01", updated_at: "2026-01-01",
    ...p,
  };
}

const range = (from: string, to: string): DateRange => ({ from: new Date(from), to: new Date(to) });
const filters = (r: DateRange, extra: Partial<ReportingFilters> = {}): ReportingFilters => ({
  range: r, hospital: null, teamMember: null, specialty: null, ...extra,
});

const JAN = range("2026-01-01T00:00:00", "2026-01-31T00:00:00");

describe("computeStageTotals", () => {
  it("counts a doctor once no matter how many hospitals shortlisted them", () => {
    // The failure mode this guards: one popular candidate quadrupling the
    // department's headline numbers.
    const rows = ["A", "B", "C", "D"].map(h =>
      attempt({ doctor_id: "d1", hospital_name: h, shortlisted_at: "2026-01-10" }));
    expect(computeStageTotals(rows, filters(JAN)).shortlisted).toBe(1);
  });

  it("counts distinct doctors, not distinct rows", () => {
    const rows = [
      attempt({ doctor_id: "d1", shortlisted_at: "2026-01-05" }),
      attempt({ doctor_id: "d2", shortlisted_at: "2026-01-06" }),
      attempt({ doctor_id: "d2", shortlisted_at: "2026-01-07", hospital_name: "Other" }),
    ];
    expect(computeStageTotals(rows, filters(JAN)).shortlisted).toBe(2);
  });

  it("excludes milestones outside the window", () => {
    const rows = [
      attempt({ doctor_id: "d1", signed_at: "2025-12-31" }),
      attempt({ doctor_id: "d2", signed_at: "2026-01-15" }),
      attempt({ doctor_id: "d3", signed_at: "2026-02-01" }),
    ];
    expect(computeStageTotals(rows, filters(JAN)).signed).toBe(1);
  });

  it("includes the whole of the last selected day", () => {
    // range.to is local midnight, but the day it names is meant to be IN the
    // window — a signature at 4pm on the last day must still count.
    const rows = [attempt({ signed_at: "2026-01-31T16:00:00" })];
    expect(computeStageTotals(rows, filters(JAN)).signed).toBe(1);
  });

  it("falls back from relocated_at to joined_at without double counting", () => {
    // The sheet import fills joined_at; Processing marks relocated_at. A row
    // carrying both is still one relocated doctor.
    const both = [attempt({ relocated_at: "2026-01-10", joined_at: "2026-01-12" })];
    expect(computeStageTotals(both, filters(JAN)).relocated).toBe(1);

    const joinedOnly = [attempt({ doctor_id: "d9", joined_at: "2026-01-12" })];
    expect(computeStageTotals(joinedOnly, filters(JAN)).relocated).toBe(1);
  });

  it("prefers relocated_at over joined_at when they fall in different windows", () => {
    // Only the explicit relocation date is in range, so the doctor counts.
    const rows = [attempt({ relocated_at: "2026-01-10", joined_at: "2025-11-01" })];
    expect(computeStageTotals(rows, filters(JAN)).relocated).toBe(1);
    // And the reverse: the preferred column lands outside, so it does NOT
    // silently fall through to the in-range joined_at.
    const rows2 = [attempt({ relocated_at: "2025-11-01", joined_at: "2026-01-10" })];
    expect(computeStageTotals(rows2, filters(JAN)).relocated).toBe(0);
  });

  it("applies the hospital and specialty filters", () => {
    const rows = [
      attempt({ doctor_id: "d1", hospital_name: "Cairo General", doctor_specialty: "Cardiology", offered_at: "2026-01-10" }),
      attempt({ doctor_id: "d2", hospital_name: "Alex Clinic",   doctor_specialty: "Neurology",  offered_at: "2026-01-10" }),
    ];
    expect(computeStageTotals(rows, filters(JAN, { hospital: "cairo" })).offered).toBe(1);
    expect(computeStageTotals(rows, filters(JAN, { specialty: "neuro" })).offered).toBe(1);
  });

  it("returns zeros, not undefined, for stages with no activity", () => {
    const totals = computeStageTotals([], filters(JAN));
    for (const s of STAGES) expect(totals[s.key]).toBe(0);
  });
});

describe("computeTrendBuckets", () => {
  it("emits a zero for quiet weeks instead of skipping them", () => {
    // A line that omits empty weeks compresses the x-axis and makes a dip
    // read as steady progress.
    const rows = [
      attempt({ doctor_id: "d1", shortlisted_at: "2026-01-05" }),
      attempt({ doctor_id: "d2", shortlisted_at: "2026-01-26" }),
    ];
    const buckets = computeTrendBuckets(rows, filters(JAN));
    expect(buckets.length).toBeGreaterThan(3);
    expect(buckets.some(b => b.shortlisted === 0)).toBe(true);
    expect(buckets.reduce((n, b) => n + b.shortlisted, 0)).toBe(2);
  });

  it("buckets by the Sunday of the milestone's week, in order", () => {
    const rows = [attempt({ shortlisted_at: "2026-01-08" })]; // a Thursday
    const [hit] = computeTrendBuckets(rows, filters(JAN)).filter(b => b.shortlisted > 0);
    expect(new Date(hit.weekStart).getDay()).toBe(0);
    const all = computeTrendBuckets(rows, filters(JAN));
    const times = all.map(b => new Date(b.weekStart).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("counts a doctor once per week even across several hospitals", () => {
    const rows = ["A", "B", "C"].map(h =>
      attempt({ doctor_id: "d1", hospital_name: h, interviewed_at: "2026-01-07" }));
    const total = computeTrendBuckets(rows, filters(JAN)).reduce((n, b) => n + b.interviews, 0);
    expect(total).toBe(1);
  });
});

describe("computeHospitalActivity", () => {
  it("counts the same doctor once PER HOSPITAL — four accounts is four conversations", () => {
    const rows = ["A", "B"].map(h =>
      attempt({ doctor_id: "d1", hospital_name: h, shortlisted_at: "2026-01-10" }));
    const out = computeHospitalActivity(rows, new Map(), filters(JAN));
    expect(out).toHaveLength(2);
    expect(out.every(r => r.counts.shortlisted === 1)).toBe(true);
  });

  it("attaches open vacancies and the most recent in-range milestone", () => {
    const rows = [attempt({ hospital_name: "General", shortlisted_at: "2026-01-05", signed_at: "2026-01-20" })];
    const [row] = computeHospitalActivity(rows, new Map([["General", 3]]), filters(JAN));
    expect(row.openVacancies).toBe(3);
    expect(row.lastAt).toBe(new Date("2026-01-20").getTime());
  });

  it("skips rows with no hospital name rather than inventing a blank account", () => {
    const rows = [attempt({ hospital_name: "  ", shortlisted_at: "2026-01-10" })];
    expect(computeHospitalActivity(rows, new Map(), filters(JAN))).toHaveLength(0);
  });
});

describe("priorRangeOf", () => {
  it("returns the equal-length window immediately before, with no overlap", () => {
    const prior = priorRangeOf(JAN);
    expect(prior.to.getTime()).toBeLessThan(JAN.from.getTime());
    const span = (r: DateRange) => r.to.getTime() - r.from.getTime();
    expect(span(prior)).toBe(span(JAN));
  });
});

describe("pctChange", () => {
  it("reports growth and decline", () => {
    expect(pctChange(15, 10)).toBeCloseTo(50);
    expect(pctChange(5, 10)).toBeCloseTo(-50);
  });

  it("returns null for 'new' (no prior baseline) and 0 for still-nothing", () => {
    // null means "no percentage is meaningful here", not "no change" — the
    // tile renders a NEW badge rather than a misleading +∞.
    expect(pctChange(4, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("date helpers", () => {
  it("startOfWeek snaps to Sunday and is idempotent", () => {
    // The team's week runs Sunday to Saturday, so a Sunday opens its own week.
    const start = startOfWeek(new Date("2026-01-11T15:00:00")); // a Sunday
    expect(start.getDay()).toBe(0);
    expect(start.getDate()).toBe(11);
    expect(startOfWeek(start).getTime()).toBe(start.getTime());
    // A Saturday still belongs to the week the Sunday before it opened.
    expect(startOfWeek(new Date("2026-01-17T15:00:00")).getDate()).toBe(11);
  });

  it("inRange rejects nulls and unparseable dates", () => {
    expect(inRange(null, JAN)).toBe(false);
    expect(stageAt(attempt({ shortlisted_at: "not a date" }), STAGES[0])).toBeNull();
  });
});

describe("computeEventTotals", () => {
  const ev = (o: Partial<EventRow>): EventRow => ({
    stage: "interviewed", occurred_at: "2026-08-14", week_ending: "2026-08-15",
    rep: "Ishak", country: "UAE", ...o,
  });
  const AUG = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-08-31T23:59:59Z") };

  it("counts every line, not distinct doctors", () => {
    // A doctor put forward at the same hospital twice is two lines to the team.
    const rows = [ev({ occurred_at: "2026-08-05" }), ev({ occurred_at: "2026-08-19" })];
    expect(computeEventTotals(rows, AUG).interviewed).toBe(2);
  });

  it("counts the same line twice when two reps logged it", () => {
    const rows = [ev({ rep: "Ishak" }), ev({ rep: "Mohamed" })];
    expect(computeEventTotals(rows, AUG).interviewed).toBe(2);
  });

  it("splits UAE from KSA/Qatar", () => {
    const rows = [ev({ country: "UAE" }), ev({ country: "KSA/Qatar" }), ev({ country: "UAE" })];
    expect(computeEventTotals(rows, AUG, { country: "UAE" }).interviewed).toBe(2);
    expect(computeEventTotals(rows, AUG, { country: "KSA/Qatar" }).interviewed).toBe(1);
  });

  it("narrows to one rep", () => {
    const rows = [ev({ rep: "Ishak" }), ev({ rep: "Mohamed" }), ev({ rep: "Ishak" })];
    expect(computeEventTotals(rows, AUG, { rep: "Ishak" }).interviewed).toBe(2);
  });

  it("leaves out lines outside the window", () => {
    const rows = [ev({ occurred_at: "2026-07-30" }), ev({ occurred_at: "2026-08-14" })];
    expect(computeEventTotals(rows, AUG).interviewed).toBe(1);
  });
});

describe("weekEndingOf", () => {
  it("still names a week after its Saturday, from September 2026", () => {
    expect(weekEndingOf("2026-09-01")).toBe("2026-09-05");   // Tuesday the 1st
    expect(weekEndingOf("2026-09-05")).toBe("2026-09-05");   // the Saturday itself
    expect(weekEndingOf("2026-09-06")).toBe("2026-09-12");   // the Sunday that opens the next
  });

  it("cuts the seam week at 31 August rather than running into September", () => {
    expect(weekEndingOf("2026-08-29")).toBe("2026-08-29");   // last whole Sunday week
    expect(weekEndingOf("2026-08-30")).toBe("2026-08-31");   // would have been 5 Sep
    expect(weekEndingOf("2026-08-31")).toBe("2026-08-31");
  });

  it("stops a week at the month end rather than running into the next", () => {
    expect(weekEndingOf("2026-09-28")).toBe("2026-09-30");   // would otherwise be Sat 3 Oct
    expect(weekEndingOf("2026-09-30")).toBe("2026-09-30");
    // October opens on a Thursday, so its first week is Thu 1 - Sat 3.
    expect(weekEndingOf("2026-10-01")).toBe("2026-10-03");
    expect(weekEndingOf("2026-10-04")).toBe("2026-10-10");
  });

  it("names a week after the Saturday closing it, before September 2026", () => {
    expect(weekEndingOf("2026-08-14")).toBe("2026-08-15");   // Friday
    expect(weekEndingOf("2026-08-15")).toBe("2026-08-15");   // the Saturday itself
    expect(weekEndingOf("2026-08-09")).toBe("2026-08-15");   // the Sunday that opens it
  });

  it("carries the last days of July into an August week, under the old rule", () => {
    // Why 32 rows sitting in the July sheet belong to August's figures.
    expect(weekEndingOf("2026-07-26")).toBe("2026-08-01");
    expect(weekEndingOf("2026-07-31")).toBe("2026-08-01");
  });
});

describe("computeEventTotals range edges", () => {
  const ev = (occurred_at: string): EventRow =>
    ({ stage: "shortlisted", occurred_at, week_ending: "2026-09-05", rep: null, country: null });

  it("counts the last day of the period, not everything but it", () => {
    // August runs Sun 2 Aug to Sat 5 Sep. The range ends at local midnight on
    // the 5th; reading the event's day as UTC put it after that, so the whole
    // last day of every period went missing east of UTC.
    const aug = { from: new Date(2026, 7, 2), to: new Date(2026, 8, 5) };
    expect(computeEventTotals([ev("2026-09-05")], aug).shortlisted).toBe(1);
    expect(computeEventTotals([ev("2026-08-02")], aug).shortlisted).toBe(1);
  });

  it("leaves out the days either side", () => {
    const aug = { from: new Date(2026, 7, 2), to: new Date(2026, 8, 5) };
    expect(computeEventTotals([ev("2026-08-01")], aug).shortlisted).toBe(0);
    expect(computeEventTotals([ev("2026-09-06")], aug).shortlisted).toBe(0);
  });
});

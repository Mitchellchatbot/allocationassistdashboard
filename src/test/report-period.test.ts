/**
 * Period math behind the Reports page's Weekly / Monthly / Yearly pill and the
 * back / forward arrows. Dates are built from local parts so the assertions
 * hold in any timezone.
 */
import { describe, it, expect } from "vitest";
import {
  periodRange, periodLabels, offsetOf, trendWindow, yearEarlier,
  countByBuckets, countInRange, earliestMilestone,
} from "@/lib/report-period";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

// Friday 18 Sep 2026.
const NOW = new Date(2026, 8, 18, 15, 30);
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const same = (a: Date, b: Date) => a.getTime() === b.getTime();

function attempt(over: Partial<PlacementAttempt>): PlacementAttempt {
  return {
    id: Math.random().toString(36), doctor_id: "d1", doctor_name: "Dr A", doctor_specialty: null,
    hospital_id: null, hospital_name: "H", shortlisted_at: null, interviewed_at: null, offered_at: null,
    signed_at: null, start_date: null, joined_at: null, relocated_at: null, paid_at: null, notes: null,
    source: "test", created_by: null, created_at: "", updated_at: "", ...over,
  };
}

describe("periodRange", () => {
  it("weekly runs Sunday → Saturday and steps by 7 days", () => {
    // The team's week, and the one every published figure is bucketed by.
    const r = periodRange("weekly", 0, NOW);          // NOW is Fri 18 Sep 2026
    expect(same(r.from, d(2026, 9, 13))).toBe(true);
    expect(same(r.to, d(2026, 9, 19))).toBe(true);
    const prev = periodRange("weekly", -1, NOW);
    expect(same(prev.from, d(2026, 9, 6))).toBe(true);
  });

  it("monthly is whole Sunday-Saturday weeks, and crosses year boundaries", () => {
    // A month runs from its first Sunday to the Saturday closing the week its
    // last Sunday opens, because that is how the team counts a week into a
    // month. September 2026 therefore opens on Sun 6 Sep and closes Sat 3 Oct.
    const r = periodRange("monthly", 0, NOW);
    expect(same(r.from, d(2026, 9, 6))).toBe(true);
    expect(same(r.to, d(2026, 10, 3))).toBe(true);
    const jan = periodRange("monthly", -8, NOW);
    expect(same(jan.from, d(2026, 1, 4))).toBe(true);
    expect(same(jan.to, d(2026, 1, 31))).toBe(true);
    const dec = periodRange("monthly", -9, NOW);
    expect(same(dec.from, d(2025, 12, 7))).toBe(true);
    expect(same(dec.to, d(2026, 1, 3))).toBe(true);
  });

  it("yearly is the rolling 12 months ending with the current month", () => {
    const r = periodRange("yearly", 0, NOW);
    expect(same(r.from, d(2025, 10, 5))).toBe(true);
    expect(same(r.to, d(2026, 10, 3))).toBe(true);
    const prev = periodRange("yearly", -1, NOW);
    expect(same(prev.from, d(2024, 10, 6))).toBe(true);
    expect(same(prev.to, d(2025, 10, 4))).toBe(true);
  });
});

describe("offsetOf", () => {
  it("inverts periodRange for every period", () => {
    for (const p of ["weekly", "monthly", "yearly"] as const) {
      for (const o of [0, -1, -5, -13]) {
        expect(offsetOf(p, periodRange(p, o, NOW).from, NOW)).toBe(o);
        expect(offsetOf(p, periodRange(p, o, NOW).to, NOW)).toBe(o);
      }
    }
  });
});

describe("periodLabels", () => {
  it("names the period in plain words", () => {
    expect(periodLabels("monthly", 0, NOW).rel).toBe("This month");
    expect(periodLabels("monthly", -1, NOW).label).toBe("August 2026");
    expect(periodLabels("weekly", -3, NOW).rel).toBe("3 weeks ago");
    expect(periodLabels("weekly", 0, NOW).label).toBe("13 Sep – 19 Sep 2026");
    expect(periodLabels("yearly", 0, NOW).label).toBe("Oct 2025 – Sep 2026");
  });
});

describe("trendWindow", () => {
  it("ends on the current bucket and marks the selection", () => {
    const w = trendWindow("monthly", -2, NOW);
    expect(w.buckets).toHaveLength(12);
    expect(same(w.buckets[11].from, d(2026, 9, 6))).toBe(true);
    expect(w.selected).toBe(9);
  });

  it("slides back when the selection is older than the window", () => {
    const w = trendWindow("weekly", -20, NOW);
    expect(w.selected).toBe(11);
    expect(same(w.buckets[11].from, periodRange("weekly", -20, NOW).from)).toBe(true);
  });

  it("yearly shows that year's own months and selects no single bucket", () => {
    const w = trendWindow("yearly", -1, NOW);
    expect(w.selected).toBeNull();
    expect(same(w.buckets[0].from, d(2024, 10, 6))).toBe(true);
    expect(same(w.buckets[11].from, d(2025, 9, 7))).toBe(true);
  });

  it("yearEarlier shifts months by 12 and weeks by 52", () => {
    const m = trendWindow("monthly", 0, NOW);
    expect(same(yearEarlier(m.buckets, "month")[11].from, d(2025, 9, 7))).toBe(true);
    const w = trendWindow("weekly", 0, NOW);
    expect(yearEarlier(w.buckets, "week")[11].from.getDay()).toBe(0);   // still a Sunday
  });
});

describe("countByBuckets", () => {
  it("counts distinct doctors per stage per bucket, relocated falling back to join", () => {
    const w = trendWindow("monthly", 0, NOW);
    const rows = [
      attempt({ doctor_id: "a", hospital_name: "H1", signed_at: "2026-09-08T10:00:00" }),
      attempt({ doctor_id: "a", hospital_name: "H2", signed_at: "2026-09-10T10:00:00" }),  // same doctor → 1
      attempt({ doctor_id: "b", signed_at: "2026-08-20T10:00:00", joined_at: "2026-09-10T10:00:00" }),
      attempt({ doctor_id: "c", shortlisted_at: "2025-06-01T10:00:00" }),                 // outside window
    ];
    const c = countByBuckets(rows, w.buckets);
    expect(c.signed[11]).toBe(1);
    expect(c.signed[10]).toBe(1);
    expect(c.relocated[11]).toBe(1);
    expect(c.shortlisted.reduce((a, b) => a + b, 0)).toBe(0);
    expect(countInRange(rows, periodRange("monthly", 0, NOW)).signed).toBe(1);
  });

  it("counts the first days of a month in the week that opened in the month before", () => {
    // September 2026 opens on Sunday 6 Sep, so 3 September sits in the week
    // that opened Sunday 30 August and belongs to August.
    const w = trendWindow("monthly", 0, NOW);
    const rows = [attempt({ doctor_id: "a", signed_at: "2026-09-03T10:00:00" })];
    const c = countByBuckets(rows, w.buckets);
    expect(c.signed[10]).toBe(1);   // August
    expect(c.signed[11]).toBe(0);   // September
  });

  it("earliestMilestone finds the oldest date on any stage", () => {
    const e = earliestMilestone([
      attempt({ signed_at: "2026-02-01T00:00:00" }),
      attempt({ shortlisted_at: "2025-11-15T09:00:00" }),
    ]);
    expect(e && same(e, d(2025, 11, 15))).toBe(true);
    expect(earliestMilestone([])).toBeNull();
  });
});

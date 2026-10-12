/**
 * Period math behind the Reports page's Weekly / Monthly / Yearly pill and the
 * back / forward arrows. Dates are built from local parts so the assertions
 * hold in any timezone.
 *
 * The calendar changes on 1 September 2026 (CALENDAR_FROM): before it a week
 * A week always runs Sunday–Saturday. What changes is the month: whole weeks
 * before, the calendar month after, with weeks cut at the month end. NOW sits
 * after the seam, so both regimes are in play here.
 */
import { describe, it, expect } from "vitest";
import {
  periodRange, periodLabels, offsetOf, trendWindow, yearEarlier, monthWindows,
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
  it("weekly runs Sunday → Saturday", () => {
    const r = periodRange("weekly", 0, NOW);          // NOW is Fri 18 Sep 2026
    expect(same(r.from, d(2026, 9, 13))).toBe(true);  // Sunday
    expect(same(r.to, d(2026, 9, 19))).toBe(true);    // Saturday
    const prev = periodRange("weekly", -1, NOW);
    expect(same(prev.from, d(2026, 9, 6))).toBe(true);
  });

  it("cuts a week where the month ends, from September 2026", () => {
    // October 2026 opens on a Thursday, so its first week is three days and
    // the one after it is whole again.
    const oct1 = offsetOf("weekly", d(2026, 10, 1), NOW);
    const first = periodRange("weekly", oct1, NOW);
    expect(same(first.from, d(2026, 10, 1))).toBe(true);   // Thursday
    expect(same(first.to, d(2026, 10, 3))).toBe(true);     // Saturday
    const second = periodRange("weekly", oct1 + 1, NOW);
    expect(same(second.from, d(2026, 10, 4))).toBe(true);  // Sunday
    expect(same(second.to, d(2026, 10, 10))).toBe(true);   // Saturday

    // September's weeks tile the month exactly, with no day in two of them.
    const weeks = [-2, -1, 0, 1, 2].map(o => periodRange("weekly", o, NOW));
    expect(same(weeks[0].from, d(2026, 9, 1))).toBe(true);   // Tue 1st, clipped
    expect(same(weeks[0].to, d(2026, 9, 5))).toBe(true);     // Saturday
    expect(same(weeks[4].from, d(2026, 9, 27))).toBe(true);
    expect(same(weeks[4].to, d(2026, 9, 30))).toBe(true);    // clipped at the month end
    for (let i = 1; i < weeks.length; i++) {
      const gap = (weeks[i].from.getTime() - weeks[i - 1].to.getTime()) / 86_400_000;
      expect(gap).toBe(1);
    }
  });

  it("lets a week cross the month end before the switch, except at the seam", () => {
    // The old rule: the week opening Sun 26 Jul closes Sat 1 Aug and counts
    // into August, which is how the team's published figures are built.
    const jul26 = offsetOf("weekly", d(2026, 7, 26), NOW);
    expect(same(periodRange("weekly", jul26, NOW).to, d(2026, 8, 1))).toBe(true);
    // The seam is the exception: 30 Aug would have closed on 5 September.
    const stub = periodRange("weekly", -3, NOW);
    expect(same(stub.from, d(2026, 8, 30))).toBe(true);
    expect(same(stub.to, d(2026, 8, 31))).toBe(true);
    const before = periodRange("weekly", -4, NOW);
    expect(same(before.from, d(2026, 8, 23))).toBe(true);
    expect(same(before.to, d(2026, 8, 29))).toBe(true);
  });

  it("monthly is the calendar month from September, whole weeks before it", () => {
    const sep = periodRange("monthly", 0, NOW);
    expect(same(sep.from, d(2026, 9, 1))).toBe(true);
    expect(same(sep.to, d(2026, 9, 30))).toBe(true);

    // August used to run to Saturday 5 September; it now stops at the 31st so
    // the first days of September are not counted in both months.
    const aug = periodRange("monthly", -1, NOW);
    expect(same(aug.from, d(2026, 8, 2))).toBe(true);     // still its first Sunday
    expect(same(aug.to, d(2026, 8, 31))).toBe(true);

    // Everything older keeps the published rule exactly.
    const jul = periodRange("monthly", -2, NOW);
    expect(same(jul.from, d(2026, 7, 5))).toBe(true);
    expect(same(jul.to, d(2026, 8, 1))).toBe(true);
    const jan = periodRange("monthly", -8, NOW);
    expect(same(jan.from, d(2026, 1, 4))).toBe(true);
    expect(same(jan.to, d(2026, 1, 31))).toBe(true);
    const dec = periodRange("monthly", -9, NOW);
    expect(same(dec.from, d(2025, 12, 7))).toBe(true);
    expect(same(dec.to, d(2026, 1, 3))).toBe(true);
  });

  it("yearly is the rolling 12 months ending with the current month", () => {
    const r = periodRange("yearly", 0, NOW);
    expect(same(r.from, d(2025, 10, 5))).toBe(true);      // legacy October opens on its first Sunday
    expect(same(r.to, d(2026, 9, 30))).toBe(true);        // and closes on the new September's last day
    const prev = periodRange("yearly", -1, NOW);
    expect(same(prev.from, d(2024, 10, 6))).toBe(true);
    expect(same(prev.to, d(2025, 10, 4))).toBe(true);
  });

  it("leaves a month's last days as a short week of their own", () => {
    // November 2026 ends on a Monday, so its last week is Sun 29 - Mon 30.
    const o = offsetOf("weekly", d(2026, 11, 30), NOW);
    const r = periodRange("weekly", o, NOW);
    expect(same(r.from, d(2026, 11, 29))).toBe(true);
    expect(same(r.to, d(2026, 11, 30))).toBe(true);
  });

  it("names a one-day week by that day alone", () => {
    // 31 Jan 2027 is a Sunday: it opens a week the month end cuts at once.
    // Read from a "now" inside 2027, since the calendar runs to the end of the
    // current year.
    const now = new Date(2027, 0, 15);
    const o = offsetOf("weekly", d(2027, 1, 31), now);
    const r = periodRange("weekly", o, now);
    expect(same(r.from, d(2027, 1, 31))).toBe(true);
    expect(same(r.to, d(2027, 1, 31))).toBe(true);
    expect(periodLabels("weekly", o, now).label).toBe("31 Jan 2027");
  });
});

describe("offsetOf", () => {
  it("inverts periodRange for every period, across the switch", () => {
    // Yearly only has as many windows as the calendar holds (six), so it is
    // round-tripped over the offsets that exist.
    const cases = { weekly: [0, -1, -5, -13], monthly: [0, -1, -5, -13], yearly: [0, -1, -5] } as const;
    for (const p of ["weekly", "monthly", "yearly"] as const) {
      for (const o of cases[p]) {
        expect(offsetOf(p, periodRange(p, o, NOW).from, NOW)).toBe(o);
        expect(offsetOf(p, periodRange(p, o, NOW).to, NOW)).toBe(o);
      }
    }
  });

  it("stops at the oldest period it has rather than inventing one", () => {
    // The arrows and the picker clamp to minOffset, which is itself read back
    // through offsetOf, so stepping past the start of the calendar stays put.
    const oldest = periodRange("yearly", -5, NOW);
    expect(periodRange("yearly", -99, NOW)).toEqual(oldest);
    expect(offsetOf("yearly", new Date(1990, 0, 1), NOW)).toBe(-5);
  });

  it("reads the month a day belongs to under the rule of its own era", () => {
    // 3 Sep 2026 is now September's; under the old rule it was August's.
    expect(offsetOf("monthly", d(2026, 9, 3), NOW)).toBe(0);
    // 1 Aug 2026 is a Saturday closing a week that opened in July, so it is
    // still July's.
    expect(offsetOf("monthly", d(2026, 8, 1), NOW)).toBe(-2);
  });
});

describe("monthWindows", () => {
  it("names every month by the month it reports on", () => {
    const months = monthWindows(NOW);
    const sep = months.find(m => m.year === 2026 && m.month === 8)!;
    expect(sep.legacy).toBe(false);
    expect(same(sep.from, d(2026, 9, 1))).toBe(true);
    const aug = months.find(m => m.year === 2026 && m.month === 7)!;
    expect(aug.legacy).toBe(true);
    expect(same(aug.to, d(2026, 8, 31))).toBe(true);
  });
});

describe("periodLabels", () => {
  it("names the period in plain words", () => {
    expect(periodLabels("monthly", 0, NOW).rel).toBe("This month");
    expect(periodLabels("monthly", 0, NOW).label).toBe("September 2026");
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
    expect(same(w.buckets[11].from, d(2026, 9, 1))).toBe(true);
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

  it("yearEarlier finds the matching window a year back", () => {
    const m = trendWindow("monthly", 0, NOW);
    expect(same(yearEarlier(m.buckets, "month", NOW)[11].from, d(2025, 9, 7))).toBe(true);
    // Weeks are no longer a fixed shift apart, so it lands on the week holding
    // the same day a year earlier — 364 days before Mon 14 Sep 2026.
    const w = trendWindow("weekly", 0, NOW);
    const back = yearEarlier(w.buckets, "week", NOW)[11];
    expect(back.from.getTime()).toBeLessThanOrEqual(d(2025, 9, 15).getTime());
    expect(back.to.getTime()).toBeGreaterThanOrEqual(d(2025, 9, 15).getTime());
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

  it("counts the first days of September in September, not in August", () => {
    // Under the old rule September opened on Sunday 6 Sep, so 3 September sat
    // in the week that opened 30 August and counted in August. The client
    // asked for the date to decide the month instead.
    const w = trendWindow("monthly", 0, NOW);
    const rows = [attempt({ doctor_id: "a", signed_at: "2026-09-03T10:00:00" })];
    const c = countByBuckets(rows, w.buckets);
    expect(c.signed[10]).toBe(0);   // August
    expect(c.signed[11]).toBe(1);   // September
  });

  it("weekly counts add up to the monthly count", () => {
    const rows = [
      attempt({ doctor_id: "a", signed_at: "2026-09-01T10:00:00" }),   // the clipped first week
      attempt({ doctor_id: "b", signed_at: "2026-09-17T10:00:00" }),
      attempt({ doctor_id: "c", signed_at: "2026-09-30T10:00:00" }),   // the clipped last week
      attempt({ doctor_id: "x", signed_at: "2026-08-31T10:00:00" }),   // August, must not leak in
    ];
    const weeks = [-2, -1, 0, 1, 2].map(o => periodRange("weekly", o, NOW));
    const weekly = weeks.reduce((n, r) => n + countInRange(rows, r, ["signed"]).signed, 0);
    expect(weekly).toBe(countInRange(rows, periodRange("monthly", 0, NOW), ["signed"]).signed);
    expect(weekly).toBe(3);
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

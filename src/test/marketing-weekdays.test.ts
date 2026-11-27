import { describe, it, expect } from "vitest";
import { buildWeekdayStats, bestWeekday, buildCalendarWeeks, type TrendLead, type TrendConversion } from "@/lib/marketing-weekdays";

// Timestamps without an offset parse as local time, so these assertions hold
// whatever timezone the test runner is in. 2026-11-02 is a Monday.
const lead = (t: string, status = "Not Contacted", channel = "Meta"): TrendLead =>
  ({ Created_Time: t, Lead_Status: status, channel });
const conv = (t: string, channel = "Meta"): TrendConversion => ({ Created_Time: t, channel });
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const NOW = new Date(2026, 11, 31, 12);   // after all the data

describe("buildWeekdayStats", () => {
  it("counts leads, qualified and conversions by weekday, Monday first", () => {
    const rows = buildWeekdayStats({
      leads: [
        lead("2026-11-02T09:00:00", "Initial Sales Call Completed"),   // Mon
        lead("2026-11-09T23:30:00"),                                   // Mon
        lead("2026-11-03T10:00:00", "High Priority Follow up"),        // Tue
        lead("2026-11-08T10:00:00"),                                   // Sun
      ],
      conversions: [conv("2026-11-04T12:00:00")],                      // Wed
      from: d(2026, 11, 2), to: d(2026, 11, 15), now: NOW,
    });
    expect(rows.map(r => r.day)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(rows[0]).toMatchObject({ leads: 2, qualified: 1, converted: 0, occurrences: 2, avgLeads: 1 });
    expect(rows[1]).toMatchObject({ leads: 1, qualified: 1 });
    expect(rows[2]).toMatchObject({ converted: 1, avgConverted: 0.5 });
    expect(rows[6]).toMatchObject({ leads: 1 });
  });

  it("does not count Contact in Future as qualified", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-03T10:00:00", "Contact in Future")],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW,
    });
    expect(rows[1].qualified).toBe(0);
  });

  it("averages per occurrence so a weekday that appears more often gets no head start", () => {
    // Mon 2 Nov → Tue 10 Nov: two Mondays and two Tuesdays, one of everything else.
    const rows = buildWeekdayStats({
      leads: [
        lead("2026-11-02T10:00:00"), lead("2026-11-09T10:00:00"),   // 2 Monday leads over 2 Mondays
        lead("2026-11-05T10:00:00"), lead("2026-11-05T11:00:00"),   // 2 Thursday leads over 1 Thursday
      ],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 10), now: NOW,
    });
    expect(rows[0]).toMatchObject({ leads: 2, occurrences: 2, avgLeads: 1 });
    expect(rows[3]).toMatchObject({ leads: 2, occurrences: 1, avgLeads: 2 });
    expect(bestWeekday(rows, "avgLeads")?.day).toBe("Thursday");
  });

  it("starts counting days at the first event, so All time doesn't divide by every day since 2000", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-02T10:00:00")],
      conversions: [], from: d(2000, 1, 1), to: d(2026, 11, 8), now: NOW,
    });
    expect(rows.every(r => r.occurrences === 1)).toBe(true);
    expect(rows[0].avgLeads).toBe(1);
  });

  it("stops counting days at today when the range runs into the future", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-02T10:00:00")],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 30),
      now: new Date(2026, 10, 4, 12),   // Wednesday 4 Nov
    });
    expect(rows.map(r => r.occurrences)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  it("keeps the inclusive end day and drops anything outside the range", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-01T23:59:00"), lead("2026-11-08T23:59:00"), lead("2026-11-09T00:00:00")],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW,
    });
    expect(rows.reduce((s, r) => s + r.leads, 0)).toBe(1);
    expect(rows[6].leads).toBe(1);
  });

  it("filters to one channel when asked", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-03T10:00:00", "Not Contacted", "Meta"), lead("2026-11-03T11:00:00", "Not Contacted", "Google Ads")],
      conversions: [conv("2026-11-04T10:00:00", "Google Ads")],
      from: d(2026, 11, 2), to: d(2026, 11, 8), channel: "Meta", now: NOW,
    });
    expect(rows[1].leads).toBe(1);
    expect(rows[2].converted).toBe(0);
  });

  it("ignores rows with missing or invalid timestamps, and returns nothing for an empty range", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-03T10:00:00"), { Created_Time: null, Lead_Status: null, channel: "Meta" }, lead("not a date")],
      conversions: [{ Created_Time: null, channel: "Meta" }],
      from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW,
    });
    expect(rows.reduce((s, r) => s + r.leads + r.converted, 0)).toBe(1);
    expect(buildWeekdayStats({ leads: [], conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW })).toEqual([]);
  });
});

describe("bestWeekday", () => {
  it("returns null when the metric is zero everywhere", () => {
    const rows = buildWeekdayStats({
      leads: [lead("2026-11-03T10:00:00")], conversions: [],
      from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW,
    });
    expect(bestWeekday(rows, "avgLeads")?.day).toBe("Tuesday");
    expect(bestWeekday(rows, "avgConverted")).toBeNull();
  });
});

describe("buildCalendarWeeks", () => {
  const leads = [
    lead("2026-11-04T10:00:00", "Initial Sales Call Completed"),   // Wed, week of 2 Nov
    lead("2026-11-04T15:00:00"),
    lead("2026-11-08T10:00:00"),                                   // Sun, week of 2 Nov
    lead("2026-11-16T10:00:00"),                                   // Mon, week of 16 Nov (9 Nov week is empty)
  ];
  const conversions = [conv("2026-11-05T10:00:00")];                // Thu, week of 2 Nov

  it("lays days out Monday to Sunday with dates and counts, newest week first", () => {
    const weeks = buildCalendarWeeks({ leads, conversions, from: d(2026, 11, 1), to: d(2026, 11, 22), now: NOW });
    expect(weeks.map(w => w.start.getDate())).toEqual([16, 9, 2]);
    const first = weeks[2];
    expect(first.days.map(x => x.date.getDate())).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(first.days[2]).toMatchObject({ leads: 2, qualified: 1, converted: 0 });
    expect(first.days[3]).toMatchObject({ converted: 1 });
    expect(first).toMatchObject({ leads: 3, qualified: 1, converted: 1 });
  });

  it("keeps an empty week in the grid with zeros", () => {
    const weeks = buildCalendarWeeks({ leads, conversions, from: d(2026, 11, 1), to: d(2026, 11, 22), now: NOW });
    expect(weeks[1]).toMatchObject({ leads: 0, qualified: 0, converted: 0, partial: false });
  });

  it("blanks days before the first lead and after the range, and marks those weeks partial", () => {
    const weeks = buildCalendarWeeks({ leads, conversions, from: d(2026, 11, 1), to: d(2026, 11, 18), now: NOW });
    const first = weeks[weeks.length - 1], last = weeks[0];
    expect(first.days.map(x => x.inRange)).toEqual([false, false, true, true, true, true, true]);   // counting starts Wed 4 Nov
    expect(last.days.map(x => x.inRange)).toEqual([true, true, true, false, false, false, false]);  // range ends Wed 18 Nov
    expect(first.partial && last.partial).toBe(true);
  });

  it("agrees with the weekday averages", () => {
    const input = { leads, conversions, from: d(2026, 11, 1), to: d(2026, 11, 22), now: NOW };
    const weeks = buildCalendarWeeks(input);
    const stats = buildWeekdayStats(input);
    for (let i = 0; i < 7; i++) {
      const days = weeks.map(w => w.days[i]).filter(x => x.inRange);
      expect(days.length).toBe(stats[i].occurrences);
      expect(days.reduce((s, x) => s + x.leads, 0)).toBe(stats[i].leads);
    }
  });

  it("returns nothing for an empty range", () => {
    expect(buildCalendarWeeks({ leads: [], conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), now: NOW })).toEqual([]);
  });
});

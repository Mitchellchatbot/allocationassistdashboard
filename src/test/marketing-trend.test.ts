import { describe, it, expect } from "vitest";
import { buildMarketingTrend, summarizeTrend, type TrendLead, type TrendConversion } from "@/lib/marketing-trend";

// Timestamps without an offset parse as local time, so these assertions hold
// whatever timezone the test runner is in. 2026-11-02 is a Monday.
const lead = (t: string, status = "Not Contacted", channel = "Meta"): TrendLead =>
  ({ Created_Time: t, Lead_Status: status, channel });
const conv = (t: string, channel = "Meta"): TrendConversion => ({ Created_Time: t, channel });
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const NOW = new Date(2026, 11, 31, 12);   // well after the data, so nothing is "in progress"

describe("buildMarketingTrend", () => {
  it("buckets by Monday-start week and counts leads, qualified and conversions", () => {
    const rows = buildMarketingTrend({
      leads: [
        lead("2026-11-02T09:00:00", "Initial Sales Call Completed"),
        lead("2026-11-08T23:30:00"),                               // Sunday — same week
        lead("2026-11-09T00:10:00", "High Priority Follow up"),    // Monday — next week
      ],
      conversions: [conv("2026-11-04T12:00:00")],
      from: d(2026, 11, 2), to: d(2026, 11, 15), granularity: "week", now: NOW,
    });
    expect(rows.map(r => r.key)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(rows[0]).toMatchObject({ leads: 2, qualified: 1, converted: 1, leadsDelta: null, partial: false });
    expect(rows[1]).toMatchObject({ leads: 1, qualified: 1, converted: 0, leadsDelta: -1 });
  });

  it("does not count Contact in Future as qualified", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-03T10:00:00", "Contact in Future")],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), granularity: "week", now: NOW,
    });
    expect(rows[0].qualified).toBe(0);
  });

  it("fills empty weeks between data points with zeros", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-02T10:00:00"), lead("2026-11-23T10:00:00")],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 29), granularity: "week", now: NOW,
    });
    expect(rows.map(r => [r.key, r.leads])).toEqual([
      ["2026-11-02", 1], ["2026-11-09", 0], ["2026-11-16", 0], ["2026-11-23", 1],
    ]);
  });

  it("starts at the first event, not the range start, so All time doesn't begin in 2000", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-03T10:00:00")],
      conversions: [], from: d(2000, 1, 1), to: d(2026, 11, 8), granularity: "week", now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("2026-11-02");
  });

  it("keeps the inclusive end day and drops anything outside the range", () => {
    const rows = buildMarketingTrend({
      leads: [
        lead("2026-11-01T23:59:00"),   // day before range
        lead("2026-11-08T23:59:00"),   // last minute of the inclusive end day
        lead("2026-11-09T00:00:00"),   // day after range
      ],
      conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), granularity: "week", now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].leads).toBe(1);
  });

  it("flags weeks cut by the range edges as partial", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-05T10:00:00"), lead("2026-11-10T10:00:00"), lead("2026-11-17T10:00:00")],
      conversions: [], from: d(2026, 11, 4), to: d(2026, 11, 18), granularity: "week", now: NOW,
    });
    expect(rows.map(r => r.partial)).toEqual([true, false, true]);
  });

  it("flags the in-progress week as partial and recent weeks as maturing", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-10-05T10:00:00"), lead("2026-11-24T10:00:00")],
      conversions: [], from: d(2026, 10, 5), to: d(2026, 11, 27), granularity: "week",
      now: new Date(2026, 10, 27, 12),   // Friday 27 Nov
    });
    const first = rows[0], last = rows[rows.length - 1];
    expect(last.key).toBe("2026-11-23");
    expect(last.partial).toBe(true);
    expect(last.maturing).toBe(true);
    expect(first.maturing).toBe(false);
  });

  it("filters to one channel when asked", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-03T10:00:00", "Not Contacted", "Meta"), lead("2026-11-03T11:00:00", "Not Contacted", "Google Ads")],
      conversions: [conv("2026-11-04T10:00:00", "Google Ads")],
      from: d(2026, 11, 2), to: d(2026, 11, 8), granularity: "week", channel: "Meta", now: NOW,
    });
    expect(rows[0]).toMatchObject({ leads: 1, converted: 0 });
  });

  it("buckets by day and by month", () => {
    const leads = [lead("2026-10-31T10:00:00"), lead("2026-11-01T10:00:00"), lead("2026-11-01T18:00:00")];
    const base = { leads, conversions: [], from: d(2026, 10, 31), to: d(2026, 11, 1), now: NOW };
    expect(buildMarketingTrend({ ...base, granularity: "day" }).map(r => [r.key, r.leads]))
      .toEqual([["2026-10-31", 1], ["2026-11-01", 2]]);
    expect(buildMarketingTrend({ ...base, granularity: "month" }).map(r => [r.key, r.leads]))
      .toEqual([["2026-10", 1], ["2026-11", 2]]);
  });

  it("ignores rows with missing or invalid timestamps", () => {
    const rows = buildMarketingTrend({
      leads: [lead("2026-11-03T10:00:00"), { Created_Time: null, Lead_Status: null, channel: "Meta" }, lead("not a date")],
      conversions: [{ Created_Time: null, channel: "Meta" }],
      from: d(2026, 11, 2), to: d(2026, 11, 8), granularity: "week", now: NOW,
    });
    expect(rows[0]).toMatchObject({ leads: 1, converted: 0 });
  });

  it("returns nothing when the range has no events", () => {
    expect(buildMarketingTrend({ leads: [], conversions: [], from: d(2026, 11, 2), to: d(2026, 11, 8), granularity: "week", now: NOW })).toEqual([]);
  });
});

describe("summarizeTrend", () => {
  it("averages and picks the best over complete weeks only", () => {
    const rows = buildMarketingTrend({
      leads: [
        ...Array.from({ length: 9 }, () => lead("2026-11-05T10:00:00")),   // partial first week — biggest, but excluded
        ...Array.from({ length: 4 }, () => lead("2026-11-10T10:00:00")),
        ...Array.from({ length: 6 }, () => lead("2026-11-17T10:00:00", "High Priority Follow up")),
      ],
      conversions: [conv("2026-11-18T10:00:00")],
      from: d(2026, 11, 4), to: d(2026, 11, 22), granularity: "week", now: NOW,
    });
    const s = summarizeTrend(rows);
    expect(s).toMatchObject({ totalLeads: 19, totalQualified: 6, totalConverted: 1, avgLeads: 5 });
    expect(s.best?.key).toBe("2026-11-16");
  });
});

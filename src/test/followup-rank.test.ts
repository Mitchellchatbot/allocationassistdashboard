import { describe, it, expect } from "vitest";
import { scoreFollowUp, FOLLOWUP_SLA_DAYS } from "@/lib/followup-rank";

const base = {
  daysSinceTouched: 5,
  leadAgeDays: 120,
  specialty: "Cardiology",
  source: "Website",
  slaDays: FOLLOWUP_SLA_DAYS.high,
  demandCounts: new Map<string, number>(),
};

describe("scoreFollowUp", () => {
  it("boosts a lead whose specialty matches an open vacancy", () => {
    const noDemand   = scoreFollowUp({ ...base });
    const withDemand = scoreFollowUp({ ...base, demandCounts: new Map([["Cardiology", 1]]) });
    expect(withDemand.score).toBeGreaterThan(noDemand.score);
    expect(withDemand.headline.toLowerCase()).toContain("vacancy");
    expect(withDemand.factors.some(f => f.label.startsWith("Open vacanc"))).toBe(true);
  });

  it("ranks a higher-demand specialty above a one-slot one (same recency)", () => {
    const oneSlot   = scoreFollowUp({ ...base, daysSinceTouched: 60, demandCounts: new Map([["Cardiology", 1]]) });
    const fiveSlots = scoreFollowUp({ ...base, daysSinceTouched: 60, demandCounts: new Map([["Cardiology", 5]]) });
    expect(fiveSlots.score).toBeGreaterThan(oneSlot.score);
  });

  it("separates very-overdue leads instead of pinning them to one score", () => {
    const a = scoreFollowUp({ ...base, daysSinceTouched: 100, demandCounts: new Map([["Cardiology", 2]]) });
    const b = scoreFollowUp({ ...base, daysSinceTouched: 177, demandCounts: new Map([["Cardiology", 2]]) });
    expect(b.score).not.toEqual(a.score);
  });

  it("ranks a more-overdue callback higher (up to the cap)", () => {
    const fresh = scoreFollowUp({ ...base, daysSinceTouched: 3 });
    const stale = scoreFollowUp({ ...base, daysSinceTouched: 25 });
    expect(stale.score).toBeGreaterThan(fresh.score);
  });

  it("gives a fresh new lead a freshness boost over an old one", () => {
    const old = scoreFollowUp({ ...base, leadAgeDays: 200 });
    const neu = scoreFollowUp({ ...base, leadAgeDays: 2 });
    expect(neu.score).toBeGreaterThan(old.score);
  });

  it("tiers high when very overdue AND high demand", () => {
    const r = scoreFollowUp({ ...base, daysSinceTouched: 177, demandCounts: new Map([["Cardiology", 3]]) });
    expect(r.tier).toBe("high");
  });

  it("handles null recency / specialty without throwing", () => {
    const r = scoreFollowUp({ ...base, daysSinceTouched: null, leadAgeDays: null, specialty: null, source: null });
    expect(typeof r.score).toBe("number");
    expect(["high", "medium", "normal"]).toContain(r.tier);
  });
});

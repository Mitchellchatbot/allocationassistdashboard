import { describe, it, expect } from "vitest";
import { scoreFollowUp } from "@/lib/followup-rank";

const base = {
  daysSinceTouched: 60,                       // 2 months = peak timing
  specialty: "Cardiology",
  demandCounts: new Map<string, number>(),
  licenseCount: 0,
  contactStatus: "reached" as const,          // isolate time/vacancy/license (no contact boost)
};

describe("scoreFollowUp", () => {
  it("peaks the time score at ~2 months and decays after", () => {
    const at0   = scoreFollowUp({ ...base, daysSinceTouched: 0 });
    const at60  = scoreFollowUp({ ...base, daysSinceTouched: 60 });
    const at90  = scoreFollowUp({ ...base, daysSinceTouched: 90 });
    const at150 = scoreFollowUp({ ...base, daysSinceTouched: 150 });
    expect(at60.score).toBeGreaterThan(at0.score);    // peak > sooner
    expect(at60.score).toBeGreaterThan(at90.score);   // peak > later
    expect(at90.score).toBeGreaterThan(at150.score);  // decays after the peak
  });

  it("boosts a lead whose specialty matches an open vacancy (graded by count)", () => {
    const none      = scoreFollowUp({ ...base });
    const oneSlot   = scoreFollowUp({ ...base, demandCounts: new Map([["Cardiology", 1]]) });
    const fiveSlots = scoreFollowUp({ ...base, demandCounts: new Map([["Cardiology", 5]]) });
    expect(oneSlot.score).toBeGreaterThan(none.score);
    expect(fiveSlots.score).toBeGreaterThan(oneSlot.score);
    expect(oneSlot.headline.toLowerCase()).toContain("vacanc");
  });

  it("boosts a doctor who already holds Gulf licenses (separate from time/vacancy)", () => {
    const noLic = scoreFollowUp({ ...base, licenseCount: 0 });
    const lic   = scoreFollowUp({ ...base, licenseCount: 2 });
    expect(lic.score).toBeGreaterThan(noLic.score);
    expect(lic.factors.some(f => f.label.toLowerCase().includes("licensed"))).toBe(true);
  });

  it("time, vacancy and license are independent contributions", () => {
    const t = scoreFollowUp({ ...base, daysSinceTouched: 60 }).score;                                  // timing only
    const tv = scoreFollowUp({ ...base, daysSinceTouched: 60, demandCounts: new Map([["Cardiology", 2]]) }).score;
    const tvl = scoreFollowUp({ ...base, daysSinceTouched: 60, demandCounts: new Map([["Cardiology", 2]]), licenseCount: 2 }).score;
    expect(tv).toBeGreaterThan(t);
    expect(tvl).toBeGreaterThan(tv);
  });

  it("tiers high at peak timing + demand + license", () => {
    const r = scoreFollowUp({ ...base, daysSinceTouched: 60, demandCounts: new Map([["Cardiology", 3]]), licenseCount: 2 });
    expect(r.tier).toBe("high");
  });

  it("handles null recency / specialty without throwing", () => {
    const r = scoreFollowUp({ ...base, daysSinceTouched: null, specialty: null });
    expect(typeof r.score).toBe("number");
    expect(["high", "medium", "normal"]).toContain(r.tier);
  });

  it("floats un-worked leads to the top; a fresh attempt counts as handled", () => {
    const reached   = scoreFollowUp({ ...base, contactStatus: "reached" });
    const never     = scoreFollowUp({ ...base, contactStatus: "none" });
    const staleTry  = scoreFollowUp({ ...base, contactStatus: "attempted", noteAgeDays: 45 });
    const freshTry  = scoreFollowUp({ ...base, contactStatus: "attempted", noteAgeDays: 10 });
    expect(never.score).toBeGreaterThan(reached.score);      // never contacted > reached
    expect(staleTry.score).toBeGreaterThan(reached.score);   // stale attempt needs retry
    expect(freshTry.score).toBe(reached.score);              // attempt in last 4 weeks = handled
    expect(never.headline.toLowerCase()).toContain("never");
  });
});

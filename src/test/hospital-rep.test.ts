import { describe, it, expect } from "vitest";
import { buildRepLookup, buildHospitalMatcher } from "@/lib/hospital-rep";
import { HI_TEAM_MEMBERS } from "@/lib/hi-team";

const [a, b] = HI_TEAM_MEMBERS;

const hospitals = [
  { name: "NMC Sharjah", owner_email: a.email },
  { name: "NMC Sharjah (Pauline)", owner_email: a.email },
  { name: "Burjeel Hospital - Dubai", owner_email: a.email },
  { name: "Mediclinic Al Ain", owner_email: a.email },
  { name: "Mediclinic Dubai Mall", owner_email: b.email },
  { name: "STMC", owner_email: b.email },
  { name: "NMC Hospital Dubai", owner_email: b.email },
  { name: "Unowned Clinic", owner_email: null },
];

describe("buildRepLookup", () => {
  const repFor = buildRepLookup(hospitals);

  it("credits a parenthesised sheet name to the branch owner", () => {
    expect(repFor("NMC (Sharjah)")?.email).toBe(a.email);
  });

  it("ignores the word Hospital when matching", () => {
    expect(repFor("Burjeel (Dubai)")?.email).toBe(a.email);
  });

  it("matches an exact abbreviation", () => {
    expect(repFor("STMC")?.email).toBe(b.email);
  });

  it("prefers a word-for-word match over a longer name that contains it", () => {
    expect(repFor("NMC Sharjah")?.email).toBe(a.email);
    expect(repFor("Mediclinic Dubai Mall")?.email).toBe(b.email);
  });

  it("credits nobody when candidate branches disagree", () => {
    expect(repFor("Mediclinic")).toBeNull();
  });

  it("does not spill one city's branch onto another", () => {
    expect(repFor("NMC Dubai")?.email).toBe(b.email);
  });

  it("returns null for hospitals with no owner and for blanks", () => {
    expect(repFor("Unowned Clinic")).toBeNull();
    expect(repFor("")).toBeNull();
    expect(repFor(null)).toBeNull();
  });
});

describe("buildHospitalMatcher", () => {
  const match = buildHospitalMatcher(hospitals);

  it("reports the canonical record a sheet spelling resolved to", () => {
    // Reports groups a member's activity under their allocated hospitals, so
    // the loose spelling has to collapse onto the record's own name.
    expect(match("NMC (Sharjah)")).toEqual({ rep: a, hospital: "NMC Sharjah" });
    expect(match("Burjeel (Dubai)")?.hospital).toBe("Burjeel Hospital - Dubai");
  });

  it("credits the rep but no single branch when several of their records match", () => {
    // Both "NMC Sharjah" and "NMC Sharjah (Pauline)" are contained in this
    // spelling and both belong to a — the person is unambiguous, the branch
    // isn't, so the row falls back to the sheet's own label.
    const hit = match("NMC Sharjah (Pauline) branch");
    expect(hit?.rep.email).toBe(a.email);
    expect(hit?.hospital).toBeNull();
  });

  it("returns null when the branches disagree on the rep", () => {
    expect(match("Mediclinic")).toBeNull();
  });
});

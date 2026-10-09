import { describe, it, expect } from "vitest";
import { reportSide, reportSideFromState } from "@/lib/hospital-region";
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

describe("reportSideFromState", () => {
  it("reads the country off the sheet's State column", () => {
    for (const s of ["Dubai, UAE", "Abu Dhabi, UAE", "Fujairah, UAE", "Ras Al Kaimah, UAE", "Sharjah, UAE"]) {
      expect([s, reportSideFromState(s)]).toEqual([s, "UAE"]);
    }
    for (const s of ["KSA", "Qatar", "Riyadh, KSA", "Jeddah, Saudi Arabia", "Doha, Qatar"]) {
      expect([s, reportSideFromState(s)]).toEqual([s, "KSA/Qatar"]);
    }
  });

  it("gives nothing to fall back on when the cell is blank or unknown", () => {
    // October's column is still being filled in, so blanks are expected and
    // the caller drops back to reading the hospital name.
    for (const s of [null, undefined, "", "   ", "Oman", "tbc"]) {
      expect(reportSideFromState(s)).toBeNull();
    }
  });
});

describe("reportSide", () => {
  it("puts the UAE accounts on the UAE side", () => {
    for (const h of ["AHD", "AH", "Mediclinic", "NMC - AUH", "NMC Sharjah", "Burjeel -DXB", "STMC",
                     "SKMC", "Garhoud", "Prime", "RAK", "FUH", "SSMC", "Ain Al Khaleej", "Medcare",
                     "Al Dhafra"]) {
      expect([h, reportSide(h)]).toEqual([h, "UAE"]);
    }
  });

  it("reports Saudi and Qatar together, as the team does", () => {
    for (const h of ["HMG", "HMG Riyadh", "HMG Al Qassim", "MNGHA Jeddah", "KFSH", "Alrajhi",
                     "Dallah", "KKSEH", "Aramco", "Saudi German Jeddah",
                     "Sidra", "Aman", "The View", "Al Ahli Qatar", "MMCH", "Hamad"]) {
      expect([h, reportSide(h)]).toEqual([h, "KSA/Qatar"]);
    }
  });

  it("keeps a Dubai branch of a Saudi chain on the UAE side", () => {
    // "HMG- Dubai" is a UAE account even though HMG is a Saudi chain.
    expect(reportSide("HMG- Dubai")).toBe("UAE");
    expect(reportSide("HMG Dubai")).toBe("UAE");
  });

  it("gives no side to a name it cannot place, rather than guessing one", () => {
    expect(reportSide("Trellis Hospital")).toBeNull();
    expect(reportSide("")).toBeNull();
  });
});

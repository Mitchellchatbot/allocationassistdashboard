import { describe, it, expect } from "vitest";
import { buildHospitalResolver, hospitalKey, type HospitalAlias } from "@/lib/hospital-alias";

const alias = (a: string, name: string, id: string | null = null): HospitalAlias =>
  ({ alias: a, alias_key: hospitalKey(a), hospital_name: name, hospital_id: id });

const resolve = buildHospitalResolver([
  alias("NMC-AUH", "NMC Abu Dhabi", "h-nmc"),
  alias("NMC-AD", "NMC Abu Dhabi", "h-nmc"),
  alias("HMG (olaya)", "HMG Olaya"),
  alias("HMG Rayan", "HMG Rayan"),
]);

describe("hospitalKey", () => {
  it("ignores spacing, hyphens, brackets and case — like the table's alias_key", () => {
    expect(hospitalKey("NMC -AUH")).toBe("nmcauh");
    expect(hospitalKey("nmc  - auh")).toBe("nmcauh");
    expect(hospitalKey("HMG (olaya)")).toBe(hospitalKey("HMG Olaya"));
  });
});

describe("buildHospitalResolver", () => {
  it("maps any spacing of a known spelling to the agreed name and record", () => {
    expect(resolve("NMC - AUH")).toEqual({ typed: "NMC - AUH", hospital_name: "NMC Abu Dhabi", hospital_id: "h-nmc", known: true });
    expect(resolve("NMC- AD").hospital_name).toBe("NMC Abu Dhabi");
  });

  it("keeps separate branches separate", () => {
    expect(resolve("HMG Olaya").hospital_name).toBe("HMG Olaya");
    expect(resolve("HMG (rayan)").hospital_name).toBe("HMG Rayan");
  });

  it("reports an unknown spelling instead of guessing", () => {
    expect(resolve("  NMC-Qusais ")).toEqual({ typed: "NMC-Qusais", hospital_name: "NMC-Qusais", hospital_id: null, known: false });
  });
});

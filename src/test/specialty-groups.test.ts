import { describe, it, expect } from "vitest";
import {
  groupSpecialty,
  rollupSpecialty,
  asSubspecialty,
  textMentionsSpecialty,
} from "@/lib/specialty-groups";

/**
 * Guards the canonical-specialty matching that vacancy + batch matching
 * relies on. The keyword stems ("cardiolog", "electrophysiolog") must
 * PREFIX-match every inflection — a trailing word-boundary regression
 * once silently broke this for every single-word specialty (groupSpecialty
 * returned null for "Cardiology"), so these assertions are the canary.
 */
describe("specialty grouping — stem matching", () => {
  it("buckets single-word + inflected specialties (the regression case)", () => {
    expect(groupSpecialty("Cardiology")).toBe("Cardiology");
    expect(groupSpecialty("Cardiologist")).toBe("Cardiology");
    expect(groupSpecialty("Neurology")).toBe("Neurology");
    expect(groupSpecialty("Ophthalmology")).toBe("Ophthalmology");
    expect(groupSpecialty("Anesthesiology")).toBe("Anesthesiology");
  });

  it("prefers the most specific entry (sub-specialty over parent)", () => {
    expect(groupSpecialty("Pediatric Cardiology")).toBe("Pediatric Cardiology");
    expect(groupSpecialty("Interventional Cardiologist")).toBe("Interventional Cardiologist");
    // fuzzy free-text still rolls up to the right bucket
    expect(groupSpecialty("Retinal Specialist")).toBe("Ophthalmology");
  });

  it("rolls sub-specialties up to their parent", () => {
    expect(rollupSpecialty("Electrophysiology")).toBe("Cardiology");
    expect(rollupSpecialty("Pediatric Cardiology")).toBe("Cardiology");
    expect(rollupSpecialty("Cardiology")).toBe("Cardiology");
  });
});

describe("asSubspecialty", () => {
  it("flags sub-specialties with their parent", () => {
    expect(asSubspecialty("Electrophysiology")).toEqual({ name: "Electrophysiology", parent: "Cardiology" });
  });
  it("returns null for top-level specialties + unmatched text", () => {
    expect(asSubspecialty("Cardiology")).toBeNull();
    expect(asSubspecialty("Not A Real Specialty 123")).toBeNull();
  });
});

describe("textMentionsSpecialty — profile scan (Ammar's electrophysiology case)", () => {
  it("detects a sub-specialty named anywhere in a profile blob", () => {
    expect(textMentionsSpecialty("does cardiac electrophysiology and ablation", "Electrophysiology")).toBe(true);
    expect(textMentionsSpecialty("electrophysiologist, arrhythmia management", "Electrophysiology")).toBe(true);
  });
  it("does not false-positive on a generic cardiologist", () => {
    expect(textMentionsSpecialty("general cardiology, echocardiography", "Electrophysiology")).toBe(false);
    expect(textMentionsSpecialty("", "Electrophysiology")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  groupSpecialty,
  rollupSpecialty,
  asSubspecialty,
  textMentionsSpecialty,
  listCanonicalSpecialties,
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

/**
 * The single invariant that catches the whole "an entry sits below something
 * broader that swallows it" bug class. listCanonicalSpecialties() feeds the
 * Specialty-of-the-day rotation picker, so an entry that doesn't resolve to
 * itself means picking it queues a DIFFERENT specialty's doctors. This has
 * bitten eleven entries at once — "Cardiac Surgery" resolved to "Cardiology"
 * (via its "cardiac" keyword) and "Dental Surgeon" to "General Surgery" (via
 * its bare /\bsurgeon\b/ catch-all).
 */
describe("every canonical specialty resolves to itself", () => {
  it.each(listCanonicalSpecialties())("%s", name => {
    expect(groupSpecialty(name)).toBe(name);
  });
});

/**
 * kw() flattens every non-alphanumeric run to "\s*", so a string keyword
 * carrying regex syntax is silently corrupted: "gyna?ecolog" became
 * "gyna\s*ecolog" (British spelling only, American returned null) and
 * "head & neck" became "head\s*neck" (never matched, so the entry fell
 * through to General Surgery). Both are literal regexes now.
 */
describe("spellings and punctuation that kw() used to mangle", () => {
  it("matches both the American and British gynaecology spellings", () => {
    expect(groupSpecialty("Gynecology")).toBe("Obstetrics and Gynecology");
    expect(groupSpecialty("Gynaecology")).toBe("Obstetrics and Gynecology");
    expect(groupSpecialty("Gynecological Oncology")).toBe("Gynecological Oncology");
    expect(groupSpecialty("Gynaecological Oncology")).toBe("Gynecological Oncology");
  });

  it("matches head & neck written with an ampersand or the word", () => {
    expect(groupSpecialty("Head & Neck Surgery")).toBe("Head & Neck Surgery");
    expect(groupSpecialty("Head and Neck Surgery")).toBe("Head & Neck Surgery");
  });

  it("keeps surgeons out of the matching medical specialty", () => {
    expect(groupSpecialty("Cardiac Surgeon")).toBe("Cardiac Surgery");
    expect(groupSpecialty("Dental Surgeon")).toBe("Dental Surgeon");
    // …without dragging the medical specialty along with them
    expect(groupSpecialty("Cardiology")).toBe("Cardiology");
  });

  it("buckets the dental sub-specialties the JotForm offers", () => {
    for (const s of ["Orthodontics", "Periodontics", "Endodontics"]) {
      expect(groupSpecialty(s)).toBe("Dentist");
    }
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

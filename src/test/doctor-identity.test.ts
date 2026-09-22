import { describe, it, expect } from "vitest";
import { buildDoctorResolver } from "@/lib/doctor-identity";

const resolver = (over: Partial<Parameters<typeof buildDoctorResolver>[0]> = {}) =>
  buildDoctorResolver({ existing: [], doctorsOnBoard: [], leads: [], ...over });

describe("buildDoctorResolver", () => {
  it("reuses the id a doctor already has in the table, whatever the spelling", () => {
    const resolve = resolver({
      existing: [{ doctor_id: "dob:1", doctor_name: "William Van Niekerk" }],
      leads:    [{ id: "9", name: "William Van Niekerk" }],
    });
    expect(resolve("5. \u2060William Van Niekerk")).toMatchObject({ doctor_id: "dob:1", how: "existing" });
    expect(resolve("Dr william van niekerk.")).toMatchObject({ doctor_id: "dob:1", how: "existing" });
  });

  it("prefers a Zoho id over a csv id when the table has both for one name", () => {
    const resolve = resolver({
      existing: [
        { doctor_id: "csv:anas-saleh", doctor_name: "Anas Saleh" },
        { doctor_id: "dob:5099", doctor_name: "Anas Saleh" },
      ],
    });
    expect(resolve("Anas Saleh")).toMatchObject({ doctor_id: "dob:5099", ambiguous: [] });
  });

  it("falls back to a Zoho doctor on board before a lead of the same name", () => {
    const resolve = resolver({
      doctorsOnBoard: [{ id: "dob:7", name: "Mehmet Arda Kılınç" }],
      leads:          [{ id: "lead:3", name: "Mehmet Arda Kilinc" }],
    });
    expect(resolve("Mehmet Arda Kilinc")).toMatchObject({ doctor_id: "dob:7", how: "zoho_dob" });
  });

  it("never guesses between two Zoho records with the same name", () => {
    const resolve = resolver({
      leads: [{ id: "lead:1", name: "Muhammad Ali" }, { id: "lead:2", name: "Muhammad Ali" }],
    });
    const m = resolve("Muhammad Ali");
    expect(m.ambiguous.map(a => a.id).sort()).toEqual(["lead:1", "lead:2"]);
  });

  it("gives an unknown doctor a csv id from the cleaned name", () => {
    expect(resolver()("3. Paulo Guimaraes")).toMatchObject({ doctor_id: "csv:paulo-guimaraes", how: "new", near: [] });
  });

  it("suggests, but never applies, a near-miss spelling", () => {
    const resolve = resolver({ existing: [{ doctor_id: "dob:4", doctor_name: "Hicham Farhat" }] });
    const m = resolve("Hicham Farha");
    expect(m.how).toBe("new");
    expect(m.doctor_id).toBe("csv:hicham-farha");
    expect(m.near).toMatchObject([{ id: "dob:4", name: "Hicham Farhat" }]);
  });

  it("suggests the full name for a one-word name", () => {
    const resolve = resolver({ existing: [{ doctor_id: "dob:8", doctor_name: "Gladys Guillaume" }] });
    expect(resolve("Gladys").near.map(n => n.id)).toEqual(["dob:8"]);
  });

  it("does not suggest a different person who only shares a surname", () => {
    const resolve = resolver({ existing: [{ doctor_id: "dob:2", doctor_name: "Sami Hassan" }] });
    expect(resolve("Ali Hassan").near).toEqual([]);
  });
});

describe("near-miss suggestions", () => {
  const known = (...names: string[]) =>
    buildDoctorResolver({ existing: names.map((n, i) => ({ doctor_id: `dob:${i}`, doctor_name: n })), doctorsOnBoard: [], leads: [] });

  it("suggests real one-letter misspellings of the same name", () => {
    expect(known("Craig McRoberts")("Craig McRobert").near).toHaveLength(1);
    expect(known("Basma Karambil")("Basma Karimbil").near).toHaveLength(1);
    expect(known("Ashraf Mahmoud")("Ashraf Mahmood").near).toHaveLength(1);
    expect(known("Ayob Berzanji")("Ayob Barzanji").near).toHaveLength(1);
  });

  it("keeps different doctors apart", () => {
    expect(known("Sami Hassan")("Ali Hassan").near).toEqual([]);
    expect(known("Ban Dawood")("May Dawood").near).toEqual([]);
    expect(known("Anas Saleh")("Amam Saleh").near).toEqual([]);
    expect(known("Mohammad Riaz")("Mohammad Ijaz").near).toEqual([]);
  });
});

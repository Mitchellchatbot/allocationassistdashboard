import { describe, it, expect } from "vitest";
import { parseHammadCsv, doctorSlug } from "@/lib/parse-hammad-csv";

const HEADER = "1/1/2026,Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,";

describe("parseHammadCsv", () => {
  it("keeps a row whose specialty cell contains a newline", () => {
    const csv = [HEADER, `,Sidra,Dani Hakimeh,"Consultant Pediatrician\nand Oncologist",7/14/2026,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].doctor_specialty).toBe("Consultant Pediatrician and Oncologist");
    expect(rows[0].shortlisted_at).toBe("2026-07-14T00:00:00.000Z");
  });

  it("reads day-first dates when the month is out of range", () => {
    const csv = [HEADER, `1,AHD,Ali Khan,Cardiology,14/09/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv).rows[0].shortlisted_at).toBe("2026-09-14T00:00:00.000Z");
  });

  it("keeps the date when a note is typed beside it", () => {
    const csv = [HEADER, `14,HMS,Kunal Babla,Neonatology,,,7/2/2026 Revise ,,,,`].join("\n");
    const row = parseHammadCsv(csv).rows[0];
    expect(row.offered_at).toBe("2026-07-02T00:00:00.000Z");
    expect(row.notes).toBe("Revise");
  });

  it("keeps a doctor-and-hospital pair that has no dates yet", () => {
    const csv = [HEADER, `3,AHD,Kaled Mohsen,Consultant ENT,,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].shortlisted_at).toBeNull();
  });

  it("ignores repeated section headers and summary rows", () => {
    const csv = [HEADER, `,,,,43,8,,,,`, "", HEADER, `1,AHD,Ali Khan,Cardiology,1/5/2026,,,,,,`].join("\n");
    const { rows, weekSections } = parseHammadCsv(csv);
    expect(weekSections).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("strips the Dr. prefix so one doctor gets one slug", () => {
    expect(doctorSlug("Dr. Anas Saleh".replace(/^\s*dr\.?\s+/i, ""))).toBe(doctorSlug("Anas Saleh"));
  });
});

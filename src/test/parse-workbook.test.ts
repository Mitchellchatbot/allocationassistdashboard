import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, isWorkbook } from "@/lib/parse-workbook";

const HEADER = ["8/2/2026", "Hospital", "Doctors / candidates", "Specialty",
                "Shortlisted", "Interview", "offered", "Signed", "Start job Date", "Joined"];

/** A workbook built the way the team's is: a tab per month, week blocks
 *  inside, and real date values rather than typed text. */
function book(tabs: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
}

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("parseWorkbook", () => {
  it("reads every month tab in one pass", () => {
    const buf = book({
      July:   [HEADER, [1, "AHD", "Ali Khan", "Cardiology", d(2026, 7, 28), "", "", "", "", ""]],
      August: [HEADER, [1, "AHD", "Sara Ali", "Cardiology", d(2026, 8, 13), "", "", "", "", ""]],
    });
    const wb = parseWorkbook(buf);
    expect(wb.sheets.map(s => s.sheet)).toEqual(["July", "August"]);
    expect(wb.rows.map(r => r.doctor_name)).toEqual(["Ali Khan", "Sara Ali"]);
  });

  it("takes a real date value as it is, without guessing", () => {
    // 9 August. Read as text, "08/09/2026" could just as well be 8 September,
    // and the week-anchored rules would be free to move it.
    const buf = book({ August: [HEADER, [1, "AHD", "Ali Khan", "Cardiology", d(2026, 8, 9), "", "", "", "", ""]] });
    expect(parseWorkbook(buf).rows[0].shortlisted_at).toBe("2026-08-09T00:00:00.000Z");
  });

  it("keeps a late-July date in the August week it belongs to", () => {
    // Sun 26 Jul - Sat 1 Aug is an August week, which is where the team counts it.
    const buf = book({ July: [HEADER, [1, "AHD", "Ali Khan", "Cardiology", d(2026, 7, 28), "", "", "", "", ""]] });
    expect(parseWorkbook(buf).rows[0].events[0].week_ending).toBe("2026-08-01");
  });

  it("still reads a date someone typed as text", () => {
    const buf = book({ August: [HEADER, [1, "AHD", "Ali Khan", "Cardiology", "8/13/2026", "", "", "", "", ""]] });
    expect(parseWorkbook(buf).rows[0].shortlisted_at).toBe("2026-08-13T00:00:00.000Z");
  });

  it("points a warning at the tab's own row number", () => {
    const buf = book({
      August: [HEADER,
               [1, "AHD", "Ali Khan", "Cardiology", "", "", "", "", "", ""],
               [2, "", "Sara Ali", "Cardiology", "8/13/2026", "", "", "", "", ""]],
    });
    const w = parseWorkbook(buf).warnings.find(x => x.kind === "no_hospital");
    expect(w?.line).toBe(3);
  });

  it("ignores a tab with no week blocks in it", () => {
    const buf = book({
      Notes:  [["some other sheet"], ["nothing to read here"]],
      August: [HEADER, [1, "AHD", "Ali Khan", "Cardiology", d(2026, 8, 13), "", "", "", "", ""]],
    });
    const wb = parseWorkbook(buf);
    expect(wb.rows).toHaveLength(1);
    expect(wb.sheets.find(s => s.sheet === "Notes")?.rows).toEqual([]);
  });

  it("knows which files are workbooks", () => {
    expect(isWorkbook({ name: "report.xlsx" })).toBe(true);
    expect(isWorkbook({ name: "report.csv" })).toBe(false);
  });
});

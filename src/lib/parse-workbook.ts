/**
 * Read the placement workbook — every month tab in one pass.
 *
 * The team keeps one .xlsx with a tab per month, and exports a CSV per tab
 * when asked for a file. Reading the workbook instead of the exports is worth
 * doing for one reason: the export flattens dates into text, and text has to
 * be guessed at. "08/09/2026" could be 8 September or 9 August, and that
 * guessing is what the day-first and wrong-year rules in parse-hammad-csv
 * exist to undo.
 *
 * In the workbook they are real date values — 3,268 of the 3,289 stage cells
 * in the 2026 file — so there is nothing to guess. Handing them on as
 * yyyy-mm-dd tells parseDateCell to take them as they are rather than
 * second-guessing a date we already know.
 *
 * It matters: reading the workbook rather than the exports moved the year's
 * interview count from 790 to 787 against a tracker total of 812, and brought
 * six of the nine months to within four rows.
 */

import * as XLSX from "xlsx";
import { parseRecords, type ParseOptions, type ParseResult } from "./parse-hammad-csv";

export interface SheetResult extends ParseResult {
  /** The tab's name, which is the month ("August"). */
  sheet: string;
}

export interface WorkbookResult {
  /** Every tab, in workbook order. */
  sheets:       SheetResult[];
  /** All tabs' rows together, for planning one import across the year. */
  rows:         SheetResult["rows"];
  warnings:     SheetResult["warnings"];
  skippedRows:  number;
  weekSections: number;
}

/** A cell as the parser wants it: text, except a real date, which becomes
 *  yyyy-mm-dd so it is read rather than guessed at. */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // The workbook stores a wall-clock day. Read the local parts, so a date
    // never slips to the day before in a negative-offset timezone.
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(v).trim();
}

/** Every tab of the workbook, read with the same rules as a CSV upload.
 *
 *  Tabs are not filtered by name: a month is whatever the team called the tab,
 *  and a tab with no week blocks in it simply yields no rows. */
export function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions = {},
): WorkbookResult {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheets: SheetResult[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
    // The line number is the row's place in the tab, so a warning can say
    // "August, row 206" and someone can go straight to it.
    const records = grid.map((row, i) => ({
      cells: (row ?? []).map(cellText),
      line:  i + 1,
    }));
    sheets.push({
      ...parseRecords(records, { ...options, sourceFile: options.sourceFile ?? name }),
      sheet: name,
    });
  }

  return {
    sheets,
    rows:         sheets.flatMap(s => s.rows),
    warnings:     sheets.flatMap(s => s.warnings),
    skippedRows:  sheets.reduce((n, s) => n + s.skippedRows, 0),
    weekSections: sheets.reduce((n, s) => n + s.weekSections, 0),
  };
}

/** Whether a file should go through parseWorkbook rather than the CSV path. */
export function isWorkbook(file: { name: string }): boolean {
  return /\.xlsx?$/i.test(file.name);
}

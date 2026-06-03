/**
 * Universal CSV / XLSX reader.
 *
 * Returns a flat CSV-text representation regardless of input type:
 *   - .csv  → file contents as-is
 *   - .xlsx → every sheet's rows concatenated into one CSV string,
 *             each sheet preceded by a blank line so existing
 *             multi-section parsers (like parseHammadCsv) handle
 *             each tab the same way they handle a new section in a
 *             single sheet
 *
 * Caller passes the resulting string into whichever parser they use.
 * Keeps the parsing path single-source-of-truth (we don't have one
 * parser for CSV and another for xlsx).
 *
 * xlsx (SheetJS) is heavy (~700KB) — we dynamic-import it only when
 * a user actually picks an xlsx file. Pure CSV imports never pay
 * that cost.
 */

export interface SheetReadout {
  name: string;
  /** CSV text for just this sheet. */
  text: string;
  /** Non-empty row count (after trim) — for UI summary. */
  rows: number;
}

export interface ReadResult {
  /** The combined CSV text ready to hand to a parser that handles
   *  multi-section input (like parseHammadCsv). For single-table
   *  importers, use sheets[0].text instead. */
  text:       string;
  /** Per-tab readouts so importers that handle one table at a time
   *  can pick the first (or let the user choose). */
  sheets:     SheetReadout[];
  /** Source format we read. */
  format:     "csv" | "xlsx";
}

/** Detect whether a file is XLSX vs CSV based on name + MIME.
 *  Falls back to CSV when ambiguous. */
function isXlsx(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) return true;
  const mime = (file.type ?? "").toLowerCase();
  return mime.includes("spreadsheetml")
      || mime.includes("ms-excel")
      || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export async function readTabularFile(file: File): Promise<ReadResult> {
  if (!isXlsx(file)) {
    const text = await file.text();
    return {
      text,
      sheets: [{ name: file.name, text, rows: text.split("\n").filter(Boolean).length }],
      format: "csv",
    };
  }

  const buf = await file.arrayBuffer();
  // Lazy-load SheetJS so the main bundle stays lean. Only fires when
  // the user has actually picked an xlsx file. vite.config.ts also
  // splits this into vendor-xlsx so cache hits are warm after the
  // first xlsx import in a session.
  const XLSX = await import("xlsx");
  const wb  = XLSX.read(buf, { type: "array" });
  const sheets: SheetReadout[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // sheet_to_csv preserves blank cells + multi-section headers —
    // exactly what parseHammadCsv expects.
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: true });
    if (!csv.trim()) continue;
    sheets.push({ name: sheetName, text: csv, rows: csv.split("\n").filter(Boolean).length });
  }
  return {
    text:   sheets.map(s => s.text).join("\n\n"),  // blank line between
    sheets,
    format: "xlsx",
  };
}

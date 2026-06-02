/**
 * Tiny CSV parser. Handles quoted fields with commas + escaped quotes + CRLF
 * + UTF-8 BOM. Good enough for the Allocation Assist sheets — they're not
 * Excel-formula-heavy and don't contain newlines inside quoted cells. If we
 * hit a quirky export, swap for papaparse.
 */
export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { cur.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  // Flush final field/row
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  // Drop trailing fully-blank rows
  while (rows.length > 0 && rows[rows.length - 1].every(c => c.trim() === "")) rows.pop();
  return rows;
}

/** Returns header row + an array of objects keyed by header. Lower-cases +
 *  trims headers so "Hospital Name" and "hospital_name" both work. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const rawHeaders = grid[0];
  const headers = rawHeaders.map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (row[j] ?? "").trim();
    }
    out.push(obj);
  }
  return { headers, rows: out };
}

/** Look up the first matching header by case-insensitive alias. Returns the
 *  exact original header string so callers can index into a row object. */
export function findHeader(headers: string[], ...aliases: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase().replace(/[\s_-]+/g, ""));
  for (const a of aliases) {
    const t = a.toLowerCase().replace(/[\s_-]+/g, "");
    const idx = lower.indexOf(t);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

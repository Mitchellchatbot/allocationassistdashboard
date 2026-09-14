/**
 * Parser for the Hammad placement-tracking CSV (Ammar's weekly
 * platform report). Handles the quirks:
 *
 *   - Multiple section headers in one file (each week starts a new
 *     "Hospital, Doctors / candidates, Specialty, Shortlisted, ..."
 *     line).
 *   - Summary count rows ("43,8,..." after each section's data).
 *   - Mostly-empty rows / blank dividers.
 *   - "Added", "SENT", "X", "ADDED" notes trailing the date columns.
 *   - "Dr. " prefix on some doctor names — normalised away.
 *   - Free-text hospital names ("AH", "STMC", "MNGHA Jeddah") that
 *     don't match the hospitals table — kept as free text; the
 *     placement_attempts table accepts both linked and free-text.
 *
 * Returns one ParsedRow per detected (doctor, hospital) attempt with
 * milestone dates parsed into ISO. Caller passes these to the
 * bulk-insert mutation.
 */

export interface ParsedRow {
  doctor_name:      string;
  doctor_specialty: string | null;
  hospital_name:    string;
  shortlisted_at:   string | null;
  interviewed_at:   string | null;
  offered_at:       string | null;
  signed_at:        string | null;
  start_date:       string | null;
  joined_at:        string | null;
  notes:            string | null;
}

export interface ParseResult {
  rows:         ParsedRow[];
  skippedRows:  number;
  weekSections: number;
}

/** Split the whole file into records, respecting quoted fields. A quoted
 *  cell may contain a newline — the specialty column regularly does — so
 *  records can't be found by splitting on "\n" first. */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const endCell = () => { row.push(cur.trim()); cur = ""; };
  const endRow  = () => { endCell(); records.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
      continue;
    }
    if (ch === '"')  { inQuotes = true; continue; }
    if (ch === ",")  { endCell(); continue; }
    if (ch === "\n") { endRow(); continue; }
    if (ch === "\r") continue;
    cur += ch;
  }
  if (cur || row.length) endRow();
  return records;
}

/** A date cell, plus whatever free text was written next to it
 *  ("7/2/2026 Revise" happens). The text is kept so it can join notes
 *  rather than silently sinking the date. */
interface DateCell { iso: string | null; note: string | null }

const NO_DATE: DateCell = { iso: null, note: null };

function parseDateCell(raw: string | undefined): DateCell {
  if (!raw) return NO_DATE;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return NO_DATE;
  // Obvious notes-not-dates keep their text but yield no date.
  if (/^(added|sent|x|-|none|n\/a)$/i.test(s)) return { iso: null, note: s };

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    let mo = parseInt(m[1], 10);
    let d  = parseInt(m[2], 10);
    let y  = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    // The sheet is mostly M/D/YYYY but a few cells are typed D/M/YYYY.
    // A month above 12 is unambiguous, so swap rather than drop the date.
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { iso: null, note: s };
    const date = new Date(Date.UTC(y, mo - 1, d));
    const rest = s.slice(m[0].length).trim();
    return { iso: isNaN(date.getTime()) ? null : date.toISOString(), note: rest || null };
  }

  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const date = new Date(Date.UTC(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3])));
    return { iso: isNaN(date.getTime()) ? null : date.toISOString(), note: null };
  }
  return { iso: null, note: s };
}

/** Strip "Dr. " prefix + collapse whitespace. */
function normaliseName(raw: string): string {
  return raw.replace(/^\s*dr\.?\s+/i, "").replace(/\s+/g, " ").trim();
}

/** Detect whether a row is a section header — first non-numeric col,
 *  then "Hospital", then "Doctors / candidates", etc. */
function isHeaderRow(cols: string[]): boolean {
  // The header row's second column is "Hospital" (case-insensitive).
  return (cols[1] ?? "").toLowerCase() === "hospital"
      && (cols[2] ?? "").toLowerCase().includes("doctor");
}

/** Detect summary count rows like ",,,,43,8,,,," — the row index is
 *  empty and the first numeric column lives at position 4 (Shortlisted
 *  count). We check that columns 0-3 are empty AND at least one of 4-9
 *  is a small integer. */
function isSummaryRow(cols: string[]): boolean {
  const first4Empty = (cols[0] ?? "") === "" && (cols[1] ?? "") === ""
                   && (cols[2] ?? "") === "" && (cols[3] ?? "") === "";
  if (!first4Empty) return false;
  const tail = cols.slice(4, 10).join("");
  return /^\d+/.test(tail);
}

export function parseHammadCsv(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  let skippedRows = 0;
  let weekSections = 0;

  for (const cols of splitRecords(text)) {
    if (cols.every(c => !c)) continue;

    if (isHeaderRow(cols)) { weekSections++; continue; }
    if (isSummaryRow(cols)) continue;

    // Skip rows where Hospital or Doctor are blank — those are
    // dividers / scratch rows in the sheet.
    const hospital = cols[1]?.trim();
    const doctor   = cols[2]?.trim();
    if (!hospital || !doctor) { skippedRows++; continue; }

    // Sanity: a Hospital cell that's actually a date (column 0 of a
    // section header that has a date in the index slot) means we
    // mis-aligned — skip it.
    if (parseDateCell(hospital).iso) { skippedRows++; continue; }

    const specialty = cols[3]?.trim().replace(/\s+/g, " ") || null;
    const shortlisted = parseDateCell(cols[4]);
    const interviewed = parseDateCell(cols[5]);
    const offered     = parseDateCell(cols[6]);
    const signed      = parseDateCell(cols[7]);
    const startDate   = parseDateCell(cols[8]);
    const joined      = parseDateCell(cols[9]);

    // Trailing free-text notes — columns 10+ are usually "Added", "SENT", "X" —
    // plus anything written alongside a date ("7/2/2026 Revise").
    const notesParts: string[] = [];
    for (const c of [shortlisted, interviewed, offered, signed, startDate, joined]) {
      if (c.note) notesParts.push(c.note);
    }
    for (let i = 10; i < cols.length; i++) {
      const v = cols[i]?.trim();
      if (v) notesParts.push(v);
    }

    rows.push({
      doctor_name:      normaliseName(doctor),
      doctor_specialty: specialty,
      hospital_name:    hospital,
      shortlisted_at:   shortlisted.iso,
      interviewed_at:   interviewed.iso,
      offered_at:       offered.iso,
      signed_at:        signed.iso,
      start_date:       startDate.iso,
      joined_at:        joined.iso,
      notes:            notesParts.length > 0 ? [...new Set(notesParts)].join(" · ") : null,
    });
  }

  return { rows, skippedRows, weekSections };
}

/** Build a synthetic doctor_id slug from a name (used when the CSV
 *  doctor doesn't match a Zoho lead / DoB). `csv:<slug>` keeps it
 *  out of the lead:/dob: namespace while remaining sortable + stable.
 *
 *  Names that share slug after normalisation (e.g. "Anas Saleh" and
 *  "Dr Anas Saleh") collapse into the SAME doctor — which is exactly
 *  what we want: same doctor at multiple hospitals = multiple
 *  placement_attempts rows under one doctor_id. */
export function doctorSlug(name: string): string {
  return "csv:" + name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")     // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

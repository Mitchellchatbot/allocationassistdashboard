/**
 * Parser for the Hammad placement-tracking CSV (Ammar's weekly
 * platform report). Handles the quirks:
 *
 *   - Multiple section headers in one file (each week starts a new
 *     "Hospital, Doctors / candidates, Specialty, Shortlisted, ..."
 *     line, with that week's date in the first cell).
 *   - Summary count rows ("43,8,..." after each section's data).
 *   - Mostly-empty rows / blank dividers.
 *   - "Added", "SENT", "X", "ADDED" notes trailing the date columns.
 *   - Doctor names typed with "Dr. ", list numbering ("5. "), invisible
 *     characters (U+2060) or a trailing full stop — all normalised away.
 *   - Dates typed day-first or with the wrong year — read against the
 *     week's header date, and reported as warnings rather than guessed
 *     silently.
 *   - Free-text hospital names ("AH", "STMC", "MNGHA Jeddah") that
 *     don't match the hospitals table — kept as free text; the
 *     placement_attempts table accepts both linked and free-text.
 *
 * Returns one ParsedRow per detected (doctor, hospital) attempt with
 * milestone dates parsed into ISO, plus a warning for anything the importer
 * preview should show a person before it is saved.
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
  /** 1-based line in the file where the row starts. */
  line:             number;
  /** The date in the header of the week block the row sits under. */
  block_date:       string | null;
  /** The tab the row came from, so a question about it can be taken back to
   *  the sheet: "September row 294" rather than "row 294 of something". */
  sheet:            string | null;
  /** Whose weekly block this row sat in. See resolveBlockRep. */
  rep:              string | null;
  country:          string | null;
  /** One per stage date on the line. The journey row keeps a single date per
   *  stage; these keep every line, because the team counts lines and a doctor
   *  is regularly put forward at the same hospital more than once. */
  events:           ParsedEvent[];
}

export type EventStage = "shortlisted" | "interviewed" | "offered" | "signed" | "joined";

export interface ParsedEvent {
  stage:       EventStage;
  /** ISO date (yyyy-mm-dd). */
  occurred_at: string;
  /** The Saturday closing the Sunday–Saturday week holding occurred_at. */
  week_ending: string;
  rep:         string | null;
  country:     string | null;
  line:        number;
}

/** The Saturday that ends the Sunday–Saturday week containing `iso`.
 *  The team's week runs Sunday to Saturday and is named after the Saturday,
 *  so 2026-08-14 (a Friday) belongs to the week ending 2026-08-15. */
export function weekEnding(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

/** Which stage each journey column reports. start_date is a plan rather than
 *  something that happened, so it produces no event. */
const EVENT_STAGE: Partial<Record<DateColumn, EventStage>> = {
  shortlisted_at: "shortlisted",
  interviewed_at: "interviewed",
  offered_at:     "offered",
  signed_at:      "signed",
  joined_at:      "joined",
};

export type DateColumn = "shortlisted_at" | "interviewed_at" | "offered_at" | "signed_at" | "start_date" | "joined_at";

export type ParseWarningKind =
  | "day_first"        // read day-first because month-first landed months ahead of the week
  | "maybe_day_first"  // kept month-first, but day-first would sit in the week — check it
  | "year_fixed"       // a mistyped year corrected to the week's year
  | "other_year"       // a year other than the week's, kept as typed
  | "future"           // after today — a planned date, not an event yet
  | "unreadable_date"  // a date cell the parser could not read
  | "hold"             // HOLD / NOT ADDED / cancelled written on the row
  | "date_in_notes"     // a date typed past the Joined column, which is empty
  | "no_hospital"      // a doctor with dates but no hospital — row skipped
  | "no_doctor";       // a hospital with dates but no doctor — row skipped

export interface ParseWarning {
  kind:     ParseWarningKind;
  /** The tab the row came from — see ParsedRow.sheet. */
  sheet:    string | null;
  line:     number;
  doctor:   string | null;
  hospital: string | null;
  column:   DateColumn | null;
  /** The cell as typed. */
  typed:    string | null;
  /** The ISO date the row was saved with, when there is one. */
  read_as:  string | null;
  message:  string;
}

export interface ParseResult {
  rows:         ParsedRow[];
  skippedRows:  number;
  weekSections: number;
  warnings:     ParseWarning[];
}

export interface ParseOptions {
  /** "Now" for the future-date check. Defaults to the current time. */
  today?: Date;
  /** Who owns a hospital, from hospitals.owner_email. Used to work out whose
   *  weekly block each section is — see resolveBlockRep. Without it, rows
   *  carry no rep and reporting can't split UAE from KSA/Qatar. */
  repFor?: (hospital: string) => { rep: string; country: string | null } | null;
  /** The file the rows came from, recorded on each event. */
  sourceFile?: string;
}

/** Split the whole file into records, respecting quoted fields. A quoted
 *  cell may contain a newline — the specialty column regularly does — so
 *  records can't be found by splitting on "\n" first. Each record carries
 *  the line it starts on so warnings can point back into the sheet. */
function splitRecords(text: string): Array<{ cells: string[]; line: number }> {
  const records: Array<{ cells: string[]; line: number }> = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  const endCell = () => { row.push(cur.trim()); cur = ""; };
  const endRow  = () => { endCell(); records.push({ cells: row, line: rowLine }); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") line++;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
      continue;
    }
    if (ch === '"')  { inQuotes = true; continue; }
    if (ch === ",")  { endCell(); continue; }
    if (ch === "\n") { endRow(); rowLine = line; continue; }
    if (ch === "\r") continue;
    cur += ch;
  }
  if (cur || row.length) endRow();
  return records;
}

// ── Names ────────────────────────────────────────────────────────────

/** Zero-width and word-joiner characters the sheet sometimes carries
 *  invisibly inside a name ("5. \u2060William Van Niekerk"). */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * A doctor's name as it should be stored: no list numbering ("5. "), no
 * "Dr." prefix, no invisible characters or trailing punctuation, single
 * spaces. Case and accents are left as typed.
 */
export function cleanDoctorName(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(/\u00A0/g, " ")
    .replace(/^\s*\d+\s*[.)]\s*/, "")
    .replace(/^\s*dr(\.\s*|\s+)/i, "")
    .replace(/[\s.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The key two spellings of one doctor share: accents, case, spaces and
 * punctuation removed. "Mehmet Arda Kılınç" and "Mehmet Arda Kilinc",
 * "Fawaz Al-Hassani" and "Fawaz Alhassani" meet here; genuinely different
 * names ("Ban Dawood", "May Dawood") do not.
 */
export function doctorKey(raw: string): string {
  return cleanDoctorName(raw)
    .replace(/ı/g, "i")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** A hospital cell with invisible characters and stray spacing removed.
 *  Mapping spellings to one hospital is the alias list's job, not this. */
export function cleanHospitalName(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

// ── Dates ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
/** How far from its week's header date a stage date can sit and still be
 *  "in that week's block" for the day-first and year checks. */
const NEAR_DAYS = 45;

const utc = (y: number, m: number, d: number): Date | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31/2 and the like, which Date would roll into the next month.
  return date.getUTCMonth() === m - 1 ? date : null;
};

const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;

/** A header or plain date cell: month-first, swapped only when the first
 *  number cannot be a month. No context — used for the week header itself. */
function parsePlainDate(raw: string | undefined): Date | null {
  const trimmed = (raw ?? "").trim();
  // yyyy-mm-dd only ever comes from a real date cell in the workbook, never
  // from someone typing into the sheet, so it is taken at face value.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return utc(+iso[1], +iso[2], +iso[3]);
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (a > 12 && b <= 12) [a, b] = [b, a];
  return utc(y, a, b);
}

/** A date cell, plus whatever free text was written next to it
 *  ("7/2/2026 Revise" happens). The text is kept so it can join notes
 *  rather than silently sinking the date. */
interface DateCell {
  iso:      string | null;
  note:     string | null;
  warning?: { kind: ParseWarningKind; message: string };
}

const NO_DATE: DateCell = { iso: null, note: null };

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** Start and join dates are planned ahead — a row signed in March can carry
 *  a June start — so they are never flipped day-first, only flagged. */
const PLANNED: ReadonlySet<DateColumn> = new Set(["start_date", "joined_at"]);

function parseDateCell(raw: string | undefined, block: Date | null, today: Date, planned = false): DateCell {
  if (!raw) return NO_DATE;
  // Cells occasionally arrive wrapped in their own quotes ("\"12/2/2025\"").
  const s = raw.trim().replace(/\s+/g, " ").replace(/^"+|"+$/g, "").trim();
  if (!s) return NO_DATE;
  // Obvious notes-not-dates keep their text but yield no date.
  if (/^(added|sent|x|-|none|n\/a|hold|not added)$/i.test(s)) return { iso: null, note: s };

  // A real date cell from the workbook, handed over as yyyy-mm-dd. Nobody
  // types that into these sheets, so it is unambiguous and none of the
  // guessing below should touch it: the day-first and wrong-year rules exist
  // to rescue text, and applied here they would rewrite a date we know.
  const isoCell = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoCell) {
    const y = +isoCell[1], mo = +isoCell[2], dd = +isoCell[3];
    const rest = s.slice(isoCell[0].length).trim() || null;
    let date = utc(y, mo, dd);
    if (!date) return { iso: null, note: s };
    let warning: DateCell["warning"];

    // A real date cell needs no guessing — but the sheet sometimes holds the
    // wrong date, because the guessing already happened when someone typed it.
    // "12/4/2026" meant 12 April and was stored as 4 December, and five HMG
    // rows in the April tab still carry it. So the week-anchored rule the typed
    // dates get applies here too: swap month and day only when the stored date
    // lands months AFTER the week the row was written in and the swap lands
    // inside it. Dates carried forward are always in the past, so this never
    // touches those.
    const swapped = mo !== dd && dd <= 12 ? utc(y, dd, mo) : null;
    if (block && swapped && !planned) {
      const gap   = daysBetween(date, block);
      const swGap = Math.abs(daysBetween(swapped, block));
      if (gap > NEAR_DAYS && swGap <= NEAR_DAYS) {
        warning = { kind: "day_first", message: `the cell holds ${fmt(date)}, months after this week (${fmt(block)}) — read as ${fmt(swapped)}` };
        date = swapped;
      }
    }
    // Same for a mistyped year: one August row holds 2028. Corrected only when
    // the right year puts the date inside the week it was written in.
    if (!warning && block && date.getUTCFullYear() !== block.getUTCFullYear()) {
      const fixed = utc(block.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      if (fixed && Math.abs(daysBetween(date, block)) > 180 && Math.abs(daysBetween(fixed, block)) <= NEAR_DAYS) {
        warning = { kind: "year_fixed", message: `the cell holds ${fmt(date)}; read as ${fmt(fixed)}, in this week (${fmt(block)})` };
        date = fixed;
      } else {
        warning = { kind: "other_year", message: `the cell holds ${fmt(date)}, not ${block.getUTCFullYear()} — kept as it is` };
      }
    }
    if (!warning && date > today && !planned) {
      warning = { kind: "future", message: `${fmt(date)} is after today — a planned date, not an event yet` };
    }
    return { iso: date.toISOString(), note: rest, warning };
  }

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const first = parseInt(m[1], 10);
    const second = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const rest = s.slice(m[0].length).trim() || null;

    let warning: DateCell["warning"];
    let date: Date | null;
    if (first > 12 && second <= 12) {
      // Unambiguous: the first number can't be a month.
      date = utc(year, second, first);
    } else {
      const monthFirst = utc(year, first, second);
      const dayFirst   = first !== second ? utc(year, second, first) : null;
      date = monthFirst;
      if (block && monthFirst && dayFirst) {
        const mfGap = daysBetween(monthFirst, block);
        const dfGap = Math.abs(daysBetween(dayFirst, block));
        if (mfGap > NEAR_DAYS && dfGap <= NEAR_DAYS && !planned) {
          // Month-first lands months AFTER the week it was written in — a
          // sheet can't record December in an April block. Old dates carried
          // forward are always in the past, so this never flips those.
          date = dayFirst;
          warning = { kind: "day_first", message: `"${m[0]}" read day-first as ${fmt(dayFirst)} — month-first would be ${fmt(monthFirst)}, months after this week (${fmt(block)})` };
        } else if (Math.abs(mfGap) > NEAR_DAYS && dfGap <= NEAR_DAYS) {
          warning = { kind: "maybe_day_first", message: `"${m[0]}" kept as ${fmt(monthFirst)}; if it was typed day-first it would be ${fmt(dayFirst)}, in this week (${fmt(block)})` };
        }
      }
    }
    if (!date) return { iso: null, note: s, warning: { kind: "unreadable_date", message: `"${s}" is not a real date` } };

    if (block && date.getUTCFullYear() !== block.getUTCFullYear()) {
      const fixed = utc(block.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      if (fixed && Math.abs(daysBetween(date, block)) > 180 && Math.abs(daysBetween(fixed, block)) <= NEAR_DAYS) {
        warning = { kind: "year_fixed", message: `"${m[0]}" has year ${date.getUTCFullYear()}; read as ${fmt(fixed)}, in this week (${fmt(block)})` };
        date = fixed;
      } else if (!warning) {
        warning = { kind: "other_year", message: `"${m[0]}" is in ${date.getUTCFullYear()}, not ${block.getUTCFullYear()} — kept as typed` };
      }
    }
    if (!warning && date.getTime() > today.getTime()) {
      warning = { kind: "future", message: `${fmt(date)} is after today — a planned date, not an event yet` };
    }
    return { iso: date.toISOString(), note: rest, warning };
  }

  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const date = utc(parseInt(m2[1]), parseInt(m2[2]), parseInt(m2[3]));
    if (date) return { iso: date.toISOString(), note: null };
  }
  const looksLikeDate = /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(s);
  return { iso: null, note: s, warning: looksLikeDate ? { kind: "unreadable_date", message: `"${s}" could not be read as a date` } : undefined };
}

// ── Rows ─────────────────────────────────────────────────────────────

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

/** Words on a row that mean a stage did not really happen.
 *
 *  "ADDED" and "NOT ADDED" are deliberately absent: the team uses those to
 *  track an internal step of their own after a join, not to say whether the
 *  doctor started. Reading them as a hold kept real joins out of the figures. */
const HOLD = /\b(hold|cancell?ed|withdrawn)\b/i;

const DATE_COLUMNS: Array<[DateColumn, number]> = [
  ["shortlisted_at", 4], ["interviewed_at", 5], ["offered_at", 6],
  ["signed_at", 7], ["start_date", 8], ["joined_at", 9],
];

/** Whose block this is, decided by the hospitals in it rather than by any
 *  cell — the sheet never names the rep.
 *
 *  Each section of the sheet is one rep's weekly submission: checked against
 *  the tracker, ten of August's fifteen rep-weeks match its per-rep cells
 *  exactly, and every August block is owned by a single rep. That matters
 *  because the hospital name alone often can't say whose a line is —
 *  "Saudi German Hospital" sits on both Sohaila's and Ishak's lists, and
 *  SKMC, NMC, Mediclinic, KCH and FUH each appear under two reps. Reading the
 *  block settles those: "SGH" in Sohaila's block is Jeddah, in Ishak's it is
 *  Dubai.
 *
 *  A plurality wins rather than a majority, because a block regularly holds a
 *  few hospitals from a shared brand. Ties leave the block unattributed — the
 *  preview asks rather than guesses. */
function resolveBlockRep(
  hospitals: string[],
  repFor: ParseOptions["repFor"],
): { rep: string | null; country: string | null } {
  if (!repFor) return { rep: null, country: null };
  const votes = new Map<string, { n: number; country: string | null }>();
  for (const h of hospitals) {
    const owner = repFor(h);
    if (!owner) continue;
    const seen = votes.get(owner.rep);
    if (seen) seen.n++;
    else votes.set(owner.rep, { n: 1, country: owner.country });
  }
  if (votes.size === 0) return { rep: null, country: null };
  const ranked = [...votes.entries()].sort((a, b) => b[1].n - a[1].n);
  if (ranked.length > 1 && ranked[0][1].n === ranked[1][1].n) return { rep: null, country: null };
  return { rep: ranked[0][0], country: ranked[0][1].country };
}

export function parseHammadCsv(text: string, options: ParseOptions = {}): ParseResult {
  return parseRecords(splitRecords(text), options);
}

/** The same reading, over rows that came from somewhere other than CSV text —
 *  a workbook sheet, where the dates are real values rather than typing. */
export function parseRecords(
  records: Array<{ cells: string[]; line: number }>,
  options: ParseOptions = {},
): ParseResult {
  const today = options.today ?? new Date();
  const sheet = options.sourceFile ?? null;
  const rows: ParsedRow[] = [];
  const warnings: ParseWarning[] = [];
  let skippedRows = 0;
  let weekSections = 0;
  let block: Date | null = null;

  // Rows wait here until the block ends, because the rep is decided by the
  // whole block and every row in it — and every event — is then stamped.
  let pending: ParsedRow[] = [];
  const closeBlock = () => {
    if (pending.length === 0) return;
    const { rep, country } = resolveBlockRep(pending.map(r => r.hospital_name), options.repFor);
    for (const row of pending) {
      row.rep = rep;
      row.country = country;
      for (const ev of row.events) { ev.rep = rep; ev.country = country; }
      rows.push(row);
    }
    pending = [];
  };

  for (const { cells: cols, line } of records) {
    if (cols.every(c => !c)) continue;

    if (isHeaderRow(cols)) { closeBlock(); weekSections++; block = parsePlainDate(cols[0]); continue; }
    if (isSummaryRow(cols)) continue;

    const hospital = cleanHospitalName(cols[1] ?? "");
    const doctor   = cleanDoctorName(cols[2] ?? "");
    const hasDates = cols.slice(4, 10).some(c => parsePlainDate(c?.replace(/\s.*$/, "")));

    // Rows missing a hospital or a doctor can't become a placement. Blank
    // dividers are skipped quietly; one that carries dates is surfaced so
    // someone can fill it in rather than lose it.
    if (!hospital || !doctor) {
      skippedRows++;
      if ((hospital || doctor) && hasDates) {
        warnings.push({
          kind: hospital ? "no_doctor" : "no_hospital", sheet, line,
          doctor: doctor || null, hospital: hospital || null, column: null, typed: null, read_as: null,
          message: hospital ? `${hospital}: a row with dates but no doctor — skipped` : `${doctor}: a row with dates but no hospital — skipped`,
        });
      }
      continue;
    }

    // Sanity: a Hospital cell that's actually a date (column 0 of a
    // section header that has a date in the index slot) means we
    // mis-aligned — skip it.
    if (parsePlainDate(hospital)) { skippedRows++; continue; }

    const specialty = cols[3]?.trim().replace(/\s+/g, " ") || null;
    const dates = {} as Record<DateColumn, string | null>;
    const notesParts: string[] = [];
    for (const [col, idx] of DATE_COLUMNS) {
      const cell = parseDateCell(cols[idx], block, today, PLANNED.has(col));
      dates[col] = cell.iso;
      // Free text written alongside a date ("7/2/2026 Revise") joins the notes.
      if (cell.note) notesParts.push(cell.note);
      if (cell.warning) {
        warnings.push({ ...cell.warning, sheet, line, doctor, hospital, column: col, typed: cols[idx] ?? null, read_as: cell.iso });
      }
    }
    // Trailing free-text notes — columns 10+ are usually "Added", "SENT", "X".
    for (let i = 10; i < cols.length; i++) {
      const v = cols[i]?.trim();
      if (v) notesParts.push(v);
    }
    const notes = notesParts.length > 0 ? [...new Set(notesParts)].join(" · ") : null;

    // "HOLD" / "NOT ADDED" beside a join means the join may not have
    // happened. The date is kept — the importer preview decides — but it is
    // never saved without someone seeing this.
    if (notes && HOLD.test(notes) && (dates.joined_at || dates.start_date)) {
      warnings.push({
        kind: "hold", sheet, line, doctor, hospital, column: dates.joined_at ? "joined_at" : "start_date",
        typed: notes, read_as: dates.joined_at ?? dates.start_date,
        message: `${doctor} @ ${hospital}: the row says "${notes}" next to a join/start date`,
      });
    }

    // A date typed one column too far right leaves Joined empty, which would
    // otherwise read as "this journey never joined" and wipe a real join date.
    const strayDate = !dates.joined_at && notes
      ? notes.split(" · ").find(n => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(n.trim()))
      : undefined;
    if (strayDate) {
      warnings.push({
        kind: "date_in_notes", sheet, line, doctor, hospital, column: "joined_at",
        typed: strayDate, read_as: null,
        message: `${doctor} @ ${hospital}: "${strayDate}" sits past the Joined column, which is empty — the join date is left as it is`,
      });
    }

    // One event per stage the line actually reports. rep and country are
    // filled in by closeBlock once the whole block has been read.
    const events: ParsedEvent[] = [];
    for (const [col, stage] of Object.entries(EVENT_STAGE) as Array<[DateColumn, EventStage]>) {
      const iso = dates[col];
      if (!iso) continue;
      const day = iso.slice(0, 10);
      events.push({ stage, occurred_at: day, week_ending: weekEnding(day), rep: null, country: null, line });
    }

    pending.push({
      doctor_name:      doctor,
      doctor_specialty: specialty,
      hospital_name:    hospital,
      ...dates,
      notes,
      line,
      sheet,
      block_date:       block ? block.toISOString() : null,
      rep:              null,
      country:          null,
      events,
    });
  }
  closeBlock();

  return { rows, skippedRows, weekSections, warnings };
}

/** Build a synthetic doctor_id slug from a name (used when the CSV
 *  doctor doesn't match a Zoho lead / DoB). `csv:<slug>` keeps it
 *  out of the lead:/dob: namespace while remaining sortable + stable.
 *
 *  The name is cleaned first, so "5. William Van Niekerk", "Dr William
 *  Van Niekerk" and "William Van Niekerk" all collapse into the SAME doctor
 *  — same doctor at multiple hospitals = multiple placement_attempts rows
 *  under one doctor_id. */
export function doctorSlug(name: string): string {
  return "csv:" + cleanDoctorName(name).toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")     // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parser for the "Weekly Report - <year>" CSVs — the aggregate per-employee
 * tracker. Structure (one file per year):
 *   - Header row: col 0 blank, then WEEK columns ("03/01/2026") interspersed
 *     with MONTH-total columns ("JAN", "FEB"…) we must skip (else double-count).
 *   - An unlabelled OVERALL block (Shortlisted:/Interviewed:/Offered:/Signed:/
 *     Started job) — skipped; we only want per-person.
 *   - Then a block per employee: a row whose first cell is the person's name
 *     ("Rodaina", "Ishak", "Sohaila"), followed by their 5 metric rows.
 *
 * Emits one row per (employee, week) with that week's counts, so the reporting
 * layer can sum whatever weeks fall in the selected date range.
 */

export interface WeeklyTeamWeek {
  employee:    string;   // canonical name
  email:       string;   // allocationassist.com email (for merging into the team table)
  weekStart:   string;   // ISO date (UTC midnight) of the week column
  shortlisted: number;
  interviewed: number;
  offered:     number;
  signed:      number;
  started:     number;   // "Started job" = relocated/joined
}

// Employee name (as it appears in the sheet) → roster email. Extend if the
// weekly sheet starts tracking more people.
const EMPLOYEE_EMAIL: Record<string, string> = {
  rodaina: "rodaina@allocationassist.com",
  ishak:   "ishak@allocationassist.com",
  sohaila: "sohaila@allocationassist.com",
};

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** "03/01/2026" (DD/MM/YYYY) → ISO UTC-midnight, or null for month labels. */
function weekDateIso(cell: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(cell.trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** "12", "-", " 3 ", "" → int (blank / dash → 0). */
function num(cell: string | undefined): number {
  const s = (cell ?? "").trim();
  if (!s || s === "-") return 0;
  const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

const METRIC_KEY: Record<string, keyof WeeklyTeamWeek> = {
  shortlisted: "shortlisted",
  interviewed: "interviewed",
  offered:     "offered",
  signed:      "signed",
  "started job": "started",
  "started":     "started",
};

export function parseWeeklyReport(text: string): WeeklyTeamWeek[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return [];

  // Header → week columns only (skip month-total columns).
  const header = splitLine(lines[0]);
  const weekCols: { idx: number; iso: string }[] = [];
  for (let i = 1; i < header.length; i++) {
    const iso = weekDateIso(header[i]);
    if (iso) weekCols.push({ idx: i, iso });
  }
  if (weekCols.length === 0) return [];

  // Accumulate per (email, weekIso).
  const acc = new Map<string, WeeklyTeamWeek>();
  const bump = (email: string, employee: string, iso: string, key: keyof WeeklyTeamWeek, v: number) => {
    if (!v) return;
    const k = `${email}|${iso}`;
    let row = acc.get(k);
    if (!row) { row = { employee, email, weekStart: iso, shortlisted: 0, interviewed: 0, offered: 0, signed: 0, started: 0 }; acc.set(k, row); }
    (row[key] as number) += v;
  };

  let curEmail: string | null = null, curName = "";
  for (let li = 1; li < lines.length; li++) {
    const cols = splitLine(lines[li]);
    const label = (cols[0] ?? "").trim().toLowerCase().replace(/[:]/g, "").trim();
    if (!label) continue;

    // Employee header row: first cell is a known name, rest ~empty.
    const email = EMPLOYEE_EMAIL[label];
    if (email) { curEmail = email; curName = (cols[0] ?? "").trim(); continue; }

    // Metric row under the current employee.
    const mk = METRIC_KEY[label];
    if (mk && curEmail) {
      for (const { idx, iso } of weekCols) bump(curEmail, curName, iso, mk, num(cols[idx]));
    }
  }
  return [...acc.values()].sort((a, b) => a.email.localeCompare(b.email) || a.weekStart.localeCompare(b.weekStart));
}

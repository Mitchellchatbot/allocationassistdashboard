/**
 * email-table — turn tabular data into an email-safe HTML <table>.
 *
 * Amir #4: insert tables into the email editor (Top 15 / Specialty lists etc.).
 * Email clients (Gmail, Outlook) strip <style>/<head>, so EVERYTHING here is
 * INLINE styles. The output drops straight into the EditableEmailPreview
 * contentEditable body and survives the send (send-flow-email / send-batch
 * ship the edited HTML verbatim).
 *
 * Pure + dependency-free for the table generation; the .xlsx parsing helper
 * lives in the component (lazy-imports the already-bundled `xlsx`).
 */

export type CellAlign = "left" | "center" | "right";
export type TablePreset = "aa" | "striped" | "minimal" | "bordered";

export interface TableStyleOptions {
  /** Visual preset. "aa" = teal branded header, the house style. */
  preset:      TablePreset;
  /** Treat the first row as a styled header row. */
  headerRow:   boolean;
  /** Global alignment, or per-column (length = column count). */
  align:       CellAlign | CellAlign[];
  /** Accent / header colour (hex). Defaults to AA teal. */
  accent:      string;
  /** Zebra-stripe the body rows. */
  striped:     boolean;
  /** Draw cell borders. */
  bordered:    boolean;
  /** Optional caption rendered above the table (e.g. "Top 15 — Cardiology"). */
  caption?:    string;
  /** Font stack — defaults to the AA email serif. */
  fontStack?:  string;
}

export const AA_TEAL = "#14b8a6";
const AA_FONT = "Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif";

export const DEFAULT_TABLE_OPTIONS: TableStyleOptions = {
  preset:    "aa",
  headerRow: true,
  align:     "left",
  accent:    AA_TEAL,
  striped:   true,
  bordered:  true,
  caption:   "",
};

/** Apply a preset to a partial options object → fully-resolved options. */
export function resolveTableOptions(o: Partial<TableStyleOptions> = {}): TableStyleOptions {
  const merged = { ...DEFAULT_TABLE_OPTIONS, ...o };
  switch (merged.preset) {
    case "minimal":  return { ...merged, striped: false, bordered: false, headerRow: o.headerRow ?? true };
    case "bordered": return { ...merged, striped: o.striped ?? false, bordered: true };
    case "striped":  return { ...merged, striped: true, bordered: o.bordered ?? false };
    case "aa":
    default:         return { ...merged, striped: o.striped ?? true, bordered: o.bordered ?? true };
  }
}

/**
 * Parse pasted spreadsheet text into a 2-D grid. Excel/Sheets copy as
 * TAB-separated by default; we fall back to comma-separated with basic quoted-
 * field handling. Trailing blank lines are dropped.
 */
export function parseDelimited(text: string): string[][] {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/\n+$/g, "");
  if (!normalised.trim()) return [];
  const lines = normalised.split("\n");
  const hasTab = lines.some(l => l.includes("\t"));
  if (hasTab) {
    return lines.map(l => l.split("\t"));
  }
  // CSV with minimal quoted-field support.
  return lines.map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Pad a ragged grid so every row has the same column count. */
export function normaliseGrid(grid: string[][]): string[][] {
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  return grid.map(r => {
    const row = r.map(c => (c ?? "").toString());
    while (row.length < cols) row.push("");
    return row;
  });
}

function alignFor(align: CellAlign | CellAlign[], col: number): CellAlign {
  return Array.isArray(align) ? (align[col] ?? "left") : align;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Build an email-safe HTML table from a grid. All inline-styled.
 * Returns "" for an empty grid.
 */
export function gridToHtmlTable(rawGrid: string[][], options: Partial<TableStyleOptions> = {}): string {
  const grid = normaliseGrid(rawGrid).filter(r => r.length > 0);
  if (grid.length === 0) return "";
  const o = resolveTableOptions(options);
  const font = o.fontStack ?? AA_FONT;
  const border = o.bordered ? `1px solid ${shade(o.accent, 0.75)}` : "none";

  const bodyStart = o.headerRow ? 1 : 0;
  const headerRow = o.headerRow ? grid[0] : null;
  const bodyRows  = grid.slice(bodyStart);

  const th = (text: string, col: number) =>
    `<th style="padding:8px 12px;text-align:${alignFor(o.align, col)};background:${o.accent};color:#ffffff;` +
    `font-weight:700;font-size:14px;border:${border};font-family:${font};">${escapeHtml(text)}</th>`;

  const td = (text: string, col: number, rowIdx: number) => {
    const zebra = o.striped && rowIdx % 2 === 1 ? `background:${shade(o.accent, 0.96)};` : "background:#ffffff;";
    return `<td style="padding:7px 12px;text-align:${alignFor(o.align, col)};${zebra}color:#1a2332;` +
      `font-size:13px;border:${border};font-family:${font};">${escapeHtml(text)}</td>`;
  };

  const headHtml = headerRow
    ? `<thead><tr>${headerRow.map((c, i) => th(c, i)).join("")}</tr></thead>`
    : "";
  const bodyHtml = `<tbody>${bodyRows
    .map((row, ri) => `<tr>${row.map((c, ci) => td(c, ci, ri)).join("")}</tr>`)
    .join("")}</tbody>`;

  const caption = o.caption
    ? `<p style="margin:0 0 6px;font-weight:700;font-size:15px;color:${o.accent};font-family:${font};">${escapeHtml(o.caption)}</p>`
    : "";

  // role=presentation + border-collapse for Outlook; wrapped in a div so the
  // editor treats it as one insertable block.
  return (
    `<div style="margin:14px 0;">${caption}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="border-collapse:collapse;width:100%;font-family:${font};">` +
    `${headHtml}${bodyHtml}</table></div>`
  );
}

/** Lighten a hex colour toward white by `amount` (0..1). Used for the header
 *  border + zebra tint so they derive from the chosen accent. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return amount > 0.9 ? "#f1f5f9" : "#cbd5e1";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Convenience: pasted text → email-safe table HTML in one call. */
export function pastedTextToTableHtml(text: string, options: Partial<TableStyleOptions> = {}): string {
  return gridToHtmlTable(parseDelimited(text), options);
}

/**
 * Curated allowlist of Supabase tables that can be the target of a Custom-
 * Table sheet connection.
 *
 * Sources auto-managed by Zoho, Facebook, BoldSign, Fathom, or our own flow
 * runners are deliberately NOT here — pasting a sheet over their state would
 * fight the sync.
 *
 * Each entry declares the columns we'll let the user map sheet headers to,
 * with the Postgres type so the edge function can coerce values correctly.
 * Add a table by adding an entry; the dropdown picks it up automatically.
 */

export type ColumnType = "text" | "number" | "integer" | "date" | "datetime" | "boolean" | "uuid" | "jsonb";

export interface TableColumn {
  name:   string;
  type:   ColumnType;
  /** Skipped during auto-mapping — typically PKs / created_at / etc. */
  managed?: boolean;
  /** Human-readable label for the mapping UI. */
  label?: string;
}

export interface ImportableTable {
  name:          string;        // actual Postgres table name
  displayName:   string;        // dropdown label
  description:   string;        // short blurb for the help line
  keyColumn:     string;        // default upsert key
  columns:       TableColumn[];
}

export const IMPORTABLE_TABLES: ImportableTable[] = [
  {
    name:        "marketing_expenses",
    displayName: "Marketing expenses",
    description: "Spend rows the team logs monthly (channel, amount, date).",
    keyColumn:   "id",
    columns: [
      { name: "id",            type: "uuid",       managed: true },
      { name: "category",      type: "text",       label: "Channel / category" },
      { name: "subcategory",   type: "text" },
      { name: "vendor",        type: "text" },
      { name: "amount",        type: "number" },
      { name: "currency",      type: "text" },
      { name: "expense_date",  type: "date",       label: "Date" },
      { name: "notes",         type: "text" },
      { name: "created_at",    type: "datetime",   managed: true },
    ],
  },
  {
    name:        "meta_leads",
    displayName: "Meta lead form submissions",
    description: "Form fills from Facebook/Instagram. Use this if a sheet has lead exports outside the live API sync.",
    keyColumn:   "lead_id",
    columns: [
      { name: "lead_id",       type: "text",       label: "Lead ID (Meta)" },
      { name: "form_id",       type: "text" },
      { name: "ad_id",         type: "text" },
      { name: "ad_name",       type: "text" },
      { name: "adset_id",      type: "text" },
      { name: "adset_name",    type: "text" },
      { name: "campaign_id",   type: "text" },
      { name: "campaign_name", type: "text" },
      { name: "platform",      type: "text" },
      { name: "full_name",     type: "text" },
      { name: "email",         type: "text" },
      { name: "phone",         type: "text" },
      { name: "specialty",     type: "text" },
      { name: "country",       type: "text" },
      { name: "created_time",  type: "datetime" },
      { name: "raw",           type: "jsonb",      managed: true },
    ],
  },
  {
    name:        "vacancies",
    displayName: "Vacancies",
    description: "Open hospital roles. Use this for a flat sheet (one row per vacancy with Hospital + Specialty columns).",
    keyColumn:   "id",
    columns: [
      { name: "id",                type: "uuid",     managed: true },
      { name: "hospital_id",       type: "uuid" },
      { name: "hospital_name",     type: "text" },
      { name: "specialty",         type: "text" },
      { name: "priority",          type: "text" },
      { name: "target_fill_days",  type: "integer" },
      { name: "status",            type: "text" },
      { name: "notes",             type: "text" },
      { name: "opened_by",         type: "text" },
      { name: "opened_at",         type: "datetime", managed: true },
    ],
  },
  {
    name:        "hospitals",
    displayName: "Hospitals",
    description: "The 95-hospital list. Use this if you want the Custom mapper instead of the dedicated parser.",
    keyColumn:   "name",
    columns: [
      { name: "id",                       type: "uuid",     managed: true },
      { name: "name",                     type: "text" },
      { name: "city",                     type: "text" },
      { name: "country",                  type: "text" },
      { name: "primary_contact_name",     type: "text" },
      { name: "primary_recruiter_email",  type: "text" },
      { name: "recruiter_phone",          type: "text" },
      { name: "template_key",             type: "text" },
      { name: "notes",                    type: "text" },
      { name: "health_score",             type: "integer" },
    ],
  },
  {
    name:        "doctor_lifecycle",
    displayName: "Doctor lifecycle (milestones)",
    description: "Historical signed/joined/approved/paid dates per doctor.",
    keyColumn:   "doctor_id",
    columns: [
      { name: "doctor_id",              type: "text",       label: "Doctor ID (lead:* / dob:*)" },
      { name: "doctor_name",            type: "text" },
      { name: "signed_at",              type: "datetime" },
      { name: "joined_at",              type: "datetime" },
      { name: "approved_at",            type: "datetime" },
      { name: "paid_at",                type: "datetime" },
      { name: "eligible_for_sending",   type: "boolean" },
      { name: "unavailable",            type: "boolean" },
      { name: "unavailable_reason",     type: "text" },
      { name: "available_check_in_at",  type: "datetime" },
      { name: "notes",                  type: "text" },
    ],
  },
  {
    name:        "lead_source_overrides",
    displayName: "Lead source overrides (Meta attribution fix)",
    description: "Map Zoho lead IDs to corrected source labels.",
    keyColumn:   "lead_id",
    columns: [
      { name: "lead_id",          type: "text" },
      { name: "override_source",  type: "text" },
      { name: "note",             type: "text" },
    ],
  },
];

export function findImportableTable(name: string): ImportableTable | undefined {
  return IMPORTABLE_TABLES.find(t => t.name === name);
}

/** Auto-map a sheet's headers to a target table's columns. Strong match by
 *  case-insensitive name; falls back to fuzzy substring match for common
 *  cases like "Email Address" → "email". Columns marked `managed` are
 *  never suggested. Returns { sheetHeader → tableColumn }. */
export function autoMapColumns(sheetHeaders: string[], table: ImportableTable): Record<string, string> {
  const cleanable = table.columns.filter(c => !c.managed);
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "").trim();
  const byNorm = new Map<string, string>();
  for (const c of cleanable) byNorm.set(norm(c.name), c.name);

  const map: Record<string, string> = {};
  const used = new Set<string>();

  for (const header of sheetHeaders) {
    const n = norm(header);
    if (!n) continue;
    // Exact normalised match wins.
    const exact = byNorm.get(n);
    if (exact && !used.has(exact)) {
      map[header] = exact;
      used.add(exact);
      continue;
    }
    // Substring match — header contains column or vice versa.
    let bestMatch: string | null = null;
    for (const col of cleanable) {
      if (used.has(col.name)) continue;
      const cn = norm(col.name);
      if (cn.includes(n) || n.includes(cn)) {
        bestMatch = col.name;
        break;
      }
    }
    if (bestMatch) {
      map[header] = bestMatch;
      used.add(bestMatch);
    }
  }
  return map;
}

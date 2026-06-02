/**
 * sheets-sync — Supabase Edge Function
 *
 * Pulls a published Google Sheet as CSV and writes the rows into whichever
 * Allocation Assist table the connection targets (hospitals / vacancies /
 * unavailable doctors / placements / source overrides / hospital templates).
 *
 * Triggered:
 *   - On demand from the /connections page ("Sync now" button).
 *   - On a schedule from tick-scheduler (every N min per connection).
 *
 * Request:
 *   { connection_id: string }
 *
 * Response:
 *   { ok: true,  summary: { created, updated, skipped, unmatched }, target_kind }
 *   { ok: false, error: string }
 *
 * The Google Sheet needs to be:
 *   - Either published to web (File → Publish to web → CSV)
 *   - Or shared as "anyone with the link can view" — the `.../export?format=csv`
 *     endpoint works on those.
 *
 * URL normalisation lives client-side; this function trusts `csv_url` on
 * the connection row.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Auth credentials for accessing private sheets. Two supported modes:
//   - "oauth"          (preferred): one-time OAuth consent by a team member.
//                      Refresh token lives in google_oauth_tokens. Set
//                      GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET.
//   - "service_account" (legacy):   GCP service account JSON. Set
//                      GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY.
const GOOGLE_SA_EMAIL          = Deno.env.get("GOOGLE_SA_EMAIL")          ?? "";
const GOOGLE_SA_PRIVATE_KEY    = Deno.env.get("GOOGLE_SA_PRIVATE_KEY")    ?? "";
const GOOGLE_CLIENT_ID         = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET     = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";

// SheetJS is the de-facto Excel parser. Importing from esm.sh works in Deno
// with no special config. Adds ~600KB to the function bundle but only
// loads when an xlsx file is actually being fetched.
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("[sheets-sync] booted.");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: {
    connection_id?: string;
    preview?: { csv_url?: string; target_kind: string; auth_mode?: string; sheet_id?: string | null; tab_gid?: string | null; headers_only?: boolean };
  };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Preview mode: dry-run a URL + target_kind without writing anything ─
  // The Connections page hits this before the user commits a new connection
  // so they can see "would create 12, update 3, 2 unmatched" upfront.
  if (body.preview) {
    try {
      let text: string;
      if (body.preview.auth_mode === "oauth") {
        if (!body.preview.sheet_id) return json({ ok: false, error: "sheet_id required for OAuth preview" }, 400);
        text = await fetchViaOAuth(supabase, body.preview.sheet_id, body.preview.tab_gid ?? null);
      } else if (body.preview.auth_mode === "service_account") {
        if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY) {
          return json({ ok: false, error: "Service account isn't configured. Use OAuth instead." }, 500);
        }
        if (!body.preview.sheet_id) return json({ ok: false, error: "sheet_id required for service_account preview" }, 400);
        text = await fetchSheetViaApi(body.preview.sheet_id, body.preview.tab_gid ?? null);
      } else {
        if (!body.preview.csv_url) return json({ ok: false, error: "csv_url required for public preview" }, 400);
        const res = await fetch(body.preview.csv_url, { redirect: "follow" });
        if (!res.ok) return json({ ok: false, error: `Sheet fetch ${res.status} — make sure the sheet is shared with "Anyone with the link can view".` }, 502);
        text = await res.text();
      }
      if (!text.trim()) return json({ ok: false, error: "Empty sheet" }, 400);
      if (body.preview.headers_only) {
        const { headers } = parseObjects(text);
        return json({ ok: true, preview: true, headers }, 200);
      }
      const summary = await previewCount(supabase, text, body.preview.target_kind);
      return json({ ok: true, preview: true, target_kind: body.preview.target_kind, summary }, 200);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  if (!body.connection_id) return json({ ok: false, error: "connection_id required" }, 400);

  // ── Load the connection ────────────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("sheet_connections")
    .select("*")
    .eq("id", body.connection_id)
    .single();
  if (connErr || !conn) return json({ ok: false, error: "Connection not found", detail: connErr?.message }, 404);
  if (!conn.active) return json({ ok: false, error: "Connection is paused" }, 409);

  const stamp = (patch: Record<string, unknown>) =>
    supabase.from("sheet_connections").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", conn.id);

  // ── Fetch the sheet contents ───────────────────────────────────────────
  // Three paths:
  //   • oauth (preferred): use the stored refresh token + Drive API. Reads
  //     both Google Sheets AND uploaded .xlsx files in the connected user's
  //     Drive. XLSX gets parsed locally via SheetJS.
  //   • service_account (legacy): GCP SA JWT for Sheets API only.
  //   • public_csv: anyone-with-link CSV export endpoint.
  let csvText: string;
  try {
    if (conn.auth_mode === "oauth") {
      if (!conn.sheet_id) {
        const err = "OAuth connection is missing sheet_id. Re-create the connection.";
        await stamp({ last_error: err });
        return json({ ok: false, error: err }, 400);
      }
      csvText = await fetchViaOAuth(supabase, conn.sheet_id, conn.tab_gid);
    } else if (conn.auth_mode === "service_account") {
      if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_PRIVATE_KEY) {
        const err = "Service account not configured. Set GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY secrets.";
        await stamp({ last_error: err });
        return json({ ok: false, error: err }, 500);
      }
      if (!conn.sheet_id) {
        const err = "Connection is in service_account mode but sheet_id is missing. Re-create the connection.";
        await stamp({ last_error: err });
        return json({ ok: false, error: err }, 400);
      }
      csvText = await fetchSheetViaApi(conn.sheet_id, conn.tab_gid);
    } else {
      const res = await fetch(conn.csv_url, { redirect: "follow" });
      if (!res.ok) {
        const err = `Sheet fetch ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`;
        await stamp({ last_error: err });
        return json({ ok: false, error: err }, 502);
      }
      csvText = await res.text();
    }
  } catch (e) {
    const err = `Sheet fetch threw: ${String(e)}`;
    await stamp({ last_error: err });
    return json({ ok: false, error: err }, 502);
  }
  if (!csvText.trim()) {
    await stamp({ last_error: "Sheet returned empty body" });
    return json({ ok: false, error: "Empty sheet" }, 400);
  }

  // ── Route to the right parser ──────────────────────────────────────────
  try {
    let summary: { created: number; updated: number; skipped: number; unmatched?: number };
    switch (conn.target_kind) {
      case "hospitals":           summary = await syncHospitals(supabase, csvText); break;
      case "vacancies":           summary = await syncVacancies(supabase, csvText, conn.created_by); break;
      case "unavailable_doctors": summary = await syncUnavailable(supabase, csvText); break;
      case "placements":          summary = await syncPlacements(supabase, csvText); break;
      case "source_overrides":    summary = await syncSourceOverrides(supabase, csvText, conn.created_by); break;
      case "hospital_templates":  summary = await syncHospitalTemplates(supabase, csvText); break;
      case "custom_table":        summary = await syncCustomTable(supabase, csvText, conn); break;
      default:
        await stamp({ last_error: `Unknown target_kind: ${conn.target_kind}` });
        return json({ ok: false, error: `Unknown target_kind: ${conn.target_kind}` }, 400);
    }
    await stamp({
      last_synced_at: new Date().toISOString(),
      last_error:     null,
      last_summary:   summary,
    });
    return json({ ok: true, target_kind: conn.target_kind, summary }, 200);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await stamp({ last_error: err });
    return json({ ok: false, error: err }, 500);
  }
});

// ── CSV parsing (Deno copy of src/lib/csv-parse.ts) ────────────────────────
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
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
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  while (rows.length > 0 && rows[rows.length - 1].every(c => c.trim() === "")) rows.pop();
  return rows;
}

function parseObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < grid.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (grid[i][j] ?? "").trim();
    rows.push(obj);
  }
  return { headers, rows };
}

function findH(headers: string[], ...aliases: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase().replace(/[\s_-]+/g, ""));
  for (const a of aliases) {
    const t = a.toLowerCase().replace(/[\s_-]+/g, "");
    const idx = lower.indexOf(t);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ── Parsers ────────────────────────────────────────────────────────────────

async function syncHospitals(supabase: ReturnType<typeof createClient>, csv: string) {
  const { headers, rows } = parseObjects(csv);
  const nameH    = findH(headers, "name", "hospital", "hospital name");
  if (!nameH) throw new Error("Missing required 'Name' column.");
  const cityH    = findH(headers, "city");
  const countryH = findH(headers, "country");
  const contactH = findH(headers, "primary contact name", "primary contact", "contact name", "contact");
  const emailH   = findH(headers, "primary recruiter email", "recruiter email", "email");
  const phoneH   = findH(headers, "recruiter phone", "phone");
  const notesH   = findH(headers, "notes");

  await supabase.from("hospitals").delete().eq("notes", "seed");

  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const name = (r[nameH] ?? "").trim();
    if (!name) { skipped++; continue; }
    const payload: Record<string, unknown> = {
      name,
      city:                    cityH    ? r[cityH].trim()    || null : null,
      country:                 countryH ? r[countryH].trim() || null : null,
      primary_contact_name:    contactH ? r[contactH].trim() || null : null,
      primary_recruiter_email: emailH   ? r[emailH].trim()   || null : null,
      recruiter_phone:         phoneH   ? r[phoneH].trim()   || null : null,
      notes:                   notesH   ? r[notesH].trim()   || null : null,
    };
    const { data: existing } = await supabase.from("hospitals").select("id").eq("name", name).maybeSingle();
    if (existing) { await supabase.from("hospitals").update(payload).eq("id", existing.id); updated++; }
    else          { await supabase.from("hospitals").insert(payload); created++; }
  }
  return { created, updated, skipped };
}

async function syncVacancies(supabase: ReturnType<typeof createClient>, csv: string, openedBy: string | null) {
  // Try the clean flat format first.
  const flat = parseObjects(csv);
  const hospH = findH(flat.headers, "hospital", "hospital name");
  const specH = findH(flat.headers, "specialty", "speciality");
  if (hospH && specH) {
    return syncVacanciesFlat(supabase, flat.headers, flat.rows, hospH, specH, openedBy);
  }

  // ── Tolerant fallback for Ammar's mixed-format sheet ─────────────────
  // Sections look like:
  //   Hospital Name in column A, rest blank          ← section header
  //   Specialty 1                                    ← row under that hospital
  //   Specialty 2
  //   ...
  // OR proper tables under that header:
  //   DEPARTMENT, POSITION, # VAC, QUALIFICATION
  //   INTENSIVE CARE UNIT, CONSULTANT, 1, ...
  // Tracks `lastHospital` across rows. Skips rows that don't yield a
  // (hospital, specialty) pair.

  const grid = parseCsv(csv);
  const { data: allH } = await supabase.from("hospitals").select("id, name");
  const idByName = new Map<string, string>();
  for (const h of (allH ?? []) as Array<{ id: string; name: string }>) {
    idByName.set(h.name.toLowerCase().trim(), h.id);
  }

  // Words that almost certainly mean "this row is a section header, not a
  // specialty row". Avoid false-flagging "Neurology" etc as hospital names.
  const SPECIALTY_HINTS = [
    "consultant", "specialist", "associate", "assistant", "staff physician",
    "neurolog", "oncolog", "pediatric", "cardio", "surgery", "surgeon",
    "anesthe", "psychiatr", "dermatolog", "radiolog", "urolog", "ophthalm",
    "obgyn", "ob/gyn", "ent", "icu", "endocrin", "gastro", "neonatolog",
    "rheumatolog", "nephrolog", "internal medicine", "emergency medicine",
    "plastic", "vascular", "hematolog", "pulmonolog", "imaging", "ivf",
    "family medicine", "fetal", "infectious",
  ];

  const looksLikeSectionHeader = (row: string[]): boolean => {
    // Row where col A is text, cols B-D are blank, and the value doesn't
    // smell like a specialty.
    const a = (row[0] ?? "").trim();
    if (!a) return false;
    const rest = row.slice(1, 4).filter(c => c && c.trim().length > 0);
    if (rest.length > 0) return false;
    const lower = a.toLowerCase();
    if (SPECIALTY_HINTS.some(h => lower.includes(h))) return false;
    return a.length >= 3 && a.length <= 80;
  };

  const looksLikeProperHeader = (row: string[]): { posCol: number; vacCol: number; noteCol: number } | null => {
    // "DEPARTMENT,,POSITION,# VAC,..." style row.
    const lower = row.map(c => (c ?? "").toLowerCase().trim());
    const posCol  = lower.findIndex(c => c === "position" || c === "job title" || c === "title");
    if (posCol === -1) return null;
    const vacCol  = lower.findIndex(c => c === "# vac" || c === "vac" || c === "vacancies" || c === "vacant");
    const noteCol = lower.findIndex(c => c === "remarks" || c.includes("qualification") || c === "notes");
    return { posCol, vacCol, noteCol };
  };

  let lastHospital: string | null = null;
  let properHeader: { posCol: number; vacCol: number; noteCol: number } | null = null;
  let created = 0, skipped = 0;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    if (row.every(c => !c?.trim())) { properHeader = null; continue; }

    // Detect proper table header. Reset previous one.
    const ph = looksLikeProperHeader(row);
    if (ph) { properHeader = ph; continue; }

    // Detect a hospital section header. When this fires, we DON'T also try
    // to insert this row as a vacancy — it's just the section break.
    if (looksLikeSectionHeader(row)) {
      lastHospital = row[0].trim();
      properHeader = null;
      continue;
    }

    // Extract from a row inside a proper table block.
    if (properHeader && lastHospital) {
      const position = (row[properHeader.posCol] ?? "").trim();
      if (!position) { skipped++; continue; }
      const vacCount  = properHeader.vacCol  >= 0 ? Number(row[properHeader.vacCol] ?? "1") || 1 : 1;
      const notes     = properHeader.noteCol >= 0 ? (row[properHeader.noteCol] ?? "").trim() || null : null;
      for (let v = 0; v < Math.min(vacCount, 10); v++) {  // cap at 10 to avoid runaway from typos
        await supabase.from("vacancies").insert({
          hospital_id:   idByName.get(lastHospital.toLowerCase()) ?? null,
          hospital_name: lastHospital,
          specialty:     position,
          priority:      "medium",
          notes,
          opened_by:     openedBy,
        });
        created++;
      }
      continue;
    }

    // No proper-table header active. If we have a hospital context AND col A
    // looks like a specialty, treat the row as a vacancy.
    const a = (row[0] ?? "").trim();
    if (a && lastHospital) {
      const lower = a.toLowerCase();
      const isSpecialty = SPECIALTY_HINTS.some(h => lower.includes(h)) || (a.length > 3 && a.length < 80);
      if (!isSpecialty) { skipped++; continue; }
      await supabase.from("vacancies").insert({
        hospital_id:   idByName.get(lastHospital.toLowerCase()) ?? null,
        hospital_name: lastHospital,
        specialty:     a,
        priority:      "medium",
        notes:         null,
        opened_by:     openedBy,
      });
      created++;
      continue;
    }

    skipped++;
  }

  if (created === 0) {
    throw new Error("Couldn't extract any vacancies. The sheet needs at minimum a Hospital and Specialty column, OR hospital-name section headers followed by specialty rows beneath each.");
  }
  return { created, updated: 0, skipped };
}

async function syncVacanciesFlat(
  supabase: ReturnType<typeof createClient>,
  _headers: string[],
  rows: Record<string, string>[],
  hospH: string,
  specH: string,
  openedBy: string | null,
) {
  const prioH  = findH(_headers, "priority", "pri");
  const daysH  = findH(_headers, "target fill days", "days", "fill days");
  const notesH = findH(_headers, "notes", "requirements", "remarks");

  const { data: allH } = await supabase.from("hospitals").select("id, name");
  const idByName = new Map<string, string>();
  for (const h of (allH ?? []) as Array<{ id: string; name: string }>) idByName.set(h.name.toLowerCase().trim(), h.id);

  let created = 0, skipped = 0;
  for (const r of rows) {
    const name = (r[hospH] ?? "").trim();
    const spec = (r[specH] ?? "").trim();
    if (!name || !spec) { skipped++; continue; }
    const rawPri = (prioH ? r[prioH] : "").trim().toLowerCase();
    const priority = ["high", "medium", "low"].includes(rawPri) ? rawPri : "medium";
    await supabase.from("vacancies").insert({
      hospital_id:      idByName.get(name.toLowerCase()) ?? null,
      hospital_name:    name,
      specialty:        spec,
      priority,
      target_fill_days: daysH && r[daysH] ? Number(r[daysH]) || null : null,
      notes:            notesH ? r[notesH] || null : null,
      opened_by:        openedBy,
    });
    created++;
  }
  return { created, updated: 0, skipped };
}

async function syncUnavailable(supabase: ReturnType<typeof createClient>, csv: string) {
  const { headers, rows } = parseObjects(csv);
  const nameH = findH(headers, "doctor name", "name", "doctor");
  if (!nameH) throw new Error("Unavailable sheet needs a 'Doctor Name' column.");
  const reasonH = findH(headers, "reason", "remarks", "notes");
  const toH     = findH(headers, "available on", "available", "check-in date", "checkin date", "date");
  const idH     = findH(headers, "doctor id", "id");

  // Build Zoho name matcher from cache rows 1+2.
  const { data: cache } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
  const merged: Record<string, unknown> = {};
  for (const r of (cache ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    if (r.data) Object.assign(merged, r.data);
  }
  const leadsArr = (merged.leads as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const dobsArr  = (merged.doctorsOnBoard as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const candidates: { prefixedId: string; name: string }[] = [];
  for (const l of leadsArr) {
    const n = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
    if (n) candidates.push({ prefixedId: `lead:${l.id}`, name: n });
  }
  for (const d of dobsArr) {
    const n = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
    if (n) candidates.push({ prefixedId: `dob:${d.id}`, name: n });
  }
  const match = makeNameMatcher(candidates);

  let created = 0, updated = 0, skipped = 0, unmatched = 0;
  for (const r of rows) {
    const nm = (r[nameH] ?? "").trim();
    if (!nm) { skipped++; continue; }
    let pid = idH ? (r[idH] ?? "").trim() : "";
    if (!pid) {
      const m = match(nm);
      if (!m) { unmatched++; skipped++; continue; }
      pid = m;
    }
    const reasonRaw = reasonH ? (r[reasonH] ?? "").trim() : "";
    const availRaw  = toH     ? (r[toH] ?? "").trim()     : "";
    const checkIn   = parseFuzzyDate(availRaw);
    const reason = [reasonRaw || null, (!checkIn && availRaw) ? `Status: ${availRaw}` : null].filter(Boolean).join(" · ") || null;
    const payload = {
      doctor_id:              pid,
      doctor_name:            nm.replace(/^(dr\.?\s+|prof\.?\s+)/i, ""),
      unavailable:            true,
      unavailable_reason:     reason,
      available_check_in_at:  checkIn,
      eligible_for_sending:   false,
      updated_at:             new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("doctor_lifecycle").select("doctor_id").eq("doctor_id", pid).maybeSingle();
    if (existing) { await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", pid); updated++; }
    else          { await supabase.from("doctor_lifecycle").insert(payload); created++; }
  }
  return { created, updated, skipped, unmatched };
}

async function syncPlacements(supabase: ReturnType<typeof createClient>, csv: string) {
  // Ammar's Placement Platform sheet has DOZENS of mini-tables stacked in one
  // file — each starting with a header row containing "Hospital" + "Doctors".
  // First try the simple flat-table format (Doctor ID/Name + signed/joined
  // columns) for nice clean exports. If that doesn't fit, fall back to the
  // multi-table format.

  // ── Path A: clean flat table ───────────────────────────────────────────
  const flat = parseObjects(csv);
  const flatIdH   = findH(flat.headers, "doctor id", "id");
  const flatNameH = findH(flat.headers, "doctor name", "name");
  const flatSigned = findH(flat.headers, "signed at", "signed date");
  if (flatIdH && flatNameH && flatSigned) {
    return syncPlacementsFlat(supabase, flat.headers, flat.rows);
  }

  // ── Path B: Ammar's nested mini-table format ───────────────────────────
  const grid = parseCsv(csv);

  // Build name matcher once.
  const { data: cache } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
  const merged: Record<string, unknown> = {};
  for (const r of (cache ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    if (r.data) Object.assign(merged, r.data);
  }
  const leadsArr = (merged.leads as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const dobsArr  = (merged.doctorsOnBoard as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const cands: { prefixedId: string; name: string }[] = [];
  for (const l of leadsArr) {
    const n = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
    if (n) cands.push({ prefixedId: `lead:${l.id}`, name: n });
  }
  for (const d of dobsArr) {
    const n = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
    if (n) cands.push({ prefixedId: `dob:${d.id}`, name: n });
  }
  const matcher = makeNameMatcher(cands);

  // Walk the grid looking for header rows. A header row has "Hospital" in
  // some column AND "Doctor" / "Candidates" in the next column. The block's
  // data rows run until an empty row, the next header, or a row whose first
  // cell is a totals-style summary (no number index, just blank).
  type HeaderMap = {
    hospitalIdx:    number;
    doctorIdx:      number;
    specialtyIdx:   number;
    shortlistedIdx: number;
    interviewIdx:   number;
    offeredIdx:     number;
    signedIdx:      number;
    startJobIdx:    number;
    joinedIdx:      number;
  };
  const detectHeader = (row: string[]): HeaderMap | null => {
    const lower = row.map(c => c.toLowerCase().trim());
    const hospitalIdx = lower.findIndex(c => c === "hospital");
    if (hospitalIdx === -1) return null;
    const doctorIdx = lower.findIndex(c => c === "doctors / candidates" || c === "doctors" || c === "doctor" || c === "doctor name" || c === "candidates");
    if (doctorIdx === -1) return null;
    return {
      hospitalIdx,
      doctorIdx,
      specialtyIdx:   lower.findIndex(c => c === "specialty" || c === "speciality"),
      shortlistedIdx: lower.findIndex(c => c === "shortlisted"),
      interviewIdx:   lower.findIndex(c => c === "interview" || c === "interviews"),
      offeredIdx:     lower.findIndex(c => c === "offered" || c === "offer"),
      signedIdx:      lower.findIndex(c => c === "signed"),
      startJobIdx:    lower.findIndex(c => c === "start job date" || c === "start job" || c === "joining date" || c === "start date"),
      joinedIdx:      lower.findIndex(c => c === "joined"),
    };
  };
  const toISO = (raw: string | undefined) => {
    const s = (raw ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  let created = 0, updated = 0, skipped = 0, unmatched = 0;
  let i = 0;
  while (i < grid.length) {
    const map = detectHeader(grid[i]);
    if (!map) { i++; continue; }

    // Walk forward through the block's data rows.
    let j = i + 1;
    while (j < grid.length) {
      const row = grid[j];
      if (row.every(c => !c?.trim())) break;                      // blank row → block done
      if (detectHeader(row)) break;                                // next block header
      // Totals row from Ammar's sheet: first cell empty (no row #), but
      // numbers in the date columns. Detect by: no doctor name AND no
      // hospital name.
      const doctor   = (row[map.doctorIdx]   ?? "").trim();
      const hospital = (row[map.hospitalIdx] ?? "").trim();
      if (!doctor && !hospital) { j++; continue; }

      if (!doctor) { skipped++; j++; continue; }
      const cleanName = doctor.replace(/^(dr\.?\s+|prof\.?\s+)/i, "").trim();
      const matched = matcher(cleanName);
      if (!matched) { unmatched++; skipped++; j++; continue; }

      const signed   = map.signedIdx   >= 0 ? toISO(row[map.signedIdx])   : null;
      const startJob = map.startJobIdx >= 0 ? toISO(row[map.startJobIdx]) : null;
      const joined   = map.joinedIdx   >= 0 ? toISO(row[map.joinedIdx])   : null;
      // "Joined" wins over "Start job date" — both fold into joined_at.
      const joinedAt = joined ?? startJob;

      // Only touch lifecycle if we actually have a milestone to record.
      // Listing a row with just a Shortlisted date doesn't mark them
      // signed/joined yet — that's still in-flight pipeline.
      if (!signed && !joinedAt) { skipped++; j++; continue; }

      const { data: existing } = await supabase
        .from("doctor_lifecycle").select("doctor_id, signed_at, joined_at").eq("doctor_id", matched).maybeSingle();
      const payload: Record<string, unknown> = {
        doctor_id:   matched,
        doctor_name: cleanName,
        updated_at:  new Date().toISOString(),
      };
      // Don't overwrite an existing signed_at with null (later blocks for the
      // same doctor might not repeat that column).
      if (signed)   payload.signed_at = signed;
      if (joinedAt) payload.joined_at = joinedAt;
      if (signed && !existing?.signed_at) payload.eligible_for_sending = false;

      if (existing) {
        await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", matched);
        updated++;
      } else {
        await supabase.from("doctor_lifecycle").insert(payload);
        created++;
      }
      j++;
    }
    i = j + 1;
  }

  if (created === 0 && updated === 0 && unmatched === 0) {
    throw new Error("Couldn't find any usable 'Hospital | Doctors / candidates' header rows. Reshape the sheet so each table has those column headers, or use the flat-table format (Doctor ID, Doctor Name, Signed At, Joined At).");
  }

  return { created, updated, skipped, unmatched };
}

// Flat-table fallback (Doctor ID, Doctor Name, Signed At, Joined At, ...).
async function syncPlacementsFlat(
  supabase: ReturnType<typeof createClient>,
  headers: string[],
  rows: Record<string, string>[],
) {
  const idH   = findH(headers, "doctor id", "id")!;
  const nameH = findH(headers, "doctor name", "name")!;
  const signedH   = findH(headers, "signed at", "signed", "signed date");
  const joinedH   = findH(headers, "joined at", "joined", "joining date", "joined date");
  const approvedH = findH(headers, "approved at", "approved", "approved date");
  const paidH     = findH(headers, "paid at", "paid", "paid date", "payment date");
  const toISO = (raw: string) => {
    const s = raw?.trim(); if (!s) return null;
    const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const id = (r[idH] ?? "").trim();
    const nm = (r[nameH] ?? "").trim();
    if (!id || !nm) { skipped++; continue; }
    const signed   = signedH   ? toISO(r[signedH])   : null;
    const joined   = joinedH   ? toISO(r[joinedH])   : null;
    const approved = approvedH ? toISO(r[approvedH]) : null;
    const paid     = paidH     ? toISO(r[paidH])     : null;
    const payload = {
      doctor_id:    id,
      doctor_name:  nm.replace(/^(dr\.?\s+|prof\.?\s+)/i, ""),
      signed_at:    signed,
      joined_at:    joined,
      approved_at:  approved,
      paid_at:      paid,
      eligible_for_sending: !signed,
      updated_at:   new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("doctor_lifecycle").select("doctor_id").eq("doctor_id", id).maybeSingle();
    if (existing) { await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", id); updated++; }
    else          { await supabase.from("doctor_lifecycle").insert(payload); created++; }
  }
  return { created, updated, skipped, unmatched: 0 };
}

async function syncSourceOverrides(supabase: ReturnType<typeof createClient>, csv: string, createdBy: string | null) {
  const { headers, rows } = parseObjects(csv);
  const idH     = findH(headers, "lead id", "id");
  const sourceH = findH(headers, "override source", "source", "channel");
  if (!idH || !sourceH) throw new Error("Source-override sheet needs 'Lead ID' and 'Override Source' columns.");
  const noteH = findH(headers, "note", "notes");

  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const id  = (r[idH] ?? "").trim();
    const src = (r[sourceH] ?? "").trim();
    if (!id || !src) { skipped++; continue; }
    const payload = {
      lead_id:         id,
      override_source: src,
      note:            noteH ? (r[noteH] ?? "").trim() || null : null,
      created_by:      createdBy,
      updated_at:      new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("lead_source_overrides").select("lead_id").eq("lead_id", id).maybeSingle();
    if (existing) { await supabase.from("lead_source_overrides").update(payload).eq("lead_id", id); updated++; }
    else          { await supabase.from("lead_source_overrides").insert(payload); created++; }
  }
  return { created, updated, skipped };
}

async function syncHospitalTemplates(supabase: ReturnType<typeof createClient>, csv: string) {
  const { headers, rows } = parseObjects(csv);
  const hospH    = findH(headers, "hospital", "hospital name", "name");
  const subjectH = findH(headers, "subject");
  const bodyH    = findH(headers, "body", "body text", "html");
  if (!hospH || !subjectH || !bodyH) throw new Error("Hospital-template sheet needs 'Hospital', 'Subject', 'Body' columns.");

  const { data: allH } = await supabase.from("hospitals").select("id, name");
  const byName = new Map<string, { id: string; name: string }>();
  for (const h of (allH ?? []) as Array<{ id: string; name: string }>) byName.set(h.name.toLowerCase().trim(), h);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  const simpleHtml = (plain: string) => {
    const e = plain.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paragraphs = e.split(/\n{2,}/).map(p => p.replace(/\n/g, "<br>")).map(p => `<p style=\"margin:0 0 14px;line-height:1.6;\">${p}</p>`).join("");
    return `<!DOCTYPE html><html><body><div style=\"font-family:-apple-system,sans-serif;padding:24px;\">${paragraphs}</div></body></html>`;
  };

  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const hName = (r[hospH] ?? "").trim();
    const subj  = (r[subjectH] ?? "").trim();
    const body  = (r[bodyH] ?? "").replace(/\\n/g, "\n").trim();
    if (!hName || !subj || !body) { skipped++; continue; }
    const hosp = byName.get(hName.toLowerCase());
    if (!hosp) { skipped++; continue; }
    const slug = slugify(hosp.name);
    const key  = `profile_sent_${slug}`;
    const payload = {
      key,
      name:      `Profile Sent · ${hosp.name}`,
      flow_key:  "profile_sent",
      subject:   subj,
      body_text: body,
      body_html: simpleHtml(body),
      variables: ["doctor_name", "doctor_speciality", "hospital_contact_name", "city", "country"],
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("email_templates").select("key").eq("key", key).maybeSingle();
    if (existing) { await supabase.from("email_templates").update(payload).eq("key", key); updated++; }
    else          { await supabase.from("email_templates").insert(payload); created++; }
    await supabase.from("hospitals").update({ template_key: key }).eq("id", hosp.id);
  }
  return { created, updated, skipped };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeNameMatcher(candidates: { prefixedId: string; name: string }[]): (raw: string) => string | null {
  const norm = (s: string) => (s ?? "")
    .replace(/Ã /g, "a").replace(/Ã©/g, "e").replace(/Ã¶/g, "o")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?)\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const tokenise = (s: string) => norm(s).split(" ").filter(t => t.length >= 2);

  const indexed = candidates.map(c => ({
    pid: c.prefixedId,
    name: c.name,
    n: norm(c.name),
    t: new Set(tokenise(c.name)),
  }));
  const byExact = new Map<string, string>();
  for (const c of indexed) if (!byExact.has(c.n)) byExact.set(c.n, c.pid);

  return (raw: string): string | null => {
    const nn = norm(raw);
    if (!nn) return null;
    if (byExact.has(nn)) return byExact.get(nn)!;
    const inT = tokenise(raw);
    if (inT.length === 0) return null;
    for (const c of indexed) if (inT.every(t => c.t.has(t))) return c.pid;
    for (const c of indexed) if (c.t.size > 0 && Array.from(c.t).every(t => inT.includes(t))) return c.pid;
    return null;
  };
}

function parseFuzzyDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d/.test(s) && /\d{4}/.test(s)) return d.toISOString();
  const m = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})$/i);
  if (m) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 } as const;
    const key = m[1].toLowerCase().slice(0, 4) as keyof typeof months;
    const yr  = Number(m[2]);
    if (months[key] !== undefined && Number.isFinite(yr)) return new Date(yr, months[key], 1).toISOString();
  }
  return null;
}

/** Lightweight preview: counts how many actionable rows a parser would find
 *  WITHOUT writing anything. Used by the Connections create dialog so the
 *  user can sanity-check before they commit. */
async function previewCount(
  _supabase: ReturnType<typeof createClient>,
  csv: string,
  kind: string,
): Promise<{ rows: number; sample: string[] }> {
  const { headers, rows } = parseObjects(csv);
  let count = 0;
  const sample: string[] = [];

  if (kind === "hospitals") {
    const h = findH(headers, "name", "hospital", "hospital name");
    if (h) for (const r of rows) {
      const v = (r[h] ?? "").trim();
      if (v) { count++; if (sample.length < 3) sample.push(v); }
    }
  } else if (kind === "unavailable_doctors" || kind === "placements") {
    const nameH = findH(headers, "doctor name", "name", "doctor", "doctors", "doctors / candidates", "candidates");
    if (nameH) for (const r of rows) {
      const v = (r[nameH] ?? "").trim();
      if (v) { count++; if (sample.length < 3) sample.push(v); }
    }
    // Placements may be the nested format — count "Hospital" + "Doctor" rows.
    if (count === 0 && kind === "placements") {
      const grid = parseCsv(csv);
      for (const row of grid) {
        const lower = row.map(c => c.toLowerCase().trim());
        const idx = lower.findIndex(c => c === "hospital");
        if (idx === -1) continue;
        const doctorIdx = lower.findIndex(c => c.startsWith("doctor"));
        if (doctorIdx === -1) continue;
        count++;  // count header rows as a proxy
      }
      sample.push(`${count} mini-table${count === 1 ? "" : "s"} detected`);
      count = count > 0 ? Math.max(1, count * 5) : 0;
    }
  } else if (kind === "vacancies") {
    const hospH = findH(headers, "hospital", "hospital name");
    const specH = findH(headers, "specialty", "speciality");
    if (hospH && specH) {
      for (const r of rows) {
        if ((r[hospH] ?? "").trim() && (r[specH] ?? "").trim()) {
          count++;
          if (sample.length < 3) sample.push(`${r[hospH]} · ${r[specH]}`);
        }
      }
    } else {
      // Tolerant fallback — count specialty-like rows under section headers.
      const grid = parseCsv(csv);
      let lastHospital: string | null = null;
      for (const row of grid) {
        const a = (row[0] ?? "").trim();
        if (!a) continue;
        const restEmpty = row.slice(1, 4).every(c => !c?.trim());
        if (restEmpty && a.length >= 3 && a.length <= 80) {
          lastHospital = a;
          continue;
        }
        if (lastHospital) { count++; if (sample.length < 3) sample.push(`${lastHospital} · ${a}`); }
      }
    }
  } else if (kind === "source_overrides") {
    const idH = findH(headers, "lead id", "id");
    if (idH) for (const r of rows) {
      const v = (r[idH] ?? "").trim();
      if (v) { count++; if (sample.length < 3) sample.push(v); }
    }
  } else if (kind === "hospital_templates") {
    const hospH = findH(headers, "hospital", "hospital name", "name");
    if (hospH) for (const r of rows) {
      const v = (r[hospH] ?? "").trim();
      if (v) { count++; if (sample.length < 3) sample.push(v); }
    }
  } else if (kind === "custom_table") {
    // Without a chosen table we can't say much — just count non-empty rows
    // and surface a few sheet headers so the user can sanity-check format.
    count = rows.filter(r => Object.values(r).some(v => v && v.trim())).length;
    sample.push(`Headers detected: ${headers.slice(0, 6).join(", ")}${headers.length > 6 ? "…" : ""}`);
  }

  return { rows: count, sample };
}

// ── Custom-table parser (Pull-any-sheet-into-any-table mode) ──────────────
// Allowlist + per-table column types. Must stay in sync with the frontend's
// src/lib/importable-tables.ts. Adding a table requires entries in BOTH.
type ColType = "text" | "number" | "integer" | "date" | "datetime" | "boolean" | "uuid" | "jsonb";
interface CustomCol { name: string; type: ColType; managed?: boolean }
interface CustomTbl { name: string; keyColumn: string; columns: CustomCol[] }

const CUSTOM_TABLES: Record<string, CustomTbl> = {
  marketing_expenses: {
    name: "marketing_expenses", keyColumn: "id",
    columns: [
      { name: "id", type: "uuid", managed: true },
      { name: "category", type: "text" },
      { name: "subcategory", type: "text" },
      { name: "vendor", type: "text" },
      { name: "amount", type: "number" },
      { name: "currency", type: "text" },
      { name: "expense_date", type: "date" },
      { name: "notes", type: "text" },
      { name: "created_at", type: "datetime", managed: true },
    ],
  },
  meta_leads: {
    name: "meta_leads", keyColumn: "lead_id",
    columns: [
      { name: "lead_id", type: "text" },
      { name: "form_id", type: "text" },
      { name: "ad_id", type: "text" },
      { name: "ad_name", type: "text" },
      { name: "adset_id", type: "text" },
      { name: "adset_name", type: "text" },
      { name: "campaign_id", type: "text" },
      { name: "campaign_name", type: "text" },
      { name: "platform", type: "text" },
      { name: "full_name", type: "text" },
      { name: "email", type: "text" },
      { name: "phone", type: "text" },
      { name: "specialty", type: "text" },
      { name: "country", type: "text" },
      { name: "created_time", type: "datetime" },
      { name: "raw", type: "jsonb", managed: true },
    ],
  },
  vacancies: {
    name: "vacancies", keyColumn: "id",
    columns: [
      { name: "id", type: "uuid", managed: true },
      { name: "hospital_id", type: "uuid" },
      { name: "hospital_name", type: "text" },
      { name: "specialty", type: "text" },
      { name: "priority", type: "text" },
      { name: "target_fill_days", type: "integer" },
      { name: "status", type: "text" },
      { name: "notes", type: "text" },
      { name: "opened_by", type: "text" },
      { name: "opened_at", type: "datetime", managed: true },
    ],
  },
  hospitals: {
    name: "hospitals", keyColumn: "name",
    columns: [
      { name: "id", type: "uuid", managed: true },
      { name: "name", type: "text" },
      { name: "city", type: "text" },
      { name: "country", type: "text" },
      { name: "primary_contact_name", type: "text" },
      { name: "primary_recruiter_email", type: "text" },
      { name: "recruiter_phone", type: "text" },
      { name: "template_key", type: "text" },
      { name: "notes", type: "text" },
      { name: "health_score", type: "integer" },
    ],
  },
  doctor_lifecycle: {
    name: "doctor_lifecycle", keyColumn: "doctor_id",
    columns: [
      { name: "doctor_id", type: "text" },
      { name: "doctor_name", type: "text" },
      { name: "signed_at", type: "datetime" },
      { name: "joined_at", type: "datetime" },
      { name: "approved_at", type: "datetime" },
      { name: "paid_at", type: "datetime" },
      { name: "eligible_for_sending", type: "boolean" },
      { name: "unavailable", type: "boolean" },
      { name: "unavailable_reason", type: "text" },
      { name: "available_check_in_at", type: "datetime" },
      { name: "notes", type: "text" },
    ],
  },
  lead_source_overrides: {
    name: "lead_source_overrides", keyColumn: "lead_id",
    columns: [
      { name: "lead_id", type: "text" },
      { name: "override_source", type: "text" },
      { name: "note", type: "text" },
    ],
  },
};

async function syncCustomTable(
  supabase: ReturnType<typeof createClient>,
  csv: string,
  conn: { target_table: string | null; key_column: string | null; column_map: Record<string, string> | null },
): Promise<{ created: number; updated: number; skipped: number; unmatched?: number }> {
  if (!conn.target_table) throw new Error("Connection is in custom_table mode but target_table is null.");
  const tbl = CUSTOM_TABLES[conn.target_table];
  if (!tbl) throw new Error(`Table "${conn.target_table}" is not in the importable allowlist.`);
  const key = conn.key_column || tbl.keyColumn;
  const keyCol = tbl.columns.find(c => c.name === key);
  if (!keyCol) throw new Error(`Key column "${key}" not present in ${tbl.name}.`);
  const map = (conn.column_map ?? {}) as Record<string, string>;
  if (Object.keys(map).length === 0) {
    throw new Error("Column map is empty. Re-create the connection so headers can be auto-matched.");
  }

  const { headers, rows } = parseObjects(csv);
  // Sanity: every mapped column must exist on the table.
  for (const targetCol of Object.values(map)) {
    if (!tbl.columns.find(c => c.name === targetCol)) {
      throw new Error(`Mapping references column "${targetCol}" which doesn't exist on ${tbl.name}.`);
    }
  }

  let created = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const payload: Record<string, unknown> = {};
    for (const header of headers) {
      const target = map[header];
      if (!target) continue;
      const col = tbl.columns.find(c => c.name === target)!;
      if (col.managed) continue;
      const raw = (row[header] ?? "").trim();
      const coerced = coerceValue(raw, col.type);
      if (coerced !== undefined) payload[target] = coerced;
    }
    if (Object.keys(payload).length === 0) { skipped++; continue; }
    const keyValRaw = (row[Object.keys(map).find(h => map[h] === key) ?? ""] ?? "").trim();
    const keyVal = coerceValue(keyValRaw, keyCol.type);
    if (keyCol.managed || keyVal === undefined || keyVal === null) {
      // No key value → straight insert. Lets users import "id" managed by
      // the DB (default uuid) without supplying it in the sheet.
      const { error } = await supabase.from(tbl.name).insert(payload);
      if (error) { console.error(error.message); skipped++; continue; }
      created++;
      continue;
    }
    const { data: existing } = await supabase
      .from(tbl.name)
      .select(`${key}`)
      .eq(key, keyVal)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from(tbl.name).update(payload).eq(key, keyVal);
      if (error) { console.error(error.message); skipped++; continue; }
      updated++;
    } else {
      // Make sure the key value is on the payload for inserts.
      if (payload[key] === undefined) payload[key] = keyVal;
      const { error } = await supabase.from(tbl.name).insert(payload);
      if (error) { console.error(error.message); skipped++; continue; }
      created++;
    }
  }
  return { created, updated, skipped };
}

function coerceValue(raw: string, type: ColType): unknown | undefined {
  if (raw === "" || raw == null) return null;
  switch (type) {
    case "text":
    case "uuid":
      return raw;
    case "number":
    case "integer": {
      const cleaned = raw.replace(/[$AED,\s]/gi, "");
      const n = type === "integer" ? parseInt(cleaned, 10) : parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      const l = raw.toLowerCase();
      if (["true", "yes", "y", "1"].includes(l))  return true;
      if (["false", "no", "n", "0"].includes(l)) return false;
      return null;
    }
    case "date":
    case "datetime": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case "jsonb":
      try { return JSON.parse(raw); }
      catch { return null; }
  }
  return undefined;
}

// ── OAuth (user-account) access ────────────────────────────────────────────
// Uses the refresh token in google_oauth_tokens to mint short-lived access
// tokens. Handles both native Google Sheets (via Sheets API) and uploaded
// .xlsx files (via Drive download → SheetJS parse → CSV).

async function fetchViaOAuth(
  supabase: ReturnType<typeof createClient>,
  fileId: string,
  gid: string | null,
): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth client isn't configured. Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET on this Edge Function.");
  }
  const accessToken = await getOAuthAccessToken(supabase);

  // First: ask Drive what kind of file it is.
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    const t = await metaRes.text();
    throw new Error(`Drive metadata ${metaRes.status}: ${t.slice(0, 200)}. Make sure the connected Google account has access to file ${fileId}.`);
  }
  const meta = await metaRes.json() as { id: string; name: string; mimeType: string };

  if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
    // Native Google Sheet — use Sheets API to extract the right tab.
    return await fetchGoogleSheetViaApi(accessToken, fileId, gid);
  }

  // Excel / xlsx / xls / numbers / etc — download bytes and parse.
  const buf = await downloadDriveFile(accessToken, fileId);
  return xlsxBytesToCsv(buf, gid);
}

async function getOAuthAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  // Read the singleton row.
  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, access_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Loading google_oauth_tokens failed: ${error.message}`);
  if (!row?.refresh_token) {
    throw new Error("No Google account connected yet. Click 'Connect Google' on /connections.");
  }
  // Reuse the cached access token if it's not about to expire.
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 60_000) {
    return row.access_token;
  }
  // Refresh.
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh-token exchange ${res.status}: ${t.slice(0, 200)}. Try disconnecting + reconnecting on /connections.`);
  }
  const tok = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await supabase.from("google_oauth_tokens").update({
    access_token: tok.access_token,
    expires_at:   expiresAt,
    updated_at:   new Date().toISOString(),
  }).eq("id", 1);
  return tok.access_token;
}

async function fetchGoogleSheetViaApi(accessToken: string, sheetId: string, gid: string | null): Promise<string> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    const t = await metaRes.text();
    throw new Error(`Sheets API meta ${metaRes.status}: ${t.slice(0, 300)}`);
  }
  const meta = await metaRes.json() as { sheets: Array<{ properties: { sheetId: number; title: string } }> };
  const wantGid = gid ? Number(gid) : null;
  const target  = wantGid != null ? meta.sheets.find(s => s.properties.sheetId === wantGid) : meta.sheets[0];
  if (!target) throw new Error(`Tab gid=${gid} not found in spreadsheet`);
  const range = `${target.properties.title}!A1:Z2000`;
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!valRes.ok) {
    const t = await valRes.text();
    throw new Error(`Sheets API values ${valRes.status}: ${t.slice(0, 300)}`);
  }
  const json = await valRes.json() as { values?: string[][] };
  return gridToCsv(json.values ?? []);
}

async function downloadDriveFile(accessToken: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive download ${res.status}: ${t.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Read an xlsx (or xls / ods / numbers) file's bytes, pick the right sheet
 *  by gid, and serialise that sheet as CSV so the existing parsers work
 *  unchanged. gid in Drive land doesn't apply here, so we just index by
 *  sheet position when gid is numeric, otherwise take the first sheet. */
function xlsxBytesToCsv(bytes: Uint8Array, gid: string | null): string {
  const wb = XLSX.read(bytes, { type: "array" });
  let sheetName = wb.SheetNames[0];
  if (gid != null) {
    const idx = Number(gid);
    if (Number.isFinite(idx) && wb.SheetNames[idx]) sheetName = wb.SheetNames[idx];
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in workbook`);
  return XLSX.utils.sheet_to_csv(sheet, { strip: false, blankrows: false });
}

function gridToCsv(grid: string[][]): string {
  return grid.map(row =>
    row.map(cell => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
}

// ── Google service-account access ──────────────────────────────────────────
// Cache the access token in module scope. Lifetimes are ~1 hour. Re-using
// across ticks saves an OAuth roundtrip per sync.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - now > 60_000) {
    return cachedAccessToken.token;
  }

  // Build a JWT signed with the SA's private key.
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const claim = {
    iss:   GOOGLE_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const signature = await signRS256(unsigned, GOOGLE_SA_PRIVATE_KEY);
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google OAuth ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token:     data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function fetchSheetViaApi(sheetId: string, gid: string | null): Promise<string> {
  const token = await getGoogleAccessToken();

  // First: look up the sheet's NAME for the given gid (the API needs a name
  // like "Sheet1!A:Z", not a gid). gid=null → first sheet.
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties`,
    { headers: { "Authorization": `Bearer ${token}` } },
  );
  if (!metaRes.ok) {
    const t = await metaRes.text();
    throw new Error(`Sheets API meta ${metaRes.status}: ${t.slice(0, 300)}`);
  }
  const meta = await metaRes.json() as { sheets: Array<{ properties: { sheetId: number; title: string } }> };
  const wantGid = gid ? Number(gid) : null;
  const targetSheet = wantGid != null
    ? meta.sheets.find(s => s.properties.sheetId === wantGid)
    : meta.sheets[0];
  if (!targetSheet) throw new Error(`Tab gid=${gid} not found in spreadsheet`);
  const range = `${targetSheet.properties.title}!A1:Z2000`;

  // Then: fetch values for that range.
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { "Authorization": `Bearer ${token}` } },
  );
  if (!valRes.ok) {
    const t = await valRes.text();
    throw new Error(`Sheets API values ${valRes.status}: ${t.slice(0, 300)}`);
  }
  const valJson = await valRes.json() as { values?: string[][] };
  const grid = valJson.values ?? [];

  // Serialise back to CSV so the existing parsers can chew on it unchanged.
  return grid.map(row =>
    row.map(cell => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
}

async function signRS256(message: string, pem: string): Promise<string> {
  // Convert PEM → ArrayBuffer.
  const cleaned = pem
    .replace(/\\n/g, "\n")                  // tolerate escaped newlines from env var pasting
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

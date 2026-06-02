/**
 * One-shot bulk import of the three sheets Ammar sent on 2026-05-23, for
 * the Wednesday demo. Runs locally; talks to the live Supabase via the
 * service-role key (so it bypasses RLS).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="..."  bun run scripts/bulk-import-ammar.ts
 *   (or `npx tsx scripts/bulk-import-ammar.ts`)
 *
 * Grab the service-role key from Supabase dashboard:
 *   Settings → API → "service_role" secret. Treat it like a password.
 *
 * What it does:
 *   1. Unavailable doctors  → doctor_lifecycle  (unavailable=true, with
 *                              check-in dates; fuzzy-matches names to Zoho
 *                              leads + DOB, falls back to synthetic
 *                              `placement:<slug>` IDs for unmatched names).
 *   2. Historical placements → doctor_lifecycle  (signed_at / joined_at
 *                              milestones from the multi-table sheet).
 *   3. Hospitals (from sheets) → no-op for demo; you can wire that later.
 *
 * Idempotent — re-running won't duplicate rows. Doctors are keyed on
 * doctor_id; collisions update milestones rather than insert again.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://elfkqmbwuspjaoorqggq.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  console.error("Grab it from Supabase dashboard → Settings → API → service_role secret.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── CSV parsing ─────────────────────────────────────────────────────────────
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

// ── Name matcher (mirrors src/lib/doctor-name-matcher.ts) ──────────────────
function makeNameMatcher(candidates: { id: string; name: string }[]) {
  const norm = (s: string) => (s ?? "")
    .replace(/Ã /g, "a").replace(/Ã©/g, "e").replace(/Ã¶/g, "o").replace(/Ã±/g, "n")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?)\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const tokenise = (s: string) => norm(s).split(" ").filter(t => t.length >= 2);

  const indexed = candidates.map(c => ({ ...c, n: norm(c.name), t: new Set(tokenise(c.name)) }));
  const byExact = new Map<string, string>();
  for (const c of indexed) if (!byExact.has(c.n)) byExact.set(c.n, c.id);

  return (raw: string): string | null => {
    const nn = norm(raw);
    if (!nn) return null;
    if (byExact.has(nn)) return byExact.get(nn)!;
    const inT = tokenise(raw);
    if (inT.length === 0) return null;
    for (const c of indexed) if (inT.every(t => c.t.has(t))) return c.id;
    for (const c of indexed) if (c.t.size > 0 && Array.from(c.t).every(t => inT.includes(t))) return c.id;
    return null;
  };
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "unknown";
}

function parseFuzzyDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d/.test(s) && /\d{4}/.test(s)) return d.toISOString();
  const m = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})$/i);
  if (m) {
    const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
    const key = m[1].toLowerCase().slice(0, 4);
    if (key in months) return new Date(Number(m[2]), months[key], 1).toISOString();
  }
  return null;
}

// ── Zoho cache loader ───────────────────────────────────────────────────────
async function buildZohoMatcher() {
  const { data } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
  const merged: Record<string, unknown> = {};
  for (const r of (data ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    if (r.data) Object.assign(merged, r.data);
  }
  const leadsArr = (merged.leads as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const dobsArr  = (merged.doctorsOnBoard as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
  const candidates: { id: string; name: string }[] = [];
  for (const l of leadsArr) {
    const n = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
    if (n) candidates.push({ id: `lead:${l.id}`, name: n });
  }
  for (const d of dobsArr) {
    const n = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
    if (n) candidates.push({ id: `dob:${d.id}`, name: n });
  }
  console.log(`Loaded ${candidates.length} Zoho candidates for fuzzy name matching`);
  return { match: makeNameMatcher(candidates), totalCandidates: candidates.length };
}

// ── Importer 1: Unavailable doctors ────────────────────────────────────────
async function importUnavailable(matcher: ReturnType<typeof makeNameMatcher>) {
  const csv = readFileSync(resolve("scripts/data/unavailable-doctors.csv"), "utf-8");
  const { rows } = parseObjects(csv);
  let created = 0, updated = 0, matched = 0, unmatched = 0, skipped = 0;
  const unmatchedNames: string[] = [];

  for (const r of rows) {
    const name = (r["Doctor name"] ?? "").trim();
    if (!name) { skipped++; continue; }
    const cleanName = name.replace(/^(dr\.?\s+|prof\.?\s+)/i, "").trim();
    let id = matcher(cleanName);
    if (id) matched++;
    else { unmatched++; unmatchedNames.push(name); id = `placement:${slugify(cleanName)}`; }

    const availRaw = (r["Available on"] ?? "").trim();
    const reason = !parseFuzzyDate(availRaw) && availRaw ? `Status: ${availRaw}` : null;
    const checkIn = parseFuzzyDate(availRaw);

    const payload = {
      doctor_id:              id,
      doctor_name:            cleanName,
      unavailable:            true,
      unavailable_reason:     reason,
      available_check_in_at:  checkIn,
      eligible_for_sending:   false,
      updated_at:             new Date().toISOString(),
    };
    const { data: existing } = await supabase.from("doctor_lifecycle").select("doctor_id").eq("doctor_id", id).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", id);
      if (error) { console.error("update fail:", error.message); skipped++; continue; }
      updated++;
    } else {
      const { error } = await supabase.from("doctor_lifecycle").insert(payload);
      if (error) { console.error("insert fail:", error.message); skipped++; continue; }
      created++;
    }
  }
  console.log(`\n── Unavailable doctors ───────────────────────────────────────`);
  console.log(`Created: ${created}  Updated: ${updated}  Skipped: ${skipped}`);
  console.log(`Zoho-matched: ${matched}  Unmatched (synthetic ID): ${unmatched}`);
  if (unmatched > 0) {
    console.log(`First few unmatched: ${unmatchedNames.slice(0, 5).join(", ")}`);
  }
}

// ── Importer 2: Historical placements ──────────────────────────────────────
async function importPlacements(matcher: ReturnType<typeof makeNameMatcher>) {
  const csv = readFileSync(resolve("scripts/data/placements.csv"), "utf-8");
  const grid = parseCsv(csv);

  interface HeaderMap {
    hospitalIdx:  number; doctorIdx:    number; specialtyIdx: number;
    signedIdx:    number; startJobIdx:  number; joinedIdx:    number;
  }
  const detectHeader = (row: string[]): HeaderMap | null => {
    const lower = row.map(c => c.toLowerCase().trim());
    const hospitalIdx = lower.findIndex(c => c === "hospital");
    if (hospitalIdx === -1) return null;
    const doctorIdx = lower.findIndex(c => c === "doctors / candidates" || c === "doctors" || c === "doctor name");
    if (doctorIdx === -1) return null;
    return {
      hospitalIdx, doctorIdx,
      specialtyIdx: lower.findIndex(c => c === "specialty" || c === "speciality"),
      signedIdx:    lower.findIndex(c => c === "signed"),
      startJobIdx:  lower.findIndex(c => c === "start job date" || c === "start job" || c === "joining date"),
      joinedIdx:    lower.findIndex(c => c === "joined"),
    };
  };

  let created = 0, updated = 0, matched = 0, unmatched = 0, skipped = 0;
  let i = 0;
  while (i < grid.length) {
    const map = detectHeader(grid[i]);
    if (!map) { i++; continue; }
    let j = i + 1;
    while (j < grid.length) {
      const row = grid[j];
      if (row.every(c => !c?.trim())) break;
      if (detectHeader(row)) break;
      const doctor   = (row[map.doctorIdx]   ?? "").trim();
      const hospital = (row[map.hospitalIdx] ?? "").trim();
      if (!doctor && !hospital) { j++; continue; }
      if (!doctor) { skipped++; j++; continue; }

      const cleanName = doctor.replace(/^(dr\.?\s+|prof\.?\s+)/i, "").trim();
      let id = matcher(cleanName);
      if (id) matched++;
      else { unmatched++; id = `placement:${slugify(cleanName)}`; }

      const signed   = map.signedIdx   >= 0 ? parseFuzzyDate(row[map.signedIdx])   : null;
      const startJob = map.startJobIdx >= 0 ? parseFuzzyDate(row[map.startJobIdx]) : null;
      const joined   = map.joinedIdx   >= 0 ? parseFuzzyDate(row[map.joinedIdx])   : null;
      const joinedAt = joined ?? startJob;

      if (!signed && !joinedAt) { skipped++; j++; continue; }

      const { data: existing } = await supabase
        .from("doctor_lifecycle").select("doctor_id, signed_at, joined_at").eq("doctor_id", id).maybeSingle();
      const payload: Record<string, unknown> = {
        doctor_id:   id,
        doctor_name: cleanName,
        updated_at:  new Date().toISOString(),
      };
      if (signed)   payload.signed_at = signed;
      if (joinedAt) payload.joined_at = joinedAt;
      if (signed && !existing?.signed_at) payload.eligible_for_sending = false;

      if (existing) {
        const { error } = await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", id);
        if (error) { console.error("update fail:", error.message); skipped++; j++; continue; }
        updated++;
      } else {
        const { error } = await supabase.from("doctor_lifecycle").insert(payload);
        if (error) { console.error("insert fail:", error.message); skipped++; j++; continue; }
        created++;
      }
      j++;
    }
    i = j + 1;
  }
  console.log(`\n── Historical placements ─────────────────────────────────────`);
  console.log(`Created: ${created}  Updated: ${updated}  Skipped: ${skipped}`);
  console.log(`Zoho-matched: ${matched}  Unmatched (synthetic ID): ${unmatched}`);
}

// ── Importer 3: Curated vacancies (from the messy sheet's parseable sections) ─
async function importVacancies() {
  // Hand-curated subset of the most parseable rows from Ammar's vacancies
  // sheet — Aramco JH, MNGHA Alahsa, MNGHA-JEDDAH KAMC, HMG (Saudi), HMG UK trip.
  // The rest of that sheet is too unstructured to parse safely; we'll get the
  // full list once Ammar reshapes it into a flat table.
  const seeds: { hospital: string; specialty: string; priority: "high" | "medium" | "low"; notes?: string }[] = [
    // Aramco JH (Dhahran)
    { hospital: "Aramco JH",   specialty: "General Surgeon",                    priority: "medium" },
    { hospital: "Aramco JH",   specialty: "Pediatric Ophthalmology Subspecialist", priority: "medium" },
    { hospital: "Aramco JH",   specialty: "ENT Subspecialist",                  priority: "medium", notes: "3 positions" },
    { hospital: "Aramco JH",   specialty: "Child/Adolescent Psychiatrist",      priority: "high",   notes: "Arabic speaker required" },
    { hospital: "Aramco JH",   specialty: "Pediatric Urology Subspecialist",    priority: "medium" },
    { hospital: "Aramco JH",   specialty: "Retina Ophthalmology Subspecialist", priority: "medium" },
    { hospital: "Aramco JH",   specialty: "Pediatric Anesthesiology",           priority: "medium" },
    { hospital: "Aramco JH",   specialty: "Anesthesiology Subspecialist",       priority: "medium" },
    { hospital: "Aramco JH",   specialty: "PET-CT Radiologist",                 priority: "medium" },
    { hospital: "Aramco JH",   specialty: "ENT Specialist",                     priority: "medium", notes: "Al-Ahsa location" },
    // MNGHA - JEDDAH (KAMC)
    { hospital: "MNGHA Jeddah", specialty: "Consultant Intensive Care Unit",     priority: "high", notes: "KAMC" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Intensive Care Unit",     priority: "high", notes: "Trauma" },
    { hospital: "MNGHA Jeddah", specialty: "Assistant Consultant Medical Imaging", priority: "medium", notes: "3 positions" },
    { hospital: "MNGHA Jeddah", specialty: "Assistant Consultant Women's Imaging", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Pediatric Medical Imaging", priority: "medium", notes: "KASCH, 2 positions" },
    { hospital: "MNGHA Jeddah", specialty: "Assistant Consultant Internal Medicine (Oncology)", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Adult Psychiatry",        priority: "medium", notes: "Arabic speaker" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Physical Medicine & Rehabilitation", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Geriatric Medicine",      priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Assistant Consultant Neurosurgery (Trauma)", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Adult ICU (Cardiac)",     priority: "high" },
    { hospital: "MNGHA Jeddah", specialty: "Assistant Consultant Cardiac Surgery", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Staff Physician Cardiac Anesthesia", priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Anatomical Pathology",    priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Transfusion Medicine",    priority: "medium" },
    { hospital: "MNGHA Jeddah", specialty: "Consultant Emergency Medicine",      priority: "high", notes: "KAMC" },
    { hospital: "MNGHA Jeddah", specialty: "Emergency Medicine",                 priority: "high", notes: "Trauma" },
    // MNGHA Taif
    { hospital: "MNGHA Taif", specialty: "ENT (Associate/Consultant)",           priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Plastic Surgery",                      priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Pediatric Emergency Medicine",         priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Infectious Diseases",                  priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Feto-Maternal Medicine",               priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Gastroenterology",          priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Psychiatry",                priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Pediatric Surgery",         priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant General Obstetrics & Gynecology", priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant General Pediatrics",        priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Pediatric Cardiology",      priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Neonatal Intensive Care",   priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Microbiology",              priority: "medium" },
    { hospital: "MNGHA Taif", specialty: "Consultant Infection Prevention & Control", priority: "medium" },
    // MNGHA Qassim
    { hospital: "MNGHA Qassim", specialty: "OBGYN",                              priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Gastroenterology",                   priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Emergency Medicine",      priority: "high",   notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Pediatric ER",            priority: "high",   notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant ICU",                     priority: "high",   notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Plastic Surgery",         priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Pediatric Surgery",       priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Hematopathology",         priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Nephrology",              priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Interventional Radiology", priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Maternal-Fetal Medicine", priority: "high", notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Obstetrics & Gynecology", priority: "high", notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Pediatric ICU",           priority: "high", notes: "Urgent" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Pediatric Gastroenterology", priority: "medium" },
    { hospital: "MNGHA Qassim", specialty: "Consultant Pediatric Nephrology",    priority: "medium" },
    // APEX Qatar
    { hospital: "APEX Qatar",  specialty: "Plastic Surgeon",                     priority: "medium" },
    { hospital: "APEX Qatar",  specialty: "Neurology",                           priority: "medium" },
    { hospital: "APEX Qatar",  specialty: "General Pediatrician",                priority: "medium" },
    // HMG (Saudi)
    { hospital: "HMG Riyadh",  specialty: "Consultant OBGYNE",                   priority: "medium", notes: "Female only, Western qualification" },
    { hospital: "HMG Riyadh",  specialty: "Consultant IVF",                      priority: "medium", notes: "Western qualification" },
    { hospital: "HMG Riyadh",  specialty: "Consultant Plastic Surgery",          priority: "medium", notes: "Western qualification" },
    { hospital: "HMG Riyadh",  specialty: "Consultant Pediatric",                priority: "medium", notes: "Female only" },
    { hospital: "HMG Riyadh",  specialty: "Consultant Orthopedic Surgery",       priority: "medium", notes: "Male, Western qualification" },
    { hospital: "HMG Riyadh",  specialty: "Consultant Gastroenterology",         priority: "medium", notes: "Male, Western qualification" },
    // HMG UK trip (high volume)
    { hospital: "HMG UK trip", specialty: "Consultant OBGYN",                    priority: "high", notes: "35 vacancies, female only, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Endocrinology",            priority: "high", notes: "23 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Gastroenterology",         priority: "high", notes: "19 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant ENT",                      priority: "medium", notes: "14 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Orthopedic Surgery",       priority: "medium", notes: "14 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Internal Medicine",        priority: "medium", notes: "11 vacancies, bilingual Arabic+English" },
    { hospital: "HMG UK trip", specialty: "Consultant Pediatrics",               priority: "medium", notes: "10 vacancies, bilingual Arabic+English" },
    { hospital: "HMG UK trip", specialty: "Consultant Dermatology",              priority: "medium", notes: "10 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Ophthalmology",            priority: "medium", notes: "9 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Neurology",                priority: "medium", notes: "8 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant IVF",                      priority: "medium", notes: "8 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Urology",                  priority: "medium", notes: "6 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Plastic Surgery",          priority: "medium", notes: "5 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Psychiatry",               priority: "medium", notes: "4 vacancies, bilingual Arabic+English" },
    { hospital: "HMG UK trip", specialty: "Consultant Anesthesia",               priority: "medium", notes: "11 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant NICU",                     priority: "medium", notes: "6 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant ICU",                      priority: "high", notes: "5 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Emergency Medicine",       priority: "medium", notes: "9 vacancies, CCT/CCST/CESR" },
    { hospital: "HMG UK trip", specialty: "Consultant Radiology",                priority: "medium", notes: "10 vacancies, diagnostic + MSK + body imaging" },
    // MNGHA Alahsa
    { hospital: "MNGHA Alahsa", specialty: "Consultant Oral & Maxillofacial Surgery", priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Pedodontics",             priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Radiology",               priority: "medium", notes: "3 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Associate Consultant Nuclear Medicine", priority: "medium", notes: "Arabic speaking" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Emergency Medicine",      priority: "high", notes: "3 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Pediatric ER",            priority: "high", notes: "2 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Infectious Diseases",     priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Neurology",               priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant ICU",                     priority: "high" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Hematology",              priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Adult Rheumatology",      priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Gastroenterology",        priority: "medium", notes: "2 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Palliative Care",         priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Interventional Cardiology", priority: "high" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Nephrology",              priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Psychiatry",              priority: "medium", notes: "Arabic speaking" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Neonatology",             priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant PICU",                    priority: "high" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant General Pediatrics",      priority: "medium", notes: "3 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant OBGYN",                   priority: "medium", notes: "3 positions" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Pediatric Surgery",       priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Plastic Surgery",         priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Ophthalmology",           priority: "medium", notes: "Pediatric / Glaucoma" },
    { hospital: "MNGHA Alahsa", specialty: "Staff Physician Vascular Surgery",   priority: "medium" },
    { hospital: "MNGHA Alahsa", specialty: "Consultant Infection Prevention & Control", priority: "medium" },
  ];

  const { data: hospitals } = await supabase.from("hospitals").select("id, name");
  const idByName = new Map<string, string>();
  for (const h of (hospitals ?? []) as Array<{ id: string; name: string }>) idByName.set(h.name.toLowerCase().trim(), h.id);

  let created = 0;
  for (const v of seeds) {
    // Avoid duplicating if a vacancy with this exact (hospital, specialty)
    // pair already exists in "open" status.
    const { data: existing } = await supabase
      .from("vacancies")
      .select("id")
      .eq("hospital_name", v.hospital)
      .eq("specialty", v.specialty)
      .eq("status", "open")
      .limit(1);
    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from("vacancies").insert({
      hospital_id:   idByName.get(v.hospital.toLowerCase()) ?? null,
      hospital_name: v.hospital,
      specialty:     v.specialty,
      priority:      v.priority,
      notes:         v.notes ?? null,
      opened_by:     "demo-import",
    });
    if (error) { console.error(error.message); continue; }
    created++;
  }
  console.log(`\n── Vacancies (curated seed) ───────────────────────────────────`);
  console.log(`Created: ${created} of ${seeds.length}`);
}

async function main() {
  console.log("Connecting to", SUPABASE_URL);
  const { match } = await buildZohoMatcher();
  await importUnavailable(match);
  await importPlacements(match);
  await importVacancies();
  console.log("\nDone.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

/**
 * Phase 3 — Doctor ↔ Vacancy match scoring.
 *
 * Scores a doctor against a vacancy on every signal we have, not just
 * specialty. Returns the score plus a per-factor breakdown so the UI can
 * explain WHY it ranked a match high or low — "Specialty matches · DHA
 * license fits Dubai · 7 years experience · short notice fits high-priority
 * vacancy". Auditable, not a black box.
 *
 * Factors (max 125 total):
 *   - Specialty match        (0-50)   exact / partial / none
 *   - License / region fit   (0-25)   DHA→Dubai, DOH→Abu Dhabi, MOH→UAE, etc.
 *   - Training country       (0-15)   trained in hospital's country / top-tier source
 *   - Years of experience    (0-10)   8+ best, scaled down
 *   - Notice ↔ urgency       (0-15)   short notice + high-pri vacancy = strong
 *   - Notes keyword overlap  (0-10)   bio/area_of_interest words mentioned in notes
 *
 * Tiers used for badge colour:
 *   ≥ 80  strong
 *   ≥ 50  decent
 *   <  50 weak
 *
 * Source: meeting with Saif Ullah, May 20 2026.
 */
import type { Vacancy } from "@/hooks/use-vacancies";
import { groupSpecialty, rollupSpecialty } from "@/lib/specialty-groups";

export interface MatchCandidateDoctor {
  id:                 string;
  name:               string;
  speciality:         string | null;
  license:            string | null;             // raw text e.g. "DHA", "MOH"
  has_dha:            boolean;
  has_doh:            boolean;
  has_moh:            boolean;
  country_training:   string | null;
  nationality:        string | null;
  years_experience:   number | null;
  notice_period:      string | null;
  area_of_interest:   string | null;
  bio:                string | null;
}

export interface MatchCandidateHospital {
  id:      string | null;
  name:    string;
  city:    string | null;
  country: string | null;
}

export interface MatchFactor {
  label:   string;
  points:  number;
  /** Negative when this factor docked points (e.g. license mismatch). */
  negative?: boolean;
}

export interface MatchScore {
  score:    number;        // 0..max
  max:      number;
  pct:      number;        // 0..100
  tier:     "strong" | "decent" | "weak" | "none";
  factors:  MatchFactor[];
  /** Quick one-liner for tooltips: "Specialty · DHA fit · 7y exp" */
  summary:  string;
}

const MAX_SCORE = 125;

const TOP_SOURCE_COUNTRIES = new Set(["united states", "usa", "us", "canada", "united kingdom", "uk", "australia"]);

const ABU_DHABI_CITIES = new Set(["abu dhabi", "al ain"]);
const DUBAI_CITIES     = new Set(["dubai"]);
const NORTHERN_EMIRATES = new Set(["sharjah", "ras al khaimah", "rak", "ajman", "fujairah", "umm al quwain"]);
const SAUDI_CITIES = new Set(["riyadh", "jeddah", "dammam", "khobar", "mecca", "medina"]);
const QATAR_CITIES = new Set(["doha", "al rayyan"]);

const NOISE_WORDS = new Set([
  "the","a","an","of","in","at","on","for","to","and","or","but","with","by","from",
  "is","are","be","been","being","was","were","has","have","had","do","does","did",
  "this","that","these","those","it","its","as","such","any","all","need","needs",
  "looking","required","requires","minimum","experience","years","year","please",
  "candidate","candidates","doctor","doctors","specialist","consultant","senior","junior",
  "hospital","preferred","ideal","must","should","would","ability","skills","strong",
]);

export function scoreMatch(d: MatchCandidateDoctor, v: Vacancy, h: MatchCandidateHospital | null): MatchScore {
  const factors: MatchFactor[] = [];

  // ── 1. Specialty (0-50) — also gates everything: if zero, the whole score
  //      is zero. Spec is the only required signal.
  const specPts = scoreSpecialtyInner(d.speciality, v.specialty);
  if (specPts === 0) {
    return {
      score: 0, max: MAX_SCORE, pct: 0, tier: "none",
      factors: [{ label: `No specialty match (doctor: ${d.speciality ?? "—"})`, points: 0 }],
      summary: "No specialty match",
    };
  }
  factors.push({
    label:
      specPts === 50 ? `Specialty exact: ${d.speciality}` :
      specPts === 40 ? `Specialty group match: ${d.speciality} → ${groupSpecialty(v.specialty) ?? v.specialty}` :
      specPts === 35 ? `Specialty partial: ${d.speciality} ↔ ${v.specialty}` :
      specPts === 30 ? `Same parent specialty: ${d.speciality} ↔ ${v.specialty}` :
                       `Specialty token overlap: ${d.speciality} ↔ ${v.specialty}`,
    points: specPts,
  });

  // ── 2. License × hospital region (0-25, can go negative -5)
  const licResult = scoreLicense(d, h);
  if (licResult) factors.push(licResult);

  // ── 3. Training country (0-15)
  const trainPts = scoreTraining(d.country_training, h?.country, d.nationality);
  if (trainPts.points > 0) factors.push(trainPts);

  // ── 4. Years of experience (0-10)
  const expPts = scoreExperience(d.years_experience);
  if (expPts.points > 0) factors.push(expPts);

  // ── 5. Notice period vs urgency (0-15)
  const urg = scoreUrgency(d.notice_period, v.priority);
  if (urg.points > 0) factors.push(urg);

  // ── 6. Notes keyword overlap (0-10)
  const notes = scoreNotes(d, v.notes);
  if (notes.points > 0) factors.push(notes);

  const total = factors.reduce((s, f) => s + f.points, 0);
  const clamped = Math.max(0, Math.min(MAX_SCORE, total));
  const pct = Math.round((clamped / MAX_SCORE) * 100);
  // Tier thresholds calibrated against real Zoho data. License coverage in
  // Saudi/Qatar is rare; many otherwise-good candidates score in the 35–60
  // range from specialty + partial training/experience alone. Old cutoffs
  // (80/50) sent almost everyone to "Long shots" — which is collapsed by
  // default → user saw "50 matches" but no rows.
  const tier: MatchScore["tier"] =
    clamped >= 65 ? "strong" :
    clamped >= 35 ? "decent" :
    clamped > 0   ? "weak"   : "none";

  return {
    score: clamped, max: MAX_SCORE, pct, tier, factors,
    summary: summarise(factors),
  };
}

/** Per-factor specialty scorer, exported so other surfaces (Batches
 *  Today's-Pick tile, specialty_of_day doctor picker, anywhere we have
 *  a specialty string but no full vacancy/hospital) can rank doctors
 *  on the same scale the vacancy matcher uses. 0–50.
 *
 *  Tiers (also returned from rankBySpecialty as `tier`):
 *    50  exact                    e.g. "Cardiology" ↔ "Cardiology"
 *    40  canonical-group match    e.g. "Retinal Specialist" ↔ "Ophthalmology" (same groupSpecialty bucket)
 *    35  substring                e.g. "Adult Cardiology" ↔ "Cardiology"
 *    30  same parent specialty    e.g. "Pediatric Cardiology" ↔ "Cardiology"
 *    25  token-overlap fallback   e.g. "Cath Lab Fellow Cardiologist" ↔ "Cardiology"
 *     0  no match                 the rank list drops these. */
export function scoreSpecialty(doctor: string | null, target: string): number {
  return scoreSpecialtyInner(doctor, target);
}

export type SpecialtyMatchTier = "exact" | "group" | "partial" | "parent" | "tokens" | "none";

export interface SpecialtyRankEntry {
  doctor_id:   string;
  doctor_name: string;
  speciality:  string | null;
  source?:     string;        // "dob" | "lead" | etc. — passthrough from caller
  points:      number;        // 0..50
  tier:        SpecialtyMatchTier;
  /** One-line "why it ranked here" — for the tooltip / inline label. */
  reason:      string;
}

/** Rank a roster against a target specialty string. Returns only doctors
 *  scoring > 0, sorted highest first, limited to `limit`. Used by the
 *  Batches Today's-Pick tile when the canonical bucket has zero entries
 *  but a fuzzy / partial / token-overlap pass would still surface useful
 *  candidates (e.g. "Cardiac Surgery" → Cardiothoracic Surgeons). */
export function rankBySpecialty<T extends { id: string; name: string; speciality: string | null; source?: string }>(
  doctors: T[],
  target:  string,
  limit  = 10,
): SpecialtyRankEntry[] {
  return doctors
    .map(d => {
      const pts = scoreSpecialtyInner(d.speciality, target);
      const tier: SpecialtyMatchTier =
        pts === 50 ? "exact"   :
        pts === 40 ? "group"   :
        pts === 35 ? "partial" :
        pts === 30 ? "parent"  :
        pts === 25 ? "tokens"  :
                     "none";
      const reason =
        pts === 50 ? "exact match" :
        pts === 40 ? `same bucket → ${groupSpecialty(target) ?? target}` :
        pts === 35 ? "substring match" :
        pts === 30 ? `same parent → ${rollupSpecialty(target) ?? target}` :
        pts === 25 ? "shared keywords" :
                     "no overlap";
      return {
        doctor_id:   d.id,
        doctor_name: d.name,
        speciality:  d.speciality,
        source:      d.source,
        points:      pts,
        tier,
        reason,
      };
    })
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points || a.doctor_name.localeCompare(b.doctor_name))
    .slice(0, limit);
}

// ── Per-factor scorers ──────────────────────────────────────────────────────

function scoreSpecialtyInner(doctor: string | null, vacancy: string): number {
  if (!doctor) return 0;
  const a = normalize(doctor);
  const b = normalize(vacancy);
  if (!a || !b) return 0;

  // Exact / substring (cheapest, catches the well-formed cases first).
  if (a === b) return 50;
  if (a.includes(b) || b.includes(a)) return 35;

  // Canonical-group match (Ammar 2026-06-03 spec). Resolves the doctor's
  // free-text specialty and the vacancy's to AA-website canonical buckets,
  // then compares. Catches "Retinal Specialist" ↔ "Ophthalmology" because
  // groupSpecialty maps the former to the latter via the keyword graph in
  // specialty-groups.ts. Same-bucket = 40 (slightly under substring,
  // slightly over token-overlap because canonical equivalence is a
  // stronger signal than coincidental shared words).
  const groupA = groupSpecialty(doctor);
  const groupB = groupSpecialty(vacancy);
  if (groupA && groupB && groupA === groupB) return 40;

  // Parent rollup — e.g. doctor is "Pediatric Cardiology" (parent
  // Cardiology) and vacancy is plain "Cardiology". Worth less than an
  // exact-bucket match but more than token coincidence.
  const parentA = rollupSpecialty(doctor);
  const parentB = rollupSpecialty(vacancy);
  if (parentA && parentB && parentA === parentB) return 30;

  // Token overlap fallback for anything the canonical list misses
  // (covers free-text noise like "Adult Cardiologist – cath lab fellow").
  const aToks = new Set(a.split(/\s+/).filter(t => t.length > 3));
  const bToks = new Set(b.split(/\s+/).filter(t => t.length > 3));
  let overlap = 0;
  for (const t of aToks) if (bToks.has(t)) overlap++;
  if (overlap >= 1) return 25;
  return 0;
}

function scoreLicense(d: MatchCandidateDoctor, h: MatchCandidateHospital | null): MatchFactor | null {
  if (!h) return null;
  const city    = normalize(h.city ?? "");
  const country = normalize(h.country ?? "");
  // Which license fits this hospital?
  let licenseRequiredLabel = "";
  let licenseMatch = false;
  let licenseHave = false;

  if (DUBAI_CITIES.has(city)) {
    licenseRequiredLabel = "DHA";
    licenseHave = d.has_dha;
    licenseMatch = d.has_dha;
  } else if (ABU_DHABI_CITIES.has(city)) {
    licenseRequiredLabel = "DOH";
    licenseHave = d.has_doh;
    licenseMatch = d.has_doh;
  } else if (NORTHERN_EMIRATES.has(city) || country === "uae" || country === "united arab emirates") {
    licenseRequiredLabel = "MOH (UAE)";
    licenseHave = d.has_moh;
    licenseMatch = d.has_moh;
  } else if (country === "saudi arabia" || SAUDI_CITIES.has(city)) {
    licenseRequiredLabel = "SCFHS";
    licenseHave = !!d.license && /scfhs|saudi/i.test(d.license);
    licenseMatch = licenseHave;
  } else if (country === "qatar" || QATAR_CITIES.has(city)) {
    licenseRequiredLabel = "QCHP";
    licenseHave = !!d.license && /qchp|qatar/i.test(d.license);
    licenseMatch = licenseHave;
  } else {
    return null;
  }

  if (licenseMatch) {
    return { label: `${licenseRequiredLabel} license fits ${h.city ?? h.country}`, points: 25 };
  }
  // Doctor has SOME license but not the specific one for this region.
  if (d.has_dha || d.has_doh || d.has_moh || d.license) {
    return { label: `License mismatch (needs ${licenseRequiredLabel})`, points: -5, negative: true };
  }
  void licenseHave;
  return null;
}

function scoreTraining(country: string | null, hospitalCountry: string | null | undefined, nationality: string | null): MatchFactor {
  const c  = normalize(country ?? "");
  const hc = normalize(hospitalCountry ?? "");
  const n  = normalize(nationality ?? "");
  if (!c && !n) return { label: "", points: 0 };
  if (c && hc && (c === hc || c.includes(hc) || hc.includes(c))) {
    return { label: `Trained in ${country}`, points: 15 };
  }
  if (c && TOP_SOURCE_COUNTRIES.has(c)) {
    return { label: `Trained in ${country} (top-source)`, points: 10 };
  }
  if (n && TOP_SOURCE_COUNTRIES.has(n)) {
    return { label: `${nationality} national`, points: 6 };
  }
  return { label: "", points: 0 };
}

function scoreExperience(years: number | null): MatchFactor {
  if (years == null) return { label: "", points: 0 };
  if (years >= 8)   return { label: `${years}y experience`, points: 10 };
  if (years >= 5)   return { label: `${years}y experience`, points: 7 };
  if (years >= 3)   return { label: `${years}y experience`, points: 5 };
  if (years >= 1)   return { label: `${years}y experience`, points: 2 };
  return { label: "", points: 0 };
}

function scoreUrgency(notice: string | null, priority: Vacancy["priority"]): MatchFactor {
  if (!notice) return { label: "", points: 0 };
  const weeks = parseNoticeWeeks(notice);
  if (weeks == null) return { label: "", points: 0 };
  if (priority === "high") {
    if (weeks <= 2) return { label: `Short notice (${notice}) · high-pri fit`, points: 15 };
    if (weeks <= 4) return { label: `${notice} notice · high-pri fit`,        points: 10 };
    return { label: `${notice} notice (long for high-pri)`, points: 2 };
  }
  if (priority === "medium") {
    if (weeks <= 8) return { label: `${notice} notice fits medium-pri`,       points: 8 };
    return { label: "", points: 0 };
  }
  // low priority: any notice is fine
  return { label: `${notice} notice`, points: 3 };
}

function scoreNotes(d: MatchCandidateDoctor, notes: string | null): MatchFactor {
  if (!notes) return { label: "", points: 0 };
  const bag = ((d.bio ?? "") + " " + (d.area_of_interest ?? "")).toLowerCase();
  if (!bag.trim()) return { label: "", points: 0 };
  const keywords = notes.toLowerCase()
    .split(/[^a-z]+/)
    .filter(w => w.length > 4 && !NOISE_WORDS.has(w));
  if (keywords.length === 0) return { label: "", points: 0 };
  const hits = new Set<string>();
  for (const k of keywords) {
    if (bag.includes(k)) hits.add(k);
  }
  if (hits.size === 0) return { label: "", points: 0 };
  const points = Math.min(10, hits.size * 2);
  const sample = Array.from(hits).slice(0, 3).join(", ");
  return { label: `Notes match: ${sample}`, points };
}

function parseNoticeWeeks(notice: string): number | null {
  const s = notice.toLowerCase().trim();
  if (s === "immediate" || s === "immediately" || s === "now" || s === "available") return 0;
  const m = s.match(/(\d+)\s*(day|week|month|wk|mo|d|w|m)/);
  if (!m) {
    // bare number — assume weeks
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith("d"))  return n / 7;
  if (unit.startsWith("mo") || unit === "m") return n * 4.3;
  return n; // weeks
}

function summarise(factors: MatchFactor[]): string {
  return factors
    .filter(f => !f.negative && f.label)
    .slice(0, 3)
    .map(f => f.label.split(/[:·(]/)[0].trim())
    .join(" · ");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

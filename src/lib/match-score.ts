/**
 * Doctor ↔ Vacancy match scoring (max 100).
 *
 * User spec (2026-06-08): "specialty match should be half the score,
 * then certificates and licenses on top." Rebalanced to:
 *
 *   Specialty match           (0-50)   = 50% baseline
 *   Region-fit license        (0-25)   = the license the hospital's emirate needs (DHA/DOH/MOH/SCFHS/QCHP)
 *   Extra licenses held       (0-10)   = +5 per additional regional license the doctor holds beyond the region-fit one
 *   Training country          (0-7)    = trained in hospital's country / top-source (US/UK/CA/AU)
 *   Years of experience       (0-5)    = 8+ best, scaled down
 *   Notice ↔ urgency          (0-3)    = short notice on a high-priority vacancy
 *   ───────────────────────────────────
 *   TOTAL                       100
 *
 * A doctor with the right specialty + the right regional license alone
 * scores 75 → 'strong', which is the team's intuition: those two
 * factors together should already mark someone as a real candidate.
 *
 * Tiers used for badge colour:
 *   ≥ 70  strong   (specialty + region-fit license alone clears this)
 *   ≥ 40  decent   (specialty alone)
 *   >  0  weak     (partial-tier specialty only)
 *   =  0  none     (no specialty match — gated out)
 *
 * Source: original spec May 20 2026 (Saif); rebalance Jun 8 2026.
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

const MAX_SCORE = 100;

const TOP_SOURCE_COUNTRIES = new Set(["united states", "usa", "us", "canada", "united kingdom", "uk", "australia"]);

const ABU_DHABI_CITIES = new Set(["abu dhabi", "al ain"]);
const DUBAI_CITIES     = new Set(["dubai"]);
const NORTHERN_EMIRATES = new Set(["sharjah", "ras al khaimah", "rak", "ajman", "fujairah", "umm al quwain"]);
const SAUDI_CITIES = new Set(["riyadh", "jeddah", "dammam", "khobar", "mecca", "medina"]);
const QATAR_CITIES = new Set(["doha", "al rayyan"]);


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

  // ── 2b. Extra licenses the doctor holds beyond the region-fit one
  //       (0-10, +5 each, capped). Two extra regional licenses = a
  //       fully-credentialed doctor edge — the team's intuition.
  const extras = scoreExtraLicenses(d, h);
  if (extras.points > 0) factors.push(extras);

  // ── 3. Training country (0-7)
  const trainPts = scoreTraining(d.country_training, h?.country, d.nationality);
  if (trainPts.points > 0) factors.push(trainPts);

  // ── 4. Years of experience (0-5)
  const expPts = scoreExperience(d.years_experience);
  if (expPts.points > 0) factors.push(expPts);

  // ── 5. Notice period vs urgency (0-3)
  const urg = scoreUrgency(d.notice_period, v.priority);
  if (urg.points > 0) factors.push(urg);

  // Notes overlap dropped from the rebalanced model — it was a 0-10
  // signal that often noised up the score with coincidental keyword
  // matches. License weight absorbs the budget instead.
  void v.notes;

  const total = factors.reduce((s, f) => s + f.points, 0);
  const clamped = Math.max(0, Math.min(MAX_SCORE, total));
  const pct = Math.round((clamped / MAX_SCORE) * 100);
  // Tier thresholds. Specialty + region-fit license = 75 → strong;
  // specialty alone = 50 → decent; partial-tier specialty only = weak.
  const tier: MatchScore["tier"] =
    clamped >= 70 ? "strong" :
    clamped >= 40 ? "decent" :
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

/** Bonus for regional licenses beyond the one the hospital's emirate
 *  specifically needs. +5 per extra, capped at +10 (i.e. holding TWO
 *  extra regional licenses ≈ a fully-credentialed doctor edge). Doesn't
 *  fire when there's no hospital context (the region-fit factor itself
 *  is null in that case). */
function scoreExtraLicenses(d: MatchCandidateDoctor, h: MatchCandidateHospital | null): MatchFactor {
  if (!h) return { label: "", points: 0 };
  const city    = normalize(h.city ?? "");
  const country = normalize(h.country ?? "");

  // Identify which of the doctor's regional licenses is the "region-fit"
  // one (already credited via scoreLicense) so we don't double-count it.
  let regionFit: "dha" | "doh" | "moh" | null = null;
  if      (DUBAI_CITIES.has(city))      regionFit = "dha";
  else if (ABU_DHABI_CITIES.has(city))  regionFit = "doh";
  else if (NORTHERN_EMIRATES.has(city) || country === "uae" || country === "united arab emirates") regionFit = "moh";

  const extras: string[] = [];
  if (d.has_dha && regionFit !== "dha") extras.push("DHA");
  if (d.has_doh && regionFit !== "doh") extras.push("DOH");
  if (d.has_moh && regionFit !== "moh") extras.push("MOH");
  if (extras.length === 0) return { label: "", points: 0 };
  const points = Math.min(10, extras.length * 5);
  return { label: `Also holds ${extras.join(" + ")} (extra licenses)`, points };
}

function scoreTraining(country: string | null, hospitalCountry: string | null | undefined, nationality: string | null): MatchFactor {
  const c  = normalize(country ?? "");
  const hc = normalize(hospitalCountry ?? "");
  const n  = normalize(nationality ?? "");
  if (!c && !n) return { label: "", points: 0 };
  if (c && hc && (c === hc || c.includes(hc) || hc.includes(c))) {
    return { label: `Trained in ${country}`, points: 7 };
  }
  if (c && TOP_SOURCE_COUNTRIES.has(c)) {
    return { label: `Trained in ${country} (top-source)`, points: 5 };
  }
  if (n && TOP_SOURCE_COUNTRIES.has(n)) {
    return { label: `${nationality} national`, points: 3 };
  }
  return { label: "", points: 0 };
}

function scoreExperience(years: number | null): MatchFactor {
  if (years == null) return { label: "", points: 0 };
  if (years >= 8)   return { label: `${years}y experience`, points: 5 };
  if (years >= 5)   return { label: `${years}y experience`, points: 4 };
  if (years >= 3)   return { label: `${years}y experience`, points: 2 };
  if (years >= 1)   return { label: `${years}y experience`, points: 1 };
  return { label: "", points: 0 };
}

function scoreUrgency(notice: string | null, priority: Vacancy["priority"]): MatchFactor {
  if (!notice) return { label: "", points: 0 };
  const weeks = parseNoticeWeeks(notice);
  if (weeks == null) return { label: "", points: 0 };
  if (priority === "high") {
    if (weeks <= 2) return { label: `Short notice (${notice}) · high-pri fit`, points: 3 };
    if (weeks <= 4) return { label: `${notice} notice · high-pri fit`,        points: 2 };
    return { label: `${notice} notice (long for high-pri)`, points: 0 };
  }
  if (priority === "medium") {
    if (weeks <= 8) return { label: `${notice} notice fits medium-pri`,       points: 1 };
    return { label: "", points: 0 };
  }
  return { label: `${notice} notice`, points: 1 };
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

/**
 * Format a raw "areas of interest" value into a short, glanceable list —
 * comma-separated with the LAST item joined by " & ". e.g.
 *   "Liver disease; bone surgery, brain tumor and epilepsy"
 *   → "Liver disease, bone surgery, brain tumor & epilepsy"
 *
 * The hard part is that `area_of_interest` is NOT reliably a list: for WordPress
 * doctors it holds the free-text BIO ("He is a UK CCT Consultant Plastic Surgeon
 * with extensive experience (2010), holding FRCS(Plast) certification & a Master
 * of Science from the University of Oxford…"). Splitting that on commas just
 * produces sentence fragments, which is what leaked into the hospital table
 * (Hasan 2026-07-22: "no fluff at all").
 *
 * So every candidate segment must LOOK like an interest term (≤4 words, no
 * digits/parentheses, no prose words). If nothing survives, fall back to the
 * doctor's specialty/title rendered as a field — "Consultant Plastic Surgeon"
 * → "Plastic Surgery". With no fallback either, return "" — a blank cell beats
 * a paragraph of bio.
 *
 * Idempotent: formatting an already-formatted value returns the same string.
 *
 * NOTE: mirrored in supabase/functions/send-flow-email AND
 * supabase/functions/send-batch so the token and both email tables render
 * identically. Keep all three in lockstep.
 */

/** Words that mean "this is a sentence, not an interest term". */
const PROSE_WORDS = new Set([
  "he", "she", "his", "her", "him", "they", "their", "them", "i", "we", "our", "who", "which", "that",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "holds", "holding",
  "with", "from", "the", "an", "including", "include", "includes", "also", "currently",
  "experience", "experienced", "extensive", "certification", "certified", "qualification", "qualified",
  "university", "master", "masters", "bachelor", "degree", "diploma", "training", "trained",
  "graduated", "graduate", "years", "year", "over", "more", "than", "after", "before", "during",
  "since", "worked", "works", "working", "completed", "obtained", "received", "awarded",
  "specialises", "specializes", "specialising", "specializing", "dr", "doctor", "consultant",
  // Credential / management / org words — these mark an "about me" blurb (often
  // comma-listed, so it dodges the sentence check above), not a clinical interest.
  "status", "registration", "registered", "chartered", "accredited", "license", "licensed",
  "roles", "role", "managerial", "management", "manager", "leadership", "leading", "led",
  "operations", "operational", "governance", "consultancy", "consulting", "organisation",
  "organisations", "organization", "organizations", "organizational", "teams", "team",
  "deputy", "service", "services", "held", "key", "senior", "head", "director", "board",
  "multisite", "multidisciplinary", "academic", "academia", "strategy", "strategic",
  "stakeholder", "delivery", "compliance", "audit", "policy",
]);

/** Seniority/grade noise to strip before deriving a field from a job title. */
const GRADE_WORDS = new Set([
  "consultant", "specialist", "senior", "junior", "associate", "assistant", "attending",
  "registrar", "fellow", "head", "department", "chief", "staff", "locum", "trainee", "resident",
  "dr", "doctor", "of", "and",
]);

/** Job-title noun → the field it practises. */
const ROLE_TO_FIELD: Array<[RegExp, string]> = [
  [/^surgeons?$/i,                                  "Surgery"],
  [/^physicians?$/i,                                "Medicine"],
  [/^an(a)?esthetists?$|^an(a)?esthesiologists?$/i, "Anaesthesia"],
  [/^obstetricians?$/i,                             "Obstetrics"],
  [/^gyn(a)?ecologists?$/i,                         "Gynaecology"],
  [/^p(a)?ediatricians?$/i,                         "Paediatrics"],
  [/^psychiatrists?$/i,                             "Psychiatry"],
  [/^dentists?$/i,                                  "Dentistry"],
  [/^radiographers?$/i,                             "Radiography"],
  [/^nurses?$/i,                                    "Nursing"],
  [/^midwi(fe|ves)$/i,                              "Midwifery"],
];

/** True when a segment reads like an interest term rather than a sentence. */
function isInterestTerm(term: string): boolean {
  if (!term) return false;
  if (/[0-9()]/.test(term)) return false;                 // "(2010)", "FRCS(Plast)"
  const words = term.split(/\s+/);
  if (words.length > 4) return false;                     // a clause, not a term
  return !words.some(w => PROSE_WORDS.has(w.replace(/[^a-z]/gi, "").toLowerCase()));
}

/** Capitalise a word unless it's an acronym we should leave alone (ENT, ICU). */
function capitalise(w: string): string {
  if (!w) return w;
  if (w.length <= 4 && w === w.toUpperCase()) return w;   // ENT, ICU, IVF
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

/** "Consultant Plastic Surgeon" → "Plastic Surgery"; "Consultant Cardiologist"
 *  → "Cardiology". Values that are already a field pass through unchanged. */
export function specialtyToField(title: string | null | undefined): string {
  if (!title) return "";
  const words = String(title)
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !GRADE_WORDS.has(w.toLowerCase()));
  if (!words.length) return "";
  const last = words[words.length - 1];
  let mapped = "";
  for (const [re, field] of ROLE_TO_FIELD) if (re.test(last)) { mapped = field; break; }
  if (!mapped && /ologist$/i.test(last)) mapped = last.replace(/ologist$/i, "ology");
  if (!mapped && /iatrist$/i.test(last)) mapped = last.replace(/iatrist$/i, "iatry");
  if (mapped) words[words.length - 1] = mapped;
  return words.map(capitalise).join(" ");
}

export function formatAreasOfInterest(
  raw: string | null | undefined,
  opts: { fallback?: string; maxWords?: number } = {},
): string {
  const { fallback = "", maxWords = 30 } = opts;
  const fromTitle = () => specialtyToField(fallback);
  if (!raw) return fromTitle();

  // Split on commas / semicolons / slashes / newlines / bullets / sentence ends,
  // and the words "and" / "&" used as separators.
  const parts = String(raw)
    .split(/\s*(?:[,;/\n·•]|\.\s|\band\b|&)\s*/i)
    .map(s => s.trim().replace(/[.\s]+$/, ""))            // drop trailing periods
    .filter(Boolean);

  // De-dupe case-insensitively, preserve order, and keep ONLY real terms.
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const p of parts) {
    if (!isInterestTerm(p)) continue;
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); terms.push(p); }
  }
  // Blurb guards — a genuine "areas of interest" is a handful of short clinical
  // terms. If the raw text is long (a bio/CV dump) or there are too many items,
  // it's not a clean list; show the specialty instead of a wall of fluff.
  const rawWords = String(raw).trim().split(/\s+/).length;
  if (!terms.length || rawWords > 14 || terms.length > 6) return fromTitle();

  // Keep whole terms until we'd exceed ~maxWords total words.
  const kept: string[] = [];
  let words = 0;
  for (const t of terms) {
    const w = t.split(/\s+/).length;
    if (kept.length && words + w > maxWords) break;
    kept.push(t);
    words += w;
  }

  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(", ")} & ${kept[kept.length - 1]}`;
}

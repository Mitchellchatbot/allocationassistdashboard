/**
 * template-match — team feedback #22 ("WO template library: predefined /
 * job-title-matched / city-specific + auto-vs-manual toggle").
 *
 * Pure, side-effect-free matcher that picks the best doctor "working
 * opportunity" template for a send from the templates that already exist in the
 * DB. Two library tiers are matchable:
 *
 *   • city-specific   — `doctor_city_<slug>`  (migration 20260825010000)
 *   • by specialty /  — `doctor_bmh_<slug>`   (migration 20260706000004)
 *     job title           "best-matched hospitals by specialty"
 *
 * The slug is `lower(value)` with every run of non-alphanumerics collapsed to a
 * single `_` — IDENTICAL to the `regexp_replace(lower(x), '[^a-z0-9]+', '_')`
 * the migrations use, so a match here always names a real key.
 *
 * Kept UI-agnostic and free of React so it can be unit-tested and reused by any
 * caller (the Send Profile dialog wires it to an Auto/Manual toggle).
 */

/** Mirror the SQL slug: lowercase, non-alphanumeric runs → "_", trimmed. */
export function templateSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export interface TemplateLike { key: string }

export type MatchKind = "city" | "specialty" | "job_title";

export interface TemplateMatch {
  key:    string;      // the resolved template key (guaranteed to exist in the input set)
  kind:   MatchKind;   // why it matched
  reason: string;      // human label for the chip ("Dubai", "Cardiologist", …)
}

export interface DoctorTemplateMatchInput {
  templates:  TemplateLike[];
  /** Hospital cities in this send (any casing; blanks ignored). A city template
   *  only fires when the whole send targets ONE city — a single city template
   *  can't honestly say "hospitals in Dubai AND Riyadh". */
  cities:     Array<string | null | undefined>;
  /** The doctor's specialty (or, for a uniform multi-doctor send, the shared
   *  specialty). Empty when doctors disagree — then no specialty match fires. */
  specialty?: string | null;
  /** The doctor's free-text job title, e.g. "Consultant Cardiac Surgeon". Used
   *  as a fallback when `specialty` doesn't resolve: we look for a bmh
   *  specialty phrase embedded in the title. */
  jobTitle?:  string | null;
}

/**
 * Best doctor-template for a send, or null to fall back to the saved default.
 *
 * Priority: city-specific first (it's the most recent, send-geography-specific
 * tier and is doctor-independent, so it's always safe across every doctor in a
 * single-city send), then specialty, then a job-title phrase match.
 */
export function matchDoctorTemplate(input: DoctorTemplateMatchInput): TemplateMatch | null {
  const keys = new Set(input.templates.map(t => t.key));

  // ── 1. City-specific (only when the send is a single distinct city) ──────
  const cities = [...new Set(
    (input.cities ?? [])
      .map(c => (c ?? "").trim())
      .filter(Boolean)
      .map(c => c.toLowerCase()),
  )];
  if (cities.length === 1) {
    const key = `doctor_city_${templateSlug(cities[0])}`;
    if (keys.has(key)) {
      return { key, kind: "city", reason: titleCase(cities[0]) };
    }
  }

  // ── 2. Specialty → best-matched-hospitals template ───────────────────────
  if (input.specialty && input.specialty.trim()) {
    const key = `doctor_bmh_${templateSlug(input.specialty)}`;
    if (keys.has(key)) {
      return { key, kind: "specialty", reason: input.specialty.trim() };
    }
  }

  // ── 3. Job-title phrase → best-matched-hospitals template ────────────────
  const fromTitle = matchBmhFromJobTitle(input.jobTitle, input.templates);
  if (fromTitle) return fromTitle;

  return null;
}

/**
 * Find the longest bmh specialty phrase that appears as whole words inside the
 * job title. "Consultant Cardiac Surgeon" → doctor_bmh_cardiac_surgeon.
 * Longest-phrase-wins so "cardiac surgeon" beats a stray "surgeon" match.
 */
function matchBmhFromJobTitle(jobTitle: string | null | undefined, templates: TemplateLike[]): TemplateMatch | null {
  const title = (jobTitle ?? "").trim();
  if (!title) return null;
  const haystack = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;

  let best: TemplateMatch | null = null;
  let bestLen = 0;
  for (const t of templates) {
    if (!t.key.startsWith("doctor_bmh_")) continue;
    const phrase = t.key.slice("doctor_bmh_".length).replace(/_/g, " ").trim();
    if (!phrase) continue;
    if (haystack.includes(` ${phrase} `) && phrase.length > bestLen) {
      best = { key: t.key, kind: "job_title", reason: titleCase(phrase) };
      bestLen = phrase.length;
    }
  }
  return best;
}

/** "abu dhabi" → "Abu Dhabi", "cardiac surgeon" → "Cardiac Surgeon". */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

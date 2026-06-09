/**
 * Canonical specialty list — AA WEBSITE source of truth.
 *
 * Replaces the earlier Zoho-bucketed approach (Ammar 2026-06-03:
 * "general surgery is NOT internal medicine"). The list below mirrors
 * the ~135 specialties on the AA website, including indented sub-
 * specialties that roll up to a parent.
 *
 * Each entry is its own canonical bucket — the batch rotation can
 * cycle through any of them. The `parent` field lets reports group
 * sub-specialties under their parent for aggregate views, and the
 * `keywords` array catches the common ways Zoho's free-text specialty
 * column is written.
 *
 * Order matters: more-specific entries appear BEFORE their parent, so
 * that "Interventional Cardiologist" wins over "Cardiology" when both
 * could match the raw text. The first match wins.
 *
 * `groupSpecialty(raw)` keeps the same signature as before so existing
 * consumers (Batches, LinkToVacancyDialog) don't need changes.
 */

export interface SpecialtyGroup {
  name:     string;        // canonical display name (matches AA website)
  parent:   string | null; // parent for rollup; null if top-level
  keywords: RegExp[];      // patterns matched against normalized raw text
}

/** Build a default keyword regex from a name.
 *
 *  Anchored at the START of a word (`\b`) but NOT the end — the entries
 *  below deliberately use truncated STEMS ("cardiolog", "neurolog",
 *  "electrophysiolog") so a single stem catches every inflection
 *  ("cardiology", "cardiologist", "cardiological"). A trailing `\b` would
 *  defeat that (it demands a word boundary right after the stem, which
 *  fails on "cardiolog|y"), so we omit it and let the stem prefix-match. */
const kw = (s: string): RegExp =>
  new RegExp(`\\b${s.toLowerCase().replace(/[^a-z0-9]+/g, "\\s*")}`);

/** Build several keywords from a parent name + extra aliases. */
const kws = (...patterns: (string | RegExp)[]): RegExp[] =>
  patterns.map(p => (p instanceof RegExp ? p : kw(p)));

// ── Canonical list ────────────────────────────────────────────────────
//
// Roughly mirrors the website ordering, but sub-specialties are pulled
// to the top of each cluster so the first-match-wins lookup picks the
// most specific entry. This is the SINGLE place to edit when the
// website list changes.
//
export const SPECIALTY_GROUPS: SpecialtyGroup[] = [
  // ── Pediatrics sub-specialties (must come BEFORE plain pediatric tags) ─
  { name: "Pediatric Cardiothoracic Surgeon", parent: "Cardiothoracic Surgery", keywords: kws("pediatric cardiothoracic", "paediatric cardiothoracic") },
  { name: "Pediatric Cardiovascular Surgeon", parent: "Cardiovascular Surgery", keywords: kws("pediatric cardiovascular", "paediatric cardiovascular") },
  { name: "Pediatric Critical Care", parent: "Critical Care Medicine",          keywords: kws("pediatric critical care", "paediatric critical care", /\bpicu\b/) },
  { name: "Pediatric Cardiology",  parent: "Cardiology",                        keywords: kws("pediatric cardio", "paediatric cardio") },
  { name: "Pediatric Endocrinology", parent: "Endocrinology",                   keywords: kws("pediatric endocrin", "paediatric endocrin") },
  { name: "Pediatric ENT Surgeon", parent: "ENT",                               keywords: kws("pediatric ent surg", "paediatric ent surg") },
  { name: "Pediatric ENT",         parent: "ENT",                               keywords: kws("pediatric ent", "paediatric ent") },
  { name: "Pediatric Gastroenterology", parent: "Gastroenterology",             keywords: kws("pediatric gastro", "paediatric gastro") },
  { name: "Pediatric Hematology", parent: "Hematology",                         keywords: kws("pediatric haemat", "pediatric hemat", "paediatric haemat", "paediatric hemat") },
  { name: "Pediatric Hepatology", parent: "Hepatologist",                       keywords: kws("pediatric hepat", "paediatric hepat") },
  { name: "Pediatric Immunologist", parent: "Clinical Immunology",              keywords: kws("pediatric immunolog", "paediatric immunolog") },
  { name: "Pediatric Infectious diseases", parent: "Infectious Disease",        keywords: kws("pediatric infectious", "paediatric infectious") },
  { name: "Pediatric Neonatology", parent: "Neonatology",                       keywords: kws("pediatric neonat", "paediatric neonat") },
  { name: "Pediatric Nephrology", parent: "Nephrology",                         keywords: kws("pediatric nephro", "paediatric nephro") },
  { name: "Pediatric Neurosurgeon", parent: "Neurosurgeon",                     keywords: kws("pediatric neurosurg", "paediatric neurosurg") },
  { name: "Pediatric Neurology", parent: "Neurology",                           keywords: kws("pediatric neuro", "paediatric neuro") },
  { name: "Pediatric Oncology", parent: "Oncology",                             keywords: kws("pediatric oncolog", "paediatric oncolog") },
  { name: "Pediatric Opthalmology", parent: "Ophthalmology",                    keywords: kws("pediatric ophthalm", "pediatric opthalm", "paediatric ophthalm", "paediatric opthalm") },
  { name: "Pediatric Orthopedic", parent: "Orthopaedic",                        keywords: kws("pediatric orthop", "paediatric orthop") },
  { name: "Pediatric Pulmonology", parent: "Pulmonology",                       keywords: kws("pediatric pulmon", "paediatric pulmon") },
  { name: "Pediatric Radiology", parent: "Radiology",                           keywords: kws("pediatric radiolog", "paediatric radiolog") },
  { name: "Pediatric Rehabilitation", parent: "Physical Medicine and Rehabilitation", keywords: kws("pediatric rehab", "paediatric rehab") },
  { name: "Pediatric Rheumatology", parent: "Rheumatologist",                   keywords: kws("pediatric rheumat", "paediatric rheumat") },
  { name: "Pediatric Sports Medicine", parent: "Sports Medicine",               keywords: kws("pediatric sports", "paediatric sports") },
  { name: "Pediatric Surgery", parent: "General Surgery",                       keywords: kws("pediatric surger", "paediatric surger") },
  { name: "Pediatric Urology", parent: "Urology",                               keywords: kws("pediatric urolog", "paediatric urolog") },
  { name: "Pediatric Anesthesia", parent: "Anesthesiology",                     keywords: kws("pediatric anesth", "paediatric anesth", "pediatric anaesth", "paediatric anaesth") },
  { name: "Pediatric Dentist", parent: "Dentist",                               keywords: kws("pediatric dent", "paediatric dent") },
  { name: "Pediatric Allergist", parent: "Allergist",                           keywords: kws("pediatric allerg", "paediatric allerg") },
  { name: "Pediatrics", parent: null,                                           keywords: kws("pediatric", "paediatric", "paed", "peds") },

  // ── Cardiology sub-specialties (before parent) ────────────────────────
  { name: "Interventional Cardiologist", parent: "Cardiology",                  keywords: kws("interventional cardio", "cath lab", "angioplast") },
  { name: "Electrophysiology", parent: "Cardiology",                            keywords: kws("electrophysiolog", /\bep\b\s*cardio/, "arrhyth") },
  { name: "Cardiology", parent: null,                                           keywords: kws("cardiolog", "cardiac", /\bheart\b/) },

  // ── Cardiothoracic / Cardiovascular / Cardiac Surgery ────────────────
  { name: "Cardiothoracic Surgery", parent: null,                               keywords: kws("cardiothoracic", "cardio thoracic", /\bcvts?\b/) },
  { name: "Cardiovascular Surgery", parent: null,                               keywords: kws("cardiovascular surg") },
  { name: "Cardiac Surgery",        parent: null,                               keywords: kws("cardiac surger", "heart surger") },

  // ── Neuro family ──────────────────────────────────────────────────────
  { name: "Interventional Neuroradiologist", parent: "Neuroradiology",         keywords: kws("interventional neuro radio") },
  { name: "Neurosurgeon",          parent: null,                                keywords: kws("neurosurg") },
  { name: "Neuroradiology",        parent: "Radiology",                         keywords: kws("neuro radiolog") },
  { name: "Neuropathology",        parent: "Pathology",                         keywords: kws("neuro patholog") },
  { name: "Neurophysiology",       parent: null,                                keywords: kws("neuro physiolog") },
  { name: "Neuro Rehabilitation",  parent: "Physical Medicine and Rehabilitation", keywords: kws("neuro rehab") },
  { name: "Neurocritical care",    parent: "Critical Care Medicine",            keywords: kws("neurocritical", "neuro critical") },
  { name: "Stroke Medicine",       parent: "Neurology",                         keywords: kws("stroke") },
  { name: "Neurology",             parent: null,                                keywords: kws("neurolog") },

  // ── Critical / Intensive Care family ──────────────────────────────────
  { name: "Surgical Critical Care", parent: "Critical Care Medicine",           keywords: kws("surgical critical") },
  { name: "Intensivist",           parent: "Intensive Care Medicine",           keywords: kws("intensivist") },
  { name: "Intensive Care Medicine", parent: null,                              keywords: kws("intensive care", /\bicu\b/) },
  { name: "Critical Care Medicine", parent: null,                               keywords: kws("critical care") },
  { name: "Pulmonology Intensivist", parent: "Pulmonology",                     keywords: kws("pulmonology intensiv") },

  // ── ENT / Head & Neck ─────────────────────────────────────────────────
  { name: "Head & Neck Surgery",   parent: "ENT",                               keywords: kws("head and neck", "head & neck") },
  { name: "ENT",                   parent: null,                                keywords: kws(/\bent\b/, "otolaryng") },

  // ── Ophthalmology family ──────────────────────────────────────────────
  { name: "Orthoptist - Optometry", parent: null,                               keywords: kws("orthoptist", "optometr") },
  { name: "Ophthalmology",         parent: null,                                keywords: kws("ophthalm", "opthalm", "ocular", "retina", "retinal", "cornea", "glaucoma", "lasik", "uveitis", "eye") },

  // ── Oncology sub-specialties (before parent) ─────────────────────────
  { name: "Hematology Oncology",   parent: "Hematology",                        keywords: kws("haematology oncology", "hematology oncology", "haem onc", "hem onc") },
  { name: "Surgical Oncology",     parent: "Oncology",                          keywords: kws("surgical oncolog") },
  { name: "Radiation Oncology",    parent: "Oncology",                          keywords: kws("radiation oncolog", "radiotherap") },
  { name: "Medical Oncology",      parent: "Oncology",                          keywords: kws("medical oncolog") },
  { name: "Medical Oncologist",    parent: "Oncology",                          keywords: kws("medical oncologist") },
  { name: "Gynecological Oncology", parent: "Oncology",                         keywords: kws("gyna?ecological oncolog", "gyn onc") },
  { name: "Oncology",              parent: null,                                keywords: kws("oncolog", "cancer") },

  // ── Obs/Gyn family ────────────────────────────────────────────────────
  { name: "Fetal Medicine",        parent: "Obstetrics and Gynecology",         keywords: kws("fetal medicine", "foetal medicine", "maternal fetal") },
  { name: "Urogynaecology",        parent: "Obstetrics and Gynecology",         keywords: kws("urogyn") },
  { name: "Midwife",               parent: "Obstetrics and Gynecology",         keywords: kws("midwife", "midwifer") },
  { name: "IVF",                   parent: "Obstetrics and Gynecology",         keywords: kws(/\bivf\b/, "fertilit", "reproductive medic") },
  { name: "Obstetrics and Gynecology", parent: null,                            keywords: kws("obstetric", "gyna?ecolog", /\bobs?[-\s/]?gyn/, /\bog\b/) },

  // ── Surgery sub-specialties (before plain Surgery) ───────────────────
  { name: "Endovascular Surgery",  parent: "Vascular Surgery",                  keywords: kws("endovascular") },
  { name: "Vascular Surgery",      parent: null,                                keywords: kws("vascular surg") },
  { name: "Endourological surgery", parent: "Urology",                          keywords: kws("endourolog") },
  { name: "Visceral Surgery",      parent: "Visceral Surgeon",                  keywords: kws("visceral surg") },
  { name: "Visceral Surgeon",      parent: null,                                keywords: kws("visceral") },
  { name: "Hand Surgery",          parent: "Orthopaedic",                       keywords: kws("hand surg") },
  { name: "Shoulders",             parent: "Orthopaedic",                       keywords: kws("shoulder") },
  { name: "Spine Surgeon",         parent: null,                                keywords: kws("spine surg") },
  { name: "Trauma Surgery",        parent: "General Surgery",                   keywords: kws("trauma surg") },
  { name: "Thoracic Surgery",      parent: null,                                keywords: kws("thoracic surg") },
  { name: "Plastic Surgery",       parent: null,                                keywords: kws("plastic surg", "aesthetic surg", "reconstructive surg") },
  { name: "Cosmetic",              parent: "Dermatology",                       keywords: kws("cosmetic", "aesthetic") },
  { name: "Hair transplant Surgery", parent: null,                              keywords: kws("hair transplant") },
  { name: "Bariatric Surgery",     parent: null,                                keywords: kws("bariatric", "obesity surg") },
  { name: "Colorectal",            parent: null,                                keywords: kws("colorect", "colon rect") },
  { name: "Upper GI",              parent: "Gastroenterology",                  keywords: kws("upper gi", "upper gastrointestinal") },
  { name: "Oral Maxillofacial Surgery", parent: "Oral Surgeon",                 keywords: kws("maxillofacial", "oral and maxillo", /\bomfs\b/) },
  { name: "Oral Surgeon",          parent: null,                                keywords: kws("oral surg") },
  { name: "Breast Surgery",        parent: null,                                keywords: kws("breast surg") },
  { name: "Minimally Invasive",    parent: null,                                keywords: kws("minimally invasive", /\bmis\b/) },
  { name: "Orthopaedic",           parent: null,                                keywords: kws("orthop", /\bortho\b/) },
  { name: "General Surgery",       parent: null,                                keywords: kws("general surger", /\bgen\.?\s*surg/, /\bsurgeon\b/, /\bsurgery\b/) },

  // ── Pathology / Radiology / Diagnostics ──────────────────────────────
  { name: "Anatomic Pathology",    parent: "Pathology",                         keywords: kws("anatomic patholog", "anatomical patholog") },
  { name: "Histopathology",        parent: "Pathology",                         keywords: kws("histopatholog") },
  { name: "Pathology",             parent: null,                                keywords: kws("patholog") },
  { name: "Breast Radiology",      parent: "Radiology",                         keywords: kws("breast radiolog") },
  { name: "Diagnostic Radiology",  parent: "Radiology",                         keywords: kws("diagnostic radiolog") },
  { name: "Interventional Radiologist", parent: "Radiology",                    keywords: kws("interventional radio") },
  { name: "Nuclear Medicine",      parent: null,                                keywords: kws("nuclear medic") },
  { name: "Radiographer",          parent: null,                                keywords: kws("radiograph") },
  { name: "Radiation Therapist",   parent: null,                                keywords: kws("radiation therap") },
  { name: "Radiology",             parent: null,                                keywords: kws("radiolog") },

  // ── Hematology / Hepatology ──────────────────────────────────────────
  { name: "Transfusion Medicine",  parent: "Hematology",                        keywords: kws("transfusion medic", "blood bank") },
  { name: "Hematology",            parent: null,                                keywords: kws("haematolog", "hematolog") },
  { name: "Hepatologist",          parent: null,                                keywords: kws("hepatolog", "liver") },

  // ── Other medical specialties ────────────────────────────────────────
  { name: "Gastrointestinal",      parent: "Gastroenterology",                  keywords: kws("gastrointestinal") },
  { name: "Gastroenterology",      parent: null,                                keywords: kws("gastroenter", /\bgi\b/) },
  { name: "Family Medicine",       parent: null,                                keywords: kws("family medic", "family physic", "famil practic") },
  { name: "Emergency Medicine",    parent: null,                                keywords: kws("emergency medic", "emergency physic", /\ber\b\s*physic/, "casualty") },
  { name: "Internal Medicine",     parent: null,                                keywords: kws("internal medic", "internist") },
  { name: "Geriatric",             parent: null,                                keywords: kws("geriatric") },
  { name: "GP",                    parent: null,                                keywords: kws(/\bgp\b/, "general practit") },
  { name: "Infectious Disease",    parent: null,                                keywords: kws("infectious disease", /\bid\b\s*physic/) },
  { name: "Endocrinology",         parent: null,                                keywords: kws("endocrin", "diabet") },
  { name: "Nephrology",            parent: null,                                keywords: kws("nephrolog", "renal") },
  { name: "Rheumatologist",        parent: null,                                keywords: kws("rheumat") },
  { name: "Dermatology",           parent: null,                                keywords: kws("dermatolog", "skin") },
  { name: "Allergist",             parent: null,                                keywords: kws("allergist", "allergolog") },
  { name: "Allergology",           parent: "Allergist",                         keywords: kws("allergolog") },
  { name: "Clinical Immunology",   parent: null,                                keywords: kws("immunolog") },

  // ── Anesthesia + pain ────────────────────────────────────────────────
  { name: "Anesthesiology",        parent: null,                                keywords: kws("anesth", "anaesth") },
  { name: "Pain Medicine",         parent: null,                                keywords: kws("pain medic", "pain physic") },
  { name: "Palliative Care",       parent: null,                                keywords: kws("palliative") },

  // ── Pulmonology / Respiratory ────────────────────────────────────────
  { name: "Pulmonology",           parent: null,                                keywords: kws("pulmonolog", "pulmonary") },
  { name: "Respiratory",           parent: null,                                keywords: kws("respiratory") },

  // ── Psychiatry / Psychology ──────────────────────────────────────────
  { name: "Addiction Specialist",  parent: "Psychiatry",                        keywords: kws("addiction") },
  { name: "Psychotherapy",         parent: "Psychiatry",                        keywords: kws("psychotherap") },
  { name: "Psychiatry",            parent: null,                                keywords: kws("psychiat") },
  { name: "Psychology",            parent: null,                                keywords: kws("psycholog") },

  // ── Dental ────────────────────────────────────────────────────────────
  { name: "Dental Surgeon",        parent: null,                                keywords: kws("dental surg") },
  { name: "Dentist",               parent: null,                                keywords: kws("dentist", "dent") },

  // ── Rehab / Therapy / Misc ───────────────────────────────────────────
  { name: "Occupational Therapy",  parent: null,                                keywords: kws("occupational therap") },
  { name: "Occupational Medicine", parent: null,                                keywords: kws("occupational medic") },
  { name: "Physical Medicine and Rehabilitation", parent: null,                 keywords: kws("physical medicine and rehab", "physiatr", "rehab") },
  { name: "Physiatrist",           parent: "Physical Medicine and Rehabilitation", keywords: kws("physiatrist") },
  { name: "Sports Medicine",       parent: null,                                keywords: kws("sports medic") },
  { name: "NICU",                  parent: "Neonatology",                       keywords: kws(/\bnicu\b/, "neonatal intensive") },
  { name: "PICU",                  parent: "Pediatrics",                        keywords: kws(/\bpicu\b/, "pediatric intensive", "paediatric intensive") },
  { name: "Neonatology",           parent: null,                                keywords: kws("neonatolog", "neonatal") },
  { name: "Nurses",                parent: null,                                keywords: kws("nurse", "nursing") },
  { name: "Medical Genetics",      parent: null,                                keywords: kws("genetic") },
  { name: "Molecular Genetic",     parent: "Medical Genetics",                  keywords: kws("molecular genetic") },
  { name: "Medical Physicist",     parent: null,                                keywords: kws("medical physic") },
  { name: "Microbiologist",        parent: null,                                keywords: kws("microbiolog") },
  { name: "Urology",               parent: null,                                keywords: kws("urolog") },
];

// Index from canonical name → group (lazy, computed once on first use).
let _byName: Map<string, SpecialtyGroup> | null = null;
function byName() {
  if (!_byName) _byName = new Map(SPECIALTY_GROUPS.map(g => [g.name, g]));
  return _byName;
}

/** Normalize a raw specialty string into its canonical group name, or
 *  null if nothing matched. Matching is case-insensitive on a
 *  punctuation-lite form so "Cardio Consultant (Adult)" matches
 *  "Cardiology" and "Retinal Specialist" matches "Ophthalmology". */
export function groupSpecialty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[._\-/\\]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  for (const g of SPECIALTY_GROUPS) {
    for (const re of g.keywords) {
      if (re.test(s)) return g.name;
    }
  }
  return null;
}

/** Return the canonical group plus its parent (if any), useful for
 *  rollup reports. "Retinal specialist" → { group: "Ophthalmology",
 *  parent: null }; "Interventional Cardiologist" → { group: "...",
 *  parent: "Cardiology" }. */
export function groupSpecialtyWithParent(raw: string | null | undefined): { group: string; parent: string | null } | null {
  const name = groupSpecialty(raw);
  if (!name) return null;
  const g = byName().get(name);
  return { group: name, parent: g?.parent ?? null };
}

/** Roll a sub-specialty up to its parent (or itself if it has none).
 *  Useful for high-level dashboard groupings — e.g. Reports rolls all
 *  cardiology sub-specialties under "Cardiology". */
export function rollupSpecialty(raw: string | null | undefined): string | null {
  const wp = groupSpecialtyWithParent(raw);
  if (!wp) return null;
  return wp.parent ?? wp.group;
}

/** If `raw` resolves to a SUB-specialty (a canonical entry that has a
 *  parent — e.g. "Electrophysiology" under "Cardiology"), return its
 *  canonical name + parent. Returns null for top-level specialties and
 *  unmatched text. Lets the matcher tell "this target is a niche term
 *  within a broader specialty" so it can scan profiles for it. */
export function asSubspecialty(raw: string | null | undefined): { name: string; parent: string } | null {
  const wp = groupSpecialtyWithParent(raw);
  if (wp && wp.parent) return { name: wp.group, parent: wp.parent };
  return null;
}

/** Does this free-text blob mention the given canonical specialty, by
 *  its keyword patterns? Used to detect a sub-specialty named anywhere
 *  in a doctor's profile even when their headline specialty is just the
 *  parent (e.g. profile bio says "electrophysiology", specialty column
 *  says "Cardiology"). */
export function textMentionsSpecialty(text: string | null | undefined, canonicalName: string): boolean {
  if (!text) return false;
  const g = byName().get(canonicalName);
  if (!g) return false;
  const s = text.toLowerCase().replace(/[._\-/\\]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return false;
  return g.keywords.some(re => re.test(s));
}

/** All canonical specialty names from the AA website list, in display
 *  order. Used by the Specialty-of-the-day rotation queue UI. */
export function listCanonicalSpecialties(): string[] {
  // De-dupe (the list above is ordered by specificity, but for UI we
  // want each canonical name once, in a stable presentation order).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of SPECIALTY_GROUPS) {
    if (seen.has(g.name)) continue;
    seen.add(g.name);
    out.push(g.name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

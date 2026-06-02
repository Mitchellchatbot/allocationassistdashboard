/**
 * Canonical specialty grouping.
 *
 * Zoho stores raw "Specialty" strings exactly as the recruiter typed them —
 * which means thousands of variants: "Cardiology", "Adult Cardiology",
 * "Interventional Cardiology", "Cardiologist (Adult)", "Cardio", etc. For
 * the batch-send rotation we only want ~50 canonical buckets, not the long
 * tail, so consumers can pick "Cardiology" once and have it cover every
 * variant in the database.
 *
 * Strategy: for each canonical group, list keyword regexes. The first
 * group whose keyword matches wins — so specific groups (Cardiothoracic
 * Surgery, Pediatric Cardiology) must come *before* their broader parents
 * (Surgery, Cardiology) in the list.
 *
 * `groupSpecialty(raw)` returns the canonical name or `null` when nothing
 * matched (used to surface a "Long tail / unmapped" bucket so we know what
 * to add to the table over time).
 */

export interface SpecialtyGroup {
  name:     string;
  keywords: RegExp[];
}

// Order matters — specific first, broad last. The matcher returns the first hit.
export const SPECIALTY_GROUPS: SpecialtyGroup[] = [
  // ── Surgical sub-specialties (must come before "Surgery") ──────────────
  { name: "Cardiothoracic Surgery", keywords: [/cardio[-\s]?thoracic/, /cardiac surger/, /heart surger/, /\bcvts?\b/] },
  { name: "Neurosurgery",           keywords: [/neuro[-\s]?surger/, /\bneurosurg/] },
  { name: "Orthopedic Surgery",     keywords: [/orthop(a)?edic/, /\bortho\b/, /\bortho-/, /trauma\b.*surger/, /spine surger/, /joint replac/] },
  { name: "Plastic Surgery",        keywords: [/plastic surger/, /aesthetic surger/, /cosmetic surger/, /reconstructive/] },
  { name: "Vascular Surgery",       keywords: [/vascular/] },
  { name: "Pediatric Surgery",      keywords: [/paediatric surger/, /pediatric surger/] },
  { name: "Maxillofacial Surgery",  keywords: [/maxillofacial/, /oral.*maxillo/, /omfs/] },
  { name: "Bariatric Surgery",      keywords: [/bariatric/, /obesity surger/] },
  { name: "Colorectal Surgery",     keywords: [/colorect/, /colon.*rect/] },
  { name: "General Surgery",        keywords: [/general surger/, /\bgen\.?\s?surg/, /\bsurgery\b/, /surgeon/] },

  // ── Cardiology sub-specialties (before Cardiology) ──────────────────────
  { name: "Pediatric Cardiology",   keywords: [/paediatric cardio/, /pediatric cardio/] },
  { name: "Interventional Cardiology", keywords: [/interventional cardio/, /cath.*lab/, /angioplast/] },
  { name: "Electrophysiology",      keywords: [/electrophysiolog/, /\bep\b.*cardio/, /arrhyth/] },
  { name: "Cardiology",             keywords: [/cardio/, /\bcardiac\b/, /heart\b/] },

  // ── Obs/Gyn variants ───────────────────────────────────────────────────
  { name: "Obstetrics & Gynaecology", keywords: [/obstetric/, /gynae?col/, /\bob[-\s/]?gyn/, /\bog\b/, /maternal/, /\bivf\b/, /fertilit/, /reproductive/] },

  // ── Pediatrics sub-specialties + main ──────────────────────────────────
  { name: "Neonatology",            keywords: [/neonat/, /\bnicu\b/] },
  { name: "Pediatric Neurology",    keywords: [/p(a)?ediatric neuro/] },
  { name: "Pediatrics",             keywords: [/p(a)?ediatric/, /\bpeds?\b/, /child(ren)? medicine/] },

  // ── Medical sub-specialties (each before Internal Medicine) ────────────
  { name: "Endocrinology",          keywords: [/endocrin/, /diabet(es|ic|olog)/] },
  { name: "Gastroenterology",       keywords: [/gastro/, /\bgi\b/, /hepatolog/, /liver\b/] },
  { name: "Nephrology",             keywords: [/nephrolog/, /\brenal\b/, /\bkidney\b/, /dialys/] },
  { name: "Pulmonology",            keywords: [/pulmonolog/, /respirat/, /\bchest\b/, /pulmon/] },
  { name: "Rheumatology",           keywords: [/rheumat/] },
  { name: "Hematology",             keywords: [/h(a)?ematolog/, /blood.*disorder/] },
  { name: "Oncology",               keywords: [/oncolog/, /cancer\b/, /chemother/, /tumour/, /tumor/] },
  { name: "Infectious Disease",     keywords: [/infectious/, /\bid\b.*physician/, /tropical med/] },
  { name: "Allergy & Immunology",   keywords: [/allerg/, /immunolog/] },
  { name: "Geriatrics",             keywords: [/geriatr/, /elder/] },
  { name: "Neurology",              keywords: [/neurolog/, /\bneuro\b/] },
  { name: "Psychiatry",             keywords: [/psychiatr/, /mental health/, /\bpsych\b/] },
  { name: "Psychology",             keywords: [/psycholog/, /counsel(l)?or/, /therap.*counsel/] },
  { name: "Dermatology",            keywords: [/dermat/, /skin\b/] },
  { name: "Ophthalmology",          keywords: [/ophthalm/, /\beye\b/, /retina/, /optometr/] },
  { name: "ENT",                    keywords: [/otolaryngolog/, /\bent\b/, /ear.*nose.*throat/] },
  { name: "Urology",                keywords: [/urolog/] },
  { name: "Internal Medicine",      keywords: [/internal med/, /internist/, /\bim\b/, /general med/, /\bmedicine\b/] },

  // ── Acute care / hospital-based ────────────────────────────────────────
  { name: "Anesthesia",             keywords: [/an(a)?esthe/, /\bicu\b.*an(a)?esthe/] },
  { name: "Critical Care",          keywords: [/critical care/, /intensiv/, /\bicu\b/, /\bccu\b/] },
  { name: "Emergency Medicine",     keywords: [/emergenc/, /\ber\b\s+med/, /\baccident/, /\bcasualty\b/] },
  { name: "Pain Medicine",          keywords: [/pain (medicine|management|specialist|physician)/] },
  { name: "Sports Medicine",        keywords: [/sports med/] },

  // ── Diagnostics ────────────────────────────────────────────────────────
  { name: "Radiology",              keywords: [/radiolog/, /\bmri\b/, /\bct\b.*scan/, /imag(ing|e)/, /ultrasound/, /sonograph/, /interventional radiolog/] },
  { name: "Pathology",              keywords: [/patholog/, /histopath/, /cytopath/] },
  { name: "Nuclear Medicine",       keywords: [/nuclear med/] },
  { name: "Laboratory Medicine",    keywords: [/\blab(oratory)?\b/, /microbiolog/, /biochemist/, /\bclinical chem/] },

  // ── Primary / community ────────────────────────────────────────────────
  { name: "Family Medicine",        keywords: [/family med/, /general practi/, /\bgp\b/, /\bfp\b/, /primary care/, /family physician/] },
  { name: "Preventive Medicine",    keywords: [/preventive/, /public health/, /occupational health/, /community med/] },
  { name: "Rehabilitation",         keywords: [/rehab/, /physical med.*rehab/, /\bpm.*r\b/] },

  // ── Allied health ──────────────────────────────────────────────────────
  { name: "Physiotherapy",          keywords: [/physiother/, /physical therap/, /\bpt\b/] },
  { name: "Occupational Therapy",   keywords: [/occupational therap/, /\bot\b/] },
  { name: "Speech Therapy",         keywords: [/speech (therap|patholog|language)/, /\bslp\b/] },
  { name: "Nursing",                keywords: [/\bnurs(e|ing)\b/, /\brn\b/, /\bbsn\b/, /staff nurse/, /midwif/] },
  { name: "Pharmacy",               keywords: [/pharmac/, /\bpharm\b/] },
  { name: "Nutrition & Dietetics",  keywords: [/dieti(t|c)/, /nutrition/] },
  { name: "Audiology",              keywords: [/audiolog/] },

  // ── Dentistry & dental specialties ─────────────────────────────────────
  { name: "Orthodontics",           keywords: [/orthodonti/] },
  { name: "Endodontics",            keywords: [/endodonti/] },
  { name: "Periodontics",           keywords: [/periodonti/, /gum/] },
  { name: "Prosthodontics",         keywords: [/prosthodonti/] },
  { name: "Pediatric Dentistry",    keywords: [/p(a)?edodonti/, /p(a)?ediatric dent/] },
  { name: "Dentistry",              keywords: [/dent(al|ist)/] },

  // ── Other ──────────────────────────────────────────────────────────────
  { name: "Genetics",               keywords: [/genetic/] },
  { name: "Palliative Care",        keywords: [/palliat/] },
  { name: "Acupuncture & TCM",      keywords: [/acupuncture/, /traditional chinese/, /\btcm\b/] },
];

/** Normalize a raw specialty string into its canonical group name, or null
 *  if nothing matched. Matching is case-insensitive on a punctuation-lite
 *  form so "Adult Cardiology / Interventional" hits "Interventional
 *  Cardiology" via the `/interventional cardio/` keyword. */
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

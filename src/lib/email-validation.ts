// Pre-send validation: find template variables that would render BLANK (or as a
// literal {{token}}) so we can block the send and tell the team exactly why each
// one is empty — e.g. {{city}} is blank because the hospital has no city on file.
//
// Mirrors renderTemplate's section handling so a field that's intentionally
// hidden inside a {{#section}}…{{/section}} (or shown by {{^inverted}}) doesn't
// get flagged — only fields that actually leave a gap in the sent email do.

// Tokens the send functions ALWAYS fill (raw HTML blocks, signatures, the card
// image switch) — never flag these as "unfilled".
const ALWAYS_FILLED = new Set<string>([
  "signature", "signature_text", "doctors_table_html", "doctor_card_html",
  "doctor_row_table_html", "logo_header", "hospital_image", "doctor_card_image_url",
  "custom_message", "profile_link", "profile_url",
]);

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || String(v).trim() === "";

/**
 * Return the set of variables in `templateText` that would render blank given
 * `vars`, after resolving section blocks (hidden sections don't count).
 */
export function detectUnfilledVars(templateText: string, vars: Record<string, string | undefined>): string[] {
  // Resolve {{#t}}…{{/t}} — drop the block when t is blank so its inner tokens
  // don't count (they won't render).
  let b = templateText.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => (isBlank(vars[key]) ? "" : inner));
  // Resolve {{^t}}…{{/t}} — the inverse.
  b = b.replace(/\{\{\^([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => (isBlank(vars[key]) ? inner : ""));

  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b)) !== null) {
    const key = m[1];
    if (ALWAYS_FILLED.has(key)) continue;
    if (isBlank(vars[key])) out.add(key);
  }
  return [...out];
}

// Human, actionable reason each variable is empty — points at where to fix it.
const REASONS: Record<string, string> = {
  city:                    "the hospital has no city set",
  country:                 "the hospital has no country set",
  hospital_name:           "no hospital is selected",
  hospital_contact_name:   "the hospital has no contact name",
  hospital_description:    "this hospital has no description on file",
  hospital_profile_url:    "this hospital has no profile link on file",
  doctor_name:             "the doctor has no name on file",
  doctor_title:            "the doctor's title is blank on their profile",
  doctor_specialty:        "the doctor's specialty is blank on their profile",
  doctor_speciality:       "the doctor's specialty is blank on their profile",
  doctor_bio:              "the doctor has no bio / area of interest on their profile",
  doctor_email:            "the doctor has no email on file",
  doctor_phone:            "the doctor has no phone on file",
  doctor_country_training: "the doctor's country of training is blank",
  doctor_years_experience: "the doctor's years of experience is blank",
  doctor_nationality:      "the doctor's nationality is blank",
  doctor_age:              "the doctor's age / date of birth is blank",
  doctor_marital_status:   "the doctor's marital status is blank",
  doctor_family_status:    "the doctor's family status is blank",
  doctor_license:          "the doctor's UAE license is blank",
  doctor_salary_expectation: "the doctor's salary expectation is blank",
  doctor_notice_period:    "the doctor's notice period is blank",
};

const WHERE: Record<string, string> = {
  city:                  "Automations → Hospitals",
  country:               "Automations → Hospitals",
  hospital_contact_name: "Automations → Hospitals",
  hospital_description:  "Automations → Hospitals",
  hospital_profile_url:  "Automations → Hospitals",
};

export interface UnfilledIssue { token: string; reason: string; where?: string }

/** Map raw tokens to {token, reason, where} for display. */
export function describeUnfilled(tokens: string[]): UnfilledIssue[] {
  return tokens.map(t => ({
    token: t,
    reason: REASONS[t] ?? "this field is blank on the record",
    where: WHERE[t],
  }));
}

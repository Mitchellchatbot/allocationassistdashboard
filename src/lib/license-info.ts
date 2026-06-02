/**
 * Medical license metadata for Gulf hospitals.
 *
 * Used by the LicensePills UI to render small DHA / DOH / MOH / SCFHS / QCHP
 * chips with hover-explanations, so anyone reading the dashboard (especially
 * sales teammates who don't live in the licensing world) can tell at a glance
 * what region a doctor is cleared to work in.
 *
 * No matching logic lives here — that's match-score.ts. This module is
 * presentation-only.
 */

export interface LicenseInfo {
  code:     string;   // short pill label
  fullName: string;
  region:   string;   // tooltip subtitle
  tone:     "teal" | "indigo" | "violet" | "amber" | "rose";
}

export const LICENSE_META: Record<string, LicenseInfo> = {
  DHA:   { code: "DHA",   fullName: "Dubai Health Authority",                region: "Required to practice in Dubai",                 tone: "teal" },
  DOH:   { code: "DOH",   fullName: "Department of Health, Abu Dhabi",       region: "Required for Abu Dhabi + Al Ain (was HAAD)",    tone: "indigo" },
  MOH:   { code: "MOH",   fullName: "UAE Ministry of Health",                region: "Required for Sharjah, RAK, Ajman, Fujairah, UAQ", tone: "violet" },
  SCFHS: { code: "SCFHS", fullName: "Saudi Commission for Health Specialties", region: "Required for Saudi Arabia (Riyadh, Jeddah, ...)", tone: "amber" },
  QCHP:  { code: "QCHP",  fullName: "Qatar Council for Healthcare Practitioners", region: "Required for Qatar (Doha, Al Rayyan)",       tone: "rose"  },
};

export const LICENSE_TONE_CLS: Record<LicenseInfo["tone"], string> = {
  teal:   "bg-teal-50 text-teal-700 border-teal-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  amber:  "bg-amber-50 text-amber-700 border-amber-200",
  rose:   "bg-rose-50 text-rose-700 border-rose-200",
};

/** Resolve the license codes a doctor holds, from any combination of:
 *   - Zoho lead boolean flags (Has_DHA / Has_DOH / Has_MOH)
 *   - Free-text license string (looks for the codes inside, case-insensitive)
 *
 * Returns codes in canonical priority order (DHA → DOH → MOH → SCFHS → QCHP)
 * so the chips render consistently across the app. */
export function detectLicenses(input: {
  has_dha?:     boolean | null;
  has_doh?:     boolean | null;
  has_moh?:     boolean | null;
  license_text?: string | null;
}): string[] {
  const found = new Set<string>();
  if (input.has_dha) found.add("DHA");
  if (input.has_doh) found.add("DOH");
  if (input.has_moh) found.add("MOH");
  const text = (input.license_text ?? "").toLowerCase();
  if (text) {
    if (/\bdha\b/.test(text))           found.add("DHA");
    if (/\bdoh\b|\bhaad\b/.test(text))  found.add("DOH");
    if (/\bmoh\b/.test(text))           found.add("MOH");
    if (/\bscfhs\b|\bsaudi\b/.test(text)) found.add("SCFHS");
    if (/\bqchp\b|\bqatar\b/.test(text))  found.add("QCHP");
  }
  const order = ["DHA", "DOH", "MOH", "SCFHS", "QCHP"];
  return order.filter(c => found.has(c));
}

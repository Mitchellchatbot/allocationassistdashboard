// Shared "working opportunity" doctor-email composer.
//
// A doctor put forward to several hospitals gets ONE consolidated email — a
// location-grouped list of those hospitals (by city, each with its photo),
// titled by country ("Working opportunity in Qatar"). This replaces the old
// one-email-per-hospital doctor note, which the team found didn't work for
// multi-hospital sends.
//
// Both edge functions use it so the two flows produce an identical doctor email:
//   • send-batch      — the tabular batch's optional doctor leg (always a list)
//   • send-flow-email — the singular flow's doctor leg, when a doctor was sent to
//                       MORE THAN ONE hospital in the same send

export interface WorkingOpHospital {
  name:       string;
  city?:      string | null;
  country?:   string | null;
  image_url?: string | null;
  /** Optional per-hospital link (e.g. the hospital's page). Rendered on the name
   *  when present; omitted otherwise (no placeholder/broken links). */
  link?:      string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Distinct countries across the hospitals, joined for a subject line:
 *  "Qatar", "Qatar & UAE", "Qatar, UAE & Oman". Empty when none are known. */
export function workingOpCountries(hospitals: WorkingOpHospital[]): string {
  const seen: string[] = [];
  for (const h of hospitals) {
    const c = String(h.country ?? "").trim();
    if (c && !seen.some(s => s.toLowerCase() === c.toLowerCase())) seen.push(c);
  }
  if (seen.length === 0) return "";
  if (seen.length === 1) return seen[0];
  return `${seen.slice(0, -1).join(", ")} & ${seen[seen.length - 1]}`;
}

/** The subject: "Working opportunity in <countries> - Allocation Assist".
 *  `fallbackLocation` (e.g. a batch's country) is used when the hospitals carry
 *  no country. Plural "opportunities" when there's no single location. */
export function buildWorkingOpSubject(hospitals: WorkingOpHospital[], fallbackLocation?: string | null): string {
  const loc = workingOpCountries(hospitals) || String(fallbackLocation ?? "").trim();
  return loc
    ? `Working opportunity in ${loc} - Allocation Assist`
    : "Working opportunities - Allocation Assist";
}

/** The location-grouped hospital list (by city), each with its photo + optional
 *  link. This is the heart of the consolidated email. */
export function buildDoctorHospitalsHtml(hospitals: WorkingOpHospital[]): string {
  const byCity = new Map<string, WorkingOpHospital[]>();
  for (const h of hospitals) {
    const c = String(h.city ?? "").trim() || "Other";
    const list = byCity.get(c) ?? byCity.set(c, []).get(c)!;
    list.push(h);
  }
  const blocks: string[] = [];
  for (const [c, hs] of byCity) {
    const items = hs.map(h => {
      const nameHtml = h.link
        ? `<a href="${esc(h.link)}" style="color:#0f766e;text-decoration:underline;">${esc(h.name)}</a>`
        : esc(h.name);
      const img = h.image_url
        ? `<div style="margin:6px 0 16px;"><img src="${esc(h.image_url)}" alt="${esc(h.name)}" width="500" style="display:block;width:100%;max-width:500px;height:auto;border-radius:12px;border:0;" /></div>`
        : "";
      return `<li style="margin:0 0 6px;">${nameHtml}${img}</li>`;
    }).join("");
    blocks.push(`<p style="font-weight:700;margin:12px 0 4px;">In ${esc(c)}:</p><ul style="margin:0 0 8px;padding-left:20px;">${items}</ul>`);
  }
  return blocks.join("");
}

/** Greeting: "Hello Dr. <name>," (title prefix stripped so it isn't doubled). */
export function doctorGreeting(name: string): string {
  const clean = String(name || "").replace(/^\s*(dr\.?|prof\.?)\s*/i, "").trim();
  return clean ? `Hello Dr. ${clean},` : "Hello Dr.,";
}

/** The full consolidated doctor-email body (greeting + intro + the grouped
 *  hospital list + signature). `signatureHtml` is supplied by the caller so each
 *  edge function keeps its own branded sign-off. */
export function buildWorkingOpBody(name: string, hospitals: WorkingOpHospital[], signatureHtml: string): string {
  return `<p>${esc(doctorGreeting(name))}</p>
<p>I hope you are well.</p>
<p>We are currently discussing your profile with the hospitals below; please let us know if you hear from any of them through email, phone call, or LinkedIn. We will also keep you informed as soon as we receive feedback.</p>
<p>We will help you with the salary and allowance negotiation to secure the best offer for you.</p>
${buildDoctorHospitalsHtml(hospitals)}
<p>If you have any questions, feel free to reach out any time.</p>
${signatureHtml}`;
}

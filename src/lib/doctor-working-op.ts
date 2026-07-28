// CLIENT mirror of supabase/functions/_shared/doctor-working-op.ts.
//
// Used to PREVIEW the consolidated "working opportunity" doctor email (the
// "Combined" mode of the personalized composer) exactly as send-flow-email /
// send-batch will render it at send time. Keep the two in lockstep — a doctor
// put forward to several hospitals gets ONE location-grouped email (by city,
// each hospital with its photo), titled by country.

export interface WorkingOpHospital {
  name:       string;
  city?:      string | null;
  country?:   string | null;
  image_url?: string | null;
  link?:      string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Distinct countries joined for a subject: "Qatar", "Qatar & UAE", … */
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

/** Subject: "Working opportunity in <countries> - Allocation Assist". */
export function buildWorkingOpSubject(hospitals: WorkingOpHospital[], fallbackLocation?: string | null): string {
  const loc = workingOpCountries(hospitals) || String(fallbackLocation ?? "").trim();
  return loc
    ? `Working opportunity in ${loc} - Allocation Assist`
    : "Working opportunities - Allocation Assist";
}

/** The location-grouped hospital list (by city), each with photo + optional link. */
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
        ? `<div style="margin:4px 0 8px;"><img src="${esc(h.image_url)}" alt="${esc(h.name)}" width="160" style="display:block;width:160px;height:auto;border-radius:8px;border:0;" /></div>`
        : "";
      return `<li style="margin:0 0 6px;">${nameHtml}${img}</li>`;
    }).join("");
    blocks.push(`<p style="font-weight:700;margin:12px 0 4px;">In ${esc(c)}:</p><ul style="margin:0 0 8px;padding-left:20px;">${items}</ul>`);
  }
  return blocks.join("");
}

/** "Hello Dr. <name>," (title prefix stripped so it isn't doubled). */
export function doctorGreeting(name: string): string {
  const clean = String(name || "").replace(/^\s*(dr\.?|prof\.?)\s*/i, "").trim();
  return clean ? `Hello Dr. ${clean},` : "Hello Dr.,";
}

/** The full consolidated doctor-email body (greeting + intro + grouped list +
 *  signature). `signatureHtml` is supplied by the caller. */
export function buildWorkingOpBody(name: string, hospitals: WorkingOpHospital[], signatureHtml: string): string {
  return `<p>${esc(doctorGreeting(name))}</p>
<p>I hope you are well.</p>
<p>We are currently discussing your profile with the hospitals below; please let us know if you hear from any of them through email, phone call, or LinkedIn. We will also keep you informed as soon as we receive feedback.</p>
<p>We will help you with the salary and allowance negotiation to secure the best offer for you.</p>
${buildDoctorHospitalsHtml(hospitals)}
<p>If you have any questions, feel free to reach out any time.</p>
${signatureHtml}`;
}

// Shared "working opportunity" doctor-email composer.
//
// A doctor put forward to several hospitals gets ONE consolidated email that
// mirrors the team's real "Working opportunities in <country> - Allocation
// Assist." message: greeting, the standard intro + negotiation lines, hospitals
// grouped by location (cities named when a country spans 2+, e.g. "In Riyadh
// and Jeddah:", otherwise the country, e.g. "In Qatar:"), each hospital a link
// to its site, big hospital photos under each group, and a warm sign-off.
//
// Both edge functions use it so the two flows produce an identical doctor email:
//   • send-batch      — the tabular batch's optional doctor leg (always a list)
//   • send-flow-email — the singular flow's doctor leg, when a doctor was sent to
//                       MORE THAN ONE hospital in the same send
//
// Keep in lockstep with the client mirror src/lib/doctor-working-op.ts.

export interface WorkingOpHospital {
  name:         string;
  city?:        string | null;
  country?:     string | null;
  image_url?:   string | null;
  /** Optional per-hospital link (e.g. the hospital's page). Rendered on the name
   *  when present; omitted otherwise (no placeholder/broken links). */
  link?:        string | null;
  /** Short "About Us" blurb shown under the hospital name in the doctor email.
   *  Optional; omitted cleanly when a hospital has none on file. */
  description?: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Natural-language join: ["Riyadh","Jeddah"] → "Riyadh and Jeddah";
 *  ["A","B","C"] → "A, B and C". */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Guard against a hospital appearing twice (duplicate selection, or a doubled
 *  batch_hospitals list) — a doctor must see each hospital ONCE. Dedupe by
 *  name + city + country (case-insensitive); first occurrence wins, order kept.
 *  Belt-and-braces against the old "working-op listed hospital A twice" defect,
 *  regardless of what the caller passes. */
export function dedupeHospitals(hospitals: WorkingOpHospital[]): WorkingOpHospital[] {
  const seen = new Set<string>();
  const out: WorkingOpHospital[] = [];
  for (const h of hospitals) {
    const name = String(h.name ?? "").trim();
    if (!name) continue;  // nameless entry — nothing to show
    const key = `${name.toLowerCase()}|${String(h.city ?? "").trim().toLowerCase()}|${String(h.country ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/** Distinct countries across the hospitals, joined for a subject line:
 *  "Qatar", "Saudi Arabia & Qatar", "Qatar, UAE & Oman". Empty when none known. */
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

/** The subject: "Working opportunities in <countries> - Allocation Assist."
 *  `fallbackLocation` (e.g. a batch's country) is used when the hospitals carry
 *  no country. */
export function buildWorkingOpSubject(hospitals: WorkingOpHospital[], fallbackLocation?: string | null): string {
  const loc = workingOpCountries(hospitals) || String(fallbackLocation ?? "").trim();
  return loc
    ? `Working opportunities in ${loc} - Allocation Assist.`
    : "Working opportunities - Allocation Assist.";
}

/** The location-grouped hospital list. Grouped by COUNTRY; the heading names the
 *  cities when a country spans 2+ ("In Riyadh and Jeddah:"), otherwise the
 *  country ("In Qatar:"). Hospital names link to their site; big photos follow
 *  each group's list. This is the heart of the consolidated email. */
export function buildDoctorHospitalsHtml(hospitals: WorkingOpHospital[]): string {
  const byCountry = new Map<string, WorkingOpHospital[]>();
  for (const h of dedupeHospitals(hospitals)) {
    const key = String(h.country ?? "").trim() || String(h.city ?? "").trim() || "Other";
    const list = byCountry.get(key) ?? byCountry.set(key, []).get(key)!;
    list.push(h);
  }
  const blocks: string[] = [];
  for (const [country, hs] of byCountry) {
    const cities: string[] = [];
    for (const h of hs) {
      const c = String(h.city ?? "").trim();
      if (c && !cities.some(x => x.toLowerCase() === c.toLowerCase())) cities.push(c);
    }
    const label = cities.length >= 2
      ? joinAnd(cities)
      : (country !== "Other" ? country : (cities[0] ?? "these locations"));

    // One self-contained block per hospital: name (linked) + "About us" link,
    // the description blurb, then the photo — so each opportunity carries its own
    // detail (team: "for each working opportunity … Hospital description, About
    // Us link, Hospital photo").
    const items = hs.map(h => {
      const nameHtml = h.link
        ? `<a href="${esc(h.link)}" style="color:#0f766e;text-decoration:underline;font-weight:700;">${esc(h.name)}</a>`
        : `<span style="font-weight:700;">${esc(h.name)}</span>`;
      const about = h.link
        ? ` <a href="${esc(h.link)}" style="color:#1d4ed8;text-decoration:underline;font-size:14px;">About us &raquo;</a>`
        : "";
      const desc = String(h.description ?? "").trim()
        ? `<p style="margin:2px 0 8px;color:#475569;font-size:15px;line-height:1.5;">${esc(h.description).replace(/\n/g, "<br>")}</p>`
        : "";
      const img = h.image_url
        ? `<div style="margin:4px 0 0;"><img src="${esc(h.image_url)}" alt="${esc(h.name)}" width="500" style="display:block;width:100%;max-width:500px;height:auto;border-radius:12px;border:0;" /></div>`
        : "";
      return `<div style="margin:0 0 18px;"><p style="margin:0 0 2px;">${nameHtml}${about}</p>${desc}${img}</div>`;
    }).join("");

    blocks.push(`<p style="font-weight:700;margin:14px 0 6px;">In ${esc(label)}:</p>${items}`);
  }
  return blocks.join("");
}

/** Greeting: "Hello Dr. <name>!" (title prefix stripped so it isn't doubled). */
export function doctorGreeting(name: string): string {
  const clean = String(name || "").replace(/^\s*(dr\.?|prof\.?)\s*/i, "").trim();
  return clean ? `Hello Dr. ${clean}!` : "Hello Doctor!";
}

/** The full consolidated doctor-email body (greeting + intro + the grouped
 *  hospital list + sign-off). `signatureHtml` is supplied by the caller so each
 *  edge function keeps its own branded "Warmest Regards … Allocation Assist"
 *  block. */
export function buildWorkingOpBody(name: string, hospitals: WorkingOpHospital[], signatureHtml: string): string {
  // Tight paragraph margins (10px) instead of the mail client's ~1em default —
  // team feedback "there is too much spacing in the email body". Inline so the
  // delivered mail matches the preview (Gmail strips <style>).
  const p = `margin:0 0 10px;`;
  return `<p style="${p}">${esc(doctorGreeting(name))}</p>
<p style="${p}">I hope you're doing well 😊</p>
<p style="${p}">We are currently discussing your profile with the hospitals below; please let us know if you hear from any of them through email, phone call, or LinkedIn. We will also let you know as soon as we receive feedback.</p>
<p style="${p}">We will help you negotiate the salary and allowance to secure your best offer.</p>
${buildDoctorHospitalsHtml(hospitals)}
<p style="${p}">We wish you a wonderful day!</p>
${signatureHtml}`;
}

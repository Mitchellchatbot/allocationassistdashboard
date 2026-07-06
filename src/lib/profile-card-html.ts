// The candidate profile card we screenshot for the hospital email — an inline-
// styled HTML reproduction of the dashboard's shared "Doctor Profile" page
// (src/pages/SharedProfile.tsx), which itself mirrors the WordPress profile:
// teal branded header (+ allocationassist.com pill), a name hero, the bio, and a
// 2-column fact-tile grid with teal icons. Kept 1:1 with SharedProfile so the
// hospital sees the same card in the email as on the web — NOT a reinterpretation.
//
// Key rule (Hasan): NEVER show empty fields — every fact is dropped unless it has
// a real value, so the card stays clean (no blank tiles, no "—").
//
// Built as an HTML string (not React) so html2canvas rasterises it deterministically.

const LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const TEAL = "#0d9488"; // teal-600, matches SharedProfile's icon + header colour

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Flatten any stray HTML in a bio field to a single clean paragraph. */
function toPlain(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Inline lucide SVGs (stroke = teal) — the same icons SharedProfile's <Fact>
// rows use, so the tiles look identical.
const svg = (paths: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:6px;">${paths}</svg>`;
const ICON = {
  award:     svg('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>'),
  cap:       svg('<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'),
  briefcase: svg('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'),
  globe:     svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  calendar:  svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
};

/**
 * Build the profile card HTML from the assembled preview `vars` (same token bag
 * the email preview uses: doctor_name, doctor_title, doctor_bio, …).
 */
export function buildProfileCardHtml(v: Record<string, string>): string {
  const name    = (v.doctor_name || "Candidate").trim();
  const title   = (v.doctor_title || v.doctor_specialty || "").trim();
  const country = (v.doctor_country_training || "").trim();
  const photo   = (v.doctor_photo_url || "").trim();
  const bioRaw  = (v.doctor_bio || v.doctor_area_of_interest || "").trim();
  const bio     = bioRaw ? esc(toPlain(bioRaw)) : "";

  // Candidate headshot (WordPress profile photo) — shown in the hero when set.
  const photoImg = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" width="104" height="104" style="display:block;width:104px;height:104px;border-radius:16px;object-fit:cover;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(15,23,42,0.10);" />`
    : "";

  // The exact 8 facts SharedProfile shows, in the same order + icons. Area of
  // Interest is skipped when it's what we already used for the bio (no dupe).
  const aoi = (v.doctor_area_of_interest || "").trim();
  const factDefs: Array<[string, string, string | undefined]> = [
    [ICON.award,     "Area of Interest",   aoi && aoi !== bioRaw ? aoi : ""],
    [ICON.cap,       "UAE License",        v.doctor_license],
    [ICON.briefcase, "Years experience",   v.doctor_years_experience],
    [ICON.globe,     "Nationality",        v.doctor_nationality],
    [ICON.calendar,  "Age",                v.doctor_age],
    [ICON.calendar,  "Marital",            v.doctor_marital_status],
    [ICON.briefcase, "Salary expectation", v.doctor_salary_expectation],
    [ICON.calendar,  "Notice period",      v.doctor_notice_period],
  ];
  const facts = factDefs
    .map(([icon, label, val]) => [icon, label, (val ?? "").trim()] as [string, string, string])
    .filter(([, , val]) => val && val !== "—");

  const factTile = (f: [string, string, string]) =>
    `<div style="background:#ffffff;padding:16px 24px;">` +
      `<div style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;font-weight:600;">${f[0]}${esc(f[1])}</div>` +
      `<div style="font-size:13px;color:#1e293b;margin-top:4px;word-break:break-word;">${esc(f[2])}</div>` +
    `</div>`;
  // Pad to an even count so the last row of the 2-col grid stays flush.
  const tiles = facts.map(factTile);
  if (tiles.length % 2 === 1) tiles.push(`<div style="background:#ffffff;"></div>`);
  const factsGrid = facts.length
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#f1f5f9;border-top:1px solid #f1f5f9;">${tiles.join("")}</div>`
    : "";

  const subline = (title || country)
    ? `<p style="font-size:14px;color:#475569;margin:4px 0 0;">${esc(title)}${title && country ? " · " : ""}${country ? esc(country) + " trained" : ""}</p>`
    : "";

  return (
`<div style="width:100%;font-family:'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif;color:#0f172a;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);padding:20px 26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td valign="middle" width="100%">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:12px;"><img src="${LOGO_URL}" alt="Allocation Assist" height="32" style="display:block;height:32px;width:auto;" /></td>
          <td valign="middle">
            <div style="font-size:16px;font-weight:600;color:#ffffff;line-height:1;">Allocation Assist</div>
            <div style="font-size:10px;letter-spacing:0.07em;text-transform:uppercase;color:rgba(255,255,255,0.9);margin-top:4px;">Healthcare placement · UAE · KSA · Qatar</div>
          </td>
        </tr></table>
      </td>
      <td valign="middle" align="right" style="white-space:nowrap;">
        <span style="display:inline-block;font-size:11px;color:#ffffff;border:1px solid rgba(255,255,255,0.4);border-radius:999px;padding:6px 14px;">allocationassist.com</span>
      </td>
    </tr></table>
  </div>
  <div style="padding:26px 32px;border-bottom:1px solid #f1f5f9;background:linear-gradient(180deg,rgba(248,250,252,0.5) 0%,#ffffff 100%);">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${photoImg ? `<td valign="middle" width="126" style="padding-right:22px;">${photoImg}</td>` : ""}
      <td valign="middle">
        <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:600;">Doctor Profile</div>
        <h1 style="font-size:28px;font-weight:700;letter-spacing:-0.01em;margin:8px 0 0;line-height:1.15;color:#0f172a;">${esc(name)}</h1>
        ${subline}
      </td>
    </tr></table>
  </div>
  ${bio ? `<div style="padding:24px 32px;font-size:14px;line-height:1.65;color:#334155;">${bio}</div>` : ""}
  ${factsGrid}
  <div style="padding:20px 32px;border-top:1px solid #f1f5f9;background:rgba(248,250,252,0.6);font-size:11px;color:#475569;line-height:1.5;">
    <strong style="color:#334155;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE · allocationassist.com
  </div>
</div>`
  );
}

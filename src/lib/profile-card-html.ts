// The candidate profile card we screenshot for the hospital email — an HTML
// reproduction of the dashboard's "View full profile" page (SharedProfile.tsx):
// teal branded header, name headline, optional photo, bio, and a two-column
// facts grid. Rendered off-screen and rasterised by card-screenshot.ts.
//
// Key rule (Hasan): NEVER show empty fields. Every fact is dropped unless it has
// a real value, so the hospital sees a clean card — no blank rows, no "—".
//
// Built as an inline-styled HTML string (not React) so html2canvas can render
// it deterministically. Widths assume the ~700px capture holder.

const LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;

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

/**
 * Build the profile card HTML from the assembled preview `vars` (same token bag
 * the email preview uses: doctor_name, doctor_photo_url, doctor_specialty, …).
 */
export function buildProfileCardHtml(v: Record<string, string>): string {
  const name    = (v.doctor_name || "Candidate").trim();
  const title   = (v.doctor_title || v.doctor_specialty || "").trim();
  const country = (v.doctor_country_training || "").trim();
  const photo   = (v.doctor_photo_url || "").trim();
  const bioRaw  = (v.doctor_bio || v.doctor_area_of_interest || "").trim();
  const bio     = bioRaw ? esc(toPlain(bioRaw)) : "";

  // Fact list — label → value. Only kept when the value is real (non-empty and
  // not a placeholder). Order mirrors the "View full profile" page, plus the
  // extra fields the team fills in.
  const factDefs: Array<[string, string | undefined]> = [
    ["Specialty",            v.doctor_specialty],
    ["Subspecialty",         v.doctor_subspecialty],
    // Skip Area of Interest as a fact if it's what we already used for the bio.
    ["Area of interest",     v.doctor_area_of_interest && v.doctor_area_of_interest.trim() !== bioRaw ? v.doctor_area_of_interest : ""],
    ["Country of training",  v.doctor_country_training],
    ["Years of experience",  v.doctor_years_experience],
    ["Current location",     v.doctor_current_location],
    ["Targeted locations",   v.doctor_targeted_locations],
    ["Nationality",          v.doctor_nationality],
    ["Age",                  v.doctor_age],
    ["Marital status",       v.doctor_marital_status],
    ["Languages",            v.doctor_languages],
    ["English level",        v.doctor_english_level],
    ["UAE license",          v.doctor_license],
    ["Salary expectation",   v.doctor_salary_expectation],
    ["Notice period",        v.doctor_notice_period],
    ["Mobile",               v.doctor_phone],
    ["Email",                v.doctor_email],
  ];
  const facts = factDefs
    .map(([label, val]) => [label, (val ?? "").trim()] as [string, string])
    .filter(([, val]) => val && val !== "—");

  const factCell = (f?: [string, string]) =>
    f
      ? `<td width="50%" valign="top" style="padding:12px 22px;border-top:1px solid #eef2f7;">` +
        `<div style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;font-weight:600;">${esc(f[0])}</div>` +
        `<div style="font-size:14px;color:#1e293b;margin-top:3px;font-weight:500;word-break:break-word;">${esc(f[1])}</div>` +
        `</td>`
      : `<td width="50%" style="border-top:1px solid #eef2f7;"></td>`;
  const factRows: string[] = [];
  for (let i = 0; i < facts.length; i += 2) {
    factRows.push(`<tr>${factCell(facts[i])}${factCell(facts[i + 1])}</tr>`);
  }

  const photoImg = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" width="88" height="88" style="display:block;width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.14);" />`
    : "";

  const subline =
    title || country
      ? `<div style="font-size:14px;color:#475569;margin-top:4px;">${esc(title)}${title && country ? " · " : ""}${country ? esc(country) + " trained" : ""}</div>`
      : "";

  return (
`<div style="width:100%;font-family:'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;color:#0f172a;">
  <div style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);padding:16px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="padding-right:12px;"><img src="${LOGO_URL}" alt="Allocation Assist" height="30" style="display:block;height:30px;width:auto;" /></td>
      <td valign="middle">
        <div style="font-size:15px;font-weight:600;color:#ffffff;line-height:1;">Allocation Assist</div>
        <div style="font-size:10px;letter-spacing:0.07em;text-transform:uppercase;color:rgba(255,255,255,0.9);margin-top:4px;">Healthcare placement · UAE · KSA · Qatar</div>
      </td>
    </tr></table>
  </div>
  <div style="padding:22px 26px 18px;border-bottom:1px solid #f1f5f9;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${photoImg ? `<td valign="middle" width="106" style="padding-right:18px;">${photoImg}</td>` : ""}
      <td valign="middle">
        <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:600;">Doctor Profile</div>
        <div style="font-size:24px;font-weight:700;color:#0f172a;margin-top:5px;line-height:1.15;">${esc(name)}</div>
        ${subline}
      </td>
    </tr></table>
  </div>
  ${bio ? `<div style="padding:18px 26px;font-size:14px;line-height:1.6;color:#334155;border-bottom:1px solid #f1f5f9;">${bio}</div>` : ""}
  ${facts.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${factRows.join("")}</table>` : ""}
  <div style="padding:14px 26px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b;line-height:1.5;">
    <strong style="color:#475569;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE · allocationassist.com
  </div>
</div>`
  );
}

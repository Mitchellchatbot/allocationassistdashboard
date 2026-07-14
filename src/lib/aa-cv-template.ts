// The Allocation Assist house-style CV — a multi-page, branded document that
// matches the team's formatted candidate CVs (teal serif headings, a photo +
// "Doctor's Profile" summary header, then dated section lists). Rendered to a
// PDF via html2pdf (see generate-cv-pdf). Built from AaCvData, which the
// cv-reformat edge function produces by parsing an arbitrary incoming CV.
//
// The AA logo lives in the public email-assets bucket (hot-linked in emails too).
export const AA_LOGO_URL = "https://elfkqmbwuspjaoorqggq.supabase.co/storage/v1/object/public/email-assets/logo.png";

export interface AaCvSection {
  heading: string;
  items?: string[];                                   // bulleted lines (dated entries etc.)
  subsections?: Array<{ heading: string; items: string[] }>;
}
export interface AaCvData {
  name: string;                 // "Ashraf Mahmood" (no "Dr.")
  title: string;                // "Consultant ENT and Head & Neck Surgeon"
  qualifications?: string;      // credential line under the title
  email?: string;
  phone?: string;
  linkedin?: string;
  photo_url?: string;           // optional headshot
  summary: string[];            // "Doctor's Profile" paragraphs
  personal?: Record<string, string>;   // Personal Details (Name/Address/DOB/…)
  sections: AaCvSection[];
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const v = (s: string | null | undefined): string => (s ?? "").toString().trim();

/** Bold a leading date token ("09/2024 –", "2015 –", "Nov 2019:") like the
 *  reference CVs do, so the timeline reads at a glance. */
function emphasiseDate(line: string): string {
  const e = esc(line);
  return e.replace(/^(\s*(?:\d{1,2}\/\d{4}|[A-Z][a-z]{2,8}\.?\s\d{4}|\d{4})(?:\s*[–-]\s*(?:Present|\d{1,2}\/\d{4}|[A-Z][a-z]{2,8}\.?\s\d{4}|\d{4}))?)(\s*[:–\-|])/,
    '<span class="date">$1</span>$2');
}

const ICON_MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>`;
const ICON_PHONE = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const ICON_IN = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C20.4 8.65 21 11.1 21 14.3V21h-4v-5.9c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1V21H9z"/></svg>`;

function contactChip(icon: string, text: string, href?: string): string {
  const inner = `<span class="cico">${icon}</span><span class="ctxt">${href ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text)}</span>`;
  return `<span class="chip">${inner}</span>`;
}

/** Build the full AA-branded CV HTML for `d`. Inject into a fixed-width holder
 *  and rasterise with html2pdf. */
export function buildAaCvHtml(d: AaCvData): string {
  const name  = v(d.name).replace(/^\s*dr\.?\s+/i, "");
  const photo = v(d.photo_url);
  const contacts = [
    d.email    ? contactChip(ICON_MAIL, v(d.email), `mailto:${v(d.email)}`) : "",
    d.phone    ? contactChip(ICON_PHONE, v(d.phone)) : "",
    d.linkedin ? contactChip(ICON_IN, "LinkedIn", v(d.linkedin)) : "",
  ].filter(Boolean).join("");

  const summary = (d.summary ?? []).map(p => v(p)).filter(Boolean)
    .map(p => `<p class="summary">${esc(p)}</p>`).join("");

  const personal = d.personal && Object.keys(d.personal).length
    ? `<div class="section"><h2>Personal Details</h2><div class="pd">` +
      Object.entries(d.personal).filter(([, val]) => v(val)).map(([k, val]) =>
        `<div class="pd-row"><div class="pd-k">${esc(k)}</div><div class="pd-v">${esc(v(val))}</div></div>`).join("") +
      `</div></div>`
    : "";

  const sections = (d.sections ?? []).map(s => {
    if (!v(s.heading)) return "";
    const items = (s.items ?? []).map(i => v(i)).filter(Boolean);
    const list = items.length ? `<ul>${items.map(i => `<li>${emphasiseDate(i)}</li>`).join("")}</ul>` : "";
    const subs = (s.subsections ?? []).map(ss => {
      const sit = (ss.items ?? []).map(i => v(i)).filter(Boolean);
      if (!v(ss.heading) && !sit.length) return "";
      return `<div class="sub"><h3>${esc(v(ss.heading))}</h3>${sit.length ? `<ul>${sit.map(i => `<li>${emphasiseDate(i)}</li>`).join("")}</ul>` : ""}</div>`;
    }).join("");
    if (!list && !subs) return "";
    return `<div class="section"><h2>${esc(v(s.heading))}</h2>${list}${subs}</div>`;
  }).join("");

  return `
<style>
.aacv{--teal:#159a8c;--ink:#2d2d2d;--muted:#555;
  box-sizing:border-box;width:720px;margin:0 auto;background:#fff;color:var(--ink);
  font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:14px;line-height:1.55;}
.aacv *{box-sizing:border-box;}
.aacv .logo{height:46px;margin:0 0 6px;}
.aacv .photo{width:200px;height:200px;border-radius:14px;object-fit:cover;display:block;margin:6px auto 16px;}
.aacv .name{text-align:center;color:var(--teal);font-weight:700;font-size:30px;margin:2px 0 2px;line-height:1.15;}
.aacv .title{text-align:center;font-style:italic;font-weight:700;font-size:18px;margin:0 0 10px;}
.aacv .quals{text-align:center;font-size:13px;color:var(--ink);margin:0 0 14px;}
.aacv .contacts{display:flex;justify-content:center;flex-wrap:wrap;gap:22px;margin:0 0 6px;}
.aacv .chip{display:inline-flex;align-items:center;gap:9px;font-size:14px;}
.aacv .cico{width:26px;height:26px;border-radius:50%;background:var(--teal);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.aacv .cico svg{width:14px;height:14px;}
.aacv .ctxt a{color:#1155cc;text-decoration:underline;}
.aacv .profile-h{text-align:center;color:var(--teal);font-weight:700;font-size:23px;text-decoration:underline;margin:22px 0 14px;}
.aacv .summary{text-align:justify;margin:0 0 13px;}
.aacv .section{margin:0 0 4px;page-break-inside:auto;}
.aacv h2{color:var(--teal);font-weight:700;font-size:20px;font-style:italic;margin:20px 0 8px;page-break-after:avoid;}
.aacv h3{color:var(--ink);font-weight:700;font-size:15px;margin:12px 0 5px;page-break-after:avoid;}
.aacv ul{margin:0 0 4px;padding-left:22px;}
.aacv li{margin:0 0 6px;line-height:1.5;page-break-inside:avoid;}
.aacv .sub{margin:0 0 8px;}
.aacv .date{color:var(--teal);font-weight:700;}
.aacv .pd{margin:2px 0 4px;}
.aacv .pd-row{display:flex;gap:14px;margin:0 0 6px;}
.aacv .pd-k{width:150px;flex-shrink:0;}
.aacv .pd-v{font-weight:600;flex:1;}
.aacv .foot{margin-top:26px;padding-top:12px;border-top:1px solid #e5e5e5;text-align:center;font-size:11px;color:#9aa7b3;}
</style>
<div class="aacv">
  <img class="logo" src="${esc(AA_LOGO_URL)}" alt="Allocation Assist" crossorigin="anonymous">
  ${photo ? `<img class="photo" src="${esc(photo)}" alt="${esc(name)}" crossorigin="anonymous">` : ""}
  ${name ? `<div class="name">Dr. ${esc(name)}</div>` : ""}
  ${v(d.title) ? `<div class="title">${esc(v(d.title))}</div>` : ""}
  ${v(d.qualifications) ? `<div class="quals">${esc(v(d.qualifications))}</div>` : ""}
  ${contacts ? `<div class="contacts">${contacts}</div>` : ""}
  ${summary ? `<div class="profile-h">Doctor’s Profile</div>${summary}` : ""}
  ${personal}
  ${sections}
  <div class="foot">Prepared by Allocation Assist · allocationassist.com</div>
</div>`;
}

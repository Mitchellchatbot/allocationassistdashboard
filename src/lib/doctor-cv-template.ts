// Build a clean, Allocation-Assist-branded CV as an HTML string, from a WP
// candidate's data — for rasterising to a PDF via html2pdf (see generate-cv-pdf).
// Straight from their stored fields (no AI); empty fields are dropped so a
// sparse profile still produces a tidy document. A4-portrait proportions.
import type { WpCandidate } from "@/hooks/use-wp-candidates";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const v = (s: string | null | undefined): string => (s ?? "").toString().trim();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso: string | null | undefined): string {
  const s = v(iso); if (!s) return "";
  const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function joinList(a: string[] | null | undefined): string {
  return (a ?? []).map(x => v(x)).filter(Boolean).join(", ");
}
function drName(name: string): string {
  const n = v(name); if (!n) return "";
  return /^\s*dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
}

/** Filename-safe base for the generated CV, e.g. "Dr Manuel Hevia — CV". */
export function cvFileName(c: WpCandidate): string {
  const base = drName(v(c.full_name) || v(c.title)).replace(/[^a-zA-Z0-9 ._-]/g, "").trim() || "Doctor";
  return `${base} - CV.pdf`;
}

export function buildDoctorCvHtml(c: WpCandidate): string {
  const name  = drName(v(c.full_name) || v(c.title));
  const role  = v(c.job_title) || [v(c.rank), v(c.specialty)].filter(Boolean).join(" ");
  const loc   = v(c.current_location) || v(c.country_of_training);
  const contact = [v(c.phone), v(c.email), loc].filter(Boolean).map(esc).join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  const expDate = [fmtDate(c.experience_start), c.experience_present ? "Present" : fmtDate(c.experience_end)].filter(Boolean).join(" – ");
  const eduDate = [fmtDate(c.education_start), c.education_present ? "Present" : fmtDate(c.education_end)].filter(Boolean).join(" – ");

  const entry = (title: string, org: string, date: string, desc: string): string => {
    if (!title && !org && !desc) return "";
    return `<div class="entry">
      <div class="entry-head">
        <div><span class="entry-title">${esc(title)}</span>${org ? ` <span class="entry-org">— ${esc(org)}</span>` : ""}</div>
        ${date ? `<div class="entry-date">${esc(date)}</div>` : ""}
      </div>
      ${desc ? `<div class="entry-desc">${esc(desc)}</div>` : ""}
    </div>`;
  };

  const facts: Array<[string, string]> = [
    ["Specialty", v(c.specialty)],
    ["Subspecialty", v(c.subspecialty)],
    ["Specialist / Consultant", v(c.rank)],
    ["Years of experience", c.years_experience != null ? `${c.years_experience} years` : ""],
    ["Nationality", v(c.nationality)],
    ["Date of birth", fmtDate(c.date_of_birth)],
    ["Country of training", v(c.country_of_training)],
    ["Licenses", v(c.license_status) || joinList(c.license_types)],
    ["Languages", v(c.languages)],
    ["English level", v(c.english_level)],
    ["Notice period", v(c.notice_period)],
    ["Targeted locations", joinList(c.targeted_locations)],
    ["Family status", v(c.family_status)],
  ].filter(([, val]) => val);

  const factRows = facts.map(([k, val]) =>
    `<div class="fact"><div class="fact-k">${esc(k)}</div><div class="fact-v">${esc(val)}</div></div>`).join("");

  const summary = v(c.area_of_interest);
  const expBlock = entry(v(c.experience_title), v(c.experience_company), expDate, v(c.experience_description));
  const eduBlock = entry(v(c.education_title), v(c.education_academy), eduDate, v(c.education_description));

  const section = (label: string, body: string): string => body ? `<div class="section"><div class="section-label">${label}</div>${body}</div>` : "";

  return `
<style>
.cv{--teal:#14a098;--ink:#1a2332;--muted:#5a6c7d;--line:#e5eaee;
  box-sizing:border-box;width:760px;margin:0 auto;padding:0;background:#fff;color:var(--ink);
  font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
.cv *{box-sizing:border-box;}
.cv .head{border-bottom:3px solid var(--teal);padding-bottom:14px;margin-bottom:18px;}
.cv .name{font-size:26px;font-weight:700;letter-spacing:-0.3px;margin:0;}
.cv .role{font-size:14px;color:var(--teal);font-weight:600;margin:4px 0 0;}
.cv .contact{font-size:11.5px;color:var(--muted);margin:8px 0 0;}
.cv .section{margin:0 0 18px;}
.cv .section-label{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--teal);border-bottom:1px solid var(--line);padding-bottom:5px;margin:0 0 10px;}
.cv .summary{font-size:12.5px;line-height:1.6;color:#333;margin:0;}
.cv .entry{margin:0 0 12px;}
.cv .entry-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.cv .entry-title{font-size:13.5px;font-weight:600;}
.cv .entry-org{font-size:13px;color:var(--muted);font-weight:500;}
.cv .entry-date{font-size:11.5px;color:var(--muted);white-space:nowrap;}
.cv .entry-desc{font-size:12px;line-height:1.55;color:#444;margin:4px 0 0;}
.cv .facts{display:grid;grid-template-columns:1fr 1fr;column-gap:28px;row-gap:9px;}
.cv .fact{display:flex;gap:8px;font-size:12px;border-bottom:1px dotted var(--line);padding-bottom:6px;}
.cv .fact-k{color:var(--muted);min-width:118px;flex-shrink:0;}
.cv .fact-v{font-weight:600;color:#2d3a4a;}
.cv .foot{margin-top:22px;padding-top:12px;border-top:1px solid var(--line);font-size:10.5px;color:#9aa7b3;text-align:center;}
</style>
<div class="cv">
  <div class="head">
    ${name ? `<h1 class="name">${esc(name)}</h1>` : ""}
    ${role ? `<div class="role">${esc(role)}</div>` : ""}
    ${contact ? `<div class="contact">${contact}</div>` : ""}
  </div>
  ${summary ? section("Professional summary", `<p class="summary">${esc(summary)}</p>`) : ""}
  ${section("Experience", expBlock)}
  ${section("Education & training", eduBlock)}
  ${factRows ? section("Details", `<div class="facts">${factRows}</div>`) : ""}
  <div class="foot">Prepared by Allocation Assist · allocationassist.com</div>
</div>`;
}

// Build the "doctor profile" card image from a WP candidate, for rasterising via
// html2canvas. This is the image that goes into the hospital "profile sent"
// emails (replacing the old teal card) and shows in Doctors → Generate image.
//
// This is a FAITHFUL REPLICA of the real allocationassist.com candidate card —
// the exact CSS/structure lives in the repo-root `doctor-profile-mockup-final.html`
// (hand-authored from a real live candidate page). Layout: teal photo card on the
// left (photo, name, role, member-since, age, phone, email) with the three action
// buttons — View Resume / Add To My Favorites / Contact Us — as rounded rectangles
// BELOW the card; and title + areas-of-interest + the fact grid on the right.
//
// Deviations from a literal copy of the mockup (intentional):
//   • Education / Experience section omitted (per team feedback).
//   • EMPTY values are dropped (real WpCandidate data has gaps; the mockup
//     hard-codes all facts).
//   • An initials fallback is kept for doctors with no photo.
//   • The three buttons are decorative (non-functional in a flat image).
//
// CSS is scoped under `.dpm` (not bare `body`/`*`) so injecting it into an
// off-screen capture holder can't repaint the dashboard.
import type { WpCandidate } from "@/hooks/use-wp-candidates";

/** Width the card is authored + captured at. Matches the mockup's natural size
 *  (32px page padding + 1040px `.wrap` = 1104) so the proportions are exact. */
export const PROFILE_IMAGE_WIDTH = 1104;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const val = (s: string | null | undefined): string => (s ?? "").toString().trim();

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function parseDate(iso: string | null | undefined): Date | null {
  const s = val(iso);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}
function ageFromDob(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age > 0 && age < 120 ? String(age) : "";
}
/** Ensure a "Dr." prefix without doubling it. */
function drName(name: string): string {
  const n = val(name);
  if (!n) return "";
  return /^\s*dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
}
function joinList(v: string[] | null | undefined): string {
  return (v ?? []).map(x => val(x)).filter(Boolean).join(", ");
}

// Fact-row icons, from the mockup (feather-style inline SVGs).
const ICON = {
  person:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/></svg>`,
  globe:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  steth:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h4v4H6zM6 7a4 4 0 0 0 4 4M14 3h4v4h-4zM18 7a4 4 0 0 1-4 4"/><path d="M10 11v2a4 4 0 0 0 4 0v-2"/><path d="M12 15v3M9 21h6"/></svg>`,
  personChk:`<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/><path d="m16 11 2 2 3-3"/></svg>`,
  briefcase:`<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>`,
  idcard:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h4M15 12h4M6 16h12"/></svg>`,
  calNote:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16h1M14 16h1"/></svg>`,
  pin:      `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  chat:     `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 9h10M7 13h6"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  phone:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  mail:     `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 6c0-1.1-.9-2-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6z"/><path d="m22 6-10 7L2 6"/></svg>`,
};

// Faithful port of doctor-profile-mockup-final.html, scoped under `.dpm`.
const STYLE = `
<style>
.dpm{
  --teal:#1aa88f;--teal-icon:#1aa88f;--text-dark:#333333;--text-gray:#7a7a7a;--tan:#8a6d47;--icon-bg:#eef0f1;
  box-sizing:border-box;width:${PROFILE_IMAGE_WIDTH}px;
  font-family:"Poppins",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#ffffff;color:var(--text-dark);padding:32px;display:flex;gap:40px;align-items:flex-start;
}
.dpm *{box-sizing:border-box;}
.dpm .side-col{width:274px;flex-shrink:0;}
.dpm .profile-card{background:linear-gradient(180deg,#189F8A 0%,#1AC2A8 100%);border-radius:20px;padding:28px 26px 26px;color:#fff;text-align:center;}
.dpm .avatar{width:170px;height:170px;border-radius:50%;overflow:hidden;margin:0 auto 16px;border:3px solid #ffffff;background:#0e7d6b;display:flex;align-items:center;justify-content:center;}
.dpm .avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.dpm .avatar .initials{font-size:60px;font-weight:600;color:#ffffff;}
.dpm .profile-card h2{font-size:17px;margin:0 0 5px;font-weight:600;line-height:1.3;white-space:nowrap;}
.dpm .profile-card .role{font-size:13px;opacity:0.95;margin:0 0 12px;font-weight:600;}
/* padding is bottom-biased (2px top / 8px bottom) to counter html2canvas
   rendering single-line text LOW in the user's Chromium — pushes it back to
   visual centre. Same trick on .btn below. */
.dpm .member-badge{display:inline-block;background:#0e7d6b;border-radius:16px;padding:1px 16px 10px;font-size:11.5px;font-weight:600;line-height:1.4;}
.dpm .profile-card hr{border:none;border-top:1px dashed rgba(255,255,255,0.4);margin:18px 0 16px;}
.dpm .profile-card .age{font-size:14px;font-weight:600;margin-bottom:14px;}
.dpm .contact-row{display:flex;align-items:center;justify-content:center;gap:9px;font-size:12.5px;margin-bottom:11px;word-break:break-word;}
.dpm .contact-icon{width:24px;height:24px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpm .contact-icon svg{width:13px;height:13px;stroke:var(--teal);}
.dpm .btn{display:block;width:100%;text-align:center;padding:11px 0 19px;border-radius:10px;font-size:14px;font-weight:600;margin-top:14px;border:none;line-height:1.4;}
.dpm .btn-gray{background:linear-gradient(180deg,#f2f2f2,#e3e3e3);color:#333;}
.dpm .btn-outline{background:#fff;color:var(--teal);border:1.5px solid var(--teal);}
.dpm .btn-black{background:#111111;color:#fff;}
.dpm .main{flex:1;min-width:0;padding-top:6px;}
.dpm .main h1{font-size:25px;line-height:1.3;margin:0 0 16px;font-weight:600;color:#3a3a3a;}
.dpm .section-label{font-size:17px;font-weight:600;margin:0 0 10px;color:#3a3a3a;}
.dpm .bio{font-size:13.5px;line-height:1.7;color:#555555;margin:0 0 20px;}
.dpm .divider{border:none;border-top:1px solid #b9e5dd;margin:22px 0;}
.dpm .fact-grid{display:grid;grid-template-columns:repeat(3,1fr);row-gap:26px;column-gap:20px;margin-bottom:20px;}
.dpm .fact{display:flex;align-items:flex-start;gap:12px;}
.dpm .fact .icon{width:44px;height:44px;border-radius:50%;background:var(--icon-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpm .fact .icon svg{width:21px;height:21px;stroke:var(--teal-icon);}
.dpm .fact .label{font-size:12.5px;color:var(--text-gray);margin-bottom:3px;}
.dpm .fact .value{font-size:14px;font-weight:600;color:#3a3a3a;}
</style>`;

function factHtml(icon: string, label: string, value: string): string {
  if (!value) return "";
  return `<div class="fact"><div class="icon">${icon}</div><div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div></div>`;
}
function contactHtml(icon: string, value: string): string {
  if (!value) return "";
  return `<div class="contact-row"><span class="contact-icon">${icon}</span>${esc(value)}</div>`;
}

/** Build the profile card HTML for `c`, empties dropped. Returns
 *  `<style>…</style><div class="dpm">…</div>` — inject as innerHTML into a
 *  capture holder captured at PROFILE_IMAGE_WIDTH. */
export function buildDoctorProfileHtml(c: WpCandidate): string {
  const name    = drName(val(c.full_name) || val(c.title));
  const role    = val(c.job_title);
  const photo   = val(c.photo_url);
  const location= val(c.current_location) || val(c.country_of_training);
  const age     = ageFromDob(c.date_of_birth);
  const licenses = val(c.license_status) || joinList(c.license_types);
  const dependents = c.has_dependents == null ? "" : (c.has_dependents ? "Yes" : "No");

  const initials = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const avatar = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" crossorigin="anonymous">`
    : `<span class="initials">${esc(initials || "Dr")}</span>`;

  const memberSince = fmtDate(c.wp_date);
  // Teal card = photo → name → role → badge → hr → age → phone → email. The three
  // action buttons live OUTSIDE the card (siblings below it), as in the mockup.
  const sideCard =
    `<div class="side-col">` +
      `<div class="profile-card">` +
        `<div class="avatar">${avatar}</div>` +
        (name ? `<h2>${esc(name)}</h2>` : "") +
        (role ? `<p class="role">${esc(role)}</p>` : "") +
        (memberSince ? `<span class="member-badge">Member Since: ${esc(memberSince)}</span>` : "") +
        ((age || val(c.phone) || val(c.email)) ? `<hr>` : "") +
        (age ? `<div class="age">Age: ${esc(age)} Years Old</div>` : "") +
        contactHtml(ICON.phone, val(c.phone)) +
        contactHtml(ICON.mail, val(c.email)) +
      `</div>` +
      // Decorative buttons — non-functional in a flat image, kept to match the
      // real card exactly (gray / teal-outline / black rounded rects).
      `<div class="btn btn-gray">View Resume</div>` +
      `<div class="btn btn-outline">Add To My Favorites</div>` +
      `<div class="btn btn-black">Contact Us</div>` +
    `</div>`;

  const h1 = [name, role, location].filter(Boolean).join(" – ");
  const bio = val(c.area_of_interest);

  const facts = [
    factHtml(ICON.person,    "Age:",                                    age ? `${age} years old` : ""),
    factHtml(ICON.globe,     "Nationality:",                            val(c.nationality)),
    factHtml(ICON.calendar,  "Date of Birth:",                          fmtDate(c.date_of_birth)),
    factHtml(ICON.steth,     "Specialty:",                              val(c.specialty)),
    factHtml(ICON.personChk, "Specialist / Consultant:",                val(c.rank)),
    factHtml(ICON.briefcase, "Years of Experience:",                    c.years_experience != null ? `${c.years_experience} Years` : ""),
    factHtml(ICON.idcard,    "DHA / DOH / MOH / SCFHS / QCHP Licenses?", licenses),
    factHtml(ICON.calNote,   "Notice Period:",                          val(c.notice_period)),
    factHtml(ICON.pin,       "Targeted Location:",                      joinList(c.targeted_locations)),
    (val(c.languages) ? `<div class="fact"><div class="icon" style="font-weight:700;font-size:12px;color:var(--teal-icon);">A文</div><div><div class="label">Languages:</div><div class="value">${esc(val(c.languages))}</div></div></div>` : ""),
    factHtml(ICON.chat,      "English Level:",                          val(c.english_level)),
    factHtml(ICON.users,     "Family Status:",                          val(c.family_status)),
    factHtml(ICON.users,     "Have Children / Dependent:",              dependents),
  ].filter(Boolean).join("");

  const main =
    `<div class="main">` +
      (h1 ? `<h1>${esc(h1)}</h1>` : "") +
      (bio ? `<p class="section-label">Specific areas of interests within the specialization</p><p class="bio">${esc(bio)}</p>` : "") +
      (facts ? `${(h1 || bio) ? `<hr class="divider">` : ""}<div class="fact-grid">${facts}</div>` : "") +
    `</div>`;

  return `${STYLE}<div class="dpm">${sideCard}${main}</div>`;
}

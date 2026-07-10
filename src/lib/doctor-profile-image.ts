// Build the "doctor profile" card as a LANDSCAPE 3:2 image (1200×800) from a WP
// candidate, for rasterising via html2canvas. This is the image that goes into
// the hospital "profile sent" emails (replacing the old teal card) and shows in
// Doctors → Generate image.
//
// Layout: teal photo card on the left (photo, name, role, member-since, age,
// contact, then the View Resume / Add To My Favorites / Contact Us buttons), and
// title + areas-of-interest + the fact grid on the right. EMPTY values are
// dropped (no blank facts / rows). The three buttons are decorative — they don't
// work in a flat image, but they're kept to match the website card Amir sent as
// the reference. (Education / Experience was removed per that same feedback.)
//
// CSS is scoped under `.dpm` (not bare `body`/`*`) so injecting it into an
// off-screen capture holder can't repaint the dashboard.
import type { WpCandidate } from "@/hooks/use-wp-candidates";

/** The 3:2 frame the profile is authored + captured at. */
export const PROFILE_IMAGE_WIDTH = 1200;
export const PROFILE_IMAGE_HEIGHT = 800;

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

// Fact-row icons, kept from the mockup.
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

const STYLE = `
<style>
.dpm{
  --teal:#1aa88f;--text-dark:#333333;--text-gray:#7a7a7a;--tan:#475569;--icon-bg:#eef0f1;
  box-sizing:border-box;width:${PROFILE_IMAGE_WIDTH}px;
  font-family:"Poppins",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#ffffff;color:var(--text-dark);padding:26px;display:flex;gap:26px;align-items:flex-start;
}
.dpm *{box-sizing:border-box;}
/* Content-height columns (align-items:flex-start on .dpm), NOT stretch — a
   stretched nested flex card rasterises inconsistently in some html2canvas
   builds (the teal background stopped short so the buttons spilled onto white).
   Letting the teal card hug its own content keeps the buttons inside it. */
.dpm .side-col{width:328px;flex-shrink:0;}
.dpm .profile-card{background:linear-gradient(180deg,#189F8A 0%,#1AC2A8 100%);border-radius:20px;padding:26px 22px;color:#fff;text-align:center;width:100%;display:flex;flex-direction:column;align-items:center;}
.dpm .avatar{width:150px;height:150px;border-radius:50%;overflow:hidden;margin:0 auto 14px;border:3px solid #ffffff;background:#0e7d6b;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpm .avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.dpm .avatar .initials{font-size:50px;font-weight:600;color:#ffffff;}
.dpm .profile-card h2{font-size:18px;margin:0 0 4px;font-weight:600;line-height:1.3;}
.dpm .profile-card .role{font-size:13px;opacity:0.95;margin:0 0 12px;font-weight:600;}
.dpm .member-badge{display:inline-flex;align-items:center;justify-content:center;height:28px;background:#0e7d6b;border-radius:16px;padding:0 16px 8px;font-size:11.5px;font-weight:600;}
.dpm .profile-card hr{border:none;border-top:1px dashed rgba(255,255,255,0.4);margin:16px 0;width:100%;}
.dpm .profile-card .age{font-size:14px;font-weight:600;margin-bottom:14px;}
.dpm .contact-row{display:flex;align-items:center;justify-content:center;gap:9px;font-size:12.5px;margin-bottom:10px;word-break:break-word;}
.dpm .contact-icon{width:24px;height:24px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpm .contact-icon svg{width:13px;height:13px;stroke:var(--teal);}
.dpm .main{flex:1;min-width:0;display:flex;flex-direction:column;}
.dpm .main h1{font-size:21px;line-height:1.3;margin:0 0 8px;font-weight:600;color:#3a3a3a;}
.dpm .section-label{font-size:13.5px;font-weight:600;margin:0 0 5px;color:#3a3a3a;}
.dpm .bio{font-size:12.5px;line-height:1.6;color:var(--tan);margin:0 0 10px;max-height:82px;overflow:hidden;}
.dpm .divider{border:none;border-top:1px solid #b9e5dd;margin:12px 0;}
.dpm .fact-grid{display:grid;grid-template-columns:repeat(3,1fr);row-gap:19px;column-gap:18px;}
.dpm .fact{display:flex;align-items:flex-start;gap:10px;}
.dpm .fact .icon{width:34px;height:34px;border-radius:50%;background:var(--icon-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dpm .fact .icon svg{width:16px;height:16px;stroke:var(--teal);}
.dpm .fact .label{font-size:11px;color:var(--text-gray);margin-bottom:2px;line-height:1.2;}
.dpm .fact .value{font-size:13px;font-weight:600;color:#3a3a3a;line-height:1.25;}
/* Decorative action buttons on the teal card. Full-width pills, stacked. The
   bottom padding is the same html2canvas nudge the member-badge uses — in the
   user's Chromium, flex-centred text in a fixed-height box rasterises LOW, so we
   pad the bottom to push it back to visual centre. */
.dpm .btn-col{width:100%;margin-top:20px;display:flex;flex-direction:column;gap:11px;}
.dpm .btn{height:44px;border-radius:23px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;line-height:1;padding:0 0 12px;}
.dpm .btn-resume{background:#ffffff;color:var(--teal);}
.dpm .btn-fav{background:#ffffff;color:#4a4a4a;}
.dpm .btn-dark{background:#111827;color:#ffffff;}
</style>`;

function factHtml(icon: string, label: string, value: string): string {
  if (!value) return "";
  return `<div class="fact"><div class="icon">${icon}</div><div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div></div>`;
}
function contactHtml(icon: string, value: string): string {
  if (!value) return "";
  return `<div class="contact-row"><span class="contact-icon">${icon}</span>${esc(value)}</div>`;
}

/** Build the 3:2 landscape profile HTML for `c`, empties dropped. Returns
 *  `<style>…</style><div class="dpm">…</div>` — inject as innerHTML into a
 *  capture holder captured at PROFILE_IMAGE_WIDTH×PROFILE_IMAGE_HEIGHT. */
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
  const sideCard =
    `<div class="profile-card">` +
      `<div class="avatar">${avatar}</div>` +
      (name ? `<h2>${esc(name)}</h2>` : "") +
      (role ? `<p class="role">${esc(role)}</p>` : "") +
      (memberSince ? `<span class="member-badge">Member Since: ${esc(memberSince)}</span>` : "") +
      ((age || val(c.phone) || val(c.email)) ? `<hr>` : "") +
      (age ? `<div class="age">Age: ${esc(age)} Years Old</div>` : "") +
      contactHtml(ICON.phone, val(c.phone)) +
      contactHtml(ICON.mail, val(c.email)) +
      // Decorative buttons (match the website card Amir referenced) — always
      // shown, non-functional in a flat image.
      `<div class="btn-col">` +
        `<div class="btn btn-resume">View Resume</div>` +
        `<div class="btn btn-fav">Add To My Favorites</div>` +
        `<div class="btn btn-dark">Contact Us</div>` +
      `</div>` +
    `</div>`;

  const h1 = [name, role, location].filter(Boolean).join(" – ");
  const bio = val(c.area_of_interest);

  const facts = [
    factHtml(ICON.person,    "Age",                             age ? `${age} years old` : ""),
    factHtml(ICON.globe,     "Nationality",                     val(c.nationality)),
    factHtml(ICON.calendar,  "Date of Birth",                   fmtDate(c.date_of_birth)),
    factHtml(ICON.steth,     "Specialty",                       val(c.specialty)),
    factHtml(ICON.personChk, "Specialist / Consultant",         val(c.rank)),
    factHtml(ICON.briefcase, "Years of Experience",             c.years_experience != null ? `${c.years_experience} Years` : ""),
    factHtml(ICON.idcard,    "DHA / DOH / MOH / SCFHS / QCHP",   licenses),
    factHtml(ICON.calNote,   "Notice Period",                   val(c.notice_period)),
    factHtml(ICON.pin,       "Targeted Location",               joinList(c.targeted_locations)),
    (val(c.languages) ? `<div class="fact"><div class="icon" style="font-weight:700;font-size:11px;color:var(--teal);">A文</div><div><div class="label">Languages</div><div class="value">${esc(val(c.languages))}</div></div></div>` : ""),
    factHtml(ICON.chat,      "English Level",                   val(c.english_level)),
    factHtml(ICON.users,     "Family Status",                   val(c.family_status)),
    factHtml(ICON.users,     "Have Children / Dependent",       dependents),
  ].filter(Boolean).join("");

  const main =
    `<div class="main">` +
      (h1 ? `<h1>${esc(h1)}</h1>` : "") +
      (bio ? `<p class="section-label">Specific areas of interests within the specialization</p><p class="bio">${esc(bio)}</p>` : "") +
      (facts ? `${(h1 || bio) ? `<hr class="divider">` : ""}<div class="fact-grid">${facts}</div>` : "") +
    `</div>`;

  return `${STYLE}<div class="dpm"><div class="side-col">${sideCard}</div>${main}</div>`;
}

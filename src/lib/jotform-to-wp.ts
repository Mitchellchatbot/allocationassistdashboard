/**
 * Client port of supabase/functions/_shared/jotform-extract.ts.
 *
 * Used by `CreateWpProfileDialog` to pre-fill the review form from a
 * stored `form_responses` row WITHOUT a round-trip — keeping the same
 * mapping behaviour as the webhook/historical-sync paths so a
 * manually-created profile looks identical to one the pipeline would
 * have created on its own.
 *
 * Keep this in lockstep with the server module. Both surfaces share the
 * same WP ACF schema; field-name drift on either side will silently
 * mis-populate.
 */

export interface MappedProfile {
  full_name:  string;
  email:      string;
  phone:      string;
  acf:        Record<string, unknown>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** JotForm's phone control is a {area, phone} object; once flattened it can
 *  land as that object's raw JSON string. Coerce to a plain "+area phone"
 *  so it never reaches WordPress (or the staging editor) as JSON. */
function normalizePhone(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s.startsWith("{") || !s.includes("phone")) return s;
  try {
    const o = JSON.parse(s) as { area?: unknown; phone?: unknown; full?: unknown };
    if (typeof o.full === "string" && o.full.trim()) return o.full.trim();
    const a = o.area  != null ? String(o.area).trim()  : "";
    const p = o.phone != null ? String(o.phone).trim() : "";
    return [a, p].filter(Boolean).join(" ") || s;
  } catch {
    return s;
  }
}

/** JotForm's date control is a {day, month, year} object; flattened it lands as
 *  that object's raw JSON string. Coerce to YYYY-MM-DD so it never reaches
 *  WordPress / the staging editor as JSON (same idea as normalizePhone). */
export function normalizeJotformDate(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s.startsWith("{") || !s.toLowerCase().includes("year")) return s;
  try {
    const o = JSON.parse(s) as { day?: unknown; month?: unknown; year?: unknown };
    const y = String(o.year ?? "").trim();
    if (!/^\d{4}$/.test(y)) return s;
    const m = /^\d{1,2}$/.test(String(o.month ?? "")) ? String(o.month).padStart(2, "0") : "01";
    const d = /^\d{1,2}$/.test(String(o.day ?? ""))   ? String(o.day).padStart(2, "0")   : "01";
    return `${y}-${m}-${d}`;
  } catch {
    return s;
  }
}

/** Walk a stored form_response and map it to the WP-shaped payload.
 *  `flatAnswers` is the {label: value} map we already persist on the
 *  row (`form_responses.answers`); for JotForm it was produced server
 *  side by `flattenAnswers`. We do field-fuzzy-matching identical to
 *  the server's `mapToProfile`. */
export function mapAnswersToWp(flat: Record<string, string>): MappedProfile {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat ?? {})) lower[norm(k)] = v;

  const pick = (...keys: string[]): string => {
    for (const k of keys) if (lower[k]) return lower[k];
    return "";
  };
  const pickContains = (...subs: string[]): string => {
    for (const sub of subs) {
      for (const [k, v] of Object.entries(lower)) if (k.includes(sub) && v) return v;
    }
    return "";
  };

  const first = pick("firstname", "fname", "givenname");
  const last  = pick("lastname", "lname", "surname", "familyname");
  const full  = pick("fullname", "name") || [first, last].filter(Boolean).join(" ");
  const email = pick("email", "emailaddress");
  const phone = normalizePhone(pick("phone", "phonenumber", "mobile", "tel", "telephone", "whatsapp"));

  const acf: Record<string, unknown> = {};
  if (full)  acf.full_name    = full;
  if (email) acf.email        = email;
  if (phone) acf.phone_number = phone;

  const dob = pick("dateofbirth", "dob", "birthdate", "birthday");
  if (dob) acf.date_of_birth = normalizeJotformDate(dob);

  const nat = pick("nationality");
  if (nat) acf.nationality = nat;

  const specialty = pick("specialty", "specialization", "speciality")
                 || pickContains("specialty", "specialization");
  if (specialty) acf.specialty = specialty;

  const subspecialty = pick("subspecialty", "subspeciality")
                    || pickContains("subspecialty", "subspeciality");
  if (subspecialty) acf.subspecialty = subspecialty;

  const areas = pick("areasofinterest", "areasofinterestwithinthespecialization", "specificareasofinterests")
             || pickContains("areasofinterest", "specificarea");
  if (areas) acf.specific_areas_of_interests_within_the_specialization = areas;

  const years = pick("yearsofexperience", "yearsexperience", "yearspostspecialization")
             || pickContains("yearsofexperience", "yearsexperience");
  if (years) acf.years_of_experience_post_specialization = years;

  const country = pick("countryoftraining", "trainingcountry") || pickContains("countryoftraining");
  if (country) acf.country_of_training = country;

  const location = pick("currentlocation", "location") || pickContains("currentlocation");
  if (location) acf.current_location = location;

  const job = pick("jobtitle", "currentrole", "position");
  if (job) acf.job_title = job;

  const languages    = pick("languages")     || pickContains("languages");
  if (languages) acf.languages = languages;

  const englishLevel = pick("englishlevel")  || pickContains("englishlevel", "english");
  if (englishLevel) acf.english_level = englishLevel;

  const currentSalary  = pick("currentsalary")  || pickContains("currentsalary");
  if (currentSalary)  acf.current_salary = currentSalary;

  const expectedSalary = pick("expectedsalary") || pickContains("expectedsalary");
  if (expectedSalary) acf.expected_salary = expectedSalary;

  const noticePeriod = pick("noticeperiod") || pickContains("noticeperiod", "notice");
  if (noticePeriod) acf.notice_period = noticePeriod;

  const familyStatus = pick("familystatus", "maritalstatus");
  if (familyStatus) acf.family_status = familyStatus;

  const dependents = pick("haschildren", "children", "dependents", "havechildren", "havedependents");
  if (dependents) acf.have_children_or_any_dependent = /yes|true|1/i.test(dependents) ? "Yes" : "No";

  const rank = pick("specialistorconsultant", "rank", "level");
  if (rank) acf.specialist__consultant = rank;

  const license = pick("license", "licensetype", "dhadohmoh", "dhadohmohscfhsqchplicenses")
               || pickContains("dhadohmoh", "license");
  if (license) acf.dha__haad__moh_license = license;

  const targeted = pick("targetedlocations", "preferredlocations") || pickContains("targetedlocation");
  if (targeted) acf.targeted_locations = targeted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  // ── Value-pattern fallbacks (mirrors supabase _shared/jotform-extract) ─
  // JotForm question labels often arrive truncated to generic stems
  // ("What Is", "Type A", "Please Send"). Catch the important fields
  // by VALUE shape too — keeps client-side stage prefill in lockstep
  // with what the webhook would have inserted.

  // CV URL: any jotform.com /uploads/ (or /widget-uploads/) URL ending in
  // pdf/doc/docx. Allow UNENCODED spaces in the filename (JotForm stores them
  // raw, e.g. ".../Europass- CV Ashraf.pdf") — a `[^\s]+` match would miss the
  // extension entirely and drop the CV. Guard against running into a second
  // URL on the same line so we don't stitch two files together.
  for (const v of Object.values(flat ?? {})) {
    const m = /(https?:\/\/(?:www\.)?jotform\.com\/(?:widget-)?uploads\/(?:(?!https?:\/\/)[^\n\r])+\.(?:pdf|docx?))(?![a-z0-9])/i.exec(v ?? "");
    if (m) {
      acf.cv_resume = m[1].trim();
      break;
    }
  }

  // DOB as {day, month, year} JSON.
  if (!acf.date_of_birth) {
    for (const v of Object.values(flat ?? {})) {
      const trimmed = (v ?? "").trim();
      if (!trimmed.startsWith("{") || !trimmed.includes("year")) continue;
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof obj.year === "string" && typeof obj.month === "string" && typeof obj.day === "string") {
          acf.date_of_birth = `${obj.year}-${String(obj.month).padStart(2, "0")}-${String(obj.day).padStart(2, "0")}`;
          break;
        }
      } catch { /* skip */ }
    }
  }

  // Bio: longest free-text answer 80+ chars, not JSON/URL/tracker.
  if (!acf.specific_areas_of_interests_within_the_specialization) {
    let longest = "";
    for (const [k, v] of Object.entries(flat ?? {})) {
      const s = (v ?? "").trim();
      if (s.length < 80) continue;
      if (s.startsWith("{") || s.startsWith("[")) continue;
      if (/^https?:\/\//i.test(s)) continue;
      const nk = norm(k);
      if (nk.includes("track") || nk.includes("execution") || nk.includes("jsexec")) continue;
      if (s.length > longest.length) longest = s;
    }
    if (longest) acf.specific_areas_of_interests_within_the_specialization = longest;
  }

  // Currency-shaped value → expected_salary fallback.
  if (!acf.expected_salary) {
    for (const v of Object.values(flat ?? {})) {
      const s = (v ?? "").trim();
      if (/^[$£€][\d, ]+$/.test(s)) {
        acf.expected_salary = s;
        break;
      }
    }
  }

  // ── Value-pattern medical / personal-info detection ──────────────
  // JotForm question labels arrive as generic stems ("Type A", "What
  // Is", etc.) so we match on the VALUES the doctor entered. Compact
  // lists below — extend over time as we see misses. See the server
  // module supabase/functions/_shared/jotform-extract.ts for the
  // master copy of these heuristics (the two stay in lockstep).
  const SPECIALTIES = [
    "Cardiology", "Cardiologist", "Anaesthesiology", "Anesthesiology", "Anaesthesia", "Anesthesia",
    "Dermatology", "Endocrinology", "Gastroenterology", "Hematology", "Haematology",
    "Nephrology", "Neurology", "Oncology", "Pulmonology", "Respiratory Medicine",
    "Rheumatology", "Urology", "Orthopaedic", "Orthopedic", "Orthopaedics", "Orthopedics",
    "Plastic Surgery", "Vascular Surgery", "General Surgery", "Surgery",
    "Pediatric", "Paediatric", "Pediatrics", "Paediatrics", "Neonatology",
    "Obstetric", "Gynecology", "Gynaecology", "Obstetrics", "OBGYN", "OB-GYN",
    "Psychiatry", "Family Medicine", "Internal Medicine", "Emergency Medicine",
    "Radiology", "Radiologist", "Pathology", "Pathologist", "ENT", "Otolaryngology",
    "Ophthalmology", "Opthalmology", "Ophthalmologist", "Dentistry", "Dentist",
    "Electrophysiology", "Interventional Cardiology", "Critical Care", "Intensive Care", "ICU",
  ];
  const COUNTRIES = [
    "Egypt", "Sudan", "Syria", "Jordan", "Lebanon", "Iraq", "Yemen", "Palestine",
    "Saudi Arabia", "UAE", "United Arab Emirates", "Kuwait", "Bahrain", "Qatar", "Oman",
    "Pakistan", "India", "Bangladesh", "Sri Lanka", "Nepal",
    "Philippines", "Indonesia", "Malaysia", "Singapore", "Thailand",
    "United Kingdom", "UK", "Ireland", "Germany", "France", "Italy", "Spain",
    "Netherlands", "Belgium", "Sweden", "Denmark", "Norway", "Finland", "Switzerland",
    "Russia", "Ukraine", "Poland", "Greece", "Turkey", "Iran",
    "USA", "United States", "Canada", "Mexico", "Brazil",
    "Nigeria", "Kenya", "Tunisia", "Morocco", "Algeria",
    "China", "Japan", "South Korea", "Korea",
    "Australia", "New Zealand",
  ];
  const LANGUAGES = [
    "English", "Arabic", "French", "Spanish", "German", "Italian", "Portuguese",
    "Russian", "Mandarin", "Chinese", "Hindi", "Urdu", "Bengali", "Tagalog",
    "Filipino", "Indonesian", "Malay", "Persian", "Farsi", "Turkish", "Greek", "Hebrew",
  ];
  const findIn = (s: string, list: string[]) => {
    const v = s.toLowerCase();
    return list.find(it => v.includes(it.toLowerCase())) ?? null;
  };

  if (!acf.specialty) {
    for (const v of Object.values(flat ?? {})) {
      const hit = findIn(v ?? "", SPECIALTIES);
      if (hit) { acf.specialty = hit; break; }
    }
  }
  if (!acf.nationality) {
    for (const v of Object.values(flat ?? {})) {
      const s = (v ?? "").trim();
      if (!s || s.length > 40) continue;
      const hit = findIn(s, COUNTRIES);
      if (hit) { acf.nationality = hit; break; }
    }
  }
  if (!acf.country_of_training) {
    const usedNat = String(acf.nationality ?? "").toLowerCase();
    for (const v of Object.values(flat ?? {})) {
      const s = (v ?? "").trim();
      if (!s || s.length > 60) continue;
      if (usedNat && s.toLowerCase().includes(usedNat)) continue;
      const hit = findIn(s, COUNTRIES);
      if (hit) { acf.country_of_training = hit; break; }
    }
  }
  if (!acf.years_of_experience_post_specialization) {
    for (const v of Object.values(flat ?? {})) {
      const m = /^(\d{1,2})(?:\s*(?:years?|yrs?))?$/i.exec((v ?? "").trim());
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 50) { acf.years_of_experience_post_specialization = String(n); break; }
      }
    }
  }
  if (!acf.job_title) {
    const re = /^(Consultant|Specialist|Senior\s+Specialist|Senior\s+Consultant|Doctor|Resident|Registrar|Fellow)\b[\s\S]{2,80}$/i;
    for (const v of Object.values(flat ?? {})) {
      const s = (v ?? "").trim();
      if (s.length > 100) continue;
      if (re.test(s)) { acf.job_title = s; break; }
    }
  }
  if (!acf.languages) {
    for (const v of Object.values(flat ?? {})) {
      const s = (v ?? "").trim();
      if (!s.includes(",") && !s.includes(" ")) continue;
      if (s.length > 200) continue;
      const tokens = s.split(/[,;&]+| and /i).map(t => t.trim()).filter(Boolean);
      if (tokens.length < 2) continue;
      const matched = tokens.filter(t => findIn(t, LANGUAGES));
      if (matched.length >= 2 && matched.length / tokens.length >= 0.6) {
        acf.languages = matched.join(", ");
        break;
      }
    }
  }
  if (acf.family_status === false || acf.family_status === "false") {
    delete (acf as Record<string, unknown>).family_status;
  }

  return { full_name: full, email, phone, acf };
}

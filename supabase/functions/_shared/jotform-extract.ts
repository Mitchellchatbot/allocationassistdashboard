/**
 * Shared JotForm extractor. Used by:
 *   - jotform-webhook (live submissions)
 *   - jotform-historical-sync (API backfill)
 *
 * Both surfaces need the same answer flattening + WP-ACF field mapping
 * so a submission that landed by webhook looks identical to one that
 * came in via backfill. Keep them in lockstep — never edit one path
 * without updating this file.
 */

/** Flatten JotForm's answer shape into a plain { questionLabel: value }
 *  map. JotForm keys can be 'q3_firstName' (webhook style) OR the
 *  answers shape returned by /form/<id>/submissions endpoint
 *  ({ "3": { name: "firstName", answer: "John", text: "First Name" } }).
 *  Compound fields (name objects, phone objects, file uploads) get
 *  expanded into a single string. */
export function flattenAnswers(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, v] of Object.entries(raw)) {
    if (key === "slug" || key === "appid" || key === "event_id") continue;

    // JotForm API submissions endpoint returns answers as
    //   { "3": { text: "First Name", answer: "...", name: "firstName" } }
    // Webhook style is flatter: { q3_firstName: "..." }.
    // Detect the API shape by checking for a wrapping object with
    // `text` (question label) and `answer` (the value).
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if ("answer" in obj || "text" in obj) {
        const label = typeof obj.text === "string" && obj.text.trim()
          ? obj.text.trim()
          : (typeof obj.name === "string" ? humaniseKey(obj.name) : humaniseKey(key));
        const value = stringifyValue(obj.answer ?? obj.prettyFormat ?? "");
        if (label && value) out[label] = value;
        continue;
      }
    }

    // Webhook-style flat field
    const label = humaniseKey(key);
    const value = stringifyValue(v);
    if (label && value) out[label] = value;
  }
  return out;
}

function humaniseKey(k: string): string {
  // 'q3_firstName' → 'firstName' → 'First Name'
  const stripped = k.replace(/^q\d+_/, "");
  const spaced = stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  // Skip the literal `false` boolean — JotForm sends it for unanswered
  // toggle-style questions and "false" is rarely a meaningful answer
  // for our downstream consumers. true → "Yes" for the same reason.
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Common JotForm compound shapes:
    //   { first, last, middle? }                     ← name
    //   { full, area?, phone? }                      ← phone
    //   { area, phone }                              ← phone (no full)
    //   { url }                                      ← file upload
    //   { prettyFormat } / { text }                  ← API submissions shape
    if (typeof obj.full === "string")  return obj.full.trim();
    if (typeof obj.first === "string" || typeof obj.last === "string") {
      return [obj.first, obj.middle, obj.last]
        .map(s => typeof s === "string" ? s.trim() : "")
        .filter(Boolean)
        .join(" ");
    }
    // Phone-without-full: { area: "+49", phone: "1727816641" } → "+49 1727816641"
    if ((typeof obj.area === "string" || typeof obj.area === "number") &&
        (typeof obj.phone === "string" || typeof obj.phone === "number")) {
      const a = String(obj.area).trim();
      const p = String(obj.phone).trim();
      if (a || p) return [a, p].filter(Boolean).join(" ");
    }
    if (typeof obj.url === "string")           return obj.url.trim();
    if (typeof obj.prettyFormat === "string")  return obj.prettyFormat.trim();
    if (typeof obj.text === "string")          return obj.text.trim();
    return JSON.stringify(obj);
  }
  return String(v);
}

// ── Value-pattern lookup lists ────────────────────────────────────────
// Compact dictionaries used by mapToProfile's value-based fallbacks.
// We can't rely on JotForm question labels because they arrive
// truncated to generic stems ("Type A", "What Is", "Please Send"), so
// we match on the VALUE the doctor entered. The lists are small on
// purpose — only the high-frequency entries — to keep the heuristic
// tight. Extend over time as we see misses.

const MEDICAL_SPECIALTIES = [
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
  "Orthodontics", "Periodontics", "Endodontics",
  "Electrophysiology", "Interventional Cardiology", "Interventional Radiology",
  "Critical Care", "Intensive Care", "ICU", "Pulmonary", "Cardiothoracic",
  "Bariatric", "Colorectal", "Hepatology", "Maxillofacial",
];
const COUNTRIES = [
  "Egypt", "Sudan", "Syria", "Jordan", "Lebanon", "Iraq", "Yemen", "Palestine",
  "Saudi Arabia", "UAE", "United Arab Emirates", "Kuwait", "Bahrain", "Qatar", "Oman",
  "Pakistan", "India", "Bangladesh", "Sri Lanka", "Nepal", "Afghanistan",
  "Philippines", "Indonesia", "Malaysia", "Singapore", "Thailand",
  "United Kingdom", "UK", "Ireland", "Germany", "France", "Italy", "Spain",
  "Netherlands", "Belgium", "Sweden", "Denmark", "Norway", "Finland", "Switzerland",
  "Russia", "Ukraine", "Poland", "Romania", "Hungary", "Bulgaria", "Greece",
  "Turkey", "Iran",
  "USA", "United States", "Canada", "Mexico", "Brazil", "Argentina",
  "Nigeria", "Kenya", "Ethiopia", "Tunisia", "Morocco", "Algeria", "Libya",
  "China", "Japan", "South Korea", "Korea", "Vietnam", "Taiwan",
  "Australia", "New Zealand",
];
const LANGUAGES = [
  "English", "Arabic", "French", "Spanish", "German", "Italian", "Portuguese",
  "Russian", "Mandarin", "Chinese", "Cantonese", "Hindi", "Urdu", "Bengali",
  "Tagalog", "Filipino", "Indonesian", "Malay", "Persian", "Farsi", "Turkish",
  "Dutch", "Swedish", "Norwegian", "Danish", "Polish", "Greek", "Hebrew",
];

/** Case-insensitive substring match. Returns the first canonical hit
 *  from `list` that appears in `value` — used by mapToProfile to detect
 *  specialty/nationality/languages from a raw answer. */
function findInList(value: string, list: string[]): string | null {
  const v = value.toLowerCase();
  for (const item of list) {
    if (v.includes(item.toLowerCase())) return item;
  }
  return null;
}

/** Map the flattened JotForm record to the canonical WordPress ACF
 *  payload + a couple of top-level convenience fields. Field matching
 *  is fuzzy — normalised lower-case alphanumeric comparison so
 *  variants like 'First Name' / 'first_name' / 'fname' all hit. */
export function mapToProfile(flat: Record<string, string>): {
  full_name: string;
  email:     string;
  phone:     string;
  acf:       Record<string, unknown>;
} {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) lower[norm(k)] = v;

  const pick = (...keys: string[]): string => {
    for (const k of keys) if (lower[k]) return lower[k];
    return "";
  };
  const pickContains = (...substrings: string[]): string => {
    for (const sub of substrings) {
      for (const [k, v] of Object.entries(lower)) {
        if (k.includes(sub) && v) return v;
      }
    }
    return "";
  };

  const first = pick("firstname", "fname", "givenname");
  const last  = pick("lastname", "lname", "surname", "familyname");
  const full  = pick("fullname", "name") || [first, last].filter(Boolean).join(" ");

  const email = pick("email", "emailaddress");
  const phone = pick("phone", "phonenumber", "mobile", "tel", "telephone", "whatsapp");

  const acf: Record<string, unknown> = {};

  if (full)  acf.full_name = full;
  if (email) acf.email     = email;
  if (phone) acf.phone_number = phone;

  const dob = pick("dateofbirth", "dob", "birthdate", "birthday");
  if (dob) acf.date_of_birth = dob;

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

  const country = pick("countryoftraining", "trainingcountry")
               || pickContains("countryoftraining");
  if (country) acf.country_of_training = country;

  const location = pick("currentlocation", "location") || pickContains("currentlocation");
  if (location) acf.current_location = location;

  const job = pick("jobtitle", "currentrole", "position");
  if (job) acf.job_title = job;

  const languages = pick("languages") || pickContains("languages");
  if (languages) acf.languages = languages;

  const englishLevel = pick("englishlevel") || pickContains("englishlevel", "english");
  if (englishLevel) acf.english_level = englishLevel;

  // Salary fields. The JotForm question is often labelled
  // "Current Salary/Expectation" — one answer for both numbers. When
  // we see that combined label (key contains both 'salary' AND
  // 'expect') we copy the value into BOTH ACF fields so the candidate
  // page shows expected salary instead of leaving it blank.
  const currentSalary = pick("currentsalary") || pickContains("currentsalary", "salaryexpectation", "salarycurrent");
  if (currentSalary) acf.current_salary = currentSalary;

  const expectedSalary = pick("expectedsalary") || pickContains("expectedsalary", "expectedsalaryexpectation");
  if (expectedSalary) acf.expected_salary = expectedSalary;
  // Combined "Current Salary/Expectation" — if expected is still
  // unset and any answer key contains BOTH 'salary' and 'expect',
  // mirror current into expected.
  if (!acf.expected_salary && acf.current_salary) {
    const hasCombined = Object.keys(lower).some(k =>
      k.includes("salary") && (k.includes("expect") || k.includes("salaryexpectation")));
    if (hasCombined) acf.expected_salary = acf.current_salary;
  }

  const noticePeriod = pick("noticeperiod") || pickContains("noticeperiod", "notice");
  if (noticePeriod) acf.notice_period = noticePeriod;

  // Family status — the JotForm label is often a long descriptive
  // sentence ("Family Status (Who Would Be Relocating With You To
  // The Middle East/UAE)?") that normalises to a 60+ char key. The
  // exact-key pick misses it; the substring fallback catches it.
  const familyStatus = pick("familystatus", "maritalstatus")
                    || pickContains("familystatus", "maritalstatus", "familystatuswho", "whowould");
  if (familyStatus) acf.family_status = familyStatus;

  // Have children / dependents. First check for an explicit dedicated
  // form key (some forms have a yes/no toggle). If absent, derive
  // from the family-status value — "Spouse and Children",
  // "Family of 4", "2 kids" etc. all imply Yes; "Single" implies No.
  const dependents = pick("haschildren", "children", "dependents", "havechildren", "havedependents");
  if (dependents) {
    acf.have_children_or_any_dependent = /yes|true|1/i.test(dependents) ? "Yes" : "No";
  } else if (familyStatus) {
    if (/\b(no|none|0)\s+(?:children|dependents?)/i.test(familyStatus)) {
      acf.have_children_or_any_dependent = "No";
    } else if (/single|unmarried|alone/i.test(familyStatus) && !/with/i.test(familyStatus)) {
      acf.have_children_or_any_dependent = "No";
    } else if (/spouse|children|kids|family|dependent|wife|husband|partner/i.test(familyStatus)) {
      acf.have_children_or_any_dependent = "Yes";
    }
  }

  // Marital status — derive from family_status when not explicit.
  // 'Spouse and Children' / 'Married' → Married; 'Single' → Single.
  if (!acf.marital_status && familyStatus) {
    if (/married|spouse|wife|husband|partner/i.test(familyStatus)) acf.marital_status = "Married";
    else if (/single|unmarried/i.test(familyStatus))               acf.marital_status = "Single";
    else if (/divorced/i.test(familyStatus))                       acf.marital_status = "Divorced";
    else if (/widow/i.test(familyStatus))                          acf.marital_status = "Widowed";
  }

  const rank = pick("specialistorconsultant", "rank", "level");
  if (rank) acf.specialist__consultant = rank;

  const license = pick("license", "licensetype", "dhadohmoh", "dhadohmohscfhsqchplicenses")
               || pickContains("dhadohmoh", "license");
  if (license) acf.dha__haad__moh_license = license;

  const targeted = pick("targetedlocations", "preferredlocations")
                || pickContains("targetedlocation");
  if (targeted) acf.targeted_locations = targeted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  const cv = pick("cv", "resume", "cvresume", "uploadcv", "uploadyourcv")
          || pickContains("cv", "resume");
  if (cv) acf.cv_resume = cv;

  // ── Value-pattern fallbacks ────────────────────────────────────────
  // JotForm question labels often arrive truncated to generic stems
  // ("What Is", "Type A", "Please Send"). The label-match above misses
  // those, so we also scan VALUES and rescue fields by their shape.

  // CV URL: any value that's a jotform.com URL pointing at /uploads/…
  // ending in a document extension. The "Please Send63" field is a
  // common offender.
  if (!acf.cv_resume) {
    for (const v of Object.values(flat)) {
      const m = /(https?:\/\/[^\s,;]+\.(?:pdf|doc|docx))/i.exec(v ?? "");
      if (m && /jotform\.com\/uploads\//i.test(m[1])) {
        acf.cv_resume = m[1];
        break;
      }
    }
  }

  // Date of birth: a JSON-looking value with {day, month, year}.
  if (!acf.date_of_birth) {
    for (const v of Object.values(flat)) {
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

  // Bio / area of interest: the longest single free-text answer that's
  // 80+ chars and doesn't look like JSON, a URL, or a phone object —
  // matches the "What Is44" field shape (truncated "what is your area
  // of interest" / "tell us about your experience" prompts).
  if (!acf.specific_areas_of_interests_within_the_specialization) {
    let longest = "";
    for (const [k, v] of Object.entries(flat)) {
      const s = (v ?? "").trim();
      if (s.length < 80) continue;
      if (s.startsWith("{") || s.startsWith("[")) continue;
      if (/^https?:\/\//i.test(s)) continue;
      // Ignore tracker / JS-execution noise.
      const nk = norm(k);
      if (nk.includes("track") || nk.includes("execution") || nk.includes("jsexec")) continue;
      if (s.length > longest.length) longest = s;
    }
    if (longest) acf.specific_areas_of_interests_within_the_specialization = longest;
  }

  // Currency-shaped value → expected salary fallback if we didn't pick
  // one by label. Form value looks like "$450,000".
  if (!acf.expected_salary) {
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      if (/^[$£€][\d, ]+$/.test(s)) {
        acf.expected_salary = s;
        break;
      }
    }
  }

  // Specialty: scan values against the medical-specialty dictionary.
  // Hits when the doctor entered "Cardiology" or "Consultant
  // Cardiologist" as a free-text answer to a generic-labelled question.
  if (!acf.specialty) {
    for (const v of Object.values(flat)) {
      const hit = findInList(v ?? "", MEDICAL_SPECIALTIES);
      if (hit) { acf.specialty = hit; break; }
    }
  }

  // Nationality: any single short answer that matches a country in our
  // list. Skip values that look like a long bio (>40 chars) since those
  // could mention a country without being one.
  if (!acf.nationality) {
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      if (!s || s.length > 40) continue;
      const hit = findInList(s, COUNTRIES);
      if (hit) { acf.nationality = hit; break; }
    }
  }

  // Country of training: same list, different label. Skip the answer we
  // already assigned to nationality so we don't double-up.
  if (!acf.country_of_training) {
    const usedNat = String(acf.nationality ?? "").toLowerCase();
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      if (!s || s.length > 60) continue;
      if (usedNat && s.toLowerCase().includes(usedNat)) continue;
      const hit = findInList(s, COUNTRIES);
      if (hit) { acf.country_of_training = hit; break; }
    }
  }

  // Years of experience: a pure number 1-50 or "X years" pattern.
  if (!acf.years_of_experience_post_specialization) {
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      const m = /^(\d{1,2})(?:\s*(?:years?|yrs?))?$/i.exec(s);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 50) {
          acf.years_of_experience_post_specialization = String(n);
          break;
        }
      }
    }
  }

  // Job title: lines that start with a medical seniority word.
  if (!acf.job_title) {
    const re = /^(Consultant|Specialist|Senior\s+Specialist|Senior\s+Consultant|Doctor|Resident|Registrar|Fellow)\b[\s\S]{2,80}$/i;
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      if (s.length > 100) continue;
      if (re.test(s)) { acf.job_title = s; break; }
    }
  }

  // Languages: comma-separated values where most tokens match our list.
  if (!acf.languages) {
    for (const v of Object.values(flat)) {
      const s = (v ?? "").trim();
      if (!s.includes(",") && !s.includes(" ")) continue;
      if (s.length > 200) continue;
      const tokens = s.split(/[,;&]+| and /i).map(t => t.trim()).filter(Boolean);
      if (tokens.length < 2) continue;
      const matched = tokens.filter(t => findInList(t, LANGUAGES));
      // At least 2 tokens AND ≥60% must match — keeps stray "English"
      // mentions in bios from getting picked.
      if (matched.length >= 2 && matched.length / tokens.length >= 0.6) {
        acf.languages = matched.join(", ");
        break;
      }
    }
  }

  // Family status: "false" booleans from JotForm. Convert to the
  // sensible default; stringifyValue already drops them, but defend
  // here in case anything slipped through.
  if (acf.family_status === false || acf.family_status === "false") {
    delete acf.family_status;
  }

  return { full_name: full, email, phone, acf };
}

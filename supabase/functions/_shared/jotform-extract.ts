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
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Common JotForm compound shapes:
    //   { first, last, middle? }                     ← name
    //   { full, area?, phone? }                      ← phone
    //   { url }                                      ← file upload
    //   { prettyFormat } / { text }                  ← API submissions shape
    if (typeof obj.full === "string")  return obj.full.trim();
    if (typeof obj.first === "string" || typeof obj.last === "string") {
      return [obj.first, obj.middle, obj.last]
        .map(s => typeof s === "string" ? s.trim() : "")
        .filter(Boolean)
        .join(" ");
    }
    if (typeof obj.url === "string")           return obj.url.trim();
    if (typeof obj.prettyFormat === "string")  return obj.prettyFormat.trim();
    if (typeof obj.text === "string")          return obj.text.trim();
    return JSON.stringify(obj);
  }
  return String(v);
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

  const currentSalary = pick("currentsalary") || pickContains("currentsalary");
  if (currentSalary) acf.current_salary = currentSalary;

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

  const targeted = pick("targetedlocations", "preferredlocations")
                || pickContains("targetedlocation");
  if (targeted) acf.targeted_locations = targeted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  const cv = pick("cv", "resume", "cvresume", "uploadcv", "uploadyourcv")
          || pickContains("cv", "resume");
  if (cv) acf.cv_resume = cv;

  return { full_name: full, email, phone, acf };
}

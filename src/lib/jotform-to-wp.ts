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
  const phone = pick("phone", "phonenumber", "mobile", "tel", "telephone", "whatsapp");

  const acf: Record<string, unknown> = {};
  if (full)  acf.full_name    = full;
  if (email) acf.email        = email;
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

  return { full_name: full, email, phone, acf };
}

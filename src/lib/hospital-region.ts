/**
 * Hospital-cell normalizer for the monthly placement reports.
 *
 * The "Doctors Placement Platform Report" sheets record a hospital as a messy
 * free-text abbreviation — 174 distinct spellings across 2026 (Mediclinic ×15,
 * NMC ×25, HMG ×20, BMC ×8, …). This maps each cell to:
 *   - a CLEAN canonical hospital name (so the "By hospital" breakdown groups the
 *     15 Mediclinic spellings into one), and
 *   - a CITY + COUNTRY (so the Region breakdown works — Dubai / Abu Dhabi /
 *     Sharjah / … / Saudi Arabia / Qatar). The cell's suffix usually encodes it
 *     (`-AD`/`-AUH`→Abu Dhabi, `-DXB`→Dubai, `-SHJ`/`-Sh`→Sharjah, `RAK`→Ras
 *     Al Khaimah, `FUH`→Fujairah); where it doesn't, the chain's home country
 *     is used (Mediclinic/NMC/BMC→UAE, HMG/MNGHA→Saudi, Apex/KMC/MMCH→Qatar).
 *
 * Used at IMPORT time (to store a clean hospital_name) and at REPORT time (to
 * group placements by region). Idempotent: normalizing an already-clean
 * canonical name yields the same result.
 *
 * Genuinely ambiguous cells fall through to country `null` ("Unknown region")
 * rather than being guessed — surfaced in the report so the team can confirm.
 */

export interface HospitalRegion {
  /** Clean canonical hospital name, e.g. "Mediclinic (Abu Dhabi)". */
  hospital: string;
  city:     string | null;
  /** "UAE" | "Saudi Arabia" | "Qatar" | "Bahrain" | "Oman" | null */
  country:  string | null;
}

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/** UAE city from a token/suffix. Null if no UAE city marker present. */
function uaeCity(n: string): string | null {
  if (/\bfuh\b|fujairah/.test(n)) return "Fujairah";
  if (/\brak\b|ras al khaimah/.test(n)) return "Ras Al Khaimah";
  if (/\bal ain\b|\balan\b|tawam|oasis|cambridge/.test(n)) return "Al Ain";
  if (/\bshj\b|sharjah|\bsh\b|zulekha|\buhs\b/.test(n)) return "Sharjah";
  if (/\bajman\b/.test(n)) return "Ajman";
  if (/\bauh\b|\bad\b|abu dhabi|\bseha\b|\bskmc\b|\bssmc\b|\bsuh\b|\bskhf\b|shakhbout|khalifa|reem|\byas\b|capital|dhafra|\bstmc\b|tarmeem|\bzmh\b|quironsalud|\bacpn?\b/.test(n)) return "Abu Dhabi";
  if (/\bdxb\b|dubai|medcare|moorfiel|moorfile|garhoud|gargash|healthbay|glucare|silkor|valens|mirdif|harl|bascom|\bahd\b|\bah\b|american|\bprime\b|\bego\b|ardens|metabolic|light house|\bkch\b/.test(n)) return "Dubai";
  return null;
}

interface Chain { name: string; country: string | null; city?: string | null; }

/** Base hospital "chain" → canonical name + its HOME country (used when the
 *  cell carries no explicit city suffix). Ordered: more specific first. */
function chainInfo(n: string): Chain | null {
  // Qatar
  if (/\bmmch\b/.test(n)) return { name: "Apex — MMCH", country: "Qatar", city: "Doha" };
  if (/\bkmc\b/.test(n)) return { name: "Apex — KMC", country: "Qatar", city: "Doha" };
  if (/the view/.test(n)) return { name: "Apex — The View", country: "Qatar", city: "Doha" };
  if (/apex/.test(n)) return { name: "Apex Health", country: "Qatar", city: "Doha" };
  if (/al fardan|\bamnm\b/.test(n)) return { name: "Al Fardan Medical", country: "Qatar", city: "Doha" };
  if (/sidra/.test(n)) return { name: "Sidra", country: "Qatar", city: "Doha" };
  if (/hamad|rumailah/.test(n)) return { name: "Hamad", country: "Qatar", city: "Doha" };
  if (/\baman\b/.test(n)) return { name: "Aman Hospital", country: "Qatar", city: "Doha" };
  if (/al ?ahli/.test(n)) return { name: "Al Ahli", country: "Qatar", city: "Doha" };
  // Saudi
  if (/mngha|national guard/.test(n)) return { name: "MNGHA", country: "Saudi Arabia" };
  if (/\bhmg\b|sulaiman|al ?habib/.test(n)) return { name: "HMG", country: "Saudi Arabia" };
  if (/kfsh|king faisal/.test(n)) return { name: "KFSH", country: "Saudi Arabia" };
  if (/dallah/.test(n)) return { name: "Dallah", country: "Saudi Arabia", city: "Riyadh" };
  if (/saudi german|\bsgh\b/.test(n)) return { name: "Saudi German Hospital", country: "Saudi Arabia" };
  if (/alrajhi/.test(n)) return { name: "Alrajhi", country: "Saudi Arabia" };
  if (/almoss?a|almosa/.test(n)) return { name: "Almoosa", country: "Saudi Arabia" };
  if (/al ?amal|alamal/.test(n)) return { name: "Al Amal Psychiatry", country: "Saudi Arabia" };
  if (/al ?kalma|alkalma/.test(n)) return { name: "Al Kalma Health", country: "UAE", city: "Abu Dhabi" };
  if (/al ?zahra|alzhara|al ?zhara/.test(n)) return { name: "Al Zahra", country: "UAE" };
  if (/red sea|amaa?la|turtle bay|\bneom\b/.test(n)) return { name: "Red Sea Project", country: "Saudi Arabia" };
  if (/womens health|\bwhh\b/.test(n)) return { name: "Women's Health Hospital", country: "Saudi Arabia" };
  // UAE chains (home country UAE even with no city suffix)
  if (/mediclin|medicalinic/.test(n)) return { name: "Mediclinic", country: "UAE" };
  if (/\bnmc\b/.test(n)) return { name: "NMC", country: "UAE" };
  if (/\bbmc\b/.test(n)) return { name: "BMC", country: "UAE" };
  if (/burjeel/.test(n)) return { name: "Burjeel", country: "UAE" };
  if (/\bstmc\b/.test(n)) return { name: "STMC", country: "UAE", city: "Abu Dhabi" };
  if (/\bahd\b/.test(n)) return { name: "American Hospital (Dubai)", country: "UAE", city: "Dubai" };
  if (/\bah\b|american/.test(n)) return { name: "American Hospital", country: "UAE", city: "Dubai" };
  if (/medcare/.test(n)) return { name: "Medcare", country: "UAE" };
  if (/\bseha\b/.test(n)) return { name: "SEHA", country: "UAE", city: "Abu Dhabi" };
  if (/\bskmc\b/.test(n)) return { name: "SKMC", country: "UAE", city: "Abu Dhabi" };
  if (/\bssmc\b/.test(n)) return { name: "SSMC", country: "UAE", city: "Abu Dhabi" };
  if (/\btawam\b/.test(n)) return { name: "Tawam", country: "UAE", city: "Al Ain" };
  if (/zulekha/.test(n)) return { name: "Zulekha", country: "UAE" };
  if (/moorfiel|moorfile/.test(n)) return { name: "Moorfields", country: "UAE", city: "Dubai" };
  if (/maudsley|maudsely|muadsley/.test(n)) return { name: "Maudsley Health", country: "UAE", city: "Dubai" };
  if (/aspris|asparis/.test(n)) return { name: "Aspris", country: "UAE", city: "Dubai" };
  if (/\bacpn?\b/.test(n)) return { name: "ACPN", country: "UAE", city: "Abu Dhabi" };
  if (/\bprime\b/.test(n)) return { name: "Prime Hospital", country: "UAE", city: "Dubai" };
  if (/capital/.test(n)) return { name: "Capital Health", country: "UAE", city: "Abu Dhabi" };
  if (/fakih/.test(n)) return { name: "Fakih IVF", country: "UAE" };
  if (/quironsalud/.test(n)) return { name: "Quironsalud", country: "UAE", city: "Abu Dhabi" };
  if (/reem/.test(n)) return { name: "Reem Hospital", country: "UAE", city: "Abu Dhabi" };
  if (/\buhs\b/.test(n)) return { name: "University Hospital Sharjah", country: "UAE", city: "Sharjah" };
  if (/\brak\b/.test(n)) return { name: "RAK Hospital", country: "UAE", city: "Ras Al Khaimah" };
  if (/\bfuh\b/.test(n)) return { name: "Fujairah University Hospital", country: "UAE", city: "Fujairah" };
  if (/\bkch\b|kings college/.test(n)) return { name: "King's College Hospital", country: "UAE", city: "Dubai" };
  if (/harl/.test(n)) return { name: "Harley Street", country: "UAE", city: "Dubai" };
  if (/tarmeem/.test(n)) return { name: "Tarmeem", country: "UAE", city: "Abu Dhabi" };
  return null;
}

export function resolveHospitalRegion(raw: string): HospitalRegion {
  const original = (raw || "").trim();
  const n = norm(original);
  if (!n) return { hospital: original, city: null, country: null };

  // Explicit country markers (words that pin the country regardless of chain).
  const dubaiOverride = /dubai|\bdxb\b/.test(n);           // "HMG Dubai" is a UAE branch
  const explicitQatar = /qatar|doha/.test(n);
  const explicitSaudi = !dubaiOverride && /riyadh|jeddah|qassim|\bqsm\b|khobar|olaya|rayan|sahafa|takasusi|ahsa|\bhasa\b|\btaif\b|mohamadiyah|saudi/.test(n);

  const chain = chainInfo(n);

  // City: an explicit Saudi city, else a UAE city suffix, else the chain's city.
  let city: string | null = null;
  let country: string | null = null;

  if (explicitQatar) { country = "Qatar"; city = "Doha"; }
  else if (explicitSaudi) {
    country = "Saudi Arabia";
    if (/riyadh|olaya|rayan|sahafa|takasusi/.test(n)) city = "Riyadh";
    else if (/jeddah/.test(n)) city = "Jeddah";
    else if (/qassim|\bqsm\b/.test(n)) city = "Qassim";
    else if (/khobar/.test(n)) city = "Khobar";
    else if (/ahsa|\bhasa\b/.test(n)) city = "Al Ahsa";
    else if (/\btaif\b/.test(n)) city = "Taif";
  } else {
    const uc = uaeCity(n);
    if (uc) { country = "UAE"; city = uc; }
  }

  // Fall back to the chain's home country/city when no explicit marker matched.
  if (!country && chain?.country) country = chain.country;
  if (!city && chain?.city && country === chain.country) city = chain.city;

  // Canonical name. Multi-city chains append the city to disambiguate.
  let hospital: string;
  if (chain) {
    const multiCity = /^(Mediclinic|NMC|BMC|Burjeel|HMG|MNGHA|KFSH|Medcare|Zulekha)$/.test(chain.name);
    hospital = multiCity && city ? `${chain.name} (${city})` : chain.name;
  } else {
    hospital = original.replace(/\s+/g, " ").trim();
  }

  return { hospital, city, country };
}

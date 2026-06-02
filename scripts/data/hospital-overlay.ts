/**
 * Hospital contact overlay — hand-parsed from Saif's master list 2026-06-02.
 *
 * This is the "human knowledge" layer that Zoho doesn't capture:
 *   - CC recipients (Zoho typically has only a primary)
 *   - Active/Stop-sending flag (Zoho note fields don't drive automation)
 *   - HI team owner (Rodaina / Mohamed / Sohaila / Ishak)
 *   - Greeting line ("Hello Mr. Hari!" — token for email templates)
 *   - Specialty restrictions (only / skip lists)
 *
 * The merge script (scripts/import-hospital-contacts.ts) reads Zoho's
 * Accounts module first for name + city + country + primary_recruiter_email,
 * then layers this overlay on top by matching on hospital name.
 *
 * Names use the canonical form from Saif's list. The matcher is fuzzy
 * (case-insensitive, normalises spacing) so small Zoho variations like
 * "American Hospital - Dubai" still hit the "American Hospital Dubai" entry.
 */

export const OWNERS = {
  rodaina: "Rodaina@allocationassist.com",
  mohamed: "mohamed.othman@allocationassist.com",
  sohaila: "sohaila@allocationassist.com",
  ishak:   "ishak@allocationassist.com",
} as const;

export interface HospitalOverlay {
  /** Canonical hospital name. Matched fuzzily against Zoho's Account_Name. */
  name:            string;
  /** Authoritative primary recipient (overrides Zoho if Zoho's empty). */
  primary_recruiter_email?: string;
  cc_emails?:      string[];
  active?:         boolean;
  owner_email?:    string | null;
  greeting?:       string;
  specialty_only?: string[];
  specialty_skip?: string[];
  notes?:          string;
  /** Optional — when Zoho lacks city/country, the overlay fills them in. */
  city?:           string;
  country?:        string;
}

// Splitting by region keeps diffs readable when Saif adds / removes hospitals.

const DUBAI: HospitalOverlay[] = [
  { name: "Latifa Hospital",                    city: "Dubai", country: "UAE", primary_recruiter_email: "fgmirza@dubaihealth.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Dr. Fadi!", specialty_only: ["Obstetrics & Gynaecology"], notes: "OBGYN only" },
  { name: "Al Jalila Children's Hospital",      city: "Dubai", country: "UAE", primary_recruiter_email: "Annette.Anthony@dubaihealth.ae", cc_emails: ["Faaalessa@dubaihealth.ae","annette.anthony@ajch.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Annette!" },
  { name: "Hamdan Bin Rashid Cancer Hospital",  city: "Dubai", country: "UAE", primary_recruiter_email: "int_smaladwala@dahc.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Shams Maladwala!" },
  { name: "Dubai Health Authority",             city: "Dubai", country: "UAE", primary_recruiter_email: "kyAlAnsari@dubaihealth.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mrs. Khawla!" },
  { name: "Saudi German Hospital Dubai",        city: "Dubai", country: "UAE", primary_recruiter_email: "sarumugam@saudigerman.com", cc_emails: ["mnawaz@saudigerman.com","ZZaben@saudigerman.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Sindu!" },
  { name: "Kings College Hospital Dubai",       city: "Dubai", country: "UAE", primary_recruiter_email: "hari.das@kch.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Hari!", notes: "Needs specific salary expectation" },
  { name: "Emirates Specialty Hospital DHCC",   city: "Dubai", country: "UAE", primary_recruiter_email: "Marina.mhanna@emirateshospital.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: false, greeting: "Hello Ms. Marina!", notes: "Stop sending per Rodaina 18MAY26" },
  { name: "Medicentres",                        city: "Dubai", country: "UAE", primary_recruiter_email: "razane.karameh@medicentres.ae", cc_emails: [], owner_email: null, active: false, greeting: "Hello Ms. Razane!", notes: "STOP SENDING 09/07" },
  { name: "Rashid Hospital",                    city: "Dubai", country: "UAE", primary_recruiter_email: "NadiaDabbagh@gmail.com", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Nadia!" },
  { name: "International Modern Hospital",      city: "Dubai", country: "UAE", primary_recruiter_email: "pauline.m@imh.ae", cc_emails: ["jennifer.s@imh.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Jennifer" },
  { name: "HealthBay",                          city: "Dubai", country: "UAE", primary_recruiter_email: "dr.maham@healthbayclinic.com", cc_emails: ["arpan.d@wahahealth.com","sreelakshmi@healthbayclinic.com","hana.a@wahahealth.com"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Hana and the team!", notes: "Individual email, with salary expectation; only CC Mohamed" },
  { name: "NMC Hospital Dubai",                 city: "Dubai", country: "UAE", primary_recruiter_email: "Nabeel.ahmed@nmc.ae", cc_emails: ["sreeprakash.j@nmc.ae","aswathy.ajith@nmc.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Nabeel!", notes: "Handles Dubai & Sharjah per Mohamed" },
  { name: "NMC Hospital Dubai (Suresh group)",  city: "Dubai", country: "UAE", primary_recruiter_email: "suresh.mathews@nmc.ae", cc_emails: ["atif.ahmad@nmc.ae","paolo.fulo@nmc.ae","alan.hooban@nmc.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Suresh and the team!" },
  { name: "Emirates Group",                     city: "Dubai", country: "UAE", primary_recruiter_email: "omar.alfaki@emirateshospital.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: false, greeting: "Hello Mr. Omar!", notes: "Stop sending per Rodaina 18MAY26" },
  { name: "Ardens Medical Center DXB",          city: "Dubai", country: "UAE", primary_recruiter_email: "J.Issa@ardensmc.ae", cc_emails: ["R.cayubit@ardensmc.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Jasmin!", specialty_only: ["Psychology","Psychiatry","Family Medicine","Occupational Therapy"], notes: "Only Psychologist / Psychiatrist / GPs / OT & Social workers" },
  { name: "Zulekha Hospital",                   city: "Dubai", country: "UAE", primary_recruiter_email: "kchettigari@zulekhahospitals.com", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Kiran!" },
  { name: "Mirdif Hospital",                    city: "Dubai", country: "UAE", primary_recruiter_email: "sandra.steephan@hmsco.ae", cc_emails: ["mmoawad@hmsco.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Sandra!", notes: "With salary expectation" },
  { name: "Prime Hospital",                     city: "Dubai", country: "UAE", primary_recruiter_email: "mirza@primehealth.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Majeed!" },
  { name: "Fakeeh University Hospital",         city: "Dubai", country: "UAE", primary_recruiter_email: "vipatil@fakeeh.care", cc_emails: ["smcampul@fakeeh.care"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Viji!" },
  { name: "Mediclinic Dubai",                   city: "Dubai", country: "UAE", primary_recruiter_email: "Ana.Peliteiro@mediclinic.ae", cc_emails: ["weam.awwad@mediclinic.ae","David.Jelley@mediclinic.ae","Nitya.Pillai@mediclinic.ae","Medha.Mukundan@mediclinic.ae","Andreeas.Branza@mediclinic.ae","Shadi.Sallam@mediclinic.ae","Ramya.Halbhavi@mediclinic.ae","Ali.Musharbek@mediclinic.ae","barry.bedford@mediclinic.ae","David.Eglington@mediclinic.ae","Ramzy.Ross@mediclinic.ae","Tyler.Taraschi@mediclinic.ae","Holly.Spyrou@mediclinic.ae","Jamie.scanlon@mediclinic.ae","Simon.Wright@mediclinic.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mediclinic team!", notes: "Albert.Oliver only for Tier 1 if advised" },
  { name: "American Hospital Dubai",            city: "Dubai", country: "UAE", primary_recruiter_email: "amirza@ahdubai.com", cc_emails: ["asallam@ahdubai.com","joquendo@ahdubai.com","rhaddad@ahdubai.com","balawadhi@ahdubai.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Ali, Mr. Sallam and Ms. Jessamine!" },
  { name: "Clemenceau Hospital",                city: "Dubai", country: "UAE", primary_recruiter_email: "houda.bensaid@cmcdubai.ae", cc_emails: ["Jad.Chokr@cmcdubai.ae","suchitra.samom@cmcdubai.ae","camille.olaes@cmcdubai.ae","edgar.chedrawy@cmcdubai.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Dr. Kiren, Ms. Suchitra, and the team!" },
  { name: "Dubai London Clinic",                city: "Dubai", country: "UAE", primary_recruiter_email: "gnayar@dubailondonclinic.ae", cc_emails: [], owner_email: null, active: true, greeting: "Hello Mr. Gaurav!" },
  { name: "Al Garhoud Hospital",                city: "Dubai", country: "UAE", primary_recruiter_email: "reema@sdinvest.ae", cc_emails: ["mmoawad@hmsco.ae","danup@hmsco.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Reema and Ms. Divya!" },
  { name: "Fakih IVF Fertility Center",         city: "Dubai", country: "UAE", primary_recruiter_email: "glen.olivera@fakihivf.com", cc_emails: ["michael.fakih@emirateshospital.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Dr. Michael!" },
  { name: "DHA Government Hospitals",           city: "Dubai", country: "UAE", primary_recruiter_email: "amalmutawa@dha.gov.ae", cc_emails: ["Hmalismaily@dha.gov.ae","ahalsuwaidi@dha.gov.ae","hrrecruitment@dha.gov.ae","EMMAALi@dha.gov.ae","kyalansari@dha.gov.ae","FIHAbdulla@dha.gov.ae","mariano.gonzalez@dahc.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello DHA team!" },
  { name: "Dubai Health",                       city: "Dubai", country: "UAE", primary_recruiter_email: "aysha.alsharhan@dubaihealth.ae", cc_emails: ["leon.dupreez@dubaihealth.ae","faaikhaja@dubaihealth.ae","int_smaladwala@dha.gov.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Team!", notes: "Upon request only" },
  { name: "Gargash Hospital",                   city: "Dubai", country: "UAE", primary_recruiter_email: "muhammadkhan@gargashhospital.com", cc_emails: ["jithikajayan@gargashhospital.com","wasimakhtar@gargashhospital.com"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Muhammad and the team!", specialty_skip: ["Nephrology","Ophthalmology"] },
  { name: "Novomed Centers",                    city: "Dubai", country: "UAE", primary_recruiter_email: "laarni.gaviola@novomed.com", cc_emails: ["silvia.botha@novomed.com","drmax@novomed.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Silvia! / Hello Team!" },
  { name: "Medcare Hospital",                   city: "Dubai", country: "UAE", primary_recruiter_email: "likhitha.kotian@medcarehospital.com", cc_emails: ["vidhya.venugopal@medcarehospital.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Likhitha!" },
  { name: "Metabolic Health",                   city: "Dubai", country: "UAE", primary_recruiter_email: "agnes@metabolic.health", cc_emails: ["james@metabolic.health"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Agnes!", specialty_only: ["Endocrinology"], notes: "With salary expectation" },
  { name: "Moorfields Eye Hospital",            city: "Dubai", country: "UAE", primary_recruiter_email: "jacqueline.rodrigues@moorfields.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Jacqueline!", specialty_only: ["Ophthalmology"] },
  { name: "Al Zahra Hospital",                  city: "Dubai", country: "UAE", primary_recruiter_email: "ali.emad@azhd.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Ali!" },
  { name: "Jumeirah American Clinic",           city: "Dubai", country: "UAE", primary_recruiter_email: "michael.fakih@emirateshospital.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Dr. Fakih!" },
  { name: "Blue Ocean Health Group",            city: "Dubai", country: "UAE", primary_recruiter_email: "ledio.zeneli@jac.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Ledio!" },
  { name: "Burjeel Hospital Dubai",             city: "Dubai", country: "UAE", primary_recruiter_email: "neda.lotfi@burjeel.com", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Ms. Neda!" },
  { name: "Sulaiman Al Habib Dubai",            city: "Dubai", country: "UAE", primary_recruiter_email: "rania.tawalbeh@drsulaimanalhabib.com", cc_emails: ["DAVID.EDDINE@drsulaimanalhabib.com","mdadil@drsulaimanalhabib.com"], owner_email: null, active: false, greeting: "Hello Mrs. Rania!", notes: "Not advised to send profiles" },
  { name: "CosmeSurge Hospital",                city: "Dubai", country: "UAE", primary_recruiter_email: "siraj.khan@cosmesurge.com", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hi Mr. Siraj!" },
  { name: "QironSalud Specialty Hospital",      city: "Dubai", country: "UAE", primary_recruiter_email: "hr@quironsalud.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Dr. Kathleen!", specialty_only: ["Ophthalmology"], notes: "Orthopedics on hold per Rodaina; for Spanish doctors" },
];

const ABU_DHABI: HospitalOverlay[] = [
  { name: "Tawam Hospital",                     city: "Al Ain",  country: "UAE", primary_recruiter_email: "rajashekar.yerra@purehealth.ae", cc_emails: ["tvarghese@seha.ae","o-arsaleem@seha.ae","o-pdiwa@seha.ae","o-shathaa@seha.ae","rdisanayaka@seha.ae","asaryani@seha.ae"], owner_email: null, active: false, greeting: "Hello Ms. Shatha!", notes: "Don't send for now per Ammar 20NOV25" },
  { name: "SEHA",                               city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "o-sespra@seha.ae", cc_emails: ["sedassery@seha.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Salome and Mr. Sekkeeb!", notes: "Only upon request" },
  { name: "Sheikh Khalifa Medical City",        city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "abakaraiba@seha.ae", cc_emails: ["cristaldim@seha.ae"], owner_email: null, active: true, greeting: "Hello Ms. Asma!", notes: "Only Asma per Ammar; Dr. Massimo via cristaldim" },
  { name: "Abu Dhabi Stem Cells Center",        city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "uzma.z@adscc.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Uzma!" },
  { name: "Harley Street Medical",              city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "ceooffice@hsmc.ae", cc_emails: ["hady.jerdak@hsmc.ae","ali.rabah@hsmc.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Dr. Hady!" },
  { name: "Royal Health Group",                 city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "muhammad.daniall@rhg.ae", cc_emails: ["kristene.cm@rhg.ae"], owner_email: OWNERS.rodaina, active: false, greeting: "Hello Mr. Muhammad!", notes: "Don't send for now per Emilie 25AUG25" },
  { name: "Royal Health Group Al Ain",          city: "Al Ain",  country: "UAE", primary_recruiter_email: "Mohammed.rashid@crh.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: false, greeting: "Hello Mr. Mohammed Rashid!", notes: "Don't send for now per Emilie 25AUG25" },
  { name: "Mubadala Health",                    city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "rpopatia@mubadalahealth.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Dr. Rizwana!", notes: "Only Rizwana per Rodaina 10NOV25" },
  { name: "Zayed Military Hospital",            city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "fatima.mayao@gmshm.ae", cc_emails: ["vijai.elugubanti@gmshm.ae","mohamed.othman@gmshm.ae","angel.dinapo@gmshm.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Fatima!", notes: "OK to send again per Ammar 19MAY26" },
  { name: "Bascom Palmer Eye Institute",        city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "G.Roos@bascompalmereyeinstitute.com", cc_emails: ["K.Mascarenhas@bascompalmereyeinstitute.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. George!", specialty_only: ["Ophthalmology"] },
  { name: "Ambulatory Services",                city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "geroos@seha.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. George!" },
  { name: "Burjeel Medical City",               city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "hanah.penuliar@burjeelmedicalcity.com", cc_emails: ["ibrahim.abugheida@burjeelmedicalcity.com","Sonia.Kattampally@burjeelmedicalcity.com"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello team!", notes: "philip.shabo CC only if Oncology" },
  { name: "Burjeel Abu Dhabi and Al Ain",       city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "linda.m@burjeel.com", cc_emails: ["aysha.almahri@burjeelholdings.com","Sonia.Kattampally@burjeelmedicalcity.com"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Linda!" },
  { name: "Burjeel Abu Dhabi (Bala)",           city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "Balachander.gnanasundaram@burjeelholdings.com", cc_emails: ["Sonia.Kattampally@burjeelmedicalcity.com"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Bala!" },
  { name: "Reem Hospital",                      city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "Khalid.hamid@reemhospital.ae", cc_emails: ["sanjana.dmello@reemhospital.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Khalid!" },
  { name: "Sheikh Shakhbout Medical City",      city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "ssmcrecruitment@gmail.com", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Team", notes: "aajam@ssmc.ae, ndalawar, sshafeel, sjesus only if advised" },
  { name: "Tarmeem Hospital",                   city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "roger.feghali@tarmeem.com", cc_emails: ["muhammed.koya@tarmeem.com","baqir.abrar@tarmeem.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Roger!", specialty_only: ["Orthopedic Surgery"] },
  { name: "Cleveland Clinic Abu Dhabi",         city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "AlvaraB@clevelandclinicabudhabi.ae", cc_emails: ["Almahrr@clevelandclinicabudhabi.ae","Aljunaa@clevelandclinicabudhabi.ae","nabeel@clevelandclinic.ae","mynamm@clevelandclinicabudhabi.ae","alibraa@clevelandclinicabudhabi.ae","AbrahaR@ClevelandClinicAbuDhabi.ae","kauls@clevelandclinicabudhabi.ae","DiazJ@ClevelandClinicAbuDhabi.ae","shahs3@clevelandclinicabudhabi.ae"], owner_email: null, active: true, greeting: "Hello team!" },
  { name: "Capital Health",                     city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "skhan@capital-health.ae", cc_emails: ["amahmoudi@capital-health.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Atef!" },
  { name: "Capital Health (Gretchen)",          city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "gretchen@capital-health.ae", cc_emails: ["gorme@capital-health.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Gretchen!" },
  { name: "SEHA Group (Fatima)",                city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "fhumaid@seha.ae", cc_emails: ["tvarghese@seha.ae","abakaraiba@seha.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello SEHA team!", notes: "Manager: Fatima Al Rayssi" },
  { name: "SEHA Al Ain",                        city: "Al Ain",  country: "UAE", primary_recruiter_email: "rdisanayka@seha.ae", cc_emails: ["o-hmadam@seha.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello SEHA Al Ain team!" },
  { name: "SEHA Al Dhafra",                     city: "Al Dhafra", country: "UAE", primary_recruiter_email: "o-mitadros@seha.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Michael!", notes: "Manager: Jamila Al Derei (jdarei@seha.ae)" },
  { name: "SEHA Fujairah",                      city: "Fujairah", country: "UAE", primary_recruiter_email: "mfabdulaziz@skh-fuj.ae", cc_emails: ["mfabdulaziz@skhf.ae","GPreetham@skhf.ae","fhumaid@seha.ae","jdarei@seha.ae","moahosani@skh-fuj.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello SEHA team!", notes: "Manager: Mohamed Al Hosani" },
  { name: "Mediclinic Airport Road",            city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "Rami.AlSaman@mediclinic.ae", cc_emails: ["anesh.maharaj@mediclinic.ae","Mohamed.Hany@mediclinic.ae","Jing.Guadalquiver@Mediclinic.ae","Shaaban.Fahmy@mediclinic.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Rami!" },
  { name: "Mediclinic Al Jowhara",              city: "Al Ain",  country: "UAE", primary_recruiter_email: "Philip.Tyler@mediclinic.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Mr. Philip!" },
  { name: "NMC Hospital AUH",                   city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "gopika.dhanesh@nmc.ae", cc_emails: ["selby.jameson@nmc.ae","simranjeet.sethi@nmc.ae","suresh.mathews@nmc.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Gopika!" },
  { name: "Canadian Specialist Hospital",       city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "m.d@csh.ae", cc_emails: [], owner_email: null, active: true, greeting: "Hello Dr. Mohanad!", notes: "HR (Maria) separate: m.villegas@csh.ae" },
  { name: "Tawam Hospital AUH STMC",            city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "o-sespra@seha.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: false, greeting: "Hello Ms. Salome!", notes: "Don't send per Rodaina 25SEP25" },
  { name: "Institute of Healthier Living",      city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "b.dumont@ihlad.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello team!", specialty_only: ["Family Medicine","Internal Medicine"] },
];

const SHARJAH_RAK: HospitalOverlay[] = [
  { name: "Sharjah University Hospital",        city: "Sharjah", country: "UAE", primary_recruiter_email: "Aicha.Seck@uhs.ae", cc_emails: ["Mudassra.syeda@uhs.ae","aisha.alali@uhs.ae","Ghadeer.Qambar@uhs.ae"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello team!" },
  { name: "NMC Sharjah",                        city: "Sharjah", country: "UAE", primary_recruiter_email: "Nabeel.ahmed@nmc.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Mr. Nabeel!", notes: "Separate email per Rodaina 20APR26" },
  { name: "NMC Sharjah (Pauline)",              city: "Sharjah", country: "UAE", primary_recruiter_email: "pauline.madriaga@nmc.ae", cc_emails: [], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Ms. Pauline!" },
  { name: "Al Sharq Hospital",                  city: "Fujairah", country: "UAE", primary_recruiter_email: "admin3.shf@fng.ae", cc_emails: ["mahmoud.elrefaey@fng.ae","cmo.shf@fng.ae","ceo_office.shf@fng.ae"], owner_email: OWNERS.mohamed, active: true, greeting: "Hello Al Sharq Hospital team!" },
  { name: "RAK Hospital",                       city: "Ras Al Khaimah", country: "UAE", primary_recruiter_email: "Recruitment.HR@rakhospital.com", cc_emails: ["parjit.b@rakhospital.com","musaveer.s@rakhospital.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Viji!" },
  { name: "Sheikh Khalifa Hospital RAK",        city: "Ras Al Khaimah", country: "UAE", primary_recruiter_email: "hind.alshehhi@sksh.ae", cc_emails: [], owner_email: null, active: true, greeting: "Hello team!" },
];

const MENTAL_HEALTH: HospitalOverlay[] = [
  { name: "Maudsley Health AUH",                city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "ishita.rathi@maudsleyhealth.com", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Ishita!", specialty_only: ["Psychiatry","Psychology"] },
  { name: "Al Kalma Health AUH",                city: "Abu Dhabi", country: "UAE", primary_recruiter_email: "careers@alkalmahealth.com", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Zhamira and the team!", specialty_only: ["Psychiatry","Psychology"] },
  { name: "The Valens Clinic DXB",              city: "Dubai", country: "UAE", primary_recruiter_email: "ssiddiqui@thevalensclinic.ae", cc_emails: [], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Sarah!", specialty_only: ["Psychiatry"] },
  { name: "Al Amal Psychiatric Hospital DXB",   city: "Dubai", country: "UAE", primary_recruiter_email: "doctor.adel.karrani@gmail.com", cc_emails: ["Albanna.Md@gmail.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Dr. Adel Karrani!", specialty_only: ["Psychiatry","Psychology"] },
  { name: "American Center of Psychiatry and Neurology DXB", city: "Dubai", country: "UAE", primary_recruiter_email: "m.farhan@ashealth.ae", cc_emails: ["m.othman@americancenteruae.com","a.sajjad@ashealth.ae","k.aboushaar@americancenteruae.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Dr. Farhan and the team!", specialty_only: ["Psychiatry","Neurology"] },
  { name: "Priory Wellbeing Centre Dubai",      city: "Dubai", country: "UAE", primary_recruiter_email: "FaridaMukhtorova@aspris.ae", cc_emails: ["WillGoodwin@priorygroup.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Farida!", specialty_only: ["Psychiatry","Psychology"] },
  { name: "The LightHouse Arabia DXB",          city: "Dubai", country: "UAE", primary_recruiter_email: "ssiddiqui@lighthousearabia.com", cc_emails: ["careers@lighthousearabia.com"], owner_email: OWNERS.rodaina, active: true, greeting: "Hello Ms. Krizalei!", specialty_only: ["Psychiatry","Psychology"] },
];

const DENTAL: HospitalOverlay[] = [
  { name: "Nicolas & Asp",                      city: "Dubai", country: "UAE", primary_recruiter_email: "windy.bugarin@nicolasasp.ae", cc_emails: [], owner_email: null, active: true, greeting: "Hello Ms. Windy!", specialty_only: ["Dentistry","Orthodontics","Endodontics","Periodontics","Prosthodontics","Pediatric Dentistry"] },
];

const KSA_SOHAILA: HospitalOverlay[] = [
  { name: "King Faisal Specialist Hospital",    city: "Riyadh",  country: "KSA", primary_recruiter_email: "physicians_recruitment@kfshrc.edu.sa", cc_emails: ["mhhafez@kfshrc.edu.sa","mhalmutairi@kfshrc.edu.sa","oshalabi@kfshrc.edu.sa","anaso@kfshrc.edu.sa","walsarrani@kfshrc.edu.sa","fqureshi@kfshrc.edu.sa","malhenaki@kfshrc.edu.sa","hhusseini@kfshrc.edu.sa","ralradhi@kfshrc.edu.sa","dhassoubah@kfshrc.edu.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!", notes: "Only UK CCT, CESR, American, Canadian, Australian. Except Anesthesia" },
  { name: "King Faisal Specialist (Anesthesia)", city: "Riyadh", country: "KSA", primary_recruiter_email: "gginateopaco@kfshrc.edu.sa", cc_emails: ["zbzoega@kfshrc.edu.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!", specialty_only: ["Anesthesia"] },
  { name: "IMC",                                city: "Jeddah",  country: "KSA", primary_recruiter_email: "Ceo1@imc.med.sa", cc_emails: ["ayman_oraif@yahoo.com","faimalki@imc.med.sa","Rjamal@imc.med.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!" },
  { name: "Myclinic",                           city: "Riyadh",  country: "KSA", primary_recruiter_email: "nasser.althrwy@myclinic.com.sa", cc_emails: ["fisal.alharthy@myclinic.com.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!" },
  { name: "Sulaiman Fakeeh Riyadh",             city: "Riyadh",  country: "KSA", primary_recruiter_email: "Hkalshadwi@fakeeh.care", cc_emails: [], owner_email: OWNERS.sohaila, active: false, greeting: "Hello Mr. Hamad!", notes: "Email delivery issue" },
  { name: "Sameer Abbas Hospital",              city: "Jeddah",  country: "KSA", primary_recruiter_email: "Areej.Shulan@Dsah.sa", cc_emails: ["ali.alharbi@dsah.sa","danh.alzahrani@dsah.sa","bayan.alhazmi@dsah.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Mr. Ali and Ms. Areej!" },
  { name: "Alsalama Hospital",                  city: "Jeddah",  country: "KSA", primary_recruiter_email: "Areej.alomari@alsalamahospital.com", cc_emails: [], owner_email: OWNERS.sohaila, active: false, greeting: "Hello Ms. Areej!", notes: "Email delivery issue, don't send" },
  { name: "Almana Group",                       city: "Dammam",  country: "KSA", primary_recruiter_email: "Tiaba.almoajel@almanahospital.sa", cc_emails: [], owner_email: OWNERS.sohaila, active: false, greeting: "Hello Dr. Almoajel!", notes: "Email delivery issue, don't send" },
  { name: "King Saud bin Abdul Aziz",           city: "Riyadh",  country: "KSA", primary_recruiter_email: "ghamdiamal@ksau-hs.edu.sa", cc_emails: [], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Ms. Amal!" },
  { name: "Dallah Hospital",                    city: "Riyadh",  country: "KSA", primary_recruiter_email: "h_basodan@dallah-hospital.com", cc_emails: ["a_alkhalaf@Dallah-Hospital.com","srelfaqih@dallahhealth.com","an_babaeer@dallah-hspital.com","f_AlShehri@dallah-hospital.com","MS_Alquraishi@dallah-hospital.com"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Mr. Hisham!" },
  { name: "Mohammed Alfagih Hospital",          city: "Riyadh",  country: "KSA", primary_recruiter_email: "Bedour.alotaibi@dmf.med.sa", cc_emails: ["asmaa.alkharazi@dmf.med.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Ms. Bedour!", specialty_only: ["ENT","Endocrinology","Neurology"], notes: "Arabic only" },
  { name: "Prince Sultan Military Hospital",    city: "Riyadh",  country: "KSA", primary_recruiter_email: "Raljibreen@psmmc.med.sa", cc_emails: [], owner_email: OWNERS.sohaila, active: false, greeting: "Hello Ms. Rathath!", notes: "Don't send any profile for now (13/05/2025)" },
  { name: "Prince Sultan Cardiac Center",       city: "Riyadh",  country: "KSA", primary_recruiter_email: "Recruitment@pscc.med.sa", cc_emails: ["khalid@pscc.med.sa","aalkhushail@pscc.med.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!", specialty_only: ["Cardiology","Cardiothoracic Surgery"] },
  { name: "Child Fertility",                    city: "Riyadh",  country: "KSA", primary_recruiter_email: "tim.child@childfertility.com", cc_emails: [], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!", specialty_only: ["Obstetrics & Gynaecology"], notes: "Only IVF/OBGYN" },
  { name: "Aramco (JHAH)",                      city: "Dhahran", country: "KSA", primary_recruiter_email: "Malak.Alhelal@jhah.com", cc_emails: ["Wadha.Almattar@jhah.com","Abdullah.Alduhaish2@jhah.com","mohammed.qahtani.151@jhah.com","ghaya.shamsi@jhah.com","Dalia.Basrawi@jhah.com","SUMAYAH.HABASHI@jhah.com","Mona.Aldossary2@jhah.com"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Dr. Wadha and Ms. Malak!", notes: "Only UK, American, Canadian, Australian and Ireland CSCST" },
  { name: "King Abdulaziz University",          city: "Jeddah",  country: "KSA", primary_recruiter_email: "Hos.hr@kau.edu.sa", cc_emails: [], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Mr. Salih!" },
  { name: "King Abdullah bin Abdulaziz Univ Hospital", city: "Riyadh", country: "KSA", primary_recruiter_email: "amalzahrani@kaauh.edu.sa", cc_emails: ["moaljaber@kaauh.edu.sa","Hialotaibi@kaauh.edu.sa","a7mad.moh1@gmail.com"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Mr. Ahmad and team!" },
  { name: "King Saud Medical City",             city: "Riyadh",  country: "KSA", primary_recruiter_email: "a.alabdulwahab@ksmc.med.sa", cc_emails: ["b.basayf@ksmc.med.sa","abajahzar@ksmc.med.sa"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Abrar and team!" },
  { name: "Fakeeh Care Group",                  city: "Jeddah",  country: "KSA", primary_recruiter_email: "dmjarwali@fakeeh.care", cc_emails: ["gmmujally@fakeeh.care","fmqurunfulah@fakeeh.care","amalhasani@fakeeh.care","tnaser@fakeeh.care","saeskandarani@fakeeh.care","Hkalshadwi@fakeeh.care"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Team!" },
  { name: "Dr. Salah Alfaqih",                  city: "Riyadh",  country: "KSA", primary_recruiter_email: "srelfaqih@dallahhealth.com", cc_emails: [], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Dr. Salah!" },
  { name: "Sulaiman Al Habib Riyadh",           city: "Riyadh",  country: "KSA", primary_recruiter_email: "Joffrey.Galvan@drsulaimanalhabib.com", cc_emails: ["jayrom.alarcio@drsulaimanalhabib.com","Atta.Rehman@drsulaimanalhabib.com","Asma.Abdullah@drsulaimanalhabib.com","faisal.almuhayd@drsulaimanalhabib.com","Naif.AL-OTAIBI@drsulaimanalhabib.com"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Joffrey!" },
  { name: "Sulaiman Al Habib Jeddah",           city: "Jeddah",  country: "KSA", primary_recruiter_email: "Atta.Rehman@drsulaimanalhabib.com", cc_emails: ["Hawaa.JangiKhan@drsulaimanalhabib.com","Abdullah.AlTurki@drsulaimanalhabib.com","osman.sajid@drsulaimanalhabib.com","Ayman.Faiz@drsulaimanalhabib.com","Ibrahim.Al-Muhaimeed@drsulaimanalhabib.com"], owner_email: OWNERS.sohaila, active: true, greeting: "Hello Atta!", notes: "Arabic speakers only" },
];

const KSA_ISHAK: HospitalOverlay[] = [
  { name: "Almoosa Hospital",                   city: "Al Ahsa", country: "KSA", primary_recruiter_email: "recruitment@almoosahealth.com.sa", cc_emails: [], owner_email: OWNERS.ishak, active: true, greeting: "Hello Mr. Mohamed!" },
  { name: "King Fahad Medical City",            city: "Riyadh",  country: "KSA", primary_recruiter_email: "rherrero@kfmc.med.sa", cc_emails: ["epadrigan@kfmc.med.sa","aaldaidani@kfmc.med.sa","amalsultan@kfmc.med.sa","hamalshehri@kfmc.med.sa"], owner_email: OWNERS.ishak, active: false, greeting: "Hello Team!", notes: "Don't send now" },
  { name: "King Khaled Eye Specialist",         city: "Riyadh",  country: "KSA", primary_recruiter_email: "gsesma@kkesh.med.sa", cc_emails: ["maws@kkesh.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello Dr. Gorka and Mr. Mohammed!", specialty_only: ["Ophthalmology"] },
  { name: "MNGHA Jeddah",                       city: "Jeddah",  country: "KSA", primary_recruiter_email: "Medrecjed@mngha.med.sa", cc_emails: ["ALSAYEDLA@mngha.med.sa","BOJANRM@mngha.med.sa","Homoudiwe@mngha.med.sa","Allehebisa@mngha.med.sa","Fakhriam@mngha.med.sa","alghamdien@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA team!" },
  { name: "MNGHA Riyadh",                       city: "Riyadh",  country: "KSA", primary_recruiter_email: "Jobs_medrec@MNGHA.MED.SA", cc_emails: ["AbdulkarimMo@mngha.med.sa","ALSUHEELNO@mngha.med.sa","ababtainma@mngha.med.sa","AloleatN@mngha.med.sa","ALTAYYARLA@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA team!" },
  { name: "MNGHA Qassim",                       city: "Qassim",  country: "KSA", primary_recruiter_email: "ALMUTAIRIAN2@mngha.med.sa", cc_emails: ["HUSSAINNO2@mngha.med.sa","alquhaidanfo@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA team!" },
  { name: "MNGHA Taif",                         city: "Taif",    country: "KSA", primary_recruiter_email: "MedRec_Taif@mngha.med.sa", cc_emails: ["ALSALMISH1@mngha.med.sa","AlraddadiBa@mngha.med.sa","ALTHBITIMU@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA team!" },
  { name: "MNGHA Al Ahsa",                      city: "Al Ahsa", country: "KSA", primary_recruiter_email: "MedRecH@mngha.med.sa", cc_emails: ["ShekhmubarakA@mngha.med.sa","alshihailno@mngha.med.sa","ALMANSOURDE@mngha.med.sa","ALSHAMMERIMA@mngha.med.sa","ALAFALIQNO1@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA team!" },
  { name: "MNGHA Madinah",                      city: "Madinah", country: "KSA", primary_recruiter_email: "MedRecMadinah@mngha.med.sa", cc_emails: ["AlobairyAb@mngha.med.sa","AlahmadiAl@mngha.med.sa","ShaikaTi@mngha.med.sa","aljawifa@mngha.med.sa","ALJOHANIGH3@mngha.med.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello MNGHA Madinah team!" },
  { name: "King's College Hospital Jeddah",     city: "Jeddah",  country: "KSA", primary_recruiter_email: "Khloud.Almaslamani@kch.sa", cc_emails: ["Emad.Sagr@kch.sa","rizwan.hamid@kch.sa","dalia.noureldin@kch.sa"], owner_email: OWNERS.ishak, active: true, greeting: "Hello Team!" },
  { name: "Saudi German Hospital",              city: "Jeddah",  country: "KSA", primary_recruiter_email: "RASayed@sghgroup.net", cc_emails: ["AGammal@sghgroup.net","Hr1.asr@sghgroup.net"], owner_email: OWNERS.ishak, active: true, greeting: "Hello Ms. Rania!" },
  { name: "Al Rajhi Medicine",                  city: "Riyadh",  country: "KSA", primary_recruiter_email: "Joumana.safawi@alrahimedicine.com", cc_emails: ["Abdulkarim.AlMubarak@alrajhimedicine.com"], owner_email: OWNERS.ishak, active: true, greeting: "Hello Joumana!", notes: "Only American & Canadian Board; Arabian or Western" },
];

const QATAR: HospitalOverlay[] = [
  { name: "Apex Health The View",               city: "Doha",    country: "Qatar", primary_recruiter_email: "physician@apexhealth-intl.com", cc_emails: ["g.gul@apexhealth-intl.com","s.valios@apexhealth-intl.com","a.chakra@apexhealth-intl.com","n.jourbania@eleganciagroup.com","u.waheed@eleganciagroup.com","s.mago@apexhealth-intl.com"], owner_email: null, active: true, greeting: "Hello Team!" },
  { name: "Alfardan Medical",                   city: "Doha",    country: "Qatar", primary_recruiter_email: "hramnm@amnm.com", cc_emails: ["anevin@amnm.com"], owner_email: null, active: true, greeting: "Hello Ms. Anjaly!" },
  { name: "Alahli Hospital",                    city: "Doha",    country: "Qatar", primary_recruiter_email: "aboodj@ahlihospital.com", cc_emails: [], owner_email: null, active: false, greeting: "Hello Dr. Jamal!", notes: "Only send if Hazem advises" },
  { name: "Primary Health Care Corporation",    city: "Doha",    country: "Qatar", primary_recruiter_email: "iamira@phcc.gov.qa", cc_emails: ["Malhakim@phcc.gov.qa","Aalrahbi@phcc.gov.qa"], owner_email: null, active: false, greeting: "Hello Team!", notes: "Don't send to them" },
  { name: "Aman Hospital",                      city: "Doha",    country: "Qatar", primary_recruiter_email: "Ceo@amanhospital.org", cc_emails: [], owner_email: null, active: false, greeting: "Hello Dr. Rola!", notes: "Only send if Hazem advises" },
  { name: "Sidra Medicine",                     city: "Doha",    country: "Qatar", primary_recruiter_email: "ujaved@sidra.org", cc_emails: ["akennedy@sidra.org","dkenny@sidra.org"], owner_email: null, active: false, greeting: "Hello Mr. Unaib!", notes: "Only send if Hazem advises" },
  { name: "Hamad Corporate",                    city: "Doha",    country: "Qatar", primary_recruiter_email: "AIslamoglu@hamad.qa", cc_emails: ["SMohamed52@hamad.qa","SSanal@hamad.qa","IERrecruitment@hamad.qa","Mbellakoud1@hamad.qa","Engagement@hamad.qa","Ralyafei@hamad.qa","BMohammed4@hamad.qa","Hkhan5@hamad.qa","ANisha@hamad.qa","adminrecruitment@hamad.qa"], owner_email: null, active: false, greeting: "Hello Team!", notes: "Don't send for now (Jan 06, 2026)" },
  { name: "Naufar",                             city: "Doha",    country: "Qatar", primary_recruiter_email: "shadaf.haider@naufar.com", cc_emails: [], owner_email: null, active: true, greeting: "Hello Mr. Shadaf!", specialty_only: ["Psychiatry"] },
];

export const HOSPITAL_OVERLAY: HospitalOverlay[] = [
  ...DUBAI, ...ABU_DHABI, ...SHARJAH_RAK, ...MENTAL_HEALTH, ...DENTAL,
  ...KSA_SOHAILA, ...KSA_ISHAK, ...QATAR,
];

/** Loose name match — strips spaces, punctuation, the / hospital / etc. so
 *  small variations between Saif's master list and Zoho's Account_Name still
 *  match the right overlay row. Also normalises "speciality" → "specialty"
 *  and drops "dr"/"drs" prefixes so Zoho's "Drs. Nicolas & Asp Centers"
 *  matches the overlay's "Nicolas & Asp". */
export function normaliseHospitalName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\bdrs?\b\.?/g, "")            // strip "Dr" / "Drs" prefix
    .replace(/\bthe\b/g, "")
    .replace(/\bhospital\b/g, "")
    .replace(/\bclinic\b/g, "")
    .replace(/\bcenters?\b/g, "")
    .replace(/\bgroup\b/g, "")
    .replace(/speciality/g, "specialty")    // British → American spelling
    .replace(/paediatric/g, "pediatric")
    .replace(/[^a-z0-9]+/g, "");
}

export function findOverlayMatch(zohoName: string): HospitalOverlay | null {
  const target = normaliseHospitalName(zohoName);
  if (!target) return null;
  return HOSPITAL_OVERLAY.find(o => normaliseHospitalName(o.name) === target) ?? null;
}

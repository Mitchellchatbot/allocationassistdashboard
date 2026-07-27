/**
 * Parsed "UAE / Saudi / Qatar Hospital List" — the colour-coded send-state sheet
 * the recruitment team maintains (blue/yellow/magenta title = SEND, red /
 * "STOP" / "Don't send" / "email delivery issue" / "only if advised" = HOLD).
 *
 * Used by the Hospitals → "Import send-list" review tool to seed each hospital's
 * send state (active), specialty rules (specialty_only / specialty_skip), CC
 * list, and greeting — matched against existing hospitals by name, applied only
 * after the team reviews the diff. Re-run whenever the sheet changes.
 *
 * NOTE ON FIDELITY: for hospitals with very large TO/CC lists (Mediclinic,
 * MNGHA, Cleveland Clinic, JHAH…) only the primary addresses are captured here;
 * `note` flags "…+ more (see sheet)" so the team adds the rest in-app. HOLD is
 * assigned to anything the sheet marks stop/don't-send OR "only if advised"
 * (those shouldn't ride an automated blast — toggle on when advised).
 */
export type SendState = "send" | "hold";

export interface SendListEntry {
  name:    string;
  country: "UAE" | "Saudi Arabia" | "Qatar";
  city:    string;
  state:   SendState;
  to:      string[];
  cc:      string[];
  greet:   string;        // contact person for the greeting ("Ms. Annette")
  only:    string[];      // specialty_only  — send ONLY for these
  skip:    string[];      // specialty_skip  — never send these
  note:    string;
}

export const HOSPITAL_SENDLIST: SendListEntry[] = [
  // ───────────── DUBAI (UAE) ─────────────
  { name: "Latifa Hospital", country: "UAE", city: "Dubai", state: "send", to: ["fgmirza@dubaihealth.ae"], cc: [], greet: "Dr. Fadi", only: ["OBGYN"], skip: [], note: "Only for OBGYN specialty" },
  { name: "Al Jalila Children's Hospital", country: "UAE", city: "Dubai", state: "send", to: ["Annette.Anthony@dubaihealth.ae"], cc: ["Faaalessa@dubaihealth.ae", "annette.anthony@ajch.ae"], greet: "Ms. Annette", only: ["Pediatrics"], skip: [], note: "Only for Pediatrics related" },
  { name: "Hamdan Bin Rashid Cancer Hospital", country: "UAE", city: "Dubai", state: "send", to: ["int_smaladwala@dahc.ae"], cc: [], greet: "Mr. Shams Maladwala", only: [], skip: [], note: "" },
  { name: "Dubai Health Authority", country: "UAE", city: "Dubai", state: "send", to: ["kyAlAnsari@dubaihealth.ae"], cc: [], greet: "Mrs. Khawla", only: [], skip: [], note: "" },
  { name: "Saudi German Hospital Dubai", country: "UAE", city: "Dubai", state: "send", to: ["sarumugam@saudigerman.com"], cc: ["mnawaz@saudigerman.com", "ZZaben@saudigerman.com"], greet: "Ms. Sindu", only: [], skip: [], note: "" },
  { name: "Kings College Hospital", country: "UAE", city: "Dubai", state: "send", to: ["hari.das@kch.ae"], cc: [], greet: "Mr. Hari", only: [], skip: [], note: "Needs specific salary expectation; only 2 profiles" },
  { name: "Emirates Specialty Hospital DHCC", country: "UAE", city: "Dubai", state: "hold", to: ["Marina.mhanna@emirateshospital.ae"], cc: [], greet: "Ms. Marina", only: [], skip: [], note: "STOP sending as per Rodaina 18MAY26" },
  { name: "Medicentres", country: "UAE", city: "Dubai", state: "hold", to: ["razane.karameh@medicentres.ae"], cc: [], greet: "Ms. Razane", only: [], skip: [], note: "STOP SENDING 09/07" },
  { name: "Rashid Hospital", country: "UAE", city: "Dubai", state: "send", to: ["NadiaDabbagh@gmail.com"], cc: [], greet: "Ms. Nadia", only: [], skip: [], note: "" },
  { name: "International Modern Hospital", country: "UAE", city: "Dubai", state: "send", to: ["pauline.m@imh.ae", "jennifer.s@imh.ae"], cc: [], greet: "Ms. Jennifer", only: [], skip: [], note: "" },
  { name: "HealthBay", country: "UAE", city: "Dubai", state: "send", to: ["hana.a@wahahealth.com"], cc: ["dr.maham@healthbayclinic.com", "sreelakshmi@healthbayclinic.com"], greet: "Ms. Hana and the team", only: [], skip: [], note: "Individual email - with salary expectation; only CC Mohamed" },
  { name: "NMC Hospital Dubai & Sharjah", country: "UAE", city: "Dubai", state: "send", to: ["alan.hooban@nmc.ae", "Rashmi.bastola@nmc.ae"], cc: ["pauline.madriaga@nmc.ae", "sreeprakash.j@nmc.ae", "aswathy.ajith@nmc.ae"], greet: "Team", only: [], skip: [], note: "Individual & with salary expectation; handling Dubai & Sharjah" },
  { name: "Emirates Group", country: "UAE", city: "Dubai", state: "hold", to: ["omar.alfaki@emirateshospital.ae"], cc: [], greet: "Mr. Omar", only: [], skip: [], note: "STOP sending as per Rodaina 18MAY26" },
  { name: "Ardens Medical Center DXB", country: "UAE", city: "Dubai", state: "send", to: ["J.Issa@ardensmc.ae", "R.cayubit@ardensmc.ae"], cc: [], greet: "Ms. Jasmin", only: ["Psychologist", "Psychiatrist", "GP", "OT", "Social worker"], skip: [], note: "" },
  { name: "Zulekha Hospital", country: "UAE", city: "Dubai", state: "send", to: ["kchettigari@zulekhahospitals.com"], cc: [], greet: "Mr. Kiran", only: [], skip: [], note: "" },
  { name: "Mirdif Hospital", country: "UAE", city: "Dubai", state: "send", to: ["sandra.steephan@hmsco.ae"], cc: ["mmoawad@hmsco.ae"], greet: "Ms. Sandra", only: [], skip: [], note: "With salary expectation" },
  { name: "Prime Hospital", country: "UAE", city: "Dubai", state: "send", to: ["mirza@primehealth.ae"], cc: [], greet: "Mr. Majeed", only: [], skip: [], note: "" },
  { name: "Fakeeh University Hospital", country: "UAE", city: "Dubai", state: "send", to: ["vipatil@fakeeh.care", "smcampul@fakeeh.care"], cc: [], greet: "Ms. Viji", only: [], skip: [], note: "" },
  { name: "Mediclinic Hospital", country: "UAE", city: "Dubai", state: "send", to: ["Ana.Peliteiro@mediclinic.ae", "weam.awwad@mediclinic.ae", "David.Jelley@mediclinic.ae", "Nitya.Pillai@mediclinic.ae"], cc: [], greet: "Mediclinic team", only: [], skip: [], note: "Separate Email; ~17 contacts + more (see sheet); Albert.Oliver only if advised (Tier 1)" },
  { name: "American Hospital", country: "UAE", city: "Dubai", state: "send", to: ["asallam@ahdubai.com", "joquendo@ahdubai.com"], cc: ["rhaddad@ahdubai.com", "balawadhi@ahdubai.com"], greet: "Mr. Sallam and Ms. Jessamine", only: [], skip: [], note: "Separate Email" },
  { name: "Clemenceau Hospital", country: "UAE", city: "Dubai", state: "send", to: ["Diana.Dsa@cmcdubai.ae"], cc: ["houda.bensaid@cmcdubai.ae", "Jad.Chokr@cmcdubai.ae", "camille.olaes@cmcdubai.ae", "edgar.chedrawy@cmcdubai.ae"], greet: "Ms. Diana", only: [], skip: [], note: "" },
  { name: "Dubai London Clinic", country: "UAE", city: "Dubai", state: "hold", to: ["gnayar@dubailondonclinic.ae"], cc: [], greet: "Mr. Gaurav", only: [], skip: [], note: "Marked red (don't send)" },
  { name: "Al Garhoud Hospital", country: "UAE", city: "Dubai", state: "send", to: ["reema@sdinvest.ae"], cc: ["mmoawad@hmsco.ae", "danup@hmsco.ae"], greet: "Ms. Reema and Ms. Divya", only: [], skip: [], note: "With salary expectation; only CC Rodaina" },
  { name: "Fakih IVF Fertility Center", country: "UAE", city: "Dubai", state: "send", to: ["glen.olivera@fakihivf.com", "michael.fakih@emirateshospital.ae"], cc: [], greet: "Dr. Michael", only: ["IVF", "Fertility", "OBGYN"], skip: [], note: "" },
  { name: "DHA GOV Hospitals", country: "UAE", city: "Dubai", state: "send", to: ["amalmutawa@dha.gov.ae", "Hmalismaily@dha.gov.ae", "ahalsuwaidi@dha.gov.ae", "hrrecruitment@dha.gov.ae", "EMMAALi@dha.gov.ae", "kyalansari@dha.gov.ae", "FIHAbdulla@dha.gov.ae", "mariano.gonzalez@dahc.ae"], cc: [], greet: "DHA team", only: [], skip: [], note: "" },
  { name: "Dubai Health", country: "UAE", city: "Dubai", state: "send", to: ["ahAlGashaish@dubaihealth.ae", "aysha.alsharhan@dubaihealth.ae", "faaikhaja@dubaihealth.ae", "int_smaladwala@dha.gov.ae"], cc: [], greet: "Team", only: [], skip: [], note: "" },
  { name: "Gargash Hospital", country: "UAE", city: "Dubai", state: "send", to: ["muhammadkhan@gargashhospital.com", "jithikajayan@gargashhospital.com", "wasimakhtar@gargashhospital.com"], cc: [], greet: "Mr. Muhammad and the team", only: [], skip: ["Nephrologist", "Ophthalmologist"], note: "" },
  { name: "Novomed Centers", country: "UAE", city: "Dubai", state: "send", to: ["laarni.gaviola@novomed.com", "silvia.botha@novomed.com", "drmax@novomed.com"], cc: [], greet: "Ms. Silvia / Team", only: [], skip: [], note: "" },
  { name: "Medcare Hospital", country: "UAE", city: "Dubai", state: "send", to: ["likhitha.kotian@medcarehospital.com"], cc: ["vidhya.venugopal@medcarehospital.com"], greet: "Ms. Likhitha", only: [], skip: [], note: "Separate Email" },
  { name: "Metabolic Health", country: "UAE", city: "Dubai", state: "send", to: ["agnes@metabolic.health"], cc: ["james@metabolic.health"], greet: "Ms. Agnes", only: ["Endocrinologist"], skip: [], note: "With salary expectation" },
  { name: "Moorfields Eye Hospital", country: "UAE", city: "Dubai", state: "send", to: ["jacqueline.rodrigues@moorfields.ae"], cc: [], greet: "Ms. Jacqueline", only: ["Ophthalmologist"], skip: [], note: "" },
  { name: "Al Zahra Hospital", country: "UAE", city: "Dubai", state: "send", to: ["ali.emad@azhd.ae"], cc: [], greet: "Mr. Ali", only: [], skip: [], note: "suchitra.s@azhd.ae separate email (Ms. Suchitra)" },
  { name: "Jumeirah American Clinic / Blue Ocean Health Group", country: "UAE", city: "Dubai", state: "send", to: ["michael.fakih@emirateshospital.ae", "ledio.zeneli@jac.ae"], cc: [], greet: "Dr. Fakih / Mr. Ledio", only: [], skip: [], note: "" },
  { name: "Burjeel Hospital Dubai", country: "UAE", city: "Dubai", state: "send", to: ["neda.lotfi@burjeel.com"], cc: [], greet: "Ms. Neda", only: [], skip: [], note: "" },
  { name: "Sulaiman Al Habib", country: "UAE", city: "Dubai", state: "hold", to: ["rania.tawalbeh@drsulaimanalhabib.com"], cc: ["DAVID.EDDINE@drsulaimanalhabib.com", "mdadil@drsulaimanalhabib.com"], greet: "Mrs. Rania", only: [], skip: [], note: "Not advised to send profiles" },
  { name: "CosmeSurge Hospital", country: "UAE", city: "Dubai", state: "send", to: ["siraj.khan@cosmesurge.com"], cc: [], greet: "Mr. Siraj", only: [], skip: [], note: "" },
  { name: "Quironsalud Speciality Hospital", country: "UAE", city: "Dubai", state: "send", to: ["hr@quironsalud.ae"], cc: [], greet: "Dr. Kathleen", only: [], skip: [], note: "For Spanish doctors" },
  { name: "Canadian Specialist Hospital", country: "UAE", city: "Dubai", state: "hold", to: ["m.d@csh.ae"], cc: [], greet: "Dr. Mohanad", only: [], skip: [], note: "Marked red; HR m.villegas@csh.ae confirm with Ammar" },
  { name: "Nicolas & Asp", country: "UAE", city: "Dubai", state: "hold", to: ["windy.bugarin@nicolasasp.ae"], cc: [], greet: "Ms. Windy", only: [], skip: [], note: "Dental hospital; marked red" },

  // ───────────── ABU DHABI / AL AIN (UAE) ─────────────
  { name: "Tawam Hospital", country: "UAE", city: "Al Ain", state: "hold", to: ["rajashekar.yerra@purehealth.ae", "tvarghese@seha.ae"], cc: ["o-arsaleem@seha.ae", "o-pdiwa@seha.ae", "o-shathaa@seha.ae"], greet: "Ms. Shatha / team", only: [], skip: [], note: "Don't send for now (Ammar 20NOV25)" },
  { name: "SEHA", country: "UAE", city: "Abu Dhabi", state: "send", to: ["o-sespra@seha.ae", "sedassery@seha.ae"], cc: [], greet: "Ms. Salome and Mr. Sekkeeb", only: [], skip: [], note: "Separate Email; only upon request" },
  { name: "Sheikh Khalifa Medical City Abu Dhabi", country: "UAE", city: "Abu Dhabi", state: "hold", to: ["abakaraiba@seha.ae", "cristaldim@seha.ae"], cc: [], greet: "Ms. Asma", only: [], skip: [], note: "Marked red; only Ms. Asma per Ammar" },
  { name: "Abu Dhabi Stem Cells Center", country: "UAE", city: "Abu Dhabi", state: "send", to: ["uzma.z@adscc.ae"], cc: [], greet: "Ms. Uzma", only: [], skip: [], note: "" },
  { name: "Harley Street Medical", country: "UAE", city: "Abu Dhabi", state: "send", to: ["ceooffice@hsmc.ae", "hady.jerdak@hsmc.ae", "ali.rabah@hsmc.ae"], cc: [], greet: "Dr. Hady", only: [], skip: [], note: "" },
  { name: "Royal Health Group", country: "UAE", city: "Abu Dhabi", state: "hold", to: ["muhammad.daniall@rhg.ae", "kristene.cm@rhg.ae"], cc: [], greet: "Mr. Muhammad", only: [], skip: [], note: "DON'T SEND for now (Emilie 25AUG25)" },
  { name: "Royal Health Group - Al Ain", country: "UAE", city: "Al Ain", state: "hold", to: ["Mohammed.rashid@crh.ae"], cc: [], greet: "Mr. Mohammed Rashid", only: [], skip: [], note: "DON'T SEND for now (Emilie 25AUG25)" },
  { name: "Mubadala", country: "UAE", city: "Abu Dhabi", state: "send", to: ["rpopatia@mubadalahealth.ae"], cc: [], greet: "Dr. Rizwana", only: [], skip: [], note: "ONLY send to Rizwana (Rodaina 10NOV25)" },
  { name: "Zayed Military Hospital", country: "UAE", city: "Abu Dhabi", state: "hold", to: ["fatima.mayao@gmshm.ae"], cc: ["vijai.elugubanti@gmshm.ae", "mohamed.othman@gmshm.ae", "angel.dinapo@gmshm.ae"], greet: "Ms. Fatima", only: [], skip: [], note: "DON'T SEND (hospital request 08JUN26)" },
  { name: "Bascom Palmer August Medical Eye Institute", country: "UAE", city: "Abu Dhabi", state: "send", to: ["G.Roos@bascompalmereyeinstitute.com", "K.Mascarenhas@bascompalmereyeinstitute.com"], cc: [], greet: "Mr. George", only: ["Ophthalmologist"], skip: [], note: "" },
  { name: "Ambulatory Services", country: "UAE", city: "Abu Dhabi", state: "send", to: ["geroos@seha.ae"], cc: [], greet: "Mr. George", only: [], skip: [], note: "" },
  { name: "Burjeel Medical City", country: "UAE", city: "Abu Dhabi", state: "send", to: ["hanah.penuliar@burjeelmedicalcity.com", "ibrahim.abugheida@burjeelmedicalcity.com"], cc: ["Sonia.Kattampally@burjeelmedicalcity.com"], greet: "Team", only: [], skip: [], note: "philip.shabo CC only if Oncology" },
  { name: "Burjeel Abu Dhabi and Al Ain", country: "UAE", city: "Abu Dhabi", state: "send", to: ["linda.m@burjeel.com"], cc: ["aysha.almahri@burjeelholdings.com", "Sonia.Kattampally@burjeelmedicalcity.com"], greet: "Ms. Linda", only: [], skip: [], note: "" },
  { name: "Burjeel Abu Dhabi", country: "UAE", city: "Abu Dhabi", state: "send", to: ["Balachander.gnanasundaram@burjeelholdings.com"], cc: ["Sonia.Kattampally@burjeelmedicalcity.com"], greet: "Mr. Bala", only: [], skip: [], note: "" },
  { name: "Reem Hospital", country: "UAE", city: "Abu Dhabi", state: "send", to: ["Khalid.hamid@reemhospital.ae"], cc: ["sanjana.dmello@reemhospital.ae"], greet: "Mr. Khalid", only: [], skip: [], note: "" },
  { name: "Sheikh Shakhbout Medical City", country: "UAE", city: "Abu Dhabi", state: "send", to: ["ssmcrecruitment@gmail.com"], cc: ["ndalawar@ssmc.ae", "sshafeel@ssmc.ae", "sjesus@ssmc.ae"], greet: "Mr. Abdulkarim and the team", only: [], skip: [], note: "Everyday email; aajam@ssmc.ae only if advised" },
  { name: "Tarmeem Hospital", country: "UAE", city: "Abu Dhabi", state: "send", to: ["roger.feghali@tarmeem.com"], cc: ["muhammed.koya@tarmeem.com", "baqir.abrar@tarmeem.com"], greet: "Mr. Roger", only: ["Orthopedics"], skip: [], note: "Abu Dhabi & Al Ain" },
  { name: "Cleveland Clinic", country: "UAE", city: "Abu Dhabi", state: "hold", to: ["AlvaraB@clevelandclinicabudhabi.ae", "nabeel@clevelandclinic.ae"], cc: [], greet: "Team", only: [], skip: [], note: "Marked red; many contacts (see sheet)" },
  { name: "Capital Health", country: "UAE", city: "Abu Dhabi", state: "send", to: ["skhan@capital-health.ae", "amahmoudi@capital-health.ae"], cc: [], greet: "Mr. Atef", only: [], skip: [], note: "Also gretchen@capital-health.ae / gorme@capital-health.ae (Ms. Gretchen)" },
  { name: "SEHA 2", country: "UAE", city: "Abu Dhabi", state: "send", to: ["fhumaid@seha.ae", "tvarghese@seha.ae", "abakaraiba@seha.ae"], cc: [], greet: "Team", only: [], skip: [], note: "Multiple sub-locations (Al Ain: rdisanayka, o-hmadam)" },
  { name: "Al Dhafra (SEHA)", country: "UAE", city: "Al Dhafra", state: "send", to: ["o-mitadros@seha.ae"], cc: [], greet: "Mr. Michael", only: [], skip: [], note: "" },
  { name: "Sheikh Khalifa Hospital Fujairah", country: "UAE", city: "Fujairah", state: "send", to: ["GPreetham@skhf.ae"], cc: ["mfabdulaziz@skhf.ae"], greet: "Mr. Garry", only: [], skip: [], note: "Separate Email; only first 2 profiles + profiles requested" },
  { name: "Mediclinic Airport Road Hospital", country: "UAE", city: "Abu Dhabi", state: "send", to: ["Rami.AlSaman@mediclinic.ae"], cc: ["Mohamed.Hany@mediclinic.ae", "Jing.Guadalquiver@Mediclinic.ae", "Shaaban.Fahmy@mediclinic.ae"], greet: "Mr. Rami", only: [], skip: [], note: "DOH" },
  { name: "Mediclinic Al Jowhara Hospital", country: "UAE", city: "Al Ain", state: "send", to: ["Philip.Tyler@mediclinic.ae"], cc: [], greet: "Mr. Philip", only: [], skip: [], note: "DOH" },
  { name: "NMC Hospital AUH", country: "UAE", city: "Abu Dhabi", state: "send", to: ["simranjeet.sethi@nmc.ae", "selby.jameson@nmc.ae"], cc: ["suresh.mathews@nmc.ae"], greet: "Ms. Simran & Mr. Selby", only: [], skip: [], note: "With salary expectation" },
  { name: "Institute of Healthier Living", country: "UAE", city: "Abu Dhabi", state: "send", to: ["b.dumont@ihlad.ae"], cc: [], greet: "Team", only: ["Family Medicine", "Internal Medicine"], skip: [], note: "" },

  // ───────────── SHARJAH / RAK (UAE) ─────────────
  { name: "Sharjah University Hospital", country: "UAE", city: "Sharjah", state: "send", to: ["Aicha.Seck@uhs.ae", "Mudassra.syeda@uhs.ae", "aisha.alali@uhs.ae"], cc: ["Ghadeer.Qambar@uhs.ae"], greet: "Team", only: [], skip: [], note: "" },
  { name: "NMC Sharjah", country: "UAE", city: "Sharjah", state: "send", to: ["pauline.madriaga@nmc.ae"], cc: [], greet: "Ms. Pauline", only: [], skip: [], note: "Separate Email; Nabeel.ahmed@nmc.ae separate (Rodaina 20APR26)" },
  { name: "Al Sharq Hospital", country: "UAE", city: "Sharjah", state: "send", to: ["admin3.shf@fng.ae"], cc: ["mahmoud.elrefaey@fng.ae", "cmo.shf@fng.ae", "ceo_office.shf@fng.ae"], greet: "Dr. Feroz / team", only: [], skip: [], note: "CC Rodaina only" },
  { name: "RAK Hospital", country: "UAE", city: "Ras Al Khaimah", state: "send", to: ["Recruitment.HR@rakhospital.com"], cc: ["parjit.b@rakhospital.com", "musaveer.s@rakhospital.com"], greet: "Ms. Viji", only: [], skip: [], note: "" },
  { name: "Sheikh Khalifa Hospital RAK", country: "UAE", city: "Ras Al Khaimah", state: "hold", to: ["hind.alshehhi@sksh.ae"], cc: [], greet: "Team", only: [], skip: [], note: "Marked red" },

  // ───────────── MENTAL HEALTH (UAE) ─────────────
  { name: "Maudsley Health AUH", country: "UAE", city: "Abu Dhabi", state: "send", to: ["ishita.rathi@maudsleyhealth.com"], cc: [], greet: "Ms. Ishita", only: ["Psychologist", "Psychiatrist"], skip: [], note: "" },
  { name: "Al Kalma Health AUH", country: "UAE", city: "Abu Dhabi", state: "send", to: ["careers@alkalmahealth.com"], cc: [], greet: "Ms. Zhamira and the team", only: ["Psychologist", "Psychiatrist"], skip: [], note: "" },
  { name: "The Valens Clinic DXB", country: "UAE", city: "Dubai", state: "send", to: ["ssiddiqui@thevalensclinic.ae"], cc: [], greet: "Ms. Sarah", only: ["Psychiatrist"], skip: [], note: "Psychiatrists only" },
  { name: "Al Amal Psychiatric Hospital DXB", country: "UAE", city: "Dubai", state: "send", to: ["doctor.adel.karrani@gmail.com"], cc: [], greet: "Dr. Adel Karrani", only: ["Psychiatrist"], skip: [], note: "Individually: Albanna.Md@gmail.com (Dr. Ammar)" },
  { name: "American Center for Psychiatry and Neurology DXB", country: "UAE", city: "Dubai", state: "send", to: ["m.farhan@ashealth.ae"], cc: ["m.othman@americancenteruae.com", "a.sajjad@ashealth.ae", "k.aboushaar@americancenteruae.com"], greet: "Dr. Farhan and the team", only: ["Psychiatrist", "Neurology"], skip: [], note: "" },
  { name: "Priory Wellbeing Centre Dubai", country: "UAE", city: "Dubai", state: "send", to: ["FaridaMukhtorova@aspris.ae"], cc: ["WillGoodwin@priorygroup.com"], greet: "Ms. Farida", only: ["Psychologist", "Psychiatrist"], skip: [], note: "" },
  { name: "The LightHouse Arabia DXB", country: "UAE", city: "Dubai", state: "send", to: ["ssiddiqui@lighthousearabia.com"], cc: ["careers@lighthousearabia.com"], greet: "Ms. Krizalei", only: ["Psychologist", "Psychiatrist"], skip: [], note: "" },

  // ───────────── SAUDI ARABIA ─────────────
  { name: "King Faisal Specialist Hospital", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["physicians_recruitment@kfshrc.edu.sa", "mhhafez@kfshrc.edu.sa", "mhalmutairi@kfshrc.edu.sa", "oshalabi@kfshrc.edu.sa"], cc: [], greet: "Team", only: [], skip: ["Anesthesia"], note: "Only UK CCT/CESR/American/Canadian/Australian, except Anesthesia; many contacts (see sheet)" },
  { name: "National Medical Care Riyadh", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["amualotaibi@care.med.sa", "aqeel.hr@hotmail.com"], cc: [], greet: "Ms. Abeer", only: [], skip: [], note: "" },
  { name: "Myclinic", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["nasser.althrwy@myclinic.com.sa", "fisal.alharthy@myclinic.com.sa"], cc: [], greet: "Team", only: [], skip: [], note: "" },
  { name: "Dr. Samir Abbas Hospital", country: "Saudi Arabia", city: "Jeddah", state: "send", to: ["bayan.alhazmi@dsah.sa", "m.abdulsalam@dsah.sa", "r.khoja@dsah.sa"], cc: [], greet: "Team", only: [], skip: [], note: "" },
  { name: "Dallah Hospital", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["h_basodan@dallah-hospital.com", "a_alkhalaf@Dallah-Hospital.com", "srelfaqih@dallahhealth.com"], cc: [], greet: "Mr. Hisham", only: [], skip: [], note: "Separate: asmaa.alkharazi@dmf.med.sa (Ms. Asma)" },
  { name: "Mohammed Alfagih Hospital", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["Bedour.alotaibi@dmf.med.sa", "asmaa.alkharazi@dmf.med.sa"], cc: [], greet: "Ms. Bedour", only: ["ENT", "Endocrinologist", "Neurology"], skip: [], note: "Arabic only" },
  { name: "Prince Sultan Cardiac Center", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["Recruitment@pscc.med.sa", "khalid@pscc.med.sa", "aalkhushail@pscc.med.sa"], cc: [], greet: "Team", only: ["Cardiology"], skip: [], note: "" },
  { name: "Child Fertility", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["tim.child@childfertility.com"], cc: [], greet: "Team", only: ["IVF", "OBGYN"], skip: [], note: "" },
  { name: "Aramco (JHAH)", country: "Saudi Arabia", city: "Dhahran", state: "send", to: ["Malak.Alhelal@jhah.com", "Wadha.Almattar@jhah.com", "mohammed.qahtani.151@jhah.com"], cc: ["ghaya.shamsi@jhah.com", "Dalia.Basrawi@jhah.com", "Mona.Aldossary2@jhah.com"], greet: "Dr. Wadha and Ms. Malak", only: [], skip: [], note: "Only UK/American/Canadian/Australian/Ireland CSCST" },
  { name: "King Abdulaziz University", country: "Saudi Arabia", city: "Jeddah", state: "send", to: ["Hos.hr@kau.edu.sa"], cc: [], greet: "Mr. Salih", only: [], skip: [], note: "" },
  { name: "King Abdullah bin Abdulaziz University Hospital", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["amalzahrani@kaauh.edu.sa", "moaljaber@kaauh.edu.sa", "Hialotaibi@kaauh.edu.sa", "a7mad.moh1@gmail.com"], cc: [], greet: "Mr. Ahmad and team", only: [], skip: [], note: "" },
  { name: "King Saud Medical City", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["a.alabdulwahab@ksmc.med.sa", "b.basayf@ksmc.med.sa", "abajahzar@ksmc.med.sa"], cc: [], greet: "Abrar and team", only: [], skip: [], note: "" },
  { name: "Fakeeh Care Group", country: "Saudi Arabia", city: "Jeddah", state: "send", to: ["dmjarwali@fakeeh.care", "gmmujally@fakeeh.care", "amalhasani@fakeeh.care", "tnaser@fakeeh.care", "saeskandarani@fakeeh.care"], cc: [], greet: "Team", only: [], skip: [], note: "" },
  { name: "Dr. Salah Alfaqih", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["srelfaqih@dallahhealth.com"], cc: [], greet: "Dr. Salah", only: [], skip: [], note: "" },
  { name: "Suliman Alhabib Hospital Saudi", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["Joffrey.Galvan@drsulaimanalhabib.com"], cc: [], greet: "Joffrey", only: [], skip: [], note: "Many contacts (see sheet); Jeddah: Atta; HMG Qassim only if advised" },
  { name: "Almoosa Hospital", country: "Saudi Arabia", city: "Al Ahsa", state: "send", to: ["recruitment@almoosahealth.com.sa"], cc: [], greet: "Mr. Mohamed", only: [], skip: [], note: "" },
  { name: "King Khaled Eye Specialist", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["gsesma@kkesh.med.sa", "maws@kkesh.med.sa"], cc: [], greet: "Dr. Gorka and Mr. Mohammed", only: ["Ophthalmology"], skip: [], note: "" },
  { name: "King's College Hospital London Jeddah", country: "Saudi Arabia", city: "Jeddah", state: "send", to: ["Khloud.Almaslamani@kch.sa", "Emad.Sagr@kch.sa", "rizwan.hamid@kch.sa", "dalia.noureldin@kch.sa"], cc: [], greet: "Team", only: [], skip: [], note: "" },
  { name: "Saudi German Hospital Saudi", country: "Saudi Arabia", city: "Aseer", state: "send", to: ["RASayed@sghgroup.net", "AGammal@sghgroup.net", "Hr1.asr@sghgroup.net"], cc: [], greet: "Ms. Rania", only: [], skip: [], note: "" },
  { name: "Remain Medical Group", country: "Saudi Arabia", city: "Saudi Arabia", state: "send", to: ["career@ahmc.com.sa"], cc: [], greet: "Mr. Faisal", only: [], skip: [], note: "" },
  { name: "Ministry of National Guard (MNGHA)", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["Jobs_medrec@MNGHA.MED.SA", "Medrecjed@mngha.med.sa"], cc: ["BinjaddahH@mngha.med.sa", "alasbaliab@mngha.med.sa", "AbdulkarimMo@mngha.med.sa"], greet: "MNGHA team", only: [], skip: [], note: "Main emails individual; many regional (see sheet); MedRecH/alshihailno don't send" },
  { name: "Al Rajhi Medicine", country: "Saudi Arabia", city: "Saudi Arabia", state: "send", to: ["Joumana.safawi@alrahimedicine.com", "Abdulkarim.AlMubarak@alrajhimedicine.com"], cc: [], greet: "Joumana", only: [], skip: [], note: "Only American & Canadian board" },
  { name: "IMC", country: "Saudi Arabia", city: "Jeddah", state: "hold", to: ["Ceo1@imc.med.sa", "faimalki@imc.med.sa", "Rjamal@imc.med.sa"], cc: [], greet: "Team", only: [], skip: [], note: "Don't send for now" },
  { name: "King Fahad Medical City", country: "Saudi Arabia", city: "Riyadh", state: "hold", to: ["rherrero@kfmc.med.sa", "epadrigan@kfmc.med.sa", "aaldaidani@kfmc.med.sa", "amalsultan@kfmc.med.sa", "hamalshehri@kfmc.med.sa"], cc: [], greet: "Team", only: [], skip: [], note: "Don't send now" },
  { name: "Sulaiman Fakeeh Riyadh", country: "Saudi Arabia", city: "Riyadh", state: "hold", to: ["Hkalshadwi@fakeeh.care"], cc: [], greet: "Mr. Hamad", only: [], skip: [], note: "Email delivery issue" },
  { name: "King Saud bin Abdul Aziz", country: "Saudi Arabia", city: "Riyadh", state: "send", to: ["ghamdiamal@ksau-hs.edu.sa"], cc: [], greet: "Ms. Amal", only: [], skip: [], note: "" },
  { name: "Alsalama Hospital", country: "Saudi Arabia", city: "Saudi Arabia", state: "hold", to: ["Areej.alomari@alsalamahospital.com"], cc: [], greet: "Ms. Areej", only: [], skip: [], note: "Don't send - email delivery issue" },
  { name: "Almana Group", country: "Saudi Arabia", city: "Saudi Arabia", state: "hold", to: ["Tiaba.almoajel@almanahospital.sa"], cc: [], greet: "Dr. Almoajel", only: [], skip: [], note: "Don't send - email delivery issue" },
  { name: "Prince Sultan Military Hospital", country: "Saudi Arabia", city: "Riyadh", state: "hold", to: ["Raljibreen@psmmc.med.sa"], cc: [], greet: "Ms. Rathath", only: [], skip: [], note: "DON'T send any profile for now (13/05/2025)" },

  // ───────────── QATAR ─────────────
  { name: "Apex Health The View", country: "Qatar", city: "Doha", state: "send", to: ["physician@apexhealth-intl.com", "g.gul@apexhealth-intl.com", "a.chakra@apexhealth-intl.com"], cc: [], greet: "Team", only: [], skip: [], note: "QCHP in process; many contacts (see sheet)" },
  { name: "Alfardan Medical", country: "Qatar", city: "Doha", state: "send", to: ["ejogi@amanhospital.org"], cc: [], greet: "Mr. Enosh", only: [], skip: [], note: "" },
  { name: "Rayhan Medical Center", country: "Qatar", city: "Doha", state: "send", to: ["a.antony@rayhanmedical.qa"], cc: [], greet: "Ms. Anjaly", only: [], skip: [], note: "" },
  { name: "Al Ahli Hospital Doha", country: "Qatar", city: "Doha", state: "hold", to: ["belanor@ahlihospital.com", "aboodj@ahlihospital.com"], cc: [], greet: "Dr. Jamal", only: [], skip: [], note: "Only send if Sohaila advised" },
  { name: "Primary Health Care Corporation", country: "Qatar", city: "Doha", state: "hold", to: ["iamira@phcc.gov.qa", "Malhakim@phcc.gov.qa", "Aalrahbi@phcc.gov.qa"], cc: [], greet: "Team", only: [], skip: [], note: "Don't send to them" },
  { name: "Aman Hospital", country: "Qatar", city: "Doha", state: "hold", to: ["Ceo@amanhospital.org"], cc: [], greet: "Dr. Rola", only: [], skip: [], note: "Only send if Hazem advised (marked red)" },
  { name: "Sidra Medicine", country: "Qatar", city: "Doha", state: "hold", to: ["ujaved@sidra.org", "akennedy@sidra.org", "dkenny@sidra.org"], cc: [], greet: "Mr. Unaib", only: [], skip: [], note: "Only send if Hazem advised" },
  { name: "Hamad Corporate", country: "Qatar", city: "Doha", state: "hold", to: ["HBeeran@hamad.qa", "RBrouwer@hamad.qa", "JMallillin@hamad.qa"], cc: [], greet: "Team", only: [], skip: [], note: "Don't send for now (Jan 06 2026); many contacts (see sheet)" },
  { name: "Naufar", country: "Qatar", city: "Doha", state: "send", to: ["shadaf.haider@naufar.com"], cc: [], greet: "Mr. Shadaf", only: ["Psychiatry"], skip: [], note: "" },
];

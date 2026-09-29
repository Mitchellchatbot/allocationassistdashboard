import { describe, it, expect } from "vitest";
import { parseHammadCsv, doctorSlug, cleanDoctorName, cleanHospitalName, doctorKey, weekEnding } from "@/lib/parse-hammad-csv";

const HEADER = "1/1/2026,Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,";

describe("parseHammadCsv", () => {
  it("keeps a row whose specialty cell contains a newline", () => {
    const csv = [HEADER, `,Sidra,Dani Hakimeh,"Consultant Pediatrician\nand Oncologist",7/14/2026,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].doctor_specialty).toBe("Consultant Pediatrician and Oncologist");
    expect(rows[0].shortlisted_at).toBe("2026-07-14T00:00:00.000Z");
  });

  it("reads day-first dates when the month is out of range", () => {
    const csv = [HEADER, `1,AHD,Ali Khan,Cardiology,14/09/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv).rows[0].shortlisted_at).toBe("2026-09-14T00:00:00.000Z");
  });

  it("keeps the date when a note is typed beside it", () => {
    // Written in a July week, as in the real sheet — under a January header
    // "7/2" would be months ahead and read day-first.
    const csv = [HEADER.replace("1/1/2026", "7/6/2026"), `14,HMS,Kunal Babla,Neonatology,,,7/2/2026 Revise ,,,,`].join("\n");
    const row = parseHammadCsv(csv).rows[0];
    expect(row.offered_at).toBe("2026-07-02T00:00:00.000Z");
    expect(row.notes).toBe("Revise");
  });

  it("keeps a doctor-and-hospital pair that has no dates yet", () => {
    const csv = [HEADER, `3,AHD,Kaled Mohsen,Consultant ENT,,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].shortlisted_at).toBeNull();
  });

  it("ignores repeated section headers and summary rows", () => {
    const csv = [HEADER, `,,,,43,8,,,,`, "", HEADER, `1,AHD,Ali Khan,Cardiology,1/5/2026,,,,,,`].join("\n");
    const { rows, weekSections } = parseHammadCsv(csv);
    expect(weekSections).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("strips the Dr. prefix so one doctor gets one slug", () => {
    expect(doctorSlug("Dr. Anas Saleh".replace(/^\s*dr\.?\s+/i, ""))).toBe(doctorSlug("Anas Saleh"));
  });

  it("reports the line each row starts on, counting newlines inside quoted cells", () => {
    const csv = [HEADER, `,Sidra,Dani Hakimeh,"Pediatrics\nOncology",7/14/2026,,,,,,`, `,AHD,Ali Khan,Cardiology,7/15/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv).rows.map(r => r.line)).toEqual([2, 4]);
  });
});

describe("doctor names", () => {
  it("strips list numbering, Dr., invisible characters and a trailing full stop", () => {
    expect(cleanDoctorName("5. \u2060William Van Niekerk")).toBe("William Van Niekerk");
    expect(cleanDoctorName("1. Mohammad Hosain")).toBe("Mohammad Hosain");
    expect(cleanDoctorName("Dr.Hamid Bayyud")).toBe("Hamid Bayyud");
    expect(cleanDoctorName("Michael Tawadrous.")).toBe("Michael Tawadrous");
    expect(cleanDoctorName("  Mthokozisi   Dube ")).toBe("Mthokozisi Dube");
  });

  it("does not strip a name that merely starts with Dr", () => {
    expect(cleanDoctorName("Drew Carter")).toBe("Drew Carter");
  });

  it("stores the cleaned name on the parsed row", () => {
    const csv = [HEADER, `5,HMG,5. \u2060William Van Niekerk,Surgery,1/5/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv).rows[0].doctor_name).toBe("William Van Niekerk");
  });

  it("gives spelling variants of one name the same key, and different names different keys", () => {
    expect(doctorKey("Mehmet Arda Kılınç")).toBe(doctorKey("Mehmet Arda Kilinc"));
    expect(doctorKey("Fawaz Al-Hassani")).toBe(doctorKey("Fawaz Alhassani"));
    expect(doctorKey("Emre Altınkurt")).toBe(doctorKey("emre altinkurt"));
    expect(doctorKey("Ban Dawood")).not.toBe(doctorKey("May Dawood"));
  });

  it("slugs numbered and plain spellings to one id", () => {
    expect(doctorSlug("5. \u2060William Van Niekerk")).toBe("csv:william-van-niekerk");
    expect(doctorSlug("Dr William Van Niekerk")).toBe("csv:william-van-niekerk");
  });

  it("tidies spacing and invisible characters in hospital names", () => {
    expect(cleanHospitalName("  NMC   -AUH\u2060 ")).toBe("NMC -AUH");
  });
});

describe("dates read against the week they were written in", () => {
  const TODAY = { today: new Date("2026-09-22T00:00:00Z") };
  const week = (date: string, ...rows: string[]) =>
    parseHammadCsv([`${date},Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,`, ...rows].join("\n"), TODAY);

  it("reads 12/4 day-first in an April week, where 4 December would be months ahead", () => {
    const { rows, warnings } = week("4/13/2026", `,HMG,Gladys Guillaume,ENT,12/4/2026,4/13/2026,,,,,`);
    expect(rows[0].shortlisted_at).toBe("2026-04-12T00:00:00.000Z");
    expect(rows[0].interviewed_at).toBe("2026-04-13T00:00:00.000Z");
    expect(warnings.map(w => [w.kind, w.column])).toEqual([["day_first", "shortlisted_at"]]);
  });

  it("keeps an old date carried forward into a later week, but flags that day-first would fit", () => {
    const { rows, warnings } = week("9/14/2026", `,Mediclinic,Laura Irimie,Neurology,3/9/2026,,,,,,`);
    expect(rows[0].shortlisted_at).toBe("2026-03-09T00:00:00.000Z");
    expect(warnings[0].kind).toBe("maybe_day_first");
  });

  it("says nothing about an ordinary date in its own week", () => {
    const { rows, warnings } = week("5/11/2026", `,HMG Olaya,Omar Salim,Neurology,5/11/2026,5/20/2026,,,,,`);
    expect(rows[0].shortlisted_at).toBe("2026-05-11T00:00:00.000Z");
    expect(warnings).toEqual([]);
  });

  it("corrects a mistyped year when the date sits in the week", () => {
    const { rows, warnings } = week("8/17/2026", `,HMG,Mthokozisi Dube,Urology,,08/20/2028,,,,,`);
    expect(rows[0].interviewed_at).toBe("2026-08-20T00:00:00.000Z");
    expect(warnings[0].kind).toBe("year_fixed");
    expect(week("9/7/2026", `,SSMC,Omar Anwar,Rheumatology,,9/11/2006,,,,,`).rows[0].interviewed_at)
      .toBe("2026-09-11T00:00:00.000Z");
  });

  it("keeps a real date from the previous year and flags it", () => {
    const { rows, warnings } = week("1/5/2026", `,AH,Sami Habal,Cardiology,,,,,,12/21/2025,`);
    expect(rows[0].joined_at).toBe("2025-12-21T00:00:00.000Z");
    expect(warnings[0].kind).toBe("other_year");
  });

  it("never flips a start date day-first — starts are planned months ahead", () => {
    const { rows, warnings } = week("3/12/2026", `,BMC,Sarah Suliman,Cardiology,,,,,6/3/2026,,`);
    expect(rows[0].start_date).toBe("2026-06-03T00:00:00.000Z");
    expect(warnings[0].kind).toBe("maybe_day_first");
  });

  it("flags a date after today as planned", () => {
    const { rows, warnings } = week("9/14/2026", `,The View,Azhar Shabir,Surgery,,9/28/2026,,,,,`);
    expect(rows[0].interviewed_at).toBe("2026-09-28T00:00:00.000Z");
    expect(warnings[0].kind).toBe("future");
  });

  it("reads a date wrapped in its own quotes", () => {
    const { rows } = week("4/13/2026", `,AH,Wisam Muhsen,Cardiology,,,"""12/2/2025""",,,,`);
    expect(rows[0].offered_at).toBe("2025-12-02T00:00:00.000Z");
  });

  it("flags a date that does not exist instead of rolling it into the next month", () => {
    const { rows, warnings } = week("2/16/2026", `,AH,Ali Khan,Cardiology,2/31/2026,,,,,,`);
    expect(rows[0].shortlisted_at).toBeNull();
    expect(warnings[0].kind).toBe("unreadable_date");
  });
});

describe("rows that need a person before they are saved", () => {
  const TODAY = { today: new Date("2026-09-22T00:00:00Z") };

  it("reports a doctor with dates but no hospital, and skips the row", () => {
    const { rows, warnings } = parseHammadCsv([HEADER, `51,,Hicham Farhat,Cardiology,1/23/2026,,,,,,`].join("\n"), TODAY);
    expect(rows).toHaveLength(0);
    expect(warnings).toMatchObject([{ kind: "no_hospital", line: 2, doctor: "Hicham Farhat" }]);
  });

  it("reports a hospital with dates but no doctor", () => {
    const { warnings } = parseHammadCsv([HEADER, `74,HMG,,,5/7/2026,,,,,,`].join("\n"), TODAY);
    expect(warnings).toMatchObject([{ kind: "no_doctor", hospital: "HMG" }]);
  });

  it("stays quiet about blank divider rows", () => {
    expect(parseHammadCsv([HEADER, `12,,,,,,,,,,`].join("\n"), TODAY).warnings).toEqual([]);
  });

  it("keeps a join date written beside HOLD or NOT ADDED, but flags it", () => {
    const hold = parseHammadCsv([HEADER, `4,NMC-Sh,Sachin Bansod,ENT,,,,,,6/15/2026,HOLD ,HOLD `].join("\n"), TODAY);
    expect(hold.rows[0].joined_at).toBe("2026-06-15T00:00:00.000Z");
    expect(hold.warnings).toMatchObject([{ kind: "hold", column: "joined_at" }]);
    const notAdded = parseHammadCsv([HEADER, `10,SSMC,Freddy Graterol,Cardiology,,,,,7/20/2026,7/20/2026,NOT ADDED,`].join("\n"), TODAY);
    expect(notAdded.warnings.map(w => w.kind)).toContain("hold");
  });
});

describe("a date typed into the wrong column", () => {
  it("flags a date sitting past an empty Joined cell", () => {
    const csv = ["4/20/2026,Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,",
                 `7,SKMC,Luca Pianta,Consultant ENT Surgeon,,,,,3/30/2026,,4/21/2026`].join("\n");
    const { rows, warnings } = parseHammadCsv(csv, { today: new Date("2026-09-23T00:00:00Z") });
    expect(rows[0].joined_at).toBeNull();
    expect(warnings.map(w => w.kind)).toContain("date_in_notes");
  });

  it("says nothing when the Joined cell is filled", () => {
    const csv = ["6/28/2026,Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,",
                 `3,AH,Judit Konya,Family Medicine,,,,,,6/28/2026,17/07,ADDED`].join("\n");
    const { warnings } = parseHammadCsv(csv, { today: new Date("2026-09-23T00:00:00Z") });
    expect(warnings.map(w => w.kind)).not.toContain("date_in_notes");
  });
});

describe("weekEnding", () => {
  it("names a week after the Saturday that closes it", () => {
    expect(weekEnding("2026-08-15")).toBe("2026-08-15");  // a Saturday is its own week
    expect(weekEnding("2026-08-14")).toBe("2026-08-15");  // Friday
    expect(weekEnding("2026-08-09")).toBe("2026-08-15");  // Sunday opens that week
  });

  it("carries the last days of a month into the next month's week", () => {
    // Sun 26 Jul - Sat 1 Aug is an August week, which is why 32 shortlisted
    // rows sitting in the July sheet belong to August's figures.
    expect(weekEnding("2026-07-26")).toBe("2026-08-01");
    expect(weekEnding("2026-07-31")).toBe("2026-08-01");
  });
});

describe("events", () => {
  it("emits one event per stage the line reports", () => {
    const csv = [HEADER, `1,AHD,Ali Khan,Cardiology,8/13/2026,8/14/2026,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    expect(rows[0].events.map(e => [e.stage, e.occurred_at, e.week_ending])).toEqual([
      ["shortlisted", "2026-08-13", "2026-08-15"],
      ["interviewed", "2026-08-14", "2026-08-15"],
    ]);
  });

  it("keeps both lines when a doctor is put forward twice at one hospital", () => {
    // The journey row can hold only one interviewed_at; the team counts both.
    const csv = [HEADER,
                 `1,AHD,Aamer Alhamwi,Surgery,,8/5/2026,,,,,`,
                 `2,AHD,Aamer Alhamwi,Surgery,,8/19/2026,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv);
    const interviews = rows.flatMap(r => r.events).filter(e => e.stage === "interviewed");
    expect(interviews.map(e => e.occurred_at)).toEqual(["2026-08-05", "2026-08-19"]);
  });

  it("makes no event for a start date, which is a plan and not an event", () => {
    const csv = [HEADER, `1,AHD,Ali Khan,Cardiology,,,,,9/1/2026,,`].join("\n");
    expect(parseHammadCsv(csv).rows[0].events).toEqual([]);
  });
});

describe("block rep", () => {
  const repFor = (h: string) => {
    const owners: Record<string, { rep: string; country: string | null }> = {
      AHD:            { rep: "Ishak",   country: "UAE" },
      "NMC - AUH":    { rep: "Ishak",   country: "UAE" },
      Garhoud:        { rep: "Mohamed", country: "UAE" },
      Prime:          { rep: "Mohamed", country: "UAE" },
      HMG:            { rep: "Sohaila", country: "KSA/Qatar" },
      MNGHA:          { rep: "Sohaila", country: "KSA/Qatar" },
    };
    return owners[h] ?? null;
  };

  it("stamps every row and event in a block with the block's rep", () => {
    const csv = [HEADER,
                 `1,HMG,Faheem Seedat,Endocrinology,8/13/2026,,,,,,`,
                 `2,MNGHA,Dalia Ahmed,Cardiac Imaging,8/13/2026,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv, { repFor });
    expect(rows.map(r => r.rep)).toEqual(["Sohaila", "Sohaila"]);
    expect(rows[0].country).toBe("KSA/Qatar");
    expect(rows[0].events[0].rep).toBe("Sohaila");
  });

  it("gives a shared hospital name the rep of the block it sits in", () => {
    // "SGH" is Saudi German, which is on both Sohaila's and Ishak's lists.
    // In a block of Ishak's hospitals it is the Dubai one.
    const csv = [HEADER,
                 `1,AHD,Ali Al-Haboubi,Emergency,8/9/2026,,,,,,`,
                 `2,AHD,Miriam Ghaly,Family Medicine,8/9/2026,,,,,,`,
                 `3,SGH,Luis Teran,Anesthesia,8/9/2026,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv, { repFor });
    expect(rows.find(r => r.hospital_name === "SGH")?.rep).toBe("Ishak");
  });

  it("keeps each block's own rep when a file holds several", () => {
    const csv = [HEADER,
                 `1,Garhoud,Monika Kodeboina,Cardiology,8/27/2026,,,,,,`,
                 HEADER,
                 `1,HMG,Fady Zakharious,Internal Medicine,8/13/2026,,,,,,`].join("\n");
    const { rows } = parseHammadCsv(csv, { repFor });
    expect(rows.map(r => r.rep)).toEqual(["Mohamed", "Sohaila"]);
  });

  it("leaves a block unattributed rather than guessing a tie", () => {
    const csv = [HEADER,
                 `1,AHD,Ali Khan,Cardiology,8/13/2026,,,,,,`,
                 `2,Garhoud,Sara Ali,Cardiology,8/13/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv, { repFor }).rows.every(r => r.rep === null)).toBe(true);
  });

  it("carries no rep when no owner map is given", () => {
    const csv = [HEADER, `1,AHD,Ali Khan,Cardiology,8/13/2026,,,,,,`].join("\n");
    expect(parseHammadCsv(csv).rows[0].rep).toBeNull();
  });
});

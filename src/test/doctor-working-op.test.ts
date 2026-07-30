import { describe, it, expect } from "vitest";
import {
  buildWorkingOpSubject,
  buildWorkingOpBody,
  buildDoctorHospitalsHtml,
  workingOpCountries,
  doctorGreeting,
  dedupeHospitals,
  type WorkingOpHospital,
} from "@/lib/doctor-working-op";

// The consolidated "working opportunities" doctor email is the one the team
// reported as buggy in the past ("a doctor sent to two hospitals sent working
// ops for hospital A twice"). These tests exercise every meaningful shape of
// that email so a regression can't slip back in.

const SIG = "<!--SIGNATURE-->";

const MNGHA: WorkingOpHospital = { name: "Ministry of National Guard Hospitals (MNGHA)", city: "Riyadh", country: "Saudi Arabia", link: "https://mngha.med.sa/", image_url: "https://img/mngha.png" };
const FAKEEH: WorkingOpHospital = { name: "Fakeeh Care Group",  city: "Jeddah", country: "Saudi Arabia", link: "https://en.fakeeh.care/about-us" };
const VIEW:   WorkingOpHospital = { name: "The View Hospital",  city: "Doha",   country: "Qatar", link: "https://www.theviewhospital.com" };
const AMNM:   WorkingOpHospital = { name: "Al Fardan Medical (AMNM)", city: "Doha", country: "Qatar" }; // no link, no image

/** How many hospital <li> rows the grouped list renders (one per hospital). */
const countLi = (html: string) => (html.match(/<li/g) ?? []).length;
/** How many "In X:" location group headings. */
const countGroups = (html: string) => (html.match(/>In [^<]+:</g) ?? []).length;

describe("subject line", () => {
  it("single country → plural + trailing period", () => {
    expect(buildWorkingOpSubject([VIEW])).toBe("Working opportunities in Qatar - Allocation Assist.");
  });
  it("two countries joined with &", () => {
    expect(buildWorkingOpSubject([MNGHA, VIEW])).toBe("Working opportunities in Saudi Arabia & Qatar - Allocation Assist.");
  });
  it("collapses duplicate countries in the subject", () => {
    expect(buildWorkingOpSubject([MNGHA, FAKEEH])).toBe("Working opportunities in Saudi Arabia - Allocation Assist.");
  });
  it("falls back to a provided location when hospitals carry no country", () => {
    expect(buildWorkingOpSubject([{ name: "X" }], "Qatar")).toBe("Working opportunities in Qatar - Allocation Assist.");
  });
});

describe("workingOpCountries", () => {
  it("dedupes and joins", () => {
    expect(workingOpCountries([MNGHA, FAKEEH, VIEW])).toBe("Saudi Arabia & Qatar");
  });
});

describe("doctorGreeting", () => {
  it("strips an existing Dr./Prof. prefix and adds one, exclamation ending", () => {
    expect(doctorGreeting("Dr. Manish")).toBe("Hello Dr. Manish!");
    expect(doctorGreeting("Prof. Draft")).toBe("Hello Dr. Draft!");
    expect(doctorGreeting("Manish")).toBe("Hello Dr. Manish!");
  });
  it("degrades gracefully with no name", () => {
    expect(doctorGreeting("")).toBe("Hello Doctor!");
  });
});

describe("hospital list grouping", () => {
  it("single hospital, single city → heading uses the country, listed once, linked", () => {
    const html = buildDoctorHospitalsHtml([VIEW]);
    expect(countLi(html)).toBe(1);
    expect(html).toContain(">In Qatar:<");
    expect(html).toContain('href="https://www.theviewhospital.com"');
    expect(html).toContain("The View Hospital");
  });

  it("two hospitals, same country, two cities → 'In Riyadh and Jeddah:', each once", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, FAKEEH]);
    expect(countGroups(html)).toBe(1);
    expect(html).toContain(">In Riyadh and Jeddah:<");
    expect(countLi(html)).toBe(2);
  });

  it("two hospitals, different countries → two groups, each hospital once", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, VIEW]);
    expect(countGroups(html)).toBe(2);
    expect(html).toContain(">In Saudi Arabia:<");   // Saudi has one city here → country label
    expect(html).toContain(">In Qatar:<");
    expect(countLi(html)).toBe(2);
  });

  it("hospital with no link renders plain text (no <a>)", () => {
    const html = buildDoctorHospitalsHtml([AMNM]);
    expect(html).toContain("Al Fardan Medical (AMNM)");
    expect(html).not.toContain("<a ");
  });

  it("hospital photo renders (below the list)", () => {
    const html = buildDoctorHospitalsHtml([MNGHA]);
    expect(html).toContain('<img src="https://img/mngha.png"');
  });
});

describe("REGRESSION: a hospital must never be listed twice", () => {
  it("duplicate hospital in the list is rendered exactly once", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, MNGHA]);
    expect(countLi(html)).toBe(1);
  });

  it("doctor → two hospitals lists BOTH, each exactly once (the old A-twice bug)", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, VIEW]);
    expect(countLi(html)).toBe(2);
    // Each hospital's linked name appears exactly once.
    expect((html.match(/mngha\.med\.sa/g) ?? []).length).toBe(1);
    expect((html.match(/theviewhospital\.com/g) ?? []).length).toBe(1);
  });

  it("dedupeHospitals: exact dup collapses, distinct kept, same-name/diff-city kept, nameless dropped", () => {
    expect(dedupeHospitals([MNGHA, MNGHA])).toHaveLength(1);
    expect(dedupeHospitals([MNGHA, FAKEEH])).toHaveLength(2);
    expect(dedupeHospitals([
      { name: "City Hospital", city: "Dubai" },
      { name: "City Hospital", city: "Abu Dhabi" },
    ])).toHaveLength(2);
    expect(dedupeHospitals([{ name: "" }, MNGHA])).toHaveLength(1);
  });
});

describe("full body", () => {
  it("contains the greeting, intro, negotiation, close, list and signature", () => {
    const body = buildWorkingOpBody("Dr. Manish", [MNGHA, VIEW], SIG);
    expect(body).toContain("Hello Dr. Manish!");
    expect(body).toContain("I hope you're doing well");   // literal line (not esc-wrapped)
    expect(body).toContain("We are currently discussing your profile with the hospitals below");
    expect(body).toContain("We will help you negotiate the salary and allowance to secure your best offer.");
    expect(body).toContain("We wish you a wonderful day!");
    expect(body).toContain(SIG);
    expect(countLi(body)).toBe(2);
  });

  it("the two-hospital body lists each hospital exactly once", () => {
    const body = buildWorkingOpBody("Dr. Manish", [MNGHA, VIEW], SIG);
    expect((body.match(/mngha\.med\.sa/g) ?? []).length).toBe(1);
    expect((body.match(/theviewhospital\.com/g) ?? []).length).toBe(1);
  });

  it("a doubled batch_hospitals list still lists the hospital once", () => {
    const body = buildWorkingOpBody("Dr. X", [MNGHA, MNGHA], SIG);
    expect(countLi(body)).toBe(1);
  });
});

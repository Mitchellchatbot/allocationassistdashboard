import { describe, it, expect } from "vitest";
import {
  buildWorkingOpSubject,
  buildWorkingOpBody,
  buildDoctorHospitalsHtml,
  ensureHospitalImageToken,
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

/** How many hospital rows the grouped list renders — one hospital-name line
 *  (`<p style="margin:0 0 2px">`) per hospital block, independent of that
 *  block's optional About-us link, description blurb, or photo. This is the
 *  "listed once" signal the regression suite guards on. The markup moved from
 *  `<ul><li>` to a per-hospital block that carries the description + About Us
 *  link + photo (the "detail per working opportunity" feature), so the row
 *  count keys off the name line rather than a now-absent `<li>`. */
const countHospitals = (html: string) => (html.match(/margin:0 0 2px;/g) ?? []).length;
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
    expect(countHospitals(html)).toBe(1);
    expect(html).toContain(">In Qatar:<");
    expect(html).toContain('href="https://www.theviewhospital.com"');
    expect(html).toContain("The View Hospital");
  });

  it("two hospitals, same country, two cities → 'In Riyadh and Jeddah:', each once", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, FAKEEH]);
    expect(countGroups(html)).toBe(1);
    expect(html).toContain(">In Riyadh and Jeddah:<");
    expect(countHospitals(html)).toBe(2);
  });

  it("two hospitals, different countries → two groups, each hospital once", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, VIEW]);
    expect(countGroups(html)).toBe(2);
    expect(html).toContain(">In Saudi Arabia:<");   // Saudi has one city here → country label
    expect(html).toContain(">In Qatar:<");
    expect(countHospitals(html)).toBe(2);
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
    expect(countHospitals(html)).toBe(1);
  });

  it("doctor → two hospitals lists BOTH, each exactly once (the old A-twice bug)", () => {
    const html = buildDoctorHospitalsHtml([MNGHA, VIEW]);
    expect(countHospitals(html)).toBe(2);
    // Both hospitals' links are present. Each hospital's URL now appears twice —
    // once on the name and once on its "About us »" link — so the "listed once"
    // guarantee is the countHospitals()===2 row count above, not a URL count.
    expect(html).toContain("mngha.med.sa");
    expect(html).toContain("theviewhospital.com");
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
    expect(countHospitals(body)).toBe(2);
  });

  it("the two-hospital body lists each hospital exactly once", () => {
    const body = buildWorkingOpBody("Dr. Manish", [MNGHA, VIEW], SIG);
    expect(countHospitals(body)).toBe(2);   // one row per hospital — no "A twice"
    expect(body).toContain("mngha.med.sa");
    expect(body).toContain("theviewhospital.com");
  });

  it("a doubled batch_hospitals list still lists the hospital once", () => {
    const body = buildWorkingOpBody("Dr. X", [MNGHA, MNGHA], SIG);
    expect(countHospitals(body)).toBe(1);
  });
});

// A city/specialty template drives the copy of a consolidated send while the
// composer fills its {{hospital_image}} slot with the grouped hospital blocks.
// The slot is the whole seam between the two, so guard that it survives.
describe("ensureHospitalImageToken", () => {
  it("leaves a template that already has the slot untouched", () => {
    const tpl = "<p>Hi</p>{{hospital_image}}<p>Bye</p>{{signature}}";
    expect(ensureHospitalImageToken(tpl)).toBe(tpl);
  });

  it("inserts the slot before the signature when a template lacks it", () => {
    const out = ensureHospitalImageToken("<p>Hi</p><p>Bye</p>{{signature}}");
    expect(out).toContain("{{hospital_image}}");
    expect(out.indexOf("{{hospital_image}}")).toBeLessThan(out.indexOf("{{signature}}"));
  });

  it("appends the slot when there is no signature token either", () => {
    const out = ensureHospitalImageToken("<p>Hi</p>");
    expect(out.startsWith("<p>Hi</p>")).toBe(true);
    expect(out).toContain("{{hospital_image}}");
  });

  it("the slot carries every hospital, so a template send lists them all", () => {
    const tpl = ensureHospitalImageToken("<p>Opportunities in Doha</p>{{signature}}");
    const rendered = tpl.replace("{{hospital_image}}", buildDoctorHospitalsHtml([VIEW, AMNM]));
    expect(countHospitals(rendered)).toBe(2);
    expect(countGroups(rendered)).toBe(1);       // both in Qatar → one heading
    expect(rendered).toContain("The View Hospital");
    expect(rendered).toContain("Al Fardan Medical (AMNM)");
  });

  // The real doctor_city_* body from migration 20260825010000. If that shape
  // ever drifts away from carrying the slot, a city send would quietly lose its
  // hospital list — which is exactly the bug this feature exists to fix.
  it("the shipped city template keeps its city copy AND gains the hospital list", () => {
    const cityTemplate =
      '<p style="margin:0 0 10px;">Hi Dr. {{doctor_name}},</p>' +
      '<p style="margin:0 0 10px;">I hope you are doing well 😊</p>' +
      '<p style="margin:0 0 10px;">Based on your profile and training, we have recommended you to leading hospitals in <strong>Doha</strong>. These are among the most relevant employers in the area for your specialty.</p>' +
      '{{hospital_image}}' +
      '<p style="margin:0 0 10px;">We wish you a wonderful day!</p>' +
      '{{signature}}';
    expect(ensureHospitalImageToken(cityTemplate)).toBe(cityTemplate);  // slot already there
    const rendered = cityTemplate
      .replace("{{hospital_image}}", buildDoctorHospitalsHtml([VIEW, AMNM]))
      .replace("{{doctor_name}}", "Manish")
      .replace("{{signature}}", SIG);
    expect(rendered).toContain("leading hospitals in <strong>Doha</strong>");  // template copy survives
    expect(countHospitals(rendered)).toBe(2);                                  // composer blocks spliced in
    expect(rendered).toContain(SIG);
    expect(rendered).not.toContain("{{");                                      // no stray tokens ship
  });
});

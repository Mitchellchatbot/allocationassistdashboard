/**
 * Reading the doctor out of a Doctors Finder submission.
 *
 * Two things are under test. First the parsing itself, because the page URL
 * is the ONLY record of which doctor an enquiry was about - the forms never
 * ask, and the team decided against adding a hidden field. Second the parity
 * between the server master and the browser port: the parser has to exist
 * twice (Deno cannot resolve `@/`, Vite will not reach into
 * supabase/functions), and a drift between them would attribute a live
 * webhook submission to one doctor and the same row re-imported from CSV to
 * another. The jotform pair drifted exactly this way once already.
 */
import { describe, it, expect } from "vitest";
import {
  enquiryTargetFrom as clientTarget,
  findTargetUrl     as clientFind,
  nameFromSlug      as clientName,
} from "@/lib/enquiry-target";
import {
  enquiryTargetFrom as serverTarget,
  findTargetUrl     as serverFind,
  nameFromSlug      as serverName,
} from "../../supabase/functions/_shared/enquiry-target";

/** Real shapes seen in the 2026-11-23 Elementor export, plus the misses. */
const URLS = [
  "https://doctorsfinder.com/doctor/dr-vera-korol/",
  "https://doctorsfinder.com/doctor/dr-jeevan-kumar-mahaveer/",
  "https://doctorsfinder.com/doctor/dr-ahmed-sharafeldin",
  "https://doctorsfinder.com/hospital/clemenceau-medical-center-hospital/",
  "https://doctorsfinder.com/blog/waiting-period-on-uae-health-insurance/",
  "https://doctorsfinder.com/contact-us/",
  "https://doctorsfinder.com/sign-up/",
  "https://doctorsfinder.com/submit-review/?dr=8068",
  "https://doctorsfinder.com/doctors/page/2",
  "/doctor/dr-local-path/",
  "not a url at all",
  "",
];

describe("reading the doctor out of a page URL", () => {
  it("takes the doctor from a profile page", () => {
    expect(clientTarget("https://doctorsfinder.com/doctor/dr-vera-korol/"))
      .toEqual({ kind: "doctor", slug: "dr-vera-korol", name: "Dr Vera Korol" });
  });

  it("does not need a trailing slash, a query, or an absolute URL", () => {
    expect(clientTarget("https://doctorsfinder.com/doctor/dr-bassem-arab")?.slug).toBe("dr-bassem-arab");
    expect(clientTarget("https://doctorsfinder.com/doctor/dr-bassem-arab/?utm_source=x")?.slug).toBe("dr-bassem-arab");
    expect(clientTarget("/doctor/dr-bassem-arab/")?.slug).toBe("dr-bassem-arab");
  });

  it("tells a hospital enquiry apart from a doctor one", () => {
    const t = clientTarget("https://doctorsfinder.com/hospital/clemenceau-medical-center-hospital/");
    expect(t?.kind).toBe("hospital");
    expect(t?.slug).toBe("clemenceau-medical-center-hospital");
  });

  it("returns nothing for a page that names no one", () => {
    // A third of the older form's submissions look like this: the enquiry
    // form is embedded on a blog post, or the browser sent no referrer.
    // "Don't know" has to stay "don't know" - guessing a doctor here would
    // put a real patient in front of the wrong person's count.
    for (const u of [
      "https://doctorsfinder.com/blog/waiting-period/",
      "https://doctorsfinder.com/contact-us/",
      "", "   ", "javascript:void(0)", "not a url",
    ]) {
      expect(clientTarget(u), u).toBeNull();
    }
  });

  it("is not fooled by a listing page", () => {
    // /doctors/page/2 is the directory, not a doctor.
    expect(clientTarget("https://doctorsfinder.com/doctors/page/2")).toBeNull();
  });

  it("keeps the slug as the identity and the name as decoration", () => {
    expect(clientName("dr-vera-korol")).toBe("Dr Vera Korol");
    // Lossy by construction: a hyphenated surname cannot be told from a word
    // break, which is exactly why counting groups on the slug.
    expect(clientName("dr-faisal-al-rubayi")).toBe("Dr Faisal Al Rubayi");
  });
});

describe("finding the page URL inside a submission payload", () => {
  it("prefers a field that names itself", () => {
    const flat = {
      Message:  "please call me",
      Referrer: "https://doctorsfinder.com/doctor/dr-vera-korol/",
    };
    expect(clientFind(flat)).toBe("https://doctorsfinder.com/doctor/dr-vera-korol/");
  });

  it("copes with Elementor's bracketed webhook keys", () => {
    const flat = { "meta[page_url][value]": "https://doctorsfinder.com/doctor/dr-emma-gardette/" };
    expect(clientTarget(clientFind(flat))?.slug).toBe("dr-emma-gardette");
  });

  it("falls back to any value that resolves to a profile", () => {
    // Insurance against Elementor renaming the field: if some other key
    // carries the URL, the enquiry is still attributed.
    const flat = { whatever_this_is: "https://doctorsfinder.com/doctor/dr-dalia-aziz/" };
    expect(clientTarget(clientFind(flat))?.slug).toBe("dr-dalia-aziz");
  });

  it("still surfaces the page when it names nobody", () => {
    // A blog-post submission has no doctor, but knowing WHERE it came from
    // is what tells the team the form is embedded somewhere unattributable.
    const flat = { Referrer: "https://doctorsfinder.com/blog/waiting-period/" };
    expect(clientFind(flat)).toBe("https://doctorsfinder.com/blog/waiting-period/");
    expect(clientTarget(clientFind(flat))).toBeNull();
  });

  it("returns null when there is no URL anywhere", () => {
    expect(clientFind({ Name: "Jane", Message: "hello" })).toBeNull();
    expect(clientFind({})).toBeNull();
  });
});

describe("the browser port matches the server master", () => {
  it("resolves every URL identically", () => {
    for (const u of URLS) {
      expect(clientTarget(u), u).toEqual(serverTarget(u));
    }
  });

  it("picks the same URL out of a payload", () => {
    const payloads = [
      { Referrer: "https://doctorsfinder.com/doctor/dr-vera-korol/" },
      { "meta[page_url][value]": "https://doctorsfinder.com/doctor/dr-wiam-bouaziz/" },
      { stray: "https://doctorsfinder.com/doctor/dr-sanjeev-kumar/" },
      { Referrer: "https://doctorsfinder.com/blog/x/" },
      { Name: "Jane" },
      {},
    ];
    for (const p of payloads) {
      expect(clientFind(p), JSON.stringify(p)).toBe(serverFind(p));
    }
  });

  it("renders the same display name", () => {
    for (const s of ["dr-vera-korol", "dr-faisal-al-rubayi", "a", "dr--double--hyphen"]) {
      expect(clientName(s), s).toBe(serverName(s));
    }
  });
});

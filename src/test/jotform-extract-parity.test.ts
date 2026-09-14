// The JotForm → WP mapping exists twice: the server master
// (supabase/functions/_shared/jotform-extract.ts, run by the webhook and the
// historical sync) and a client port (src/lib/jotform-to-wp.ts, run by the
// Forms page when someone converts a stored response by hand). Both map the
// SAME submission, so a value-lookup list present in one and not the other
// means the specialty a doctor typed is detected on one path and dropped on
// the other. That had already happened — the client copy was missing ten
// specialties (Colorectal, Maxillofacial, Cardiothoracic, …) despite a comment
// claiming the two were in lockstep. These assertions make the claim real.
import { describe, it, expect } from "vitest";
import {
  SPECIALTIES as CLIENT_SPECIALTIES,
  COUNTRIES   as CLIENT_COUNTRIES,
  LANGUAGES   as CLIENT_LANGUAGES,
} from "@/lib/jotform-to-wp";
import {
  MEDICAL_SPECIALTIES as SERVER_SPECIALTIES,
  COUNTRIES           as SERVER_COUNTRIES,
  LANGUAGES           as SERVER_LANGUAGES,
} from "../../supabase/functions/_shared/jotform-extract";

describe("jotform value-lookup lists stay in lockstep", () => {
  it("specialties match the server master exactly, including order", () => {
    expect(CLIENT_SPECIALTIES).toEqual(SERVER_SPECIALTIES);
  });

  it("countries match the server master exactly, including order", () => {
    expect(CLIENT_COUNTRIES).toEqual(SERVER_COUNTRIES);
  });

  it("languages match the server master exactly, including order", () => {
    expect(CLIENT_LANGUAGES).toEqual(SERVER_LANGUAGES);
  });

  // Order matters beyond tidiness: both sides detect with a first-match scan
  // (`list.find(it => value.includes(it))`), so reordering changes which
  // label wins for a value naming two — "Interventional Cardiology" must
  // stay ahead of nothing broader, and "Surgery" must stay behind the
  // specific surgical entries or it swallows them all.
  it("keeps 'Surgery' after the specific surgical specialties", () => {
    const generic = SERVER_SPECIALTIES.indexOf("Surgery");
    for (const specific of ["Plastic Surgery", "Vascular Surgery", "General Surgery"]) {
      expect(SERVER_SPECIALTIES.indexOf(specific)).toBeLessThan(generic);
    }
  });
});

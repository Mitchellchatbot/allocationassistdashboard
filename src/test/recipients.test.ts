// Guards the shared "To" address check used by every email sender
// (supabase/functions/_shared/recipients.ts). The whole point of the module is
// that a blank / junk To can never reach Resend, so the negative cases matter
// more than the happy path.
import { describe, it, expect } from "vitest";
import {
  toRecipientList,
  hasRecipient,
  missingRecipientError,
} from "../../supabase/functions/_shared/recipients";
import { splitEmails, isEmail } from "@/components/automations/CcBccPicker";

describe("toRecipientList", () => {
  it("accepts a single address", () => {
    expect(toRecipientList("a@b.com")).toEqual(["a@b.com"]);
  });

  it("splits comma- and semicolon-joined lists ('all' contact mode)", () => {
    expect(toRecipientList("a@b.com, c@d.com;e@f.com")).toEqual(["a@b.com", "c@d.com", "e@f.com"]);
  });

  it("flattens arrays, including arrays of joined strings", () => {
    expect(toRecipientList(["a@b.com", "c@d.com, e@f.com"])).toEqual(["a@b.com", "c@d.com", "e@f.com"]);
  });

  it("dedups case-insensitively, keeping first-seen order and casing", () => {
    expect(toRecipientList("B@x.com, a@x.com, b@X.COM")).toEqual(["B@x.com", "a@x.com"]);
  });

  it("trims surrounding whitespace", () => {
    expect(toRecipientList("  a@b.com  ,\n c@d.com ")).toEqual(["a@b.com", "c@d.com"]);
  });

  // The cases that used to slip past `!effectiveTo` / `e.includes("@")` and get
  // mailed verbatim as the To.
  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["empty array", []],
    ["array of blanks", ["", "  "]],
    ["stray separators", ",;,"],
    ["a bare at-sign", "@"],
    ["no domain", "someone@"],
    ["no local part", "@hospital.com"],
    ["no at-sign", "not-an-email"],
    ["a placeholder note", "n/a"],
    ["no dot in the domain", "recruiter@hospital"],
  ])("rejects %s", (_label, input) => {
    expect(toRecipientList(input)).toEqual([]);
    expect(hasRecipient(input)).toBe(false);
  });

  it("keeps the good addresses out of a mixed list", () => {
    expect(toRecipientList("n/a, real@hospital.com, @, ")).toEqual(["real@hospital.com"]);
  });
});

describe("missingRecipientError", () => {
  it("names a single offender", () => {
    expect(missingRecipientError(["City Hospital"], "hospital"))
      .toBe("No email address for City Hospital. Add a To address before sending.");
  });

  it("counts and lists several", () => {
    expect(missingRecipientError(["City Hospital", "Bay Clinic"], "hospital"))
      .toBe("No email address for 2 hospitals: City Hospital, Bay Clinic. Add a To address for each before sending.");
  });

  it("survives blank / missing names rather than printing 'undefined'", () => {
    expect(missingRecipientError(["", "  "], "hospital")).not.toContain("undefined");
  });
});

// The dialogs block a send client-side before any sender is called. If the two
// checks disagree, a To the UI accepts would be rejected by the edge function
// (or worse, vice versa).
describe("client/server address checks agree", () => {
  const cases = [
    "a@b.com", "first.last@sub.hospital.co.uk", "a+tag@b.com",
    "", "   ", "@", "someone@", "@hospital.com", "not-an-email", "n/a", "recruiter@hospital",
  ];
  it.each(cases)("agree on %j", (input) => {
    expect(hasRecipient(input)).toBe(isEmail(input));
  });

  it("agree on multi-address lists", () => {
    const list = "a@b.com, c@d.com";
    expect(toRecipientList(list)).toEqual(splitEmails(list));
  });
});

import { describe, it, expect } from "vitest";
import { validatePassword, generatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

describe("validatePassword", () => {
  it("rejects anything shorter than the minimum", () => {
    expect(validatePassword("short1!")).toMatch(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects a password that is all spaces", () => {
    expect(validatePassword(" ".repeat(12))).not.toBeNull();
  });

  it("rejects a confirm that doesn't match", () => {
    expect(validatePassword("long-enough-pw", "long-enough-pX")).toMatch(/match/i);
  });

  it("accepts a long-enough password, with or without a matching confirm", () => {
    expect(validatePassword("long-enough-pw")).toBeNull();
    expect(validatePassword("long-enough-pw", "long-enough-pw")).toBeNull();
  });
});

describe("generatePassword", () => {
  it("makes passwords that pass the policy and differ each time", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(validatePassword(a)).toBeNull();
    expect(a).not.toBe(b);
  });
});

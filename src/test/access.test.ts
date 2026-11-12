/**
 * Who gets which pages. The rule that matters most: an email we don't
 * recognise, with no user_profiles row, gets NOTHING — never the admin set.
 * The old fallback handed such users every page (a fail-open).
 */
import { describe, it, expect } from "vitest";
import {
  accessFromEmail, resolveFetchedAccess, hasAnyAccess, landingFor,
  resolveLoginEmail, canSelfReset,
  ALL_PAGES, HI_MEMBER_PAGES, NO_ACCESS_ROLE,
} from "@/lib/access";

describe("accessFromEmail (no profile row)", () => {
  it("gives @sales.com workers the worker page only, with their sheet name", () => {
    expect(accessFromEmail("Abraham@Sales.com")).toEqual({
      role: "worker", allowedPages: ["/worker"], fullName: "Abraham",
    });
  });

  it("gives HI specialists and granted guests the HI page set", () => {
    expect(accessFromEmail("ishak@allocationassist.com")).toEqual({
      role: "hi_member", allowedPages: HI_MEMBER_PAGES, fullName: "Ishak Boulaat",
    });
    expect(accessFromEmail("amir@allocationassist.com").role).toBe("hi_member");
  });

  it("gives an unknown email no access at all", () => {
    const a = accessFromEmail("stranger@allocationassist.com");
    expect(a).toEqual({ role: NO_ACCESS_ROLE, allowedPages: [], fullName: null });
    expect(a.allowedPages).not.toEqual(ALL_PAGES);
  });

  it("treats a missing email as unknown", () => {
    expect(accessFromEmail(null).role).toBe(NO_ACCESS_ROLE);
  });
});

describe("resolveFetchedAccess", () => {
  const cached = { role: "sales", allowedPages: ["/", "/sales"], fullName: "Jane" };

  it("uses the profile row whenever there is one", () => {
    expect(resolveFetchedAccess({
      email: "stranger@x.com",
      row: { role: "admin", allowed_pages: ALL_PAGES, full_name: "Boss" },
      cached: null,
    })).toEqual({ role: "admin", allowedPages: ALL_PAGES, fullName: "Boss" });
  });

  it("reads a null allowed_pages as no pages", () => {
    expect(resolveFetchedAccess({
      email: "x@y.com", row: { role: "custom", allowed_pages: null, full_name: null }, cached: null,
    }).allowedPages).toEqual([]);
  });

  it("keeps the cached profile when a re-fetch comes back empty (no elevation)", () => {
    expect(resolveFetchedAccess({ email: "stranger@x.com", row: null, cached })).toBe(cached);
  });

  it("falls back by email only on first load", () => {
    expect(resolveFetchedAccess({ email: "stranger@x.com", row: null, cached: null }).role)
      .toBe(NO_ACCESS_ROLE);
  });
});

describe("hasAnyAccess / landingFor", () => {
  it("admins always have access, even with an empty page list", () => {
    expect(hasAnyAccess({ role: "admin", allowedPages: [] })).toBe(true);
    expect(landingFor({ role: "admin", allowedPages: [] })).toBe("/");
  });

  it("a non-admin with no pages has no access and lands on the no-access screen", () => {
    expect(hasAnyAccess({ role: NO_ACCESS_ROLE, allowedPages: [] })).toBe(false);
    expect(landingFor({ role: NO_ACCESS_ROLE, allowedPages: [] })).toBe("/no-access");
  });

  it("HI members land on their workspace; others on their first page", () => {
    expect(landingFor({ role: "hi_member", allowedPages: HI_MEMBER_PAGES })).toBe("/my-workspace");
    expect(landingFor({ role: "worker", allowedPages: ["/worker"] })).toBe("/worker");
  });
});

describe("resolveLoginEmail / canSelfReset", () => {
  it("maps short usernames and passes emails through trimmed", () => {
    expect(resolveLoginEmail("Admin")).toBe("admin@allocationassist.com");
    expect(resolveLoginEmail("  jane@allocationassist.com ")).toBe("jane@allocationassist.com");
  });

  it("@sales.com logins can't receive email, so they can't self-reset", () => {
    expect(canSelfReset("peter@sales.com")).toBe(false);
    expect(canSelfReset("PETER@SALES.COM")).toBe(false);
    expect(canSelfReset("jane@allocationassist.com")).toBe(true);
  });
});

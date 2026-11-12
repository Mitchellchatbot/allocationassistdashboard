/**
 * The links in the reset / invite emails land on /auth/confirm with
 * ?token_hash=…&type=recovery|invite. When Supabase itself rejects a link it
 * redirects with the error in the URL hash instead.
 */
import { describe, it, expect } from "vitest";
import { parseConfirmLink } from "@/lib/auth-links";

describe("parseConfirmLink", () => {
  it("reads a recovery link", () => {
    expect(parseConfirmLink("?token_hash=abc123&type=recovery", "")).toEqual({
      kind: "ok", tokenHash: "abc123", type: "recovery",
    });
  });

  it("reads an invite link", () => {
    expect(parseConfirmLink("?token_hash=abc&type=invite", "")).toMatchObject({ kind: "ok", type: "invite" });
  });

  it("refuses link types this page doesn't handle", () => {
    expect(parseConfirmLink("?token_hash=abc&type=email_change", "").kind).toBe("invalid");
  });

  it("calls a link with no token invalid", () => {
    expect(parseConfirmLink("?type=recovery", "").kind).toBe("invalid");
    expect(parseConfirmLink("", "").kind).toBe("invalid");
  });

  it("reports an expired link from Supabase's hash error", () => {
    expect(parseConfirmLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"))
      .toEqual({ kind: "expired" });
  });

  it("reports other hash errors as invalid", () => {
    expect(parseConfirmLink("", "#error=server_error&error_description=boom").kind).toBe("invalid");
  });
});

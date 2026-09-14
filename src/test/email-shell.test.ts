// The send shell is what makes a delivered email look like its preview. It has
// drifted twice now — once when batch sends rendered the signature at 14/13px,
// and again when send-flow-email shipped hand-edited bodies with no wrapper at
// all, so the body fell back to the mail client's default font while the
// signature (inline Garamond) did not. These tests pin the invariant: the
// server shell and the preview shell are the same string, and every body goes
// out wrapped in it exactly once.
import { describe, it, expect } from "vitest";
import {
  FONT_STACK,
  FONT_IMPORT,
  BODY_SHELL_OPEN,
  withBodyShell,
} from "../../supabase/functions/_shared/email-shell";
import { EMAIL_FONT_STACK, EMAIL_FONT_IMPORT, wrapBodyForSend } from "@/lib/email-preview";

describe("send shell / preview shell parity", () => {
  it("uses the same font stack on both sides", () => {
    expect(FONT_STACK).toBe(EMAIL_FONT_STACK);
  });

  it("uses the same web-font import on both sides", () => {
    expect(FONT_IMPORT).toBe(EMAIL_FONT_IMPORT);
  });

  it("produces byte-identical HTML to the client's wrapBodyForSend", () => {
    const body = "<p>Dear Dr. Haddad,</p>";
    expect(withBodyShell(body)).toBe(wrapBodyForSend(body));
  });
});

describe("withBodyShell", () => {
  it("wraps a bare body in the Garamond shell", () => {
    const out = withBodyShell("<p>hello</p>");
    expect(out).toContain(BODY_SHELL_OPEN);
    expect(out).toContain("Garamond");
    expect(out).toContain("<p>hello</p>");
  });

  it("preserves inline font-size spans from the composer", () => {
    const edited = '<p><span style="font-size: 24px;">Big news</span></p>';
    expect(withBodyShell(edited)).toContain('font-size: 24px;');
  });

  it("is idempotent — an already-wrapped body is not nested twice", () => {
    const once  = withBodyShell("<p>hello</p>");
    const twice = withBodyShell(once);
    expect(twice).toBe(once);
    expect(twice.split(BODY_SHELL_OPEN)).toHaveLength(2); // i.e. one occurrence
  });

  it("re-attaches the font import to a pre-wrapped body that lost it", () => {
    const wrappedNoImport = `${BODY_SHELL_OPEN}<p>hello</p></div>`;
    const out = withBodyShell(wrappedNoImport);
    expect(out.startsWith(FONT_IMPORT)).toBe(true);
    expect(out.split(BODY_SHELL_OPEN)).toHaveLength(2);
  });
});

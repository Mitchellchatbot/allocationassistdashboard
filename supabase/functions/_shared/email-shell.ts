// The send shell — the single wrapper every outgoing email body goes out in.
//
// This exists because the shell kept drifting. The dashboard previews the body
// inside a container carrying these exact metrics (src/lib/email-preview.ts,
// EMAIL_BODY_STYLE / wrapBodyForSend), so if a send path forgets the wrapper
// the delivered mail inherits the client's default font instead — while the
// signature, whose Garamond is inline on every <p>, keeps rendering as intended.
// The result is an email whose body and signature are in different fonts and
// neither matches what the sender previewed.
//
// Keep in lockstep with src/lib/email-preview.ts.

/** Body font stack — Garamond serif with graceful fallbacks. An OS font, not a
 *  web font, so the recipient's client resolves it exactly as the preview does. */
export const FONT_STACK = "Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif";

/** Poppins @import, for the doctor-card blocks whose inline font-family is
 *  Poppins. Harmless for plain bodies; clients that drop <style> fall back to
 *  the Helvetica/Arial tail of the card's own stack. */
export const FONT_IMPORT =
  `<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');</style>`;

/** Opening tag of the shell. Also the marker used to detect an already-wrapped
 *  body, so it must stay byte-identical to what wrapBodyForSend emits. */
export const BODY_SHELL_OPEN =
  `<div style="font-family:${FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">`;

/**
 * Wrap a rendered body in the send shell.
 *
 * Idempotent: a body edited in the composer may already carry the shell
 * (SendProfileDialog pipes its overrides through wrapBodyForSend), and nesting
 * a second font context is something clients resolve inconsistently.
 */
export function withBodyShell(bodyHtml: string): string {
  if (bodyHtml.includes(BODY_SHELL_OPEN)) {
    return bodyHtml.includes(FONT_IMPORT) ? bodyHtml : `${FONT_IMPORT}${bodyHtml}`;
  }
  return `${FONT_IMPORT}${BODY_SHELL_OPEN}${bodyHtml}</div>`;
}

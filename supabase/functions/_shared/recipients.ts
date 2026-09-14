// Shared "To" address guard.
//
// Every sender must refuse to ship an email with a blank To. A missing address
// used to be swallowed silently — the hospital was filtered out of the batch, or
// the doctor leg hit `continue` — so a send reported success while some
// recipients got nothing. Senders now collect the offenders and fail the WHOLE
// send with the list, so the dispatcher fixes the addresses and re-sends.
//
// The client side runs the same check before it even calls a sender, via
// splitEmails/isEmail in src/components/automations/CcBccPicker.tsx — keep the
// two address checks in agreement.

/**
 * Normalise anything a caller might hold an address in — a string, a
 * comma/semicolon-joined list, an array, null — into a clean list of addresses.
 * Deduped case-insensitively, order preserved.
 */
export function toRecipientList(raw: unknown): string[] {
  const flat: string[] = Array.isArray(raw)
    ? raw.flatMap(v => String(v ?? "").split(/[,;]+/))
    : String(raw ?? "").split(/[,;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of flat) {
    const e = part.trim();
    if (!isEmailAddress(e)) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** True when `raw` yields at least one usable address. */
export function hasRecipient(raw: unknown): boolean {
  return toRecipientList(raw).length > 0;
}

/**
 * The error message for a send blocked by missing addresses. `labels` names the
 * recipients that came up blank (hospital or doctor names).
 */
export function missingRecipientError(labels: string[], kind = "recipient"): string {
  const named = labels.map(l => String(l ?? "").trim()).filter(Boolean);
  const list  = named.length ? named.join(", ") : `${named.length || "Some"} ${kind}s`;
  return named.length === 1
    ? `No email address for ${list}. Add a To address before sending.`
    : `No email address for ${named.length} ${kind}s: ${list}. Add a To address for each before sending.`;
}

// A pragmatic address check — one @, something either side, a dotted domain, no
// whitespace. Deliberately not RFC-complete: it exists to catch blank/garbage
// To fields, not to adjudicate exotic-but-legal addresses.
function isEmailAddress(e: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e);
}

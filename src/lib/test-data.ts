/**
 * Test-data detection.
 *
 * AA's team runs the contract builder + BoldSign flow with mock leads (e.g.
 * "TEST TEST") to validate plumbing. Those test leads then leak into Zoho
 * via the BoldSign webhook (which creates a Doctors on Board record on
 * signing) and pollute production conversion metrics.
 *
 * This module provides a single source of truth for "is this row test data".
 * Applied at the data-ingest boundary in `useZohoData` so every downstream
 * metric (Marketing, Finance, Dashboard, etc.) gets the filter for free.
 *
 * The patterns are intentionally conservative — we only flag rows where the
 * test signal is unambiguous. If a real lead is named "Test" we don't want
 * to silently drop them. The patterns are:
 *
 *   1. Both First_Name AND Last_Name equal "TEST" (case-insensitive)
 *   2. Full_Name matches /^test\s+test$/i
 *   3. Email starts with "test" or "test+" before the @
 *
 * To add more patterns (e.g. specific internal emails), extend the helpers
 * here rather than scattering filters across hooks.
 */

interface NameLikeRow {
  First_Name?: string | null;
  Last_Name?:  string | null;
  Full_Name?:  string | null;
  Email?:      string | null;
}

const NAME_RE = /^test$/i;
const FULL_RE = /^test\s+test$/i;
const EMAIL_RE = /^test(?:[+.\-_]\w*)?@/i;

export function isTestRow(row: NameLikeRow): boolean {
  const first = (row.First_Name ?? "").trim();
  const last  = (row.Last_Name ?? "").trim();
  if (NAME_RE.test(first) && NAME_RE.test(last)) return true;

  const full = (row.Full_Name ?? "").trim();
  if (FULL_RE.test(full)) return true;

  const email = (row.Email ?? "").trim();
  if (email && EMAIL_RE.test(email)) return true;

  return false;
}

/** Convenience filter — returns the input array with test rows removed. */
export function stripTestRows<T extends NameLikeRow>(rows: T[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.filter(r => !isTestRow(r));
}

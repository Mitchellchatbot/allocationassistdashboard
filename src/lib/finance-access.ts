/**
 * Finance access allowlist.
 *
 * The Finance page exposes company-wide revenue, expenses, payroll and profit,
 * so access is locked to a HARD list of login emails — independent of the
 * normal role / allowed_pages system. Admins do NOT bypass this; only the
 * emails below can open /finance or see it in the sidebar.
 *
 * To grant or revoke access, edit this list (lowercase emails).
 */
export const FINANCE_ALLOWED_EMAILS = [
  "emilie@allocationassist.com",
  "dinithi@allocationassist.com",
  "admin@allocationassist.com",
];

const ALLOWED = new Set(FINANCE_ALLOWED_EMAILS.map(e => e.trim().toLowerCase()));

/** True only if this email is on the Finance allowlist. */
export function canSeeFinance(email: string | null | undefined): boolean {
  return !!email && ALLOWED.has(email.trim().toLowerCase());
}

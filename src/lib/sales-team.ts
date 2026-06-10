/**
 * The active sales team.
 *
 * Ammar 2026-06-10: "leave only Abraham, Asser and Asim on the Sales team
 * list, remove the rest of us." The Team Performance page used to list every
 * Zoho lead owner (which swept in Ammar, HI specialists, ex-reps, etc.); this
 * is the canonical short list of who actually belongs on the sales board.
 *
 * Matching to Zoho owners / weekly_sales rows is by FIRST NAME
 * (case-insensitive), the same convention the rest of the team-performance
 * code already uses, since Zoho owner display names carry surnames the
 * dashboard accounts don't.
 *
 * Source of truth lives here (small, slow-changing) — mirror the worker
 * accounts in worker_profiles_setup.sql + WORKER_EMAIL_TO_NAME if it changes.
 */
export interface SalesRep {
  name:      string;   // display fallback when no Zoho owner row is matched
  firstName: string;   // lowercase match key
  email?:    string;   // dashboard worker login (@sales.com)
}

export const SALES_TEAM: SalesRep[] = [
  { name: "Abraham", firstName: "abraham", email: "abraham@sales.com" },
  { name: "Asser",   firstName: "asser",   email: "asser@sales.com"   },
  { name: "Asim",    firstName: "asim",    email: "asim@sales.com"     },
];

const SALES_FIRST_NAMES = new Set(SALES_TEAM.map(r => r.firstName));

/** First word of a name, lowercased — the join key across Zoho owner names,
 *  weekly_sales member names, and the roster above. */
export function firstNameKey(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** True when a name (Zoho owner / weekly_sales member) belongs to the sales
 *  team. Used to filter the team-performance board down to the real reps. */
export function isSalesRepName(name: string | null | undefined): boolean {
  return SALES_FIRST_NAMES.has(firstNameKey(name));
}

const SALES_EMAILS = new Set(SALES_TEAM.map(r => (r.email ?? "").toLowerCase()).filter(Boolean));

/** True when a Fathom call host belongs to the sales team. Fathom hosts may
 *  use a work email (not the @sales.com dashboard login), so match on the
 *  display name's first word, the exact roster email, OR the first-name in
 *  the email local part (e.g. abraham@allocationassist.com). */
export function isSalesRepHost(name: string | null | undefined, email: string | null | undefined): boolean {
  if (isSalesRepName(name)) return true;
  const e = (email ?? "").toLowerCase().trim();
  if (!e) return false;
  if (SALES_EMAILS.has(e)) return true;
  const local = e.split("@")[0]?.split(/[._-]/)[0] ?? "";
  return SALES_FIRST_NAMES.has(local);
}

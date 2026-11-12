/**
 * Who may see which pages — the pure part of use-auth, kept free of the
 * Supabase client so it can be unit-tested.
 *
 * The user_profiles row is the source of truth. When there is none (or the
 * fetch failed on first load) we fall back by email, and that fallback is
 * deliberately restrictive: sales workers get /worker, HI team members get the
 * HI page set, and EVERYONE ELSE GETS NOTHING. It used to hand unknown emails
 * the admin page set — a fail-open that let any auth user without a profile
 * row see every tab.
 */
import { findHiAccessByEmail } from "@/lib/hi-team";

// Map short usernames → Supabase emails for convenient login
export const USERNAME_MAP: Record<string, string> = {
  admin:   "admin@allocationassist.com",
  worker:  "worker@allocationassist.com",
  worker2: "worker2@allocationassist.com",
};

// Worker email → full name as it appears in weekly_sales.member_name.
// Used as a fallback so the worker portal can still match performance rows
// when the user_profiles fetch times out or fails.
export const WORKER_EMAIL_TO_NAME: Record<string, string> = {
  "abraham@sales.com": "Abraham",
  "ahmed@sales.com":   "Ahmed",
  "asser@sales.com":   "Asser",
  "mohamed@sales.com": "Mohamed Othaman",
  "peter@sales.com":   "Peter",
  "sohaila@sales.com": "Sohaila",
  "sumia@sales.com":   "Sumia",
};

// All pages that exist in the app (used for admin fallback)
// /doctors is the unified shell — the old /leads-pipeline, /doctor-profiles
// and /wp-candidates URLs redirect into it, so they don't need their own
// entry in the access list. Anyone who can see "doctors" sees all three tabs.
export const ALL_PAGES = ["/", "/my-workspace", "/sales", "/marketing", "/doctors", "/team", "/finance", "/meta-ads", "/settings", "/worker", "/calls", "/chatbot", "/follow-ups", "/sends", "/automations", "/information", "/vacancies", "/reports", "/batches", "/profile-sent", "/import-bulk", "/connections", "/forms", "/feedback"];

// Hospital Introduction team page set. They land on /my-workspace and
// only see the surfaces that matter for moving doctors through the
// pipeline. Marketing/Sales/Finance/Admin tabs are hidden.
export const HI_MEMBER_PAGES = [
  "/",
  "/my-workspace",
  "/sends",
  // Legacy send routes kept so old bookmarks/deep-links still pass the page
  // gate and redirect into /sends (they now resolve to tabs on that page).
  "/automations",
  "/information",
  "/doctors",
  "/vacancies",
  "/profile-sent",
  "/batches",
  "/reports",
  "/forms",
];

// Role presets — selected in the Add User dialog
export const ROLE_PRESETS: Record<string, string[]> = {
  admin:     ALL_PAGES,
  // /settings included in every non-worker preset so users can manage
  // their own Slack handle + notification preferences. The page itself
  // hides admin-only tabs (Users, organization-level Slack webhook
  // test) when role !== "admin".
  sales:     ["/", "/sales", "/marketing", "/doctors", "/team", "/calls", "/chatbot", "/settings"],
  finance:   ["/", "/finance", "/settings"],
  worker:    ["/worker"],
  hi_member: [...HI_MEMBER_PAGES, "/settings"],
};

/** Role given to a signed-in user we can't place. Sees only /no-access. */
export const NO_ACCESS_ROLE = "none";
export const NO_ACCESS_PATH = "/no-access";

export interface Access {
  role: string;
  allowedPages: string[];
  fullName: string | null;
}

export interface ProfileRow {
  role: string;
  allowed_pages: string[] | null;
  full_name: string | null;
}

const lower = (email: string | null | undefined) => (email ?? "").toLowerCase().trim();

/** Logins on the made-up @sales.com domain — no inbox behind them. */
export function isSalesWorkerEmail(email: string | null | undefined): boolean {
  return lower(email).endsWith("@sales.com");
}

/** Access for a user with no user_profiles row. Never grants admin. */
export function accessFromEmail(email: string | null | undefined): Access {
  const e = lower(email);
  if (isSalesWorkerEmail(e)) {
    return { role: "worker", allowedPages: ["/worker"], fullName: WORKER_EMAIL_TO_NAME[e] ?? e.split("@")[0] };
  }
  const hi = findHiAccessByEmail(e);
  if (hi) return { role: "hi_member", allowedPages: HI_MEMBER_PAGES, fullName: hi.name };
  return { role: NO_ACCESS_ROLE, allowedPages: [], fullName: null };
}

/**
 * What a profile fetch resolves to. A row always wins. With no row, keep the
 * last good profile if we have one — a null on a re-fetch (token refresh, tab
 * focus) is almost always the timeout, not a deleted row, and must never
 * change what the user can see. Only on first load fall back by email.
 */
export function resolveFetchedAccess(args: {
  email: string | null | undefined;
  row: ProfileRow | null;
  cached: Access | null;
}): Access {
  const { email, row, cached } = args;
  if (row) return { role: row.role, allowedPages: row.allowed_pages ?? [], fullName: row.full_name ?? null };
  if (cached) return cached;
  return accessFromEmail(email);
}

export function hasAnyAccess(a: Pick<Access, "role" | "allowedPages">): boolean {
  return a.role === "admin" || a.allowedPages.length > 0;
}

/** Where to send a user right after sign-in. */
export function landingFor(a: Pick<Access, "role" | "allowedPages">): string {
  if (a.role === "admin") return "/";
  if (!hasAnyAccess(a)) return NO_ACCESS_PATH;
  if (a.role === "hi_member") return "/my-workspace";
  return a.allowedPages[0];
}

/** The login box takes a short username or an email. */
export function resolveLoginEmail(usernameOrEmail: string): string {
  const v = usernameOrEmail.trim();
  return USERNAME_MAP[v.toLowerCase()] ?? v;
}

/** Can this login get a reset link by email? Not if nobody reads the inbox. */
export function canSelfReset(email: string): boolean {
  return !isSalesWorkerEmail(email);
}

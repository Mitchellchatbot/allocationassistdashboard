/**
 * Reading the links in Supabase's reset-password and invite emails.
 *
 * The email templates (supabase/templates/) point at
 *   /auth/confirm?token_hash=…&type=recovery|invite
 * which the page exchanges for a session with verifyOtp. That works in any
 * browser — unlike PKCE links, which only work in the browser that asked for
 * them, and an invite is asked for by the admin, not the invitee.
 *
 * When Supabase rejects a link before it reaches us it redirects with the
 * error in the hash (#error=…&error_code=otp_expired).
 */
export type ConfirmType = "recovery" | "invite";

export type ConfirmLink =
  | { kind: "ok"; tokenHash: string; type: ConfirmType }
  | { kind: "expired" }
  | { kind: "invalid" };

const TYPES: ConfirmType[] = ["recovery", "invite"];

export function parseConfirmLink(search: string, hash: string): ConfirmLink {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  if (h.get("error") || h.get("error_code")) {
    return h.get("error_code") === "otp_expired" ? { kind: "expired" } : { kind: "invalid" };
  }
  const q = new URLSearchParams(search);
  const tokenHash = q.get("token_hash");
  const type = q.get("type") as ConfirmType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return { kind: "invalid" };
  return { kind: "ok", tokenHash, type };
}

/** Where the reset / invite emails send people. Must be in Supabase's redirect allow-list. */
export function confirmUrl(origin: string = window.location.origin): string {
  return `${origin}/auth/confirm`;
}

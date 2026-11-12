/**
 * One password rule for every form that sets one (reset, invite, change,
 * admin "set password"). Keep MIN_PASSWORD_LENGTH in step with the minimum
 * configured in Supabase → Authentication → Policies, which is what actually
 * enforces it server-side.
 */
export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message to show, or null when the password is fine. */
export function validatePassword(password: string, confirm?: string): string | null {
  if (password.trim().length === 0) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (confirm !== undefined && confirm !== password) return "The two passwords don't match.";
  return null;
}

// No look-alikes (0/O, 1/l/I) — these get read out over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** A random password for an admin to hand to someone. */
export function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

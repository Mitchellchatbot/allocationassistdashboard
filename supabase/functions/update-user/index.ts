/**
 * update-user — Supabase Edge Function
 *
 * Changes an existing user's access (role, page list, full name) and/or sets
 * a new password for them. Admin only.
 *
 * The password path is for logins that can't get a reset email (@sales.com)
 * or for an admin helping someone who's locked out. Everyone with a real
 * inbox can also be sent a reset link from the dashboard instead.
 *
 * Profile fields are upserted (not updated) so a user without a profile row
 * still gets one — but only when at least one profile field was sent, so a
 * password-only call never writes a half-empty row.
 *
 * POST body: { userId, email?, role?, allowed_pages?, full_name?, password? }
 * Returns:   { ok: true } | { error: string }
 */

import { adminClient, json, preflight, requireAdmin } from '../_shared/admin-auth.ts';

const MIN_PASSWORD_LENGTH = 10; // keep in step with src/lib/password-policy.ts

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { caller } = auth;

  let body: {
    userId?: string;
    email?: string;
    role?: string;
    allowed_pages?: string[];
    full_name?: string | null;
    password?: string;
  } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { userId, email, role, allowed_pages, full_name, password } = body;

  if (!userId) {
    return json({ error: 'userId is required' }, 400);
  }

  // Guard against self-lockout: an admin can't strip their own admin role
  // (otherwise they'd lose access to this very screen and can't undo it).
  if (userId === caller.id && role && role !== 'admin') {
    return json({ error: "You can't remove your own admin access." }, 400);
  }

  if (password !== undefined) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
    }
    const { error: pwErr } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (pwErr) return json({ error: pwErr.message }, 500);
  }

  const patch: Record<string, unknown> = {};
  if (email !== undefined)         patch.email         = email;
  if (role !== undefined)          patch.role          = role;
  if (allowed_pages !== undefined) patch.allowed_pages = allowed_pages;
  if (full_name !== undefined)     patch.full_name     = full_name;

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await adminClient
      .from('user_profiles')
      .upsert({ id: userId, ...patch }, { onConflict: 'id' });
    if (upErr) return json({ error: upErr.message }, 500);
  }

  return json({ ok: true });
});

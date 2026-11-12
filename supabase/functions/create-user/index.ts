/**
 * create-user — Supabase Edge Function
 *
 * Creates a Supabase Auth user and inserts a user_profiles row. Admin only.
 *
 * Two ways in:
 *   - No password  → invite. Supabase emails the person a link
 *                    (supabase/templates/invite.html) and they choose their
 *                    own password on /set-password.
 *   - password set → the admin chose it. For logins with no inbox
 *                    (@sales.com), where an invite could never arrive.
 *
 * POST body: { email, password?, redirect_to?, full_name?, role, allowed_pages: string[] }
 * Returns:   { ok: true, userId, invited: boolean } | { error: string }
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
    email?: string;
    password?: string;
    redirect_to?: string;
    full_name?: string;
    role?: string;
    allowed_pages?: string[];
  } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const email = body.email?.trim().toLowerCase();
  const { password, redirect_to, full_name, role, allowed_pages } = body;

  if (!email || !role) {
    return json({ error: 'email and role are required' }, 400);
  }
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }
  if (!password && email.endsWith('@sales.com')) {
    return json({ error: '@sales.com logins have no inbox — set a password instead of inviting' }, 400);
  }

  // Create the auth user — by invite email, or with the admin's password.
  const { data: created, error: createErr } = password
    ? await adminClient.auth.admin.createUser({ email, password, email_confirm: true })
    : await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirect_to,
        data: { full_name: full_name ?? null },
      });

  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? 'Failed to create user' }, 500);
  }

  const { error: profileErr } = await adminClient
    .from('user_profiles')
    .insert({
      id:            created.user.id,
      email,
      full_name:     full_name ?? null,
      role,
      allowed_pages: allowed_pages ?? [],
      created_by:    caller.id,
    });

  if (profileErr) {
    // Roll back the auth user so a retry starts clean.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: profileErr.message }, 500);
  }

  return json({ ok: true, userId: created.user.id, invited: !password });
});

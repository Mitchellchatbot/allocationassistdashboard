/**
 * delete-user — Supabase Edge Function
 *
 * Deletes a Supabase Auth user (and cascades to user_profiles).
 * Admin-only.
 *
 * POST body: { userId: string }
 */

import { adminClient, json, preflight, requireAdmin } from '../_shared/admin-auth.ts';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { caller } = auth;

  let userId: string | undefined;
  try { ({ userId } = await req.json()); } catch { /* ignore */ }
  if (!userId) return json({ error: 'userId required' }, 400);

  // Prevent self-deletion
  if (userId === caller.id) return json({ error: 'Cannot delete your own account' }, 400);

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});

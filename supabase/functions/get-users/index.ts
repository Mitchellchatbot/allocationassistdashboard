/**
 * get-users — Supabase Edge Function
 * Returns all user_profiles rows. Admin-only.
 * Uses service role to bypass RLS (avoids self-referential policy recursion).
 */

import { adminClient, json, preflight, requireAdmin } from '../_shared/admin-auth.ts';

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { data, error } = await adminClient
    .from('user_profiles')
    .select('id, email, full_name, role, allowed_pages, created_at')
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ users: data });
});

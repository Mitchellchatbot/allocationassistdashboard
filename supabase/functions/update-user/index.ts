/**
 * update-user — Supabase Edge Function
 *
 * Updates an existing user's role + page access (and optional full_name) in
 * user_profiles. Lets an admin change who has access to what AFTER the user
 * was created — the create-user companion that was missing.
 *
 * Requires the caller to be an admin (same check as create-user). Upserts so
 * it also works for users that don't have a profile row yet (e.g. seeded /
 * email-pattern accounts).
 *
 * POST body: { userId, email, role?, allowed_pages?, full_name? }
 * Returns:   { ok: true } | { error: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // Verify the calling user is an admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerJwt  = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: callerErr } =
    await adminClient.auth.getUser(callerJwt);

  if (callerErr || !caller) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: callerProfile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  const isAdmin =
    callerProfile?.role === 'admin' ||
    caller.email === 'admin@allocationassist.com';

  if (!isAdmin) {
    return json({ error: 'Forbidden — admin only' }, 403);
  }

  // Parse body
  let body: {
    userId?: string;
    email?: string;
    role?: string;
    allowed_pages?: string[];
    full_name?: string | null;
  } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { userId, email, role, allowed_pages, full_name } = body;

  if (!userId) {
    return json({ error: 'userId is required' }, 400);
  }

  // Guard against self-lockout: an admin can't strip their own admin role
  // (otherwise they'd lose access to this very screen and can't undo it).
  if (userId === caller.id && role && role !== 'admin') {
    return json({ error: "You can't remove your own admin access." }, 400);
  }

  // Upsert the profile — only the fields that were sent. Upsert (not update)
  // so a user without a profile row still gets one.
  const patch: Record<string, unknown> = { id: userId };
  if (email !== undefined)         patch.email         = email;
  if (role !== undefined)          patch.role          = role;
  if (allowed_pages !== undefined) patch.allowed_pages = allowed_pages;
  if (full_name !== undefined)     patch.full_name     = full_name;

  const { error: upErr } = await adminClient
    .from('user_profiles')
    .upsert(patch, { onConflict: 'id' });

  if (upErr) {
    return json({ error: upErr.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * create-user — Supabase Edge Function
 *
 * Creates a Supabase Auth user and inserts a user_profiles row.
 * Requires the caller to be an admin (checked via user_profiles table).
 *
 * POST body: { email, password, full_name?, role, allowed_pages: string[] }
 * Returns:   { ok: true, userId } | { error: string }
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

  // Allow if caller is the legacy admin email OR has admin role in DB
  const isAdmin =
    callerProfile?.role === 'admin' ||
    caller.email === 'admin@allocationassist.com';

  if (!isAdmin) {
    return json({ error: 'Forbidden — admin only' }, 403);
  }

  // Parse body
  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    role?: string;
    allowed_pages?: string[];
  } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const { email, password, full_name, role, allowed_pages } = body;

  if (!email || !password || !role) {
    return json({ error: 'email, password and role are required' }, 400);
  }

  // Create auth user
  const { data: newUser, error: createErr } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // skip confirmation email
    });

  if (createErr || !newUser.user) {
    return json({ error: createErr?.message ?? 'Failed to create user' }, 500);
  }

  // Insert profile
  const { error: profileErr } = await adminClient
    .from('user_profiles')
    .insert({
      id:            newUser.user.id,
      email,
      full_name:     full_name ?? null,
      role,
      allowed_pages: allowed_pages ?? [],
      created_by:    caller.id,
    });

  if (profileErr) {
    // Roll back auth user if profile insert fails
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return json({ error: profileErr.message }, 500);
  }

  return json({ ok: true, userId: newUser.user.id });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

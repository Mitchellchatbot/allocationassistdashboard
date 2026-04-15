/**
 * delete-user — Supabase Edge Function
 *
 * Deletes a Supabase Auth user (and cascades to user_profiles).
 * Admin-only.
 *
 * POST body: { userId: string }
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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user: caller } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!caller) return json({ error: 'Unauthorized' }, 401);

  const { data: callerProfile } = await adminClient
    .from('user_profiles').select('role').eq('id', caller.id).single();

  const isAdmin = callerProfile?.role === 'admin' || caller.email === 'admin@allocationassist.com';
  if (!isAdmin) return json({ error: 'Forbidden' }, 403);

  const { userId } = await req.json();
  if (!userId) return json({ error: 'userId required' }, 400);

  // Prevent self-deletion
  if (userId === caller.id) return json({ error: 'Cannot delete your own account' }, 400);

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

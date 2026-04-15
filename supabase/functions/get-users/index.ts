/**
 * get-users — Supabase Edge Function
 * Returns all user_profiles rows. Admin-only.
 * Uses service role to bypass RLS (avoids self-referential policy recursion).
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

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user: caller } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!caller) return json({ error: 'Unauthorized' }, 401);

  // Check if caller is admin
  const { data: profile } = await adminClient
    .from('user_profiles').select('role').eq('id', caller.id).maybeSingle();

  const isAdmin = profile?.role === 'admin' || caller.email === 'admin@allocationassist.com';
  if (!isAdmin) return json({ error: 'Forbidden' }, 403);

  const { data, error } = await adminClient
    .from('user_profiles')
    .select('id, email, full_name, role, allowed_pages, created_at')
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ users: data });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

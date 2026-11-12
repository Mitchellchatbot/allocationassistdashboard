/**
 * Shared plumbing for the admin-only user-management functions
 * (create-user, update-user, delete-user, get-users): CORS, JSON responses,
 * the service-role client, and the "is the caller an admin?" check that each
 * of them used to copy-paste.
 *
 * The admin@allocationassist.com bypass is the legacy bootstrap account. It
 * stays until migration 20261112000000_backfill_user_profiles.sql (which gives
 * it an admin row) has run in production; after that, delete
 * LEGACY_ADMIN_EMAIL and rely on the row alone.
 */
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LEGACY_ADMIN_EMAIL = 'admin@allocationassist.com';

export const adminClient: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Answers the CORS preflight and rejects anything but POST. Null = carry on. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });
  return null;
}

/**
 * Resolves the caller from the bearer token and checks they're an admin.
 * Returns the caller, or the 401/403 Response to send back.
 */
export async function requireAdmin(req: Request): Promise<{ caller: User } | Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user: caller }, error } = await adminClient.auth.getUser(jwt);
  if (error || !caller) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin' || caller.email === LEGACY_ADMIN_EMAIL;
  if (!isAdmin) return json({ error: 'Forbidden — admin only' }, 403);

  return { caller };
}

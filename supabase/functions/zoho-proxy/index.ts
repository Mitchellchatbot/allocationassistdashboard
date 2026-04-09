/**
 * Zoho Proxy — Supabase Edge Function
 *
 * Token caching strategy:
 *  1. Check in-memory cache (fast, same instance)
 *  2. Check zoho_tokens table in Supabase (shared across all instances)
 *  3. Only call Zoho's token endpoint if both caches are stale
 *
 * This prevents the "too many requests" error that occurs when many
 * edge function instances all try to refresh the token simultaneously.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID     = Deno.env.get('ZOHO_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!;
const REFRESH_TOKEN = Deno.env.get('ZOHO_REFRESH_TOKEN')!;
const API_DOMAIN    = 'https://www.zohoapis.com';

// Built-in Supabase edge function env vars — no need to set as secrets
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// In-memory cache (lives for this instance's lifetime)
let _token: string | null = null;
let _expiresAt = 0;

async function getAccessToken(): Promise<string> {
  // 1. In-memory hit
  if (_token && Date.now() < _expiresAt) return _token;

  // 2. Supabase shared cache
  const { data } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .single();

  if (data && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
    _token     = data.access_token;
    _expiresAt = new Date(data.expires_at).getTime();
    return _token!;
  }

  // 3. Refresh from Zoho (only when truly expired)
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });

  const tokenData = await res.json();
  if (!tokenData.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(tokenData)}`);
  }

  const expiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 3600) - 120) * 1000);

  // Update both caches
  _token     = tokenData.access_token as string;
  _expiresAt = expiresAt.getTime();

  await supabase.from('zoho_tokens').upsert({
    id:           1,
    access_token: tokenData.access_token,
    expires_at:   expiresAt.toISOString(),
  });

  return _token;
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const url    = new URL(req.url);
    const module = url.searchParams.get('module');
    const action = url.searchParams.get('action');

    if (action === 'email-counts') {
      const ids   = (url.searchParams.get('lead_ids') ?? '').split(',').filter(Boolean).slice(0, 30);
      const token = await getAccessToken();

      let total = 0;
      const bySender: Record<string, number> = {};

      for (const id of ids) {
        try {
          const r = await fetch(`${API_DOMAIN}/crm/v2/Leads/${id}/Emails`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });
          if (r.ok) {
            const d = await r.json() as { email_related_list?: Array<{ owner?: { name?: string } }> };
            const emails = d.email_related_list ?? [];
            total += emails.length;
            for (const e of emails) {
              const name = e.owner?.name ?? 'Unknown';
              bySender[name] = (bySender[name] ?? 0) + 1;
            }
          }
        } catch { /* skip failed individual lead */ }
      }

      return new Response(
        JSON.stringify({ total, bySender, sampled: ids.length }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    if (!module) {
      return new Response(
        JSON.stringify({ error: '?module= is required (e.g. Leads, Deals)' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const zohoUrl = new URL(`${API_DOMAIN}/crm/v2/${module}`);
    url.searchParams.forEach((v, k) => {
      if (k !== 'module') zohoUrl.searchParams.set(k, v);
    });

    const token   = await getAccessToken();
    const zohoRes = await fetch(zohoUrl.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    const body = await zohoRes.text();

    return new Response(body, {
      status: zohoRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[zoho-proxy]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

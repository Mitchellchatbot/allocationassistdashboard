/**
 * Zoho Proxy — Supabase Edge Function
 *
 * Runs server-side (Deno). Stores Zoho credentials as Supabase secrets
 * so they are never exposed to the browser. Handles token refresh
 * automatically — tokens are cached in memory for the function instance
 * lifetime.
 *
 * Usage from frontend:
 *   GET /functions/v1/zoho-proxy?module=Leads&fields=Full_Name,Lead_Status&page=1&per_page=200
 *   GET /functions/v1/zoho-proxy?module=Deals&fields=Stage,Amount,Owner&page=1&per_page=200
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Secrets set via: supabase secrets set ZOHO_CLIENT_ID=... etc.
const CLIENT_ID     = Deno.env.get('ZOHO_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!;
const REFRESH_TOKEN = Deno.env.get('ZOHO_REFRESH_TOKEN')!;
const API_DOMAIN    = 'https://www.zohoapis.com';

// In-memory token cache (lives for the duration of the function instance)
let _token: string | null = null;
let _expiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _expiresAt) return _token;

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

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);
  }

  _token     = data.access_token as string;
  _expiresAt = Date.now() + ((data.expires_in ?? 3600) - 120) * 1000;
  return _token;
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const url    = new URL(req.url);
    const module = url.searchParams.get('module');
    const action = url.searchParams.get('action');

    // ── Special action: count emails for a batch of lead IDs server-side ──
    // Called as: ?action=email-counts&lead_ids=id1,id2,...
    // Runs all Zoho calls inside this single edge-function invocation so the
    // token is cached and the browser only makes one request.
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

    // Build Zoho URL — pass through all params except 'module'
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

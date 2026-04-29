/**
 * zoho-sync — Supabase Edge Function
 *
 * Fetches all data from Zoho CRM and stores it in the zoho_cache table.
 * Call this once to populate, then have n8n trigger it hourly.
 *
 * Secrets required (same as zoho-proxy):
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID     = Deno.env.get('ZOHO_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!;
const REFRESH_TOKEN = Deno.env.get('ZOHO_REFRESH_TOKEN')!;
const API_DOMAIN    = 'https://www.zohoapis.com';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
  const { data } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .single();

  if (data && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
    return data.access_token;
  }

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

  const tok = await res.json();
  if (!tok.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(tok)}`);

  const expiresAt = new Date(Date.now() + ((tok.expires_in ?? 3600) - 120) * 1000);
  await supabase.from('zoho_tokens').upsert({ id: 1, access_token: tok.access_token, expires_at: expiresAt.toISOString() });
  return tok.access_token;
}

/**
 * Fetches all pages of a Zoho module in parallel batches.
 * batchSize concurrent requests per round — fast but stays within Zoho rate limits.
 */
async function fetchAllPages<T>(
  token: string,
  module: string,
  fields: string[],
  maxPages = 200,
  batchSize = 5,   // 5 concurrent page-fetches per module — stays well under Zoho's
                   // ~10 concurrent connections / 100 calls-per-minute cap.
): Promise<T[]> {
  const all: T[] = [];

  for (let startPage = 1; startPage <= maxPages; startPage += batchSize) {
    const pages = Array.from(
      { length: Math.min(batchSize, maxPages - startPage + 1) },
      (_, i) => startPage + i,
    );

    const results = await Promise.all(
      pages.map(async (p) => {
        const url = new URL(`${API_DOMAIN}/crm/v2/${module}`);
        url.searchParams.set('fields', fields.join(','));
        url.searchParams.set('per_page', '200');
        url.searchParams.set('page', String(p));

        // Retry once on 429 (rate-limited) with a short backoff. Zoho returns
        // 429 sporadically even within rate limits when bursts overlap.
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });
          if (res.status === 429) {
            const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
            console.warn(`[zoho-sync] ${module} page ${p} 429 — retry ${attempt + 1} in ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          if (res.status === 204) return null;
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[zoho-sync] ${module} page ${p} → HTTP ${res.status}: ${body.slice(0, 300)}`);
            return null;
          }
          const text = await res.text();
          if (!text) return null;
          return JSON.parse(text) as { data?: T[]; info?: { more_records: boolean } };
        }
        console.warn(`[zoho-sync] ${module} page ${p} — gave up after 3 retries on 429`);
        return null;
      }),
    );

    let done = false;
    for (const json of results) {
      if (!json?.data?.length) { done = true; break; }
      all.push(...json.data);
      if (!json.info?.more_records) { done = true; break; }
    }
    if (done) break;
  }

  return all;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const token = await getAccessToken();

    // Dump every module API name in this Zoho org (including custom modules)
    // so we can find the right name for "Doctors on Board". One-time noise in
    // the logs, but invaluable when guessing-by-name fails.
    try {
      const modulesRes = await fetch(`${API_DOMAIN}/crm/v2/settings/modules`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const modulesJson = await modulesRes.json();
      const moduleList = (modulesJson?.modules ?? []).map((m: { api_name: string; module_name: string; plural_label: string }) => ({
        api_name: m.api_name,
        plural:   m.plural_label,
      }));
      console.log('[zoho-sync] available modules:', JSON.stringify(moduleList));
    } catch (e) {
      console.warn('[zoho-sync] could not list modules:', e);
    }

    // Leads — paginated in parallel batches of 5, up to 200 pages (40 000 leads)
    // Email/Phone/Mobile drive the cross-reference between meta_leads (form
    // submissions) and Zoho. Without these fields the qualified-count
    // reconciliation silently returns zero.
    const leads = await fetchAllPages(token, 'Leads', [
      'Full_Name', 'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile',
      'Lead_Status', 'Lead_Source',
      'Owner', 'Specialty', 'Specialty_New', 'Country_of_Specialty_training',
      'Created_Time', 'Has_DOH', 'Has_DHA', 'Has_MOH', 'License',
      'Recruiter', 'Age', 'Prime_Classification',
    ]);

    // Run remaining modules SEQUENTIALLY (was Promise.all). Zoho rate-limits
    // to ~10 concurrent connections / 100 calls per minute per user — running
    // 5 modules in parallel with batchSize 20 gave us ~100 concurrent requests
    // and triggered widespread 429s. Sequential is slower (~30-60s extra) but
    // every module actually returns data.
    const deals    = await fetchAllPages(token, 'Deals',
      ['Deal_Name', 'Stage', 'Amount', 'Owner', 'Closing_Date', 'Lead_Source', 'Created_Time'], 50)
      .catch((err) => { console.warn('[zoho-sync] Deals failed:', err); return []; });

    const calls    = await fetchAllPages(token, 'Calls',
      ['Subject', 'Call_Type', 'Call_Status', 'Owner', 'Created_Time'], 100)
      .catch((err) => { console.warn('[zoho-sync] Calls failed:', err); return []; });

    const accounts = await fetchAllPages(token, 'Accounts',
      ['Account_Name', 'Industry', 'Owner'], 25)
      .catch(() => []);

    const campaigns = await fetchAllPages(token, 'Campaigns',
      ['Campaign_Name', 'Type', 'Status', 'Start_Date', 'End_Date', 'Budgeted_Cost', 'Actual_Cost', 'Owner'], 10)
      .catch(() => []);

    // "Doctors on Board" — Zoho api_name is "Contacts" (org renamed the module).
    // Includes Email/Phone/Mobile so we can cross-reference DoB rows back to
    // meta_leads (form submissions) and Zoho leads — which gives us a much
    // stronger Meta attribution path than Lead_Source alone (most DoB rows
    // have no Lead_Source set).
    //
    // FALLBACK: This org renamed the Contacts module and the custom layout
    // may not expose Email/Phone/Mobile to the API user. If the full field
    // list returns zero rows, retry with the minimal set that worked before.
    const DOB_FULL_FIELDS = ['Full_Name', 'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile',
      'Owner', 'Account_Name', 'Created_Time', 'Modified_Time', 'Lead_Source'];
    const DOB_MINIMAL_FIELDS = ['Full_Name', 'First_Name', 'Last_Name',
      'Owner', 'Account_Name', 'Created_Time', 'Modified_Time', 'Lead_Source'];
    let doctorsOnBoard = await fetchAllPages(token, 'Contacts', DOB_FULL_FIELDS, 50)
      .catch((err) => { console.warn('[zoho-sync] Contacts (DoB) full fields failed:', err); return []; });
    if (doctorsOnBoard.length === 0) {
      console.warn('[zoho-sync] DoB returned 0 rows with full fields — retrying with minimal field set');
      doctorsOnBoard = await fetchAllPages(token, 'Contacts', DOB_MINIMAL_FIELDS, 50)
        .catch((err) => { console.warn('[zoho-sync] Contacts (DoB) minimal fields failed:', err); return []; });
      console.log(`[zoho-sync] DoB minimal fetch returned ${doctorsOnBoard.length} rows`);
    }

    // Log every per-module count so we can see at a glance what's loading.
    console.log(`[zoho-sync] counts → leads:${leads.length} deals:${deals.length} calls:${calls.length} accounts:${accounts.length} campaigns:${campaigns.length} doctorsOnBoard:${doctorsOnBoard.length}`);
    if (doctorsOnBoard.length > 0) {
      // Show the first row's keys so we know what fields Zoho actually returned
      // — this tells us the right names for Specialty, Specialty_Details, etc.
      console.log('[zoho-sync] doctorsOnBoard sample keys:', Object.keys(doctorsOnBoard[0] as object));
    }

    // Split the cache into two rows to keep each upsert under Postgres'
    // statement-timeout limit. Row 1 = leads (the big one — ~26K records with
    // ~20 fields each). Row 2 = everything else (deals, calls, accounts,
    // campaigns, doctorsOnBoard). The dashboard reads both rows on load.
    const syncedAt = new Date().toISOString();
    const r1 = await supabase.from('zoho_cache').upsert({
      id: 1, data: { leads }, synced_at: syncedAt,
    });
    if (r1.error) throw r1.error;

    const r2 = await supabase.from('zoho_cache').upsert({
      id: 2, data: { deals, calls, accounts, campaigns, doctorsOnBoard }, synced_at: syncedAt,
    });
    if (r2.error) throw r2.error;

    return new Response(JSON.stringify({
      ok: true,
      leads: leads.length, deals: deals.length, calls: calls.length,
      accounts: accounts.length, campaigns: campaigns.length,
      doctorsOnBoard: doctorsOnBoard.length,
      synced_at: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[zoho-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

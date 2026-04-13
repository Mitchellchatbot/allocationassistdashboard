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
  batchSize = 5,
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
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });
        if (!res.ok || res.status === 204) return null;
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text) as { data?: T[]; info?: { more_records: boolean } };
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

    // Leads — paginated in parallel batches of 5, up to 200 pages (40 000 leads)
    const leads = await fetchAllPages(token, 'Leads', [
      'Full_Name', 'First_Name', 'Last_Name', 'Lead_Status', 'Lead_Source',
      'Owner', 'Specialty', 'Specialty_New', 'Country_of_Specialty_training',
      'Created_Time', 'Has_DOH', 'Has_DHA', 'Has_MOH', 'License',
      'Recruiter', 'Age', 'Prime_Classification',
    ]);

    // Rest in parallel (smaller modules — sequential batches are fine)
    const [deals, calls, accounts, campaigns] = await Promise.all([
      fetchAllPages(token, 'Deals',     ['Deal_Name', 'Stage', 'Amount', 'Owner', 'Closing_Date', 'Lead_Source', 'Created_Time'], 50),
      fetchAllPages(token, 'Calls',     ['Subject', 'Call_Type', 'Call_Status', 'Owner', 'Created_Time'], 100),
      fetchAllPages(token, 'Accounts',  ['Account_Name', 'Industry', 'Owner'], 25).catch(() => []),
      fetchAllPages(token, 'Campaigns', ['Campaign_Name', 'Type', 'Status', 'Start_Date', 'End_Date', 'Budgeted_Cost', 'Actual_Cost', 'Owner'], 10).catch(() => []),
    ]);

    const { error } = await supabase.from('zoho_cache').upsert({
      id:        1,
      data:      { leads, deals, calls, accounts, campaigns },
      synced_at: new Date().toISOString(),
    });

    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      leads: leads.length, deals: deals.length, calls: calls.length,
      accounts: accounts.length, campaigns: campaigns.length,
      synced_at: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[zoho-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

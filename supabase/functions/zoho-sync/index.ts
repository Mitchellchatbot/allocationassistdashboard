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
          if (res.status === 204) return null;             // legit end of data
          if (!res.ok) {
            // A real error mid-walk would silently truncate the dataset (e.g.
            // 26k leads → 200) and overwrite the cache with partial data. Throw
            // so the whole sync aborts and the last COMPLETE cache is kept; the
            // next run retries.
            const body = await res.text().catch(() => '');
            throw new Error(`[zoho-sync] ${module} page ${p} HTTP ${res.status}: ${body.slice(0, 200)}`);
          }
          const text = await res.text();
          if (!text) return null;
          return JSON.parse(text) as { data?: T[]; info?: { more_records: boolean } };
        }
        throw new Error(`[zoho-sync] ${module} page ${p} rate-limited after 3 retries — aborting to avoid truncated data`);
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

/**
 * Latest Zoho note per lead, for the Sales-tracker "contacted" rule. Walks the
 * Notes module newest-first and records the FIRST note seen for each lead id
 * (= the latest), stopping once every lead is covered or maxPages is hit.
 *
 * Fully defensive: any error (Notes not enabled, sort unsupported, rate limit
 * exhausted) returns whatever was collected so far and NEVER throws, so the main
 * sync is unaffected. Note content is truncated — only enough to match a
 * call-outcome phrase.
 */
async function fetchLatestNoteByLead(
  token: string,
  leadIds: Set<string>,
  maxPages = 120,
): Promise<Record<string, { note: string; at: string }>> {
  const out: Record<string, { note: string; at: string }> = {};
  try {
    for (let p = 1; p <= maxPages; p++) {
      const url = new URL(`${API_DOMAIN}/crm/v2/Notes`);
      url.searchParams.set('fields', 'Note_Content,Created_Time,Parent_Id');
      url.searchParams.set('per_page', '200');
      url.searchParams.set('page', String(p));
      url.searchParams.set('sort_by', 'Created_Time');
      url.searchParams.set('sort_order', 'desc');

      let json: { data?: Array<Record<string, unknown>>; info?: { more_records?: boolean } } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(url.toString(), { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
        if (res.status === 429) { await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt))); continue; }
        if (res.status === 204) return out;                       // no more notes
        if (!res.ok) { console.warn(`[zoho-sync] Notes page ${p} HTTP ${res.status} — stopping notes walk`); return out; }
        const text = await res.text();
        json = text ? JSON.parse(text) : null;
        break;
      }
      const data = json?.data ?? [];
      if (data.length === 0) break;
      for (const n of data) {
        const parent = n?.Parent_Id;
        const pid = parent && typeof parent === 'object'
          ? (parent as { id?: string }).id
          : (typeof parent === 'string' ? parent : undefined);
        const id = pid ? String(pid) : '';
        if (!id || !leadIds.has(id) || out[id]) continue;        // first-seen (newest) wins
        out[id] = { note: String(n?.Note_Content ?? '').slice(0, 240), at: String(n?.Created_Time ?? '') };
      }
      if (Object.keys(out).length >= leadIds.size) break;        // every lead covered
      if (!json?.info?.more_records) break;
    }
  } catch (e) {
    console.warn('[zoho-sync] Notes walk failed (non-fatal):', e);
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const token = await getAccessToken();

    // ?debug=modules — return the full module list as JSON without doing
    // any actual sync work. Useful when wiring up a new custom module and
    // we need to know its api_name.
    const urlD = new URL(req.url);
    if (urlD.searchParams.get('debug') === 'modules') {
      const modulesRes = await fetch(`${API_DOMAIN}/crm/v2/settings/modules`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const modulesJson = await modulesRes.json();
      const moduleList = (modulesJson?.modules ?? []).map((m: { api_name: string; module_name: string; plural_label: string }) => ({
        api_name: m.api_name, plural: m.plural_label, module_name: m.module_name,
      }));
      return new Response(JSON.stringify({ modules: moduleList }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

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
      'Created_Time', 'Modified_Time', 'Has_DOH', 'Has_DHA', 'Has_MOH', 'License',
      'Recruiter', 'Age', 'Prime_Classification',
    ]);

    // Latest note per lead → powers the Sales-tracker "contacted" rule (a rep
    // who logs "no answer" without moving the status still counts as contacted).
    // Defensive: never throws, so a Notes failure can't break the lead sync.
    const leadIds = new Set(
      (leads as Array<{ id?: string }>).map(l => String(l.id ?? '')).filter(Boolean),
    );
    const leadNotes = await fetchLatestNoteByLead(token, leadIds);
    console.log(`[zoho-sync] leadNotes: ${Object.keys(leadNotes).length}/${leadIds.size} leads have a latest note`);

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
      ['Account_Name', 'Industry', 'Owner', 'Billing_City', 'Billing_State', 'Billing_Country', 'Phone', 'Website'], 25)
      .catch(() => []);

    // Hospital Contacts — custom related module. Despite the confusing
    // api_name (`Hospitals`), this is the *contacts list* (plural_label
    // "Hospital Contacts"); the actual hospitals live in Accounts. Each
    // contact has a `Hospital` lookup to the parent Account, a `Contact_Type`
    // (Primary/Secondary), Email, Name, Phone, Emirate.
    const hospitalContacts = await fetchAllPages(token, 'Hospitals',
      ['Name', 'Email', 'Phone', 'Contact_Type', 'Hospital', 'Emirate', 'Owner', 'Created_Time'], 25)
      .catch((err) => { console.warn('[zoho-sync] Hospital Contacts (module=Hospitals) failed:', err); return []; });
    console.log(`[zoho-sync] hospitalContacts: ${hospitalContacts.length} rows`);

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
    // Zoho's Contacts module uses British spelling — `Speciality`, NOT
    // `Specialty`. Probed via /Contacts?per_page=1: every row has
    // Speciality + Specialty_New + Country_of_Specialty_training set.
    const DOB_FULL_FIELDS = ['Full_Name', 'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile',
      'Owner', 'Account_Name', 'Created_Time', 'Modified_Time', 'Lead_Source',
      'Speciality', 'Specialty_New', 'Country_of_Specialty_training'];
    const DOB_MINIMAL_FIELDS = ['Full_Name', 'First_Name', 'Last_Name',
      'Owner', 'Account_Name', 'Created_Time', 'Modified_Time', 'Lead_Source',
      'Speciality', 'Specialty_New', 'Country_of_Specialty_training'];
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

    // Never overwrite a good cache with EMPTY critical data. Leads + Doctors on
    // Board are always non-zero for this org, so an empty result means the
    // fetch failed (the optional .catch(()=>[]) on the DoB fetch can mask a
    // transient error) — skip that row's upsert and keep the last good copy
    // rather than zeroing out the dashboard's leads/conversions.
    const skipped: string[] = [];

    if (leads.length > 0) {
      const r1 = await supabase.from('zoho_cache').upsert({ id: 1, data: { leads }, synced_at: syncedAt });
      if (r1.error) throw r1.error;
    } else {
      skipped.push('leads');
      console.warn('[zoho-sync] leads came back empty — preserving last good cache row 1');
    }

    if (doctorsOnBoard.length > 0) {
      // The secondary modules each fetch with .catch(()=>[]) so a transient
      // error on Deals/Calls/etc. would otherwise overwrite good cached data
      // with [] (zeroing revenue/activity). Fall back to the last-good cached
      // value for any module that came back empty.
      const { data: prev2 } = await supabase.from('zoho_cache').select('data').eq('id', 2).maybeSingle();
      const prev = (prev2?.data ?? {}) as Record<string, unknown[]>;
      const keep = (cur: unknown[], key: string) => (cur.length > 0 ? cur : (Array.isArray(prev[key]) ? prev[key] : cur));
      if (calls.length === 0 && Array.isArray(prev.calls) && prev.calls.length > 0) skipped.push('calls');
      if (deals.length === 0 && Array.isArray(prev.deals) && prev.deals.length > 0) skipped.push('deals');
      const r2 = await supabase.from('zoho_cache').upsert({
        id: 2,
        data: {
          deals:            keep(deals, 'deals'),
          calls:            keep(calls, 'calls'),
          accounts:         keep(accounts, 'accounts'),
          campaigns:        keep(campaigns, 'campaigns'),
          doctorsOnBoard,
          hospitalContacts: keep(hospitalContacts, 'hospitalContacts'),
          // Map of lead id → latest note. Preserve the last good copy if this
          // run's Notes walk came back empty (Notes API hiccup) so the
          // contacted rule doesn't flip back to status-only.
          leadNotes: Object.keys(leadNotes).length > 0
            ? leadNotes
            : (prev.leadNotes ?? leadNotes),
        },
        synced_at: syncedAt,
      });
      if (r2.error) throw r2.error;
    } else {
      skipped.push('doctorsOnBoard');
      console.warn('[zoho-sync] Doctors on Board came back empty — preserving last good cache row 2 (deals/DoB)');
    }

    return new Response(JSON.stringify({
      ok: true,
      leads: leads.length, deals: deals.length, calls: calls.length,
      accounts: accounts.length, campaigns: campaigns.length,
      doctorsOnBoard: doctorsOnBoard.length,
      skipped,   // rows NOT overwritten because the fetch returned empty
      synced_at: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[zoho-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

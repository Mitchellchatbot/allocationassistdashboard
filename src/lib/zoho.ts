/**
 * Zoho CRM client — routes ALL requests through the Supabase Edge Function
 * `zoho-proxy` so that:
 *  • Zoho credentials never appear in the browser bundle
 *  • Token refresh happens server-side — no CORS issues, no expiry visible to users
 *  • Works permanently without any manual token rotation
 */

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PROXY_URL = `${SUPABASE_URL}/functions/v1/zoho-proxy`;

/**
 * Call the Zoho proxy edge function.
 * The function handles token refresh automatically server-side.
 */
export async function zohoGet<T = unknown>(
  module: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(PROXY_URL);
  url.searchParams.set('module', module);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`zoho-proxy ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch email counts for up to 30 leads in a single edge-function call.
 * The proxy handles all Zoho sub-requests server-side so the browser only
 * makes one network round-trip.
 * Returns { total, bySender: Record<recruiterName, count>, sampled }
 */
export async function zohoGetEmailCounts(leadIds: string[]): Promise<{
  total: number;
  bySender: Record<string, number>;
  sampled: number;
}> {
  const ids = leadIds.slice(0, 30).join(',');
  const url = new URL(PROXY_URL);
  url.searchParams.set('action', 'email-counts');
  url.searchParams.set('lead_ids', ids);

  const res = await fetch(url.toString(), {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) return { total: 0, bySender: {}, sampled: 0 };
  return res.json();
}

/**
 * Trigger a full Zoho → Supabase cache sync via the zoho-sync edge function.
 * Takes ~10–20s as it fetches all leads, deals, calls, campaigns from Zoho.
 */
export async function zohoSync(): Promise<{ ok: boolean; leads: number; deals: number; calls: number; synced_at: string }> {
  const url = `${SUPABASE_URL}/functions/v1/zoho-sync`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`zoho-sync ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * PUT to a Zoho module path (e.g. "Leads/RECORD_ID").
 * Body should be { data: [{ Field: value }] }
 */
export async function zohoPut<T = unknown>(
  modulePath: string,
  body: unknown
): Promise<T> {
  const url = new URL(PROXY_URL);
  url.searchParams.set('module', modulePath);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'apikey':         SUPABASE_ANON_KEY,
      'Authorization':  `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`zoho-proxy PUT ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/** Fetch every page of a Zoho module and return all records.
 *  Pages are fetched in parallel (batches of 5) instead of sequentially,
 *  cutting load time from ~N×500ms down to ~ceil(N/5)×500ms.
 */
export async function zohoFetchAll<T = Record<string, unknown>>(
  module: string,
  fields: string[],
  maxPages = 15
): Promise<T[]> {
  const PARAMS = { fields: fields.join(','), per_page: '200' };

  // Page 1 first — tells us whether there are more records at all
  const first = await zohoGet<{ data?: T[]; info?: { more_records: boolean } }>(
    module, { ...PARAMS, page: '1' }
  );
  if (!first.data?.length) return [];
  if (!first.info?.more_records || maxPages <= 1) return first.data;

  // Fetch remaining pages in parallel batches of 20
  const BATCH = 20;
  const all: T[] = [...first.data];
  let batchStart = 2;

  while (batchStart <= maxPages) {
    const batchEnd = Math.min(batchStart + BATCH - 1, maxPages);
    const pages = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

    const results = await Promise.all(
      pages.map(p =>
        zohoGet<{ data?: T[]; info?: { more_records: boolean } }>(
          module, { ...PARAMS, page: String(p) }
        ).catch(() => ({ data: [] as T[], info: { more_records: false } }))
      )
    );

    let hasMore = false;
    for (const r of results) {
      if (r.data?.length) { all.push(...r.data); hasMore = r.info?.more_records ?? false; }
    }
    if (!hasMore) break;
    batchStart += BATCH;
  }

  return all;
}

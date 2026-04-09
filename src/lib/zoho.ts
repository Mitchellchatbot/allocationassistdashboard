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

/** Fetch every page of a Zoho module and return all records. */
export async function zohoFetchAll<T = Record<string, unknown>>(
  module: string,
  fields: string[],
  maxPages = 15
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let more = true;

  while (more && page <= maxPages) {
    const data = await zohoGet<{ data?: T[]; info?: { more_records: boolean } }>(
      module,
      { fields: fields.join(','), per_page: '200', page: String(page) }
    );

    if (!data.data?.length) break;

    all.push(...data.data);
    more = data.info?.more_records ?? false;
    page++;
  }

  return all;
}

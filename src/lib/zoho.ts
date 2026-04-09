/**
 * Zoho CRM API client with automatic token refresh.
 *
 * How auth works:
 *  - Access tokens expire after 1 hour. We cache one in memory.
 *  - When it expires, we POST to accounts.zoho.com to get a new one
 *    using the long-lived refresh token stored in .env.
 *  - If the browser blocks that call (CORS), we fall back to the
 *    VITE_ZOHO_ACCESS_TOKEN env var (set at build time, valid ~1h).
 */

const CLIENT_ID     = import.meta.env.VITE_ZOHO_CLIENT_ID     as string;
const CLIENT_SECRET = import.meta.env.VITE_ZOHO_CLIENT_SECRET  as string;
const REFRESH_TOKEN = import.meta.env.VITE_ZOHO_REFRESH_TOKEN  as string;
const API_DOMAIN    = (import.meta.env.VITE_ZOHO_API_DOMAIN as string) || 'https://www.zohoapis.com';

// In-memory token cache
let _token: string | null = import.meta.env.VITE_ZOHO_ACCESS_TOKEN as string || null;
let _expiresAt = 0; // unix ms

async function refreshAccessToken(): Promise<string> {
  try {
    const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      _token = data.access_token;
      _expiresAt = Date.now() + ((data.expires_in ?? 3600) - 120) * 1000; // 2-min buffer
      return _token!;
    }
    throw new Error(data.error ?? 'Token refresh failed');
  } catch (err) {
    // CORS or network — return whatever we have cached
    console.warn('[Zoho] Token refresh blocked, using cached token:', err);
    return _token ?? '';
  }
}

async function getToken(): Promise<string> {
  if (_token && Date.now() < _expiresAt) return _token;
  return refreshAccessToken();
}

export async function zohoGet<T = unknown>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = await getToken();
  const url = new URL(`${API_DOMAIN}/crm/v2/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (res.status === 401) {
    // Token definitely expired — force refresh once
    _expiresAt = 0;
    const freshToken = await refreshAccessToken();
    const retry = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${freshToken}` },
    });
    if (!retry.ok) throw new Error(`Zoho API ${retry.status}: ${path}`);
    return retry.json() as T;
  }

  if (!res.ok) throw new Error(`Zoho API ${res.status}: ${path}`);
  return res.json() as T;
}

/** Fetch every page of a module and return all records. */
export async function zohoFetchAll<T = Record<string, unknown>>(
  module: string,
  fields: string[],
  maxPages = 10
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let more = true;

  while (more && page <= maxPages) {
    const data = await zohoGet<{ data: T[]; info: { more_records: boolean } }>(
      module,
      { fields: fields.join(','), per_page: '200', page: String(page) }
    );
    all.push(...(data.data ?? []));
    more = data.info?.more_records ?? false;
    page++;
  }

  return all;
}

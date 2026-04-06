import { supabase } from './supabase';

const ZOHO_CLIENT_ID = import.meta.env.VITE_ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = import.meta.env.VITE_ZOHO_CLIENT_SECRET;
const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2';

export const zohoConfig = {
  clientId: ZOHO_CLIENT_ID,
  clientSecret: ZOHO_CLIENT_SECRET,
  tokenUrl: ZOHO_TOKEN_URL,
  apiBase: ZOHO_API_BASE,
};

/**
 * Exchange an authorization code for access + refresh tokens,
 * then persist them in Supabase for reuse.
 */
export async function exchangeZohoCode(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${ZOHO_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
  });

  if (!res.ok) throw new Error(`Zoho token exchange failed: ${res.statusText}`);

  const tokens = await res.json();

  await supabase.from('zoho_tokens').upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  });

  return tokens;
}

/**
 * Fetch a fresh access token using the stored refresh token.
 */
export async function refreshZohoToken() {
  const { data } = await supabase
    .from('zoho_tokens')
    .select('refresh_token')
    .eq('id', 1)
    .single();

  if (!data?.refresh_token) throw new Error('No Zoho refresh token stored');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    refresh_token: data.refresh_token,
  });

  const res = await fetch(`${ZOHO_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
  });

  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.statusText}`);

  const tokens = await res.json();

  await supabase.from('zoho_tokens').update({
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq('id', 1);

  return tokens.access_token as string;
}

/**
 * Get a valid Zoho access token, refreshing if needed.
 */
export async function getZohoAccessToken(): Promise<string> {
  const { data } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .single();

  if (!data) throw new Error('No Zoho tokens stored — complete OAuth flow first');

  const isExpired = new Date(data.expires_at) <= new Date(Date.now() + 60_000);
  if (isExpired) return refreshZohoToken();

  return data.access_token as string;
}

/**
 * Make an authenticated request to the Zoho CRM API.
 */
export async function zohoFetch(path: string, options: RequestInit = {}) {
  const token = await getZohoAccessToken();

  const res = await fetch(`${ZOHO_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`Zoho API error ${res.status}: ${res.statusText}`);

  return res.json();
}

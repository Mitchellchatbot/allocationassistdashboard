/**
 * drive-list-files — lists Google Sheets + Excel files in the connected
 * Drive so the dashboard's "New connection" modal can offer a searchable
 * picker instead of asking the user to paste a URL.
 *
 * Uses the OAuth refresh token saved by google-oauth-callback. Returns up to
 * 200 files sorted by modified time desc.
 *
 * Response shape:
 *   { files: Array<{
 *       id: string;
 *       name: string;
 *       mimeType: string;          // sheet | xlsx
 *       modifiedTime: string;      // ISO
 *       webViewLink: string;       // open-in-Drive URL
 *     }> }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID          = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET      = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken  = await getOAuthAccessToken(supabase);

    // Filter for Google Sheets + Excel files only. Exclude trashed.
    const q = [
      "trashed = false",
      "(mimeType = 'application/vnd.google-apps.spreadsheet'",
      " or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
      " or mimeType = 'application/vnd.ms-excel')",
    ].join(" and ").replace("and (", "and (");  // q joiner already correct, this is a no-op safety

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", "trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.ms-excel')");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink,iconLink)");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives",         "true");
    url.searchParams.set("corpora",                   "allDrives");

    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: `Drive list failed (${res.status}): ${t.slice(0, 300)}` }, 500);
    }
    const data = await res.json() as { files: Array<unknown> };
    return json({ files: data.files ?? [] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function getOAuthAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: row, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, access_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Loading google_oauth_tokens failed: ${error.message}`);
  if (!row?.refresh_token) {
    throw new Error("No Google account connected yet. Click 'Connect Google' on /connections.");
  }
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 60_000) {
    return row.access_token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh-token exchange ${res.status}: ${t.slice(0, 200)}. Reconnect Google on /connections.`);
  }
  const tok = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await supabase.from("google_oauth_tokens").update({
    access_token: tok.access_token,
    expires_at:   expiresAt,
    updated_at:   new Date().toISOString(),
  }).eq("id", 1);
  return tok.access_token;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Delete a candidate from WordPress + our mirror.
 *
 * Calls WP REST `DELETE /wp/v2/candidate/<id>?force=true` (force=true
 * skips the WP trash so the post is gone for real) and then removes
 * the row from wordpress_candidates so the dashboard updates
 * immediately without waiting for the next sync.
 *
 * Endpoint: POST /functions/v1/wordpress-candidate-delete
 * Body:     { id: number }
 * Returns:  { ok: true } on success.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl   = Deno.env.get("SUPABASE_URL")              ?? "";
const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const wpBaseUrl     = (Deno.env.get("WP_BASE_URL")    ?? "").replace(/\/+$/, "");
const wpUsername    = Deno.env.get("WP_USERNAME")               ?? "";
const wpAppPassword = (Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "");
const supabase      = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return json({ ok: false, error: "Missing WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD env" }, 500);
  }

  let body: { id?: number };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad JSON body" }, 400); }
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) return json({ ok: false, error: "id required" }, 400);

  const basic = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);
  const wpUrl = `${wpBaseUrl}/wp-json/wp/v2/candidate/${id}?force=true`;

  const wpRes = await fetch(wpUrl, {
    method:  "DELETE",
    headers: { Authorization: basic, "Content-Type": "application/json" },
  });

  // 404 = already gone on WP. That's fine — just clean up the mirror.
  if (!wpRes.ok && wpRes.status !== 404) {
    const text = await wpRes.text().catch(() => "");
    return json({ ok: false, error: `WP DELETE ${wpRes.status}: ${text.slice(0, 200)}` }, wpRes.status);
  }

  const { error } = await supabase
    .from("wordpress_candidates")
    .delete()
    .eq("id", id);
  if (error) return json({ ok: false, error: `Mirror delete: ${error.message}` }, 500);

  return json({ ok: true, id });
});

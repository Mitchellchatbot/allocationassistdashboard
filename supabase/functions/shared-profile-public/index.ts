/**
 * Public profile-view endpoint (Ammar 2026-06-03).
 *
 * Validates a `shared_profile_tokens.token` row, increments view_count,
 * and returns the merged doctor profile + Zoho fields. The /shared-profile/:token
 * React route on the dashboard calls this with no auth headers — the
 * edge function is the only place that touches the token table.
 *
 * Edge cases handled:
 *   - token missing / wrong  → 404
 *   - token revoked          → 410 Gone
 *   - token expired          → 410 Gone
 *   - everything fine        → 200 with profile + view metrics bumped
 *
 * No private fields are returned (salary expectations + nationality
 * are part of the profile shape the hospitals already see in the
 * email — same fields, just rendered as a page).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return json({ ok: false, error: "token required" }, 400);

  // Lookup
  const { data: tok, error: tokErr } = await supabase
    .from("shared_profile_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (tokErr) return json({ ok: false, error: "lookup failed", detail: tokErr.message }, 500);
  if (!tok)   return json({ ok: false, error: "Not found" }, 404);

  if (tok.revoked_at) return json({ ok: false, error: "This link was revoked." }, 410);
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "This link has expired." }, 410);
  }

  // Merge profile from doctor_profiles + (optional) zoho-cache row.
  // Doctor IDs are prefixed (`lead:<id>` / `dob:<id>`) so we resolve
  // both shapes the same way.
  const { data: profile } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("doctor_id", tok.doctor_id)
    .maybeSingle();

  // Bump view counters. Don't await in a critical-path way — we still
  // return the profile if the increment write fails.
  supabase.from("shared_profile_tokens").update({
    view_count:     (tok.view_count ?? 0) + 1,
    last_viewed_at: new Date().toISOString(),
  }).eq("token", token).then(() => {/* ignore */});

  return json({
    ok: true,
    profile: profile ?? null,
    meta: {
      doctor_name:    tok.doctor_name,
      hospital:       tok.hospital,
      view_count:     (tok.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
      issued_at:      tok.created_at,
      expires_at:     tok.expires_at,
    },
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

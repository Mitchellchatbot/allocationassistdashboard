/**
 * Upload a CV / résumé to WP Media and attach it to a candidate's
 * `cv_resume` ACF File field, then mirror the resulting URL so the
 * dashboard reflects it immediately.
 *
 * The candidate upsert STRIPS cv_resume (it can't take a raw URL), so this
 * dedicated path is how a résumé actually lands on the WP profile: upload the
 * file to the media library to get an attachment id, then PATCH the
 * candidate's cv_resume to that id (same shape as the profile-picture upload).
 *
 * Endpoint: POST /functions/v1/wordpress-candidate-upload-cv
 * multipart/form-data: file (required), candidate_id (required).
 * Returns { ok, media_id, source_url, attached_to }.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const wpBaseUrl    = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
const wpUsername   = Deno.env.get("WP_USERNAME") ?? "";
const wpAppPassword = (Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "");
const supabase     = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return json({ ok: false, error: "Missing WP env" }, 500);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, error: "Body must be multipart/form-data" }, 400);

  const f = form.get("file");
  if (!(f instanceof File)) return json({ ok: false, error: "No file" }, 400);
  if (f.size === 0)               return json({ ok: false, error: "Empty file" }, 400);
  if (f.size > 15 * 1024 * 1024)  return json({ ok: false, error: "File too large (>15 MB)" }, 413);

  const candidateIdRaw = form.get("candidate_id");
  const candidateId = candidateIdRaw && typeof candidateIdRaw === "string" && /^\d+$/.test(candidateIdRaw)
    ? parseInt(candidateIdRaw, 10)
    : null;
  if (!candidateId) return json({ ok: false, error: "candidate_id required" }, 400);

  const basic = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);

  // 1. Upload to WP media (raw body + Content-Disposition — no multipart
  //    re-encoding). Any type is fine: PDF, doc, docx.
  const buf = await f.arrayBuffer();
  const safeName = (f.name || "cv.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const mediaRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": f.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
    body: buf,
  });
  const mediaJson = await mediaRes.json().catch(() => null) as { id?: number; source_url?: string; code?: string; message?: string } | null;
  if (!mediaRes.ok || !mediaJson || mediaJson.code) {
    return json({ ok: false, error: `Media upload ${mediaRes.status}: ${mediaJson?.code ?? ""} ${mediaJson?.message ?? ""}` }, 502);
  }
  const mediaId   = mediaJson.id!;
  const sourceUrl = mediaJson.source_url ?? null;

  // 2. Attach to the candidate's cv_resume ACF File field (attachment id).
  const patchRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${candidateId}`, {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/json" },
    body: JSON.stringify({ acf: { cv_resume: mediaId } }),
  });
  if (!patchRes.ok) {
    const t = await patchRes.text().catch(() => "");
    return json({ ok: false, error: `Attach failed ${patchRes.status}: ${t.slice(0, 200)}`, media_id: mediaId, source_url: sourceUrl }, 502);
  }

  // 3. Mirror the URL so the dashboard's "View Resume" works right away.
  if (sourceUrl) {
    await supabase.from("wordpress_candidates")
      .update({ cv_url: sourceUrl, updated_at: new Date().toISOString() })
      .eq("id", candidateId);
  }

  return json({ ok: true, media_id: mediaId, source_url: sourceUrl, attached_to: candidateId }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

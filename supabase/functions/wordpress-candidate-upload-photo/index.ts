/**
 * Upload a profile photo to WP Media and (optionally) attach it to a
 * candidate's `profile_picture` ACF field.
 *
 * Endpoint: POST /functions/v1/wordpress-candidate-upload-photo
 *
 * Two body shapes:
 *
 *   A) multipart/form-data (browser-driven upload)
 *      - file        (required) the image
 *      - candidate_id (optional) — if set, PATCH the candidate to
 *                     point profile_picture at <media_id>.
 *
 *   B) application/json (server-side download from JotForm)
 *      {
 *        candidate_id:  number,        // required
 *        jotform_url:   string,        // the APIKEY-gated URL
 *        form_id:       string         // forms.id (NOT JotForm form id) —
 *                                      // looked up server-side to find api_token
 *      }
 *      We download the image with `APIKEY: <api_token>`, then run the
 *      same upload + ACF-attach path. This is what the staging-area
 *      Publish flow uses.
 *
 * Returns { ok, media_id, source_url, attached_to? }.
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

  const contentType = req.headers.get("content-type") ?? "";

  // ── Resolve file + candidate_id from either multipart OR JSON body. ──
  let file: File | null = null;
  let candidateId: number | null = null;

  if (contentType.includes("application/json")) {
    // Server-side path — fetch the JotForm URL using the form's APIKEY.
    const body = await req.json().catch(() => null) as { candidate_id?: number; jotform_url?: string; form_id?: string } | null;
    if (!body?.jotform_url || !body?.form_id) {
      return json({ ok: false, error: "JSON body needs jotform_url + form_id" }, 400);
    }
    candidateId = typeof body.candidate_id === "number" ? body.candidate_id : null;

    const { data: row } = await supabase
      .from("forms")
      .select("api_token")
      .eq("id", body.form_id)
      .single();
    const apiKey = (row as { api_token?: string } | null)?.api_token;
    if (!apiKey) return json({ ok: false, error: "Form has no JotForm api_token; cannot fetch picture" }, 404);

    // Normalise relative paths.
    const jfUrl = body.jotform_url.startsWith("http")
      ? body.jotform_url
      : `https://www.jotform.com${body.jotform_url.startsWith("/") ? "" : "/"}${body.jotform_url}`;

    const jfRes = await fetch(jfUrl, { headers: { APIKEY: apiKey } });
    if (!jfRes.ok) return json({ ok: false, error: `JotForm fetch ${jfRes.status}` }, 502);
    const blob = await jfRes.blob();
    if (blob.size === 0)                  return json({ ok: false, error: "JotForm returned empty body" }, 502);
    if (blob.size > 8 * 1024 * 1024)      return json({ ok: false, error: "Picture too large (>8 MB)" }, 413);

    const inferredName = (jfUrl.split("/").pop() || "photo.jpg").split("?")[0];
    file = new File([blob], inferredName, { type: blob.type || "image/jpeg" });
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) return json({ ok: false, error: "Body must be multipart/form-data or application/json" }, 400);

    const f = form.get("file");
    if (!(f instanceof File)) return json({ ok: false, error: "No file" }, 400);
    if (f.size > 8 * 1024 * 1024) return json({ ok: false, error: "File too large (>8 MB)" }, 413);
    file = f;

    const candidateIdRaw = form.get("candidate_id");
    candidateId = candidateIdRaw && typeof candidateIdRaw === "string" && /^\d+$/.test(candidateIdRaw)
      ? parseInt(candidateIdRaw, 10)
      : null;
  }

  if (!file) return json({ ok: false, error: "No file resolved" }, 400);

  const basic = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);

  // 1. Upload to WP media library. WP REST media endpoint accepts the
  //    file as the raw body with Content-Disposition naming it — that
  //    keeps the request simple (no multipart re-encoding).
  const buf  = await file.arrayBuffer();
  const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const mediaRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
    body: buf,
  });
  const mediaJson = await mediaRes.json().catch(() => null) as { id?: number; source_url?: string; code?: string; message?: string } | null;
  if (!mediaRes.ok || !mediaJson || mediaJson.code) {
    return json({ ok: false, error: `Media upload ${mediaRes.status}: ${mediaJson?.code ?? ""} ${mediaJson?.message ?? ""}` }, 502);
  }

  const mediaId  = mediaJson.id!;
  const sourceUrl = mediaJson.source_url ?? null;

  // 2. Optionally attach to a candidate's profile_picture ACF field.
  let attachedTo: number | null = null;
  if (candidateId) {
    const patchRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${candidateId}`, {
      method: "POST",
      headers: { Authorization: basic, "Content-Type": "application/json" },
      body: JSON.stringify({ acf: { profile_picture: mediaId } }),
    });
    if (!patchRes.ok) {
      const t = await patchRes.text().catch(() => "");
      return json({ ok: false, error: `Attach failed ${patchRes.status}: ${t.slice(0, 200)}`, media_id: mediaId, source_url: sourceUrl }, 502);
    }
    attachedTo = candidateId;
  }

  return json({ ok: true, media_id: mediaId, source_url: sourceUrl, attached_to: attachedTo }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

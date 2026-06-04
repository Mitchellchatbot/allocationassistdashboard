/**
 * Upload a profile photo to WP Media and (optionally) attach it to a
 * candidate's `profile_picture` ACF field.
 *
 * Endpoint: POST /functions/v1/wordpress-candidate-upload-photo
 * Body: multipart/form-data
 *   - file        (required) the image
 *   - candidate_id (optional) — if set, we PATCH the candidate after
 *                  upload to set profile_picture = <media_id>. Otherwise
 *                  just returns the media id+url and the caller can
 *                  pass that into the upsert.
 *
 * Returns { ok, media_id, source_url, attached_to? }.
 */
const wpBaseUrl    = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
const wpUsername   = Deno.env.get("WP_USERNAME") ?? "";
const wpAppPassword = (Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "");

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

  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "No file" }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ ok: false, error: "File too large (>8 MB)" }, 413);

  const candidateIdRaw = form.get("candidate_id");
  const candidateId = candidateIdRaw && typeof candidateIdRaw === "string" && /^\d+$/.test(candidateIdRaw)
    ? parseInt(candidateIdRaw, 10)
    : null;

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

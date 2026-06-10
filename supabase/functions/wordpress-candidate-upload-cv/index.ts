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

  // 2. Discover the CV field's real ACF key. The field slug isn't derivable
  //    from "CV/ Resume" (field names are manually set — cf. the license field
  //    dha__haad__moh_license), and CRUCIALLY: ACF silently IGNORES a write to
  //    an unknown key and returns HTTP 200, so a single best-guess PATCH can
  //    no-op invisibly. So pull every acf key, build an ordered candidate list
  //    (strong CV/résumé matches first, generic file/document last, then
  //    hard-coded fallbacks), and PATCH+VERIFY each until one actually takes.
  let acfKeys: string[] = [];
  try {
    const getRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${candidateId}?_fields=acf`, {
      headers: { Authorization: basic, Accept: "application/json" },
    });
    if (getRes.ok) {
      const g = await getRes.json() as { acf?: Record<string, unknown> } | null;
      acfKeys = Object.keys(g?.acf ?? {});
    }
  } catch { /* fall through — hard-coded fallbacks below still tried */ }

  const CV_STRONG = /resume|curriculum|(^|_)cv(_|$)/i;
  const CV_WEAK   = /document|\bfile\b/i;
  const strong = acfKeys.filter(k => CV_STRONG.test(k));
  const weak   = acfKeys.filter(k => CV_WEAK.test(k) && !CV_STRONG.test(k));
  const candidateKeys = [...new Set([...strong, ...weak, "cv__resume", "cv_resume", "cv_resume_file"])];

  // ACF File fields return an int id, a numeric string, or an {id|url} object
  // depending on the field's "Return Format" — accept any of them as "set".
  const valueMatchesMedia = (v: unknown): boolean => {
    if (v == null || v === "" || v === false || v === 0 || v === "0") return false;
    if (typeof v === "number") return v === mediaId;
    if (typeof v === "string") return /^\d+$/.test(v) ? parseInt(v, 10) === mediaId : v.length > 0;
    if (typeof v === "object") {
      const o = v as { id?: number; ID?: number; url?: string };
      if (typeof o.id === "number") return o.id === mediaId;
      if (typeof o.ID === "number") return o.ID === mediaId;
      return !!o.url;
    }
    return false;
  };

  // 3. PATCH each candidate key, then RE-READ that field to VERIFY it took —
  //    the POST status alone proves nothing (ACF's silent 200 no-op).
  const tried: Array<{ key: string; status: number; verified: boolean; note?: string }> = [];
  let attachedKey: string | null = null;

  for (const key of candidateKeys) {
    const patchRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${candidateId}`, {
      method: "POST",
      headers: { Authorization: basic, "Content-Type": "application/json" },
      body: JSON.stringify({ acf: { [key]: mediaId } }),
    });
    const patchJson = await patchRes.json().catch(() => null) as
      { code?: string; message?: string; data?: { params?: Record<string, unknown>; details?: Record<string, unknown> } } | null;

    // rest_invalid_param on this key → the File field may reject a bare int and
    // want a different shape; record the detail and move on.
    if (patchJson?.code) {
      const detail = patchJson.data?.params
        ? Object.values(patchJson.data.params).join("; ")
        : patchJson.data?.details ? JSON.stringify(patchJson.data.details) : (patchJson.message ?? "");
      tried.push({ key, status: patchRes.status, verified: false, note: `${patchJson.code}: ${detail}` });
      continue;
    }

    let verified = false;
    try {
      const vRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${candidateId}?_fields=acf.${key}`, {
        headers: { Authorization: basic, Accept: "application/json" },
      });
      if (vRes.ok) {
        const vj = await vRes.json() as { acf?: Record<string, unknown> } | null;
        verified = valueMatchesMedia(vj?.acf?.[key]);
      }
    } catch { /* verified stays false */ }

    tried.push({ key, status: patchRes.status, verified });
    if (verified) { attachedKey = key; break; }
  }

  // 4. Nothing verified → DON'T mirror cv_url (no false "View Resume"). Return
  //    the full acf key list + every key tried so the real slug is visible.
  if (!attachedKey) {
    return json({
      ok: false,
      error: "CV uploaded to media, but no candidate ACF field accepted the attachment (none verified after write).",
      media_id: mediaId,
      source_url: sourceUrl,
      acf_keys: acfKeys,
      tried,
    }, 422);
  }

  // 5. Verified → mirror the URL so the dashboard's "View Resume" reflects WP.
  if (sourceUrl) {
    await supabase.from("wordpress_candidates")
      .update({ cv_url: sourceUrl, updated_at: new Date().toISOString() })
      .eq("id", candidateId);
  }

  return json({ ok: true, media_id: mediaId, source_url: sourceUrl, attached_to: candidateId, attached_key: attachedKey }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

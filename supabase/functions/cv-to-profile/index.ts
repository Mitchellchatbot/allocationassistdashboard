/**
 * cv-to-profile — Supabase Edge Function
 *
 * The "drop a CV, get a profile" entry point (Amir 2026-06-26). The team
 * uploads a CV PDF/DOCX straight from the dashboard — NO doctor link, NO
 * intake form — and we:
 *   1. create an empty staged_doctor_profiles row,
 *   2. store the file in the private doctor-cvs bucket,
 *   3. insert a cv_uploads row keyed `staged:<id>`,
 *   4. trigger cv-extract, which Claude-parses the CV and merges every field
 *      (now including name / email / phone) onto the staging row.
 *
 * The staging row then shows up in the Profiles tab with the CV-parsed data,
 * ready for a human to review and Publish to WordPress. Nothing touches
 * WordPress here — the stage-first rule still holds.
 *
 * Runs with the service-role key because the doctor-cvs bucket only allows
 * service-role writes (see 20260524000001_cv_uploads.sql).
 *
 * Request (JSON):
 *   { file_base64: string, file_name: string, file_mime?: string, created_by?: string }
 * Response:
 *   { ok: true,  staged_id: string, upload_id: string }
 *   { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("[cv-to-profile] booted.");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { file_base64?: string; file_name?: string; file_mime?: string; created_by?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { file_base64, file_name, file_mime, created_by } = body;
  if (!file_base64 || !file_name) {
    return json({ ok: false, error: "file_base64 and file_name are required" }, 400);
  }

  // Decode the base64 payload to bytes for the storage upload.
  let bytes: Uint8Array;
  try {
    const bin = atob(file_base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    return json({ ok: false, error: `Could not decode file_base64: ${String(e)}` }, 400);
  }
  if (bytes.length === 0) return json({ ok: false, error: "Empty file" }, 400);

  // ── 1. Create the staging row ───────────────────────────────────────────
  // full_name is a placeholder until cv-extract overwrites it with the
  // CV's real name. source='cv' distinguishes drop-a-PDF rows from the
  // 'manual' / 'jotform' ones in the staging list.
  const { data: staged, error: stagedErr } = await supabase
    .from("staged_doctor_profiles")
    .insert({ source: "cv", full_name: "Extracting from CV…", created_by: created_by ?? null })
    .select("id")
    .single();
  if (stagedErr || !staged) {
    return json({ ok: false, error: `Could not create staging row: ${stagedErr?.message ?? "unknown"}` }, 500);
  }
  const stagedId = String(staged.id);

  // ── 2. Upload the file to the private doctor-cvs bucket ─────────────────
  const token   = crypto.randomUUID().replace(/-/g, "");
  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `staged-${stagedId}/${token}/${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("doctor-cvs")
    .upload(filePath, bytes, { contentType: file_mime || "application/pdf", upsert: false });
  if (upErr) {
    // Roll back the staging row so a failed upload doesn't leave an orphan.
    await supabase.from("staged_doctor_profiles").delete().eq("id", stagedId);
    return json({ ok: false, error: `Storage upload failed: ${upErr.message}` }, 500);
  }

  // ── 3. Insert the cv_uploads row keyed to the staging profile ───────────
  const { data: upload, error: cvErr } = await supabase
    .from("cv_uploads")
    .insert({
      doctor_id:    `staged:${stagedId}`,
      doctor_name:  "Extracting from CV…",
      token,
      file_path:    filePath,
      file_name,
      file_size:    bytes.length,
      file_mime:    file_mime ?? null,
      uploaded_at:  new Date().toISOString(),
      status:       "uploaded",
      created_by:   created_by ?? "cv-to-profile",
    })
    .select("id")
    .single();
  if (cvErr || !upload) {
    await supabase.storage.from("doctor-cvs").remove([filePath]).catch(() => {});
    await supabase.from("staged_doctor_profiles").delete().eq("id", stagedId);
    return json({ ok: false, error: `Could not create cv_uploads row: ${cvErr?.message ?? "unknown"}` }, 500);
  }
  const uploadId = String(upload.id);

  // ── 4. Trigger cv-extract ───────────────────────────────────────────────
  // Fire it inline and await so the staging row is fully populated by the
  // time the caller refetches. If extraction fails, the row still exists
  // (status='failed' on cv_uploads) and the team can retry from the UI.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cv-extract`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey":        SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    const extractBody = await res.json().catch(() => ({}));
    if (!res.ok || !(extractBody as { ok?: boolean }).ok) {
      // Non-fatal: return success with an extraction warning so the UI can
      // show the row and a "extraction failed — retry" hint.
      return json({
        ok: true, staged_id: stagedId, upload_id: uploadId,
        extraction_ok: false,
        extraction_error: (extractBody as { error?: string }).error ?? `cv-extract HTTP ${res.status}`,
      }, 200);
    }
  } catch (e) {
    return json({
      ok: true, staged_id: stagedId, upload_id: uploadId,
      extraction_ok: false, extraction_error: `cv-extract call failed: ${String(e)}`,
    }, 200);
  }

  return json({ ok: true, staged_id: stagedId, upload_id: uploadId, extraction_ok: true }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

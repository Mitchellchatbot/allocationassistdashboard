/**
 * cv-upload-public — Supabase Edge Function
 *
 * Public endpoint (deployed with --no-verify-jwt) that accepts CV uploads
 * from the /upload-cv/:token page. Validates the token against cv_uploads,
 * writes the file into the private doctor-cvs Storage bucket, and triggers
 * the cv-extract function to populate the doctor's profile via Claude.
 *
 * Request: multipart/form-data
 *   - token: string  (the URL-safe token issued by send-cv-upload-link)
 *   - file:  File    (PDF or DOC/DOCX, ≤10MB)
 *
 * Response:
 *   { ok: true,  status: "uploaded" | "extracting", upload_id: string }
 *   { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_BYTES = 10 * 1024 * 1024;  // 10MB

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("[cv-upload-public] booted");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return json({ ok: false, error: "Expected multipart/form-data", detail: String(e) }, 400);
  }

  const token = String(form.get("token") ?? "").trim();
  const file  = form.get("file");
  if (!token) return json({ ok: false, error: "Missing token" }, 400);
  if (!(file instanceof File)) return json({ ok: false, error: "Missing file" }, 400);
  if (file.size === 0)         return json({ ok: false, error: "Empty file" }, 400);
  if (file.size > MAX_BYTES)   return json({ ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, 413);

  // Validate token
  const { data: row, error: lookupErr } = await supabase
    .from("cv_uploads")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (lookupErr) {
    console.error("[cv-upload-public] lookup err:", lookupErr.message);
    return json({ ok: false, error: "Lookup failed" }, 500);
  }
  if (!row) return json({ ok: false, error: "Invalid or expired link" }, 404);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "Link has expired. Ask the team to send a new one." }, 410);
  }
  if (row.status === "uploaded" || row.status === "extracting" || row.status === "extracted") {
    // Allow re-upload (doctor sent a wrong file the first time) but warn.
    console.log("[cv-upload-public] re-upload for token", token);
  }

  // Write to storage
  const safeName = (file.name || "cv").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const path     = `${row.doctor_id}/${token}/${safeName}`;
  const bytes    = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from("doctor-cvs")
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadErr) {
    console.error("[cv-upload-public] storage upload failed:", uploadErr.message);
    return json({ ok: false, error: "Could not store file", detail: uploadErr.message }, 500);
  }

  // Update cv_uploads row
  await supabase.from("cv_uploads").update({
    file_path:   path,
    file_name:   safeName,
    file_size:   file.size,
    file_mime:   file.type,
    uploaded_at: new Date().toISOString(),
    status:      "extracting",
  }).eq("id", row.id);

  // Fire-and-forget invoke of cv-extract. Done after the upload status flip
  // so even if extraction never returns, the row reflects the uploaded state.
  // We don't await — the response to the doctor is immediate; extraction
  // happens in the background.
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cv-extract`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ upload_id: row.id }),
  }).catch(e => console.error("[cv-upload-public] cv-extract invoke threw:", e));

  return json({ ok: true, status: "extracting", upload_id: row.id }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

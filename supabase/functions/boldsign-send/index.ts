/**
 * boldsign-send — Supabase Edge Function
 *
 * Forwards a contract PDF to BoldSign's "send for signature" endpoint and
 * returns the resulting documentId so the dashboard can track signing status.
 *
 * Currently targets BoldSign SANDBOX (api-sandbox.boldsign.com) because the
 * Business plan only includes sandbox API access. Documents signed via this
 * path are NOT legally binding — they're watermarked dev test envelopes.
 * To go to production: change BOLDSIGN_API_BASE to api.boldsign.com AND
 * upgrade the BoldSign plan to Enterprise (or pivot vendor — see roadmap).
 *
 * Secrets required (set via Supabase dashboard → Edge Functions → Secrets):
 *   BOLDSIGN_API_KEY        — sandbox key from BoldSign Settings → API
 *   BOLDSIGN_SENDER_EMAIL   — verified sender identity (e.g. Islam@allocationassist.com)
 *
 * Request body (JSON):
 *   {
 *     pdfBase64:     string,   // PDF file as base64 (no data: prefix)
 *     doctorEmail:   string,   // recipient's email
 *     doctorName:    string,   // recipient's full name
 *     contractTitle: string,   // e.g. "Service Agreement — Dr. Sunil Thambi"
 *     message?:      string,   // optional custom email body
 *   }
 *
 * Response (JSON):
 *   { ok: true,  documentId: string, trackingUrl: string }
 *   { ok: false, error: string,      detail?: string }
 */

// Use Deno.serve (Supabase Edge Runtime native) instead of the old
// std/http/server.ts import — that one is no longer reliable on the
// current edge runtime and can fail silently before request handling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOLDSIGN_API_KEY      = Deno.env.get("BOLDSIGN_API_KEY") ?? "";
const BOLDSIGN_SENDER_EMAIL = Deno.env.get("BOLDSIGN_SENDER_EMAIL") ?? "";
const BOLDSIGN_BRAND_ID     = Deno.env.get("BOLDSIGN_BRAND_ID") ?? "";
// Production endpoint. BoldSign sandbox lives at api-sandbox.boldsign.com
// but the user has a live/production key, so we hit the prod host.
const BOLDSIGN_API_BASE     = "https://api.boldsign.com";
const BOLDSIGN_APP_BASE     = "https://app.boldsign.com";

console.log("[boldsign-send] booted. Has key:", !!BOLDSIGN_API_KEY, "Has sender:", !!BOLDSIGN_SENDER_EMAIL, "Has brand:", !!BOLDSIGN_BRAND_ID);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendRequest {
  pdfBase64:     string;
  doctorEmail:   string;
  doctorName:    string;
  contractTitle: string;
  message?:      string;
  pageCount?:    number;
  leadId?:       string;   // Zoho Lead ID — used by boldsign-webhook to
                           // copy the lead to Doctors on Board on signing
}

Deno.serve(async (req: Request) => {
  console.log("[boldsign-send] request:", req.method, req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!BOLDSIGN_API_KEY) {
    return jsonResponse({
      ok: false,
      error: "BOLDSIGN_API_KEY not set on the Edge Function. Add it via Supabase → Settings → Edge Functions → Secrets.",
    }, 500);
  }

  let body: SendRequest;
  try {
    body = await req.json();
  } catch (e) {
    console.error("[boldsign-send] req.json() failed:", e);
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const { pdfBase64, doctorEmail, doctorName, contractTitle, message, pageCount, leadId } = body;
  console.log("[boldsign-send] parsed body. pdfBase64 length:", pdfBase64?.length, "doctorEmail:", doctorEmail, "pageCount:", pageCount, "leadId:", leadId);
  if (!pdfBase64 || !doctorEmail || !doctorName || !contractTitle) {
    return jsonResponse({
      ok: false,
      error: "Missing required field — need pdfBase64, doctorEmail, doctorName, contractTitle",
    }, 400);
  }

  // Decode base64 → Uint8Array → Blob for multipart upload.
  // Using Uint8Array.from with a one-shot map is ~3× more memory-efficient
  // than the for-loop approach for large PDFs (we hit OOM at ~2MB on the
  // 256MB Edge Function limit otherwise).
  let pdfBlob: Blob;
  try {
    const binary  = atob(pdfBase64);
    const bytes   = Uint8Array.from(binary, c => c.charCodeAt(0));
    pdfBlob       = new Blob([bytes], { type: "application/pdf" });
  } catch (e) {
    return jsonResponse({ ok: false, error: "pdfBase64 is not valid base64", detail: String(e) }, 400);
  }

  // BoldSign /v1/document/send takes multipart/form-data:
  //   Files       — file upload
  //   Title       — string
  //   Signers     — JSON-string array; per-signer fields use camelCase
  //   Message     — optional plain string
  // The Signers JSON object uses camelCase per BoldSign's API spec
  // (docs: developers.boldsign.com). PascalCase fails validation with
  // a generic "Signers: Value is invalid" error.
  const form = new FormData();
  form.append("Title", contractTitle);
  if (message) form.append("Message", message);
  form.append("Files", pdfBlob, `${contractTitle}.pdf`);
  // BoldSign expects EACH signer as its own `Signers` form field with a
  // JSON OBJECT value (not an array). Multi-signer = multiple appends.
  // Wrapping in an array — even with a single element — fails validation
  // with the cryptic "Signers: Value is invalid" message.
  // Place the signature on the LAST page (where the "THE CLIENT" line lives
  // in the AA contract template). BoldSign form-field bounds use TOP-LEFT
  // origin in PDF points (72pt = 1in; A4 = 595×842pt). The contract's right-
  // hand "THE CLIENT" column starts ~mid-page horizontally; the underline
  // where the doctor signs sits ~middle of the page vertically.
  const signaturePage = (typeof pageCount === "number" && pageCount > 0) ? pageCount : 1;
  form.append("Signers", JSON.stringify({
    name:         doctorName,
    emailAddress: doctorEmail,
    signerOrder:  1,
    signerType:   "Signer",
    formFields:   [
      {
        fieldType:  "Signature",
        pageNumber: signaturePage,
        bounds:     { x: 300, y: 380, width: 200, height: 40 },
        isRequired: true,
      },
    ],
  }));
  // OnBehalfOf — sends the document FROM a verified Sender Identity in
  // your BoldSign account. The email must exactly match a row in
  // Settings → Sender Identities with status="Verified". Casing matters:
  // pass it exactly as stored there (e.g. "Islam@allocationassist.com"
  // not "islam@…"). When this works, the recipient sees the Sender
  // Identity's Name + email instead of the account owner's profile.
  if (BOLDSIGN_SENDER_EMAIL) {
    console.log("[boldsign-send] OnBehalfOf:", BOLDSIGN_SENDER_EMAIL);
    form.append("OnBehalfOf", BOLDSIGN_SENDER_EMAIL);
  }
  // BrandId — applies a Brand from Settings → Branding (logo, colors, button
  // styling, optional "hide BoldSign branding" toggle on higher plans). The
  // Brand ID is a UUID shown in the BoldSign UI after creating a brand.
  // Without this, the email uses BoldSign defaults (red accents, BoldSign
  // logo in the footer).
  if (BOLDSIGN_BRAND_ID) {
    console.log("[boldsign-send] BrandId:", BOLDSIGN_BRAND_ID);
    form.append("BrandId", BOLDSIGN_BRAND_ID);
  }

  console.log("[boldsign-send] forwarding to BoldSign…");
  let res: Response;
  try {
    res = await fetch(`${BOLDSIGN_API_BASE}/v1/document/send`, {
      method:  "POST",
      headers: { "X-API-KEY": BOLDSIGN_API_KEY },
      body:    form,
    });
  } catch (e) {
    console.error("[boldsign-send] fetch threw:", e);
    return jsonResponse({ ok: false, error: "Network error reaching BoldSign", detail: String(e) }, 502);
  }
  console.log("[boldsign-send] BoldSign responded:", res.status);

  const text = await res.text();
  if (!res.ok) {
    console.error("[boldsign-send] BoldSign HTTP", res.status, text.slice(0, 500));
    return jsonResponse({
      ok:     false,
      error:  `BoldSign API returned ${res.status}`,
      detail: text.slice(0, 500),
    }, res.status);
  }

  let parsed: { documentId?: string };
  try { parsed = JSON.parse(text); }
  catch { parsed = {}; }
  const documentId = parsed.documentId;
  if (!documentId) {
    return jsonResponse({
      ok:     false,
      error:  "BoldSign accepted the request but didn't return a documentId",
      detail: text.slice(0, 500),
    }, 500);
  }

  // Record this send so the boldsign-webhook function can map an incoming
  // "Completed" event back to the originating Zoho lead. Failure to record
  // is non-fatal for the user — the document is already sent — but we log
  // loudly so we know post-sign automation won't fire.
  if (leadId) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error: insertErr } = await supabase.from("contract_sends").insert({
        boldsign_document_id: documentId,
        zoho_lead_id:         leadId,
        doctor_email:         doctorEmail,
        doctor_name:          doctorName,
        status:               "sent",
      });
      if (insertErr) {
        console.error("[boldsign-send] contract_sends insert failed:", insertErr.message);
      } else {
        console.log("[boldsign-send] tracked send for lead", leadId, "doc", documentId);
      }
    } catch (e) {
      console.error("[boldsign-send] contract_sends insert threw:", e);
    }
  } else {
    console.warn("[boldsign-send] no leadId provided — skipping contract_sends tracking. Webhook automation will be a no-op for this doc.");
  }

  return jsonResponse({
    ok:          true,
    documentId,
    trackingUrl: `${BOLDSIGN_APP_BASE}/document/${documentId}`,
  }, 200);
});

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

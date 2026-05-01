/**
 * boldsign-download — Supabase Edge Function
 *
 * Proxies BoldSign's GET /v1/document/download?documentId=... so the dashboard
 * can fetch a (signed or in-progress) PDF without exposing the API key client-
 * side. Returns the PDF bytes with a sensible Content-Disposition so the
 * browser triggers a download dialog.
 *
 * Auth: requires the caller's Supabase access token in the Authorization
 * header (Supabase functions.invoke does this automatically). We don't do
 * additional row-level checks here — anyone authenticated can download any
 * tracked contract. If finer-grained access control is needed later, add a
 * lookup against contract_sends + the user's role.
 *
 * Secrets required: BOLDSIGN_API_KEY (already set for boldsign-send)
 */

const BOLDSIGN_API_KEY = Deno.env.get("BOLDSIGN_API_KEY") ?? "";
const BOLDSIGN_API_BASE = "https://api.boldsign.com";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!BOLDSIGN_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "BOLDSIGN_API_KEY not set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Accept documentId via query string (GET) or body (POST).
  let documentId = "";
  let filename = "contract.pdf";
  if (req.method === "GET") {
    documentId = new URL(req.url).searchParams.get("documentId") ?? "";
  } else if (req.method === "POST") {
    try {
      const body = await req.json();
      documentId = body.documentId ?? "";
      if (body.filename) filename = body.filename;
    } catch {/* empty body — fall through to error */}
  } else {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  if (!documentId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing documentId" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const url = `${BOLDSIGN_API_BASE}/v1/document/download?documentId=${encodeURIComponent(documentId)}`;
  const res = await fetch(url, { headers: { "X-API-KEY": BOLDSIGN_API_KEY } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[boldsign-download] BoldSign HTTP", res.status, detail.slice(0, 300));
    return new Response(JSON.stringify({ ok: false, error: `BoldSign returned ${res.status}`, detail: detail.slice(0, 300) }), {
      status: res.status, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Stream the PDF straight back to the client.
  return new Response(res.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control":       "private, max-age=0, no-store",
    },
  });
});

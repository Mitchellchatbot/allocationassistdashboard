/**
 * boldsign-webhook — Supabase Edge Function
 *
 * Receives webhook events from BoldSign and, on a "Completed" (signed) event,
 *   1. looks up the originating Zoho lead via the contract_sends table
 *   2. creates a matching Contact record in the "Doctors on Board" module
 *      (Zoho api_name = "Contacts" — the org renamed it)
 *   3. flips the Lead's Lead_Status to "Closed Won"
 *   4. updates the contract_sends row with status='signed' and the new
 *      Zoho contact_id (or zoho_error if anything failed)
 *
 * BoldSign POSTs a JSON body with shape:
 *   {
 *     event: { eventType, eventTime, ... },
 *     data:  { documentId, status, signers: [...], ... }
 *   }
 * (See https://developers.boldsign.com → Webhook Events for the full schema.)
 *
 * Secrets required:
 *   BOLDSIGN_WEBHOOK_SECRET   — HMAC secret from BoldSign Settings → Webhooks
 *                               (optional in dev — verification is skipped if unset,
 *                               but you SHOULD set this in prod)
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOLDSIGN_WEBHOOK_SECRET = Deno.env.get("BOLDSIGN_WEBHOOK_SECRET") ?? "";
const ZOHO_CLIENT_ID          = Deno.env.get("ZOHO_CLIENT_ID")!;
const ZOHO_CLIENT_SECRET      = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const ZOHO_REFRESH_TOKEN      = Deno.env.get("ZOHO_REFRESH_TOKEN")!;
const ZOHO_API_DOMAIN         = "https://www.zohoapis.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

console.log("[boldsign-webhook] booted. Has webhook secret:", !!BOLDSIGN_WEBHOOK_SECRET);

// ── Zoho access token (cached in zoho_tokens table, mirrors zoho-sync) ──────
async function getZohoAccessToken(): Promise<string> {
  const { data } = await supabase
    .from("zoho_tokens")
    .select("access_token, expires_at")
    .eq("id", 1)
    .single();
  if (data && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
    return data.access_token;
  }
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type:    "refresh_token",
    }),
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(tok)}`);
  const expiresAt = new Date(Date.now() + ((tok.expires_in ?? 3600) - 120) * 1000);
  await supabase.from("zoho_tokens").upsert({
    id: 1, access_token: tok.access_token, expires_at: expiresAt.toISOString(),
  });
  return tok.access_token;
}

// ── HMAC-SHA256 verification ────────────────────────────────────────────────
// BoldSign uses a Stripe-style signature scheme:
//   header = "t=<unix_seconds>, s0=<hex_hmac>"
// where s0 = HMAC-SHA256(secret, `${timestamp}.${rawBody}`) in lowercase hex.
// We also reject requests older than ~5 minutes to defeat replay attacks.
async function verifyBoldsignSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!BOLDSIGN_WEBHOOK_SECRET) {
    console.warn("[boldsign-webhook] BOLDSIGN_WEBHOOK_SECRET not set — accepting unverified request");
    return true;
  }
  if (!signatureHeader) {
    console.error("[boldsign-webhook] missing signature header");
    return false;
  }
  // Parse "t=..., s0=..." — order isn't guaranteed, so split by comma + key.
  const parts = signatureHeader.split(",").map(p => p.trim());
  let ts = "";
  let sig = "";
  for (const p of parts) {
    if (p.startsWith("t="))  ts  = p.slice(2);
    if (p.startsWith("s0=")) sig = p.slice(3);
  }
  if (!ts || !sig) {
    console.error("[boldsign-webhook] could not parse signature header:", signatureHeader);
    return false;
  }

  // Reject events older than 5 minutes (replay protection).
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(ageSec) || ageSec > 300) {
    console.error("[boldsign-webhook] timestamp too old or invalid:", ts, "ageSec:", ageSec);
    return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(BOLDSIGN_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${rawBody}`));
  // Lowercase hex — BoldSign's s0 is hex, not base64.
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  const ok = expected === sig.toLowerCase();
  if (!ok) console.error("[boldsign-webhook] signature mismatch. expected:", expected, "got:", sig);
  return ok;
}

// ── Zoho: fetch a Lead by id ────────────────────────────────────────────────
async function fetchZohoLead(token: string, leadId: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/Leads/${leadId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    console.error("[boldsign-webhook] Zoho /Leads/" + leadId + " HTTP", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return json?.data?.[0] ?? null;
}

// ── Zoho: create a Contact in Doctors on Board (Contacts module) ────────────
// Mirrors the field set used in zoho-sync's DoB fetch so the new row looks
// like a "real" DoB record. Last_Name is the only required field per Zoho.
async function createZohoContact(token: string, lead: Record<string, any>): Promise<{ id: string } | { error: string }> {
  const payload = {
    data: [{
      Last_Name:   lead.Last_Name  ?? lead.Full_Name ?? "Unknown",
      First_Name:  lead.First_Name ?? null,
      Email:       lead.Email      ?? null,
      Phone:       lead.Phone      ?? null,
      Mobile:      lead.Mobile     ?? null,
      Lead_Source: lead.Lead_Source ?? null,
      // No Owner — Zoho assigns it to the API user automatically. Setting
      // Owner explicitly requires the user's id which we don't have here.
    }],
    // trigger: [] — skip workflow rules to avoid double-emailing the doctor
    trigger: [],
  };
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/Contacts`, {
    method:  "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const json = await res.json();
  const row = json?.data?.[0];
  if (row?.code === "SUCCESS" && row?.details?.id) return { id: row.details.id };
  console.error("[boldsign-webhook] Zoho Contact create failed:", JSON.stringify(json));
  return { error: row?.message ?? `HTTP ${res.status}` };
}

// ── Zoho: flip Lead_Status to "Closed Won" ──────────────────────────────────
async function markLeadClosedWon(token: string, leadId: string): Promise<string | null> {
  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/Leads/${leadId}`, {
    method:  "PUT",
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ data: [{ Lead_Status: "Closed Won" }], trigger: [] }),
  });
  const json = await res.json();
  const row = json?.data?.[0];
  if (row?.code === "SUCCESS") return null;
  const err = `Lead status update failed: ${row?.message ?? `HTTP ${res.status}`}`;
  console.error("[boldsign-webhook]", err, JSON.stringify(json));
  return err;
}

// ── Map BoldSign event type → contract_sends.status ─────────────────────────
// BoldSign event names vary by webhook version; we accept the common set.
function bsEventToStatus(eventType: string): string | null {
  const norm = (eventType ?? "").toLowerCase();
  if (norm.includes("complete") || norm === "signed")  return "signed";
  if (norm.includes("decline"))                         return "declined";
  if (norm.includes("expire"))                          return "expired";
  if (norm.includes("view"))                            return "viewed";
  if (norm.includes("sent"))                            return "sent";
  return null;
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  console.log("[boldsign-webhook] request:", req.method, req.url);
  if (req.method === "GET") {
    return new Response("boldsign-webhook alive", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Read body as raw text first — we need the exact bytes for signature verify
  const rawBody = await req.text();
  const sigHeader = req.headers.get("X-BoldSign-Signature") ?? req.headers.get("x-boldsign-signature");
  const verified = await verifyBoldsignSignature(rawBody, sigHeader);
  if (!verified) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch (e) {
    console.error("[boldsign-webhook] invalid JSON:", e);
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400 });
  }

  // BoldSign nests differently across event versions — pull defensively.
  const eventType  = payload?.event?.eventType ?? payload?.eventType ?? payload?.eventName ?? "";
  const documentId = payload?.data?.documentId ?? payload?.documentId ?? payload?.data?.documentDetails?.documentId;
  const newStatus  = bsEventToStatus(eventType);
  console.log("[boldsign-webhook] eventType:", eventType, "documentId:", documentId, "→ status:", newStatus);

  if (!documentId) {
    return new Response(JSON.stringify({ ok: true, note: "No documentId — ignored" }), { status: 200 });
  }
  if (!newStatus) {
    return new Response(JSON.stringify({ ok: true, note: `Unmapped event type: ${eventType}` }), { status: 200 });
  }

  // Always update the row's status so the dashboard reflects the latest state,
  // regardless of whether this event triggers Zoho automation.
  const { data: existing, error: findErr } = await supabase
    .from("contract_sends")
    .select("*")
    .eq("boldsign_document_id", documentId)
    .maybeSingle();
  if (findErr) {
    console.error("[boldsign-webhook] contract_sends lookup failed:", findErr.message);
    return new Response(JSON.stringify({ ok: false, error: findErr.message }), { status: 500 });
  }
  if (!existing) {
    console.warn("[boldsign-webhook] no contract_sends row for documentId", documentId, "— ignoring");
    return new Response(JSON.stringify({ ok: true, note: "Untracked document" }), { status: 200 });
  }

  await supabase.from("contract_sends").update({
    status:     newStatus,
    updated_at: new Date().toISOString(),
  }).eq("boldsign_document_id", documentId);

  // Only the "signed" event triggers Zoho automation. Bail early on the rest.
  if (newStatus !== "signed") {
    return new Response(JSON.stringify({ ok: true, note: `Status updated to ${newStatus}` }), { status: 200 });
  }
  if (existing.zoho_contact_id) {
    console.log("[boldsign-webhook] already processed (contact_id present) — skipping");
    return new Response(JSON.stringify({ ok: true, note: "Already processed" }), { status: 200 });
  }

  // ── Zoho automation: create Contact + mark Lead Closed Won ────────────────
  let zohoError: string | null = null;
  let contactId: string | null = null;
  try {
    const token = await getZohoAccessToken();
    const lead = await fetchZohoLead(token, existing.zoho_lead_id);
    if (!lead) {
      zohoError = `Lead ${existing.zoho_lead_id} not found in Zoho`;
    } else {
      const contactRes = await createZohoContact(token, lead);
      if ("error" in contactRes) {
        zohoError = contactRes.error;
      } else {
        contactId = contactRes.id;
        const statusErr = await markLeadClosedWon(token, existing.zoho_lead_id);
        // Don't fail the whole flow if status update alone fails — the
        // Contact exists, which is the more important record for ops.
        if (statusErr) zohoError = statusErr;
      }
    }
  } catch (e) {
    zohoError = String(e);
    console.error("[boldsign-webhook] Zoho automation threw:", e);
  }

  await supabase.from("contract_sends").update({
    status:           "signed",
    signed_at:        new Date().toISOString(),
    zoho_contact_id:  contactId,
    zoho_error:       zohoError,
    updated_at:       new Date().toISOString(),
  }).eq("boldsign_document_id", documentId);

  return new Response(JSON.stringify({
    ok:        !zohoError,
    contactId, zohoError,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});

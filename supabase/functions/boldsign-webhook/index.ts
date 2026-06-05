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
import { notify } from "../_shared/notify.ts";

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

// ── Resend: notify admins on contract signing ───────────────────────────────
// Per AA onboarding meeting (2026-05-04): signing alone shouldn't flip the
// Zoho Lead_Status to "Closed Won" because doctors sometimes ghost on the
// VOB payment. Rather than introduce a new picklist value (which would
// require AA to extend their Zoho config), we just email all dashboard
// admins when a contract gets signed and let them decide when to flip the
// status manually after payment lands.
//
// Recipient list = every row in user_profiles where role='admin', plus any
// extras configured via BOLDSIGN_NOTIFY_EMAILS (comma-separated). Falls back
// to BOLDSIGN_SENDER_EMAIL if no admins are configured yet.
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
// Default to Resend's pre-verified shared sender so you can ship without
// adding DNS records. Override with a domain-verified sender (e.g.
// "notifications@allocationassist.com") once you're ready to brand it —
// the rest of the integration doesn't change.
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

async function getAdminEmails(): Promise<string[]> {
  const set = new Set<string>();
  // Admin profiles
  const { data, error } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("role", "admin");
  if (error) {
    console.warn("[boldsign-webhook] could not load admin profiles:", error.message);
  } else {
    for (const row of data ?? []) {
      if (row.email) set.add(String(row.email).trim().toLowerCase());
    }
  }
  // Extra static recipients via env var (e.g. shared ops mailbox)
  const extras = (Deno.env.get("BOLDSIGN_NOTIFY_EMAILS") ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const e of extras) set.add(e);
  // Final fallback so we never silently fail to notify anyone
  if (set.size === 0 && Deno.env.get("BOLDSIGN_SENDER_EMAIL")) {
    set.add(Deno.env.get("BOLDSIGN_SENDER_EMAIL")!.trim().toLowerCase());
  }
  return Array.from(set);
}

async function notifyAdminsOfSigning(row: {
  doctor_name: string;
  doctor_email: string;
  boldsign_document_id: string;
  zoho_contact_id: string | null;
}): Promise<string | null> {
  if (!RESEND_API_KEY) {
    console.warn("[boldsign-webhook] RESEND_API_KEY not set — skipping admin email");
    return null;
  }
  const recipients = await getAdminEmails();
  if (recipients.length === 0) {
    console.warn("[boldsign-webhook] no admin recipients configured");
    return null;
  }

  const trackingUrl = `https://app.boldsign.com/documents/behalfdocuments/overview/?documentId=${row.boldsign_document_id}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; line-height: 1.5; padding: 24px; max-width: 560px; margin: 0 auto;">
  <div style="border-left: 4px solid #14a098; padding: 6px 0 6px 14px; margin-bottom: 18px;">
    <h2 style="margin: 0; font-size: 16px; color: #111;">A doctor just signed their contract</h2>
  </div>
  <p style="margin: 0 0 14px;">
    <strong>${escapeHtml(row.doctor_name)}</strong> (${escapeHtml(row.doctor_email)}) has signed their service agreement.
  </p>
  ${row.zoho_contact_id
    ? `<p style="margin: 0 0 14px; color: #2c7a55;">✓ A Doctors on Board record was automatically created in Zoho.</p>`
    : `<p style="margin: 0 0 14px; color: #a06000;">⚠ Zoho Contact creation pending — check the dashboard if it doesn't appear shortly.</p>`}
  <p style="margin: 0 0 20px; color: #555; font-size: 13px;">
    The lead's Zoho status has <strong>NOT</strong> been changed automatically. Once VOB payment is received, please update the lead to "Closed Won" manually.
  </p>
  <a href="${trackingUrl}" style="display: inline-block; background: #14a098; color: white; text-decoration: none; padding: 9px 18px; border-radius: 6px; font-size: 13px; font-weight: 600;">
    View signed document on BoldSign
  </a>
  <p style="margin: 24px 0 0; font-size: 11px; color: #888;">
    Sent automatically by the AA dashboard. Document ID: ${row.boldsign_document_id}
  </p>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    `Allocation Assist <${RESEND_FROM_EMAIL}>`,
      to:      recipients,
      subject: `${row.doctor_name} signed their contract`,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = `Resend ${res.status}: ${text.slice(0, 200)}`;
    console.error("[boldsign-webhook] Resend send failed:", err);
    return err;
  }
  console.log("[boldsign-webhook] admin notification sent to", recipients.join(", "));
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
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

// ── Sync the BoldSign event into the contract_signing flow_run ──────────────
// Idempotent: re-deliveries don't double-advance because we only update when
// the current_stage matches the expected "before" stage for each transition.
// On signed, ALSO inserts a Relocation flow run (Flow 6) so the post-signing
// guide + attestation sequence kicks off automatically.
async function mirrorBoldSignEventToFlowRun(documentId: string, newStatus: string): Promise<void> {
  // Find the contract_signing run for this envelope. `metadata->>boldsign_document_id`
  // is the PostgREST JSON-text accessor.
  const { data: runs, error: findErr } = await supabase
    .from("automation_flow_runs")
    .select("*")
    .eq("flow_key", "contract_signing")
    .filter("metadata->>boldsign_document_id", "eq", documentId);
  if (findErr) {
    console.warn("[boldsign-webhook] flow_run lookup failed:", findErr.message);
    return;
  }
  const run = (runs ?? [])[0];
  if (!run) {
    console.log("[boldsign-webhook] no contract_signing run for doc", documentId, "— skipping mirror (probably sent before flow integration shipped)");
    return;
  }
  if (run.status !== "active") {
    console.log("[boldsign-webhook] run", run.id, "is", run.status, "— skipping further updates");
    return;
  }

  const nowIso = new Date().toISOString();
  if (newStatus === "viewed") {
    if (run.current_stage !== "awaiting_view") {
      console.log("[boldsign-webhook] run", run.id, "already past awaiting_view (stage =", run.current_stage + ") — skipping");
      return;
    }
    await supabase.from("automation_flow_runs").update({
      current_stage: "awaiting_signature",
      last_event_at: nowIso,
    }).eq("id", run.id);
    await supabase.from("automation_flow_events").insert([
      { run_id: run.id, stage_key: "awaiting_view",      event_type: "email_opened",
        message: "BoldSign: doctor opened the envelope." },
      { run_id: run.id, stage_key: "awaiting_signature", event_type: "entered",
        message: "Waiting for signature. BoldSign auto-reminders every 3 days." },
    ]);
    console.log("[boldsign-webhook] mirrored viewed → run", run.id);
    return;
  }

  if (newStatus === "declined" || newStatus === "expired") {
    await supabase.from("automation_flow_runs").update({
      status:        "failed",
      last_event_at: nowIso,
    }).eq("id", run.id);
    await supabase.from("automation_flow_events").insert({
      run_id:     run.id,
      stage_key:  run.current_stage,
      event_type: "error",
      message:    `BoldSign: ${newStatus}. Flow stopped.`,
    });
    console.log("[boldsign-webhook] mirrored", newStatus, "→ run", run.id);
    return;
  }

  if (newStatus === "signed") {
    if (run.current_stage === "contract_signed") {
      console.log("[boldsign-webhook] run", run.id, "already signed — skipping");
      return;
    }
    await supabase.from("automation_flow_runs").update({
      current_stage: "contract_signed",
      status:        "completed",
      completed_at:  nowIso,
      last_event_at: nowIso,
    }).eq("id", run.id);
    await supabase.from("automation_flow_events").insert({
      run_id:     run.id,
      stage_key:  "contract_signed",
      event_type: "completed",
      message:    "Doctor signed. Zoho updates triggered; Relocation flow firing.",
    });
    console.log("[boldsign-webhook] mirrored signed → run", run.id);

    // ── Auto-trigger Relocation flow ──────────────────────────────────────
    // Signing is the explicit trigger for Relocation in Saif's process.
    // If the Contract Builder captured a hospital_id, we look up the city
    // and skip past `select_city_guide` directly to `send_relocation_email`
    // — guide + attestation then auto-chain via send-flow-email's
    // auto_continue. Net effect: zero manual clicks between signing and the
    // doctor receiving both relocation emails.
    try {
      const md = (run.metadata ?? {}) as Record<string, unknown>;
      const hospitalId = md.hospital_id as string | undefined;

      // Try to resolve the city from the captured hospital_id.
      let resolvedCity: string | null = null;
      let resolvedHospital: string | null = run.hospital;
      if (hospitalId) {
        const { data: h } = await supabase
          .from("hospitals")
          .select("name, city")
          .eq("id", hospitalId)
          .maybeSingle();
        if (h?.city) {
          resolvedCity = h.city;
          resolvedHospital = h.name ?? resolvedHospital;
          console.log("[boldsign-webhook] auto-resolved relocation city:", h.city, "from hospital:", h.name);
        }
      }

      // If we know the city, skip the wait stage and start at the email send.
      // Otherwise fall back to the original behavior (wait at select_city_guide
      // for the team to manually pick).
      const startStage   = resolvedCity ? "send_relocation_email" : "select_city_guide";
      const relMetadata: Record<string, unknown> = {
        triggered_via:        "boldsign_signed",
        source_contract_run:  run.id,
        boldsign_document_id: documentId,
        zoho_lead_id:         md.zoho_lead_id ?? null,
      };
      if (hospitalId) relMetadata.hospital_id = hospitalId;
      if (resolvedCity) relMetadata.city = resolvedCity;

      const { data: relRun, error: relErr } = await supabase
        .from("automation_flow_runs")
        .insert({
          flow_key:      "relocation",
          doctor_id:     run.doctor_id,
          doctor_name:   run.doctor_name,
          doctor_email:  run.doctor_email,
          doctor_phone:  run.doctor_phone,
          hospital:      resolvedHospital,
          current_stage: startStage,
          status:        "active",
          metadata:      relMetadata,
        })
        .select("id")
        .single();

      if (relErr || !relRun) {
        console.warn("[boldsign-webhook] relocation auto-trigger failed:", relErr?.message);
      } else {
        // Seed the timeline. trigger_offer_signed always; then either:
        //   - city known → skipped select_city_guide as a completed step + entered send_relocation_email
        //   - city unknown → entered select_city_guide (manual pick needed)
        const events: Array<{ run_id: string; stage_key: string; event_type: string; message: string }> = [
          { run_id: relRun.id, stage_key: "trigger_offer_signed", event_type: "entered",
            message: `Auto-triggered by signed contract (doc ${documentId}).` },
        ];
        if (resolvedCity) {
          events.push(
            { run_id: relRun.id, stage_key: "select_city_guide", event_type: "completed",
              message: `City auto-resolved from hospital: ${resolvedCity}. Skipping manual pick.` },
            { run_id: relRun.id, stage_key: "send_relocation_email", event_type: "entered",
              message: "Queued for sending." },
          );
        } else {
          events.push(
            { run_id: relRun.id, stage_key: "select_city_guide", event_type: "entered",
              message: run.hospital
                ? `Resolving city guide for ${run.hospital}.`
                : "Hospital not set on contract run — Hospital Intro team needs to set city before guide goes out." },
          );
        }
        await supabase.from("automation_flow_events").insert(events);

        // If we skipped to the email send stage, fire it immediately.
        // send-flow-email's auto_continue then chains to send_attestation_email.
        if (resolvedCity) {
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-flow-email`, {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ run_id: relRun.id }),
          }).catch(e => console.error("[boldsign-webhook] relocation send invoke threw:", e));
          console.log("[boldsign-webhook] relocation run auto-created + relocation guide email queued:", relRun.id);
        } else {
          console.log("[boldsign-webhook] relocation run auto-created (awaiting city pick):", relRun.id);
        }
      }
    } catch (e) {
      console.warn("[boldsign-webhook] relocation auto-trigger threw (non-fatal):", e);
    }
    return;
  }

  // "sent" arrives shortly after envelope creation; the run is already at
  // awaiting_view so we just log.
  if (newStatus === "sent") {
    console.log("[boldsign-webhook] sent event for run", run.id, "— already at awaiting_view, no-op");
  }
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

  // Mirror the event into the Automations timeline. Runs on every status,
  // not just signed — viewed/declined/expired all need to advance the
  // contract_signing flow. Wrapped so a flow_run failure can't kill the
  // critical Zoho path below.
  try {
    await mirrorBoldSignEventToFlowRun(documentId, newStatus);
  } catch (e) {
    console.warn("[boldsign-webhook] flow_run mirror threw (non-fatal):", e);
  }

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
        // We deliberately DON'T touch Lead_Status here — AA's Zoho config
        // doesn't have a "signed but unpaid" picklist value, and signing
        // alone isn't a real conversion (some doctors ghost on VOB
        // payment). Admins are notified via Resend instead and can flip
        // the status manually once payment lands.
      }
    }
  } catch (e) {
    zohoError = String(e);
    console.error("[boldsign-webhook] Zoho automation threw:", e);
  }

  // Notify admins via Resend. Done regardless of Zoho outcome — we don't
  // want a Contact-creation error to prevent the team from learning that a
  // contract got signed.
  const emailErr = await notifyAdminsOfSigning({
    doctor_name:          existing.doctor_name,
    doctor_email:         existing.doctor_email,
    boldsign_document_id: documentId,
    zoho_contact_id:      contactId,
  }).catch(e => {
    console.error("[boldsign-webhook] notifyAdminsOfSigning threw:", e);
    return String(e);
  });

  await supabase.from("contract_sends").update({
    status:           "signed",
    signed_at:        new Date().toISOString(),
    zoho_contact_id:  contactId,
    zoho_error:       zohoError,
    updated_at:       new Date().toISOString(),
  }).eq("boldsign_document_id", documentId);

  // High-signal celebratory + actionable nudge so HI can log the
  // milestone in the Placements tab without waiting for a tick.
  await notify({
    kind:    "contract_signed",
    title:   `${existing.doctor_name} signed their contract`,
    body:    `Service agreement received via BoldSign${zohoError ? "" : " · Doctors on Board record created in Zoho"}. Log the joining date in Reports → Placements so the 45-day payment clock arms.`,
    link_path: `/reports`,
    related_doctor_id: contactId ? `dob:${contactId}` : null,
  }).catch(e => console.error("[boldsign-webhook] notify failed:", e));

  return new Response(JSON.stringify({
    ok:        !zohoError && !emailErr,
    contactId, zohoError, emailErr,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});

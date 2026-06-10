/**
 * inbound-hospital-reply — Supabase Edge Function
 *
 * Public endpoint that Resend Inbound POSTs to whenever a hospital recruiter
 * replies to one of our Profile Sent emails. We:
 *
 *   1. Verify the webhook signature (if RESEND_INBOUND_SECRET is set)
 *   2. Parse the email payload (defensive — Resend's exact shape may evolve)
 *   3. Find the matching Profile Sent run via:
 *        a) In-Reply-To / References header → outgoing message_id we stored
 *           on the run's metadata
 *        b) Subject pattern match → "Re: ... Dr. X ..." → active profile_sent
 *           runs for that doctor name
 *        c) Sender domain → active profile_sent runs to that hospital
 *   4. Hand off to classify-hospital-reply with the reply text + matched run
 *
 * Deploy with `--no-verify-jwt` so Resend can POST without a Supabase JWT.
 *
 * Secrets:
 *   RESEND_INBOUND_SECRET — Svix-style HMAC signing secret from Resend's
 *     Inbound route config. Optional during initial setup; once set, unsigned
 *     requests get rejected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const INBOUND_SECRET = Deno.env.get("RESEND_INBOUND_SECRET") ?? "";

console.log("[inbound-hospital-reply] booted. Signature verification:", INBOUND_SECRET ? "ON" : "OFF");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method === "GET")     return new Response("inbound-hospital-reply alive", { status: 200 });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();

  // ── Signature verification (Svix-compatible) ────────────────────────────
  // Resend's inbound webhooks use Svix under the hood. Headers:
  //   svix-id, svix-timestamp, svix-signature
  // Signed payload = `${svix_id}.${svix_timestamp}.${rawBody}`, signed via
  // HMAC-SHA256 with the secret, base64-encoded. Signature header contains
  // space-separated "v1,<base64>" entries. We accept if any match.
  if (INBOUND_SECRET) {
    const svixId   = req.headers.get("svix-id");
    const svixTs   = req.headers.get("svix-timestamp");
    const svixSig  = req.headers.get("svix-signature");
    if (!svixId || !svixTs || !svixSig) {
      console.warn("[inbound-hospital-reply] missing svix-* headers — rejecting");
      return new Response("Missing signature headers", { status: 401 });
    }
    const ok = await verifySvixSignature(svixId, svixTs, rawBody, svixSig, INBOUND_SECRET);
    if (!ok) {
      console.warn("[inbound-hospital-reply] signature mismatch — rejecting");
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  console.log("[inbound-hospital-reply] received event, top-level keys:", Object.keys(payload));

  // ── Parse Resend payload ────────────────────────────────────────────────
  // Real shape (confirmed from Resend webhook logs 2026-05-22):
  //   { type: "email.received", created_at, data: { email_id, from, to, cc, bcc,
  //     subject, message_id, created_at, attachments: [...] } }
  // The body fields (text/html) are NOT in the webhook payload — they require
  // a separate API call to GET /emails/receiving/{email_id}. The metadata is
  // present though.
  //
  // Docs: https://resend.com/docs/dashboard/receiving/get-email-content
  const eventType = (payload.type as string | undefined) ?? "";
  const webhookData = (payload.data as Record<string, unknown>) ?? {};
  // Accept both `email_id` (current Resend shape) and `id` (older / generic
  // webhook spec) as the source of the email identifier — defensive against
  // future schema tweaks.
  const emailId = (webhookData.email_id as string | undefined) ?? (webhookData.id as string | undefined);
  if (eventType !== "email.received") {
    console.log("[inbound-hospital-reply] non-inbound event:", eventType, "— ignoring");
    return new Response(JSON.stringify({ ok: true, note: `Ignored event type: ${eventType}` }), { status: 200 });
  }
  if (!emailId) {
    console.warn("[inbound-hospital-reply] webhook payload missing data.email_id");
    return new Response(JSON.stringify({ ok: false, error: "Missing email id in payload" }), { status: 400 });
  }

  // Fetch the full email content
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not set" }), { status: 500 });
  }
  const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!fetchRes.ok) {
    const text = await fetchRes.text();
    console.error("[inbound-hospital-reply] Resend GET failed:", fetchRes.status, text.slice(0, 400));
    return new Response(JSON.stringify({ ok: false, error: `Resend API ${fetchRes.status}`, detail: text.slice(0, 400) }), { status: 200 });
  }
  const email = await fetchRes.json() as {
    id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    html?: string | null;
    text?: string | null;
    headers?: Record<string, string> | Array<{ name?: string; value?: string }>;
    message_id?: string;
    cc?: string[];
    bcc?: string[];
    reply_to?: string[];
  };

  const replyFrom    = email.from ?? "";
  const replySubject = email.subject ?? "";
  const replyText    = email.text ?? "";
  const replyHtml    = email.html ?? "";
  // The `to` field is an array of recipient addresses. For replies to our
  // Profile Sent emails, this includes `reply-<run_id>@reply.allocationassist.com`
  // — the unique address we set as Reply-To on the outbound. Parsing that
  // address gives us 100% match accuracy.
  const toList: string[] = [
    ...(Array.isArray(email.to) ? email.to : []),
    ...(Array.isArray(email.cc) ? email.cc : []),
    ...(Array.isArray(email.bcc) ? email.bcc : []),
  ].filter(Boolean);

  if (!replyText && !replyHtml) {
    console.warn("[inbound-hospital-reply] no body content found via Resend API");
    return new Response(JSON.stringify({ ok: true, note: "Empty body, ignored" }), { status: 200 });
  }

  // Headers from Resend's API can be either an object (Record<string,string>)
  // or array form. Normalise to a map.
  const headerMap = new Map<string, string>();
  if (Array.isArray(email.headers)) {
    for (const h of email.headers) {
      if (h.name) headerMap.set(h.name.toLowerCase(), h.value ?? "");
    }
  } else if (email.headers && typeof email.headers === "object") {
    for (const [k, v] of Object.entries(email.headers)) {
      headerMap.set(k.toLowerCase(), String(v));
    }
  }
  const inReplyTo = headerMap.get("in-reply-to") ?? "";
  const references = headerMap.get("references") ?? "";

  console.log("[inbound-hospital-reply] from:", replyFrom, "subject:", replySubject, "in-reply-to:", inReplyTo);

  // ── Find the matching Profile Sent run ──────────────────────────────────
  let runId: string | null = null;
  let matchMethod = "none";

  // Match strategy 0 (PRIMARY): unique reply-to address with embedded run_id.
  // send-flow-email sets `Reply-To: reply-<run_id>@reply.allocationassist.com` on
  // every outbound, so any hospital reply lands here with the run_id literally
  // in the recipient address. 100% accuracy, no header dependency.
  const REPLY_ADDR_RE = /reply-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
  for (const addr of toList) {
    const m = addr.match(REPLY_ADDR_RE);
    if (m) {
      // Verify the run actually exists — anyone could craft a UUID, we don't
      // want to spam classify-hospital-reply with garbage IDs.
      const { data: verify } = await supabase
        .from("automation_flow_runs")
        .select("id")
        .eq("id", m[1])
        .maybeSingle();
      if (verify) {
        runId = m[1];
        matchMethod = "reply-to-address";
        break;
      }
    }
  }

  // Match strategy 1: outgoing message_id stored in metadata
  // (We set this when sending — see updates to send-flow-email below.)
  const allRefs = [inReplyTo, ...references.split(/\s+/)].filter(Boolean).map(s => s.replace(/[<>]/g, ""));
  if (!runId && allRefs.length > 0) {
    for (const ref of allRefs) {
      const { data: runs } = await supabase
        .from("automation_flow_runs")
        .select("id")
        .eq("flow_key", "profile_sent")
        .filter("metadata->>outgoing_message_id", "eq", ref)
        .limit(1);
      if (runs && runs.length > 0) {
        runId = runs[0].id;
        matchMethod = "in-reply-to";
        break;
      }
    }
  }

  // Match strategy 2: doctor name in subject + active profile_sent run
  // Captures "Re: Candidate introduction — Dr. Heena Sharma" patterns.
  if (!runId && replySubject) {
    // Strip "Re:" / "Fwd:" prefixes
    const cleanedSubject = replySubject.replace(/^((re|fwd|fw|aw):\s*)+/i, "").trim();
    const { data: candidates } = await supabase
      .from("automation_flow_runs")
      .select("id, doctor_name, hospital, created_at")
      .eq("flow_key", "profile_sent")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);
    for (const c of candidates ?? []) {
      if (c.doctor_name && cleanedSubject.toLowerCase().includes(c.doctor_name.toLowerCase())) {
        runId = c.id;
        matchMethod = "subject-doctor-name";
        break;
      }
    }
  }

  // Match strategy 3: sender domain matches a hospital with an active run
  if (!runId && replyFrom) {
    const senderDomain = replyFrom.split("@")[1]?.toLowerCase();
    if (senderDomain) {
      // Hospitals table holds primary_recruiter_email; we match by domain.
      const { data: hospitals } = await supabase
        .from("hospitals")
        .select("id, name, primary_recruiter_email");
      const matchingHospital = hospitals?.find(h =>
        h.primary_recruiter_email?.toLowerCase().endsWith("@" + senderDomain),
      );
      if (matchingHospital) {
        const { data: runs } = await supabase
          .from("automation_flow_runs")
          .select("id")
          .eq("flow_key", "profile_sent")
          .eq("status", "active")
          .ilike("hospital", `%${matchingHospital.name}%`)
          .order("created_at", { ascending: false })
          .limit(1);
        if (runs && runs.length > 0) {
          runId = runs[0].id;
          matchMethod = "sender-domain";
        }
      }
    }
  }

  // ── Log + classify ──────────────────────────────────────────────────────
  if (!runId) {
    console.warn("[inbound-hospital-reply] could not match reply to a run — logging unmatched");
    await supabase.from("hospital_replies").insert({
      doctor_name:   "(unmatched)",
      hospital_name: replyFrom ?? null,
      reply_from:    replyFrom,
      reply_subject: replySubject,
      reply_text:    replyText || stripHtml(replyHtml),
      classification: "unclear",
      ai_summary:    "Inbound reply could not be matched to any active Profile Sent run",
      action_taken:  "Logged as unmatched — team should review manually",
      source:        "resend_inbound",
    });
    return new Response(JSON.stringify({ ok: true, note: "Unmatched; logged for manual review" }), { status: 200 });
  }

  console.log("[inbound-hospital-reply] matched via", matchMethod, "→ run", runId);

  // Hand off to classify-hospital-reply
  const classifyRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/classify-hospital-reply`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      run_id:        runId,
      reply_text:    replyText || stripHtml(replyHtml),
      reply_subject: replySubject,
      reply_from:    replyFrom,
      source:        "resend_inbound",
    }),
  });

  const classifyBody = await classifyRes.text();
  if (!classifyRes.ok) {
    console.error("[inbound-hospital-reply] classify failed:", classifyRes.status, classifyBody.slice(0, 400));
    return new Response(JSON.stringify({ ok: false, error: "Classifier failed", detail: classifyBody.slice(0, 400) }), { status: 200 });
    // Note: still return 200 to Resend so they don't retry endlessly on
    // a Claude/classification issue. We've already logged the failure.
  }

  return new Response(JSON.stringify({ ok: true, matched_run: runId, match_method: matchMethod }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function verifySvixSignature(id: string, ts: string, body: string, sigHeader: string, secret: string): Promise<boolean> {
  // Svix secrets are prefixed "whsec_" — strip and base64-decode.
  const secretClean = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(secretClean), c => c.charCodeAt(0));
  } catch {
    console.error("[inbound-hospital-reply] could not base64-decode secret");
    return false;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", secretBytes,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Header is space-separated entries like "v1,abc= v1,def="
  for (const part of sigHeader.split(/\s+/)) {
    const [scheme, sig] = part.split(",");
    if (scheme === "v1" && sig === expected) return true;
  }
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

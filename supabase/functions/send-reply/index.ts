/**
 * send-reply — send an arbitrary reply or forward from the Replies inbox.
 *
 * Unlike send-flow-email/send-batch (both gated on a flow-run/batch row +
 * template), this is a thin generic sender: it takes a composed message and
 * POSTs it to Resend. From = the Allocation Assist Team address; Reply-To routes
 * further replies back into the inbox (reply-<run_id>@reply.allocationassist.com)
 * so the conversation stays captured. Threading headers (In-Reply-To/References)
 * are set from the source reply's Message-ID when we have it. TEST-mode override
 * is honoured so composing during testing never reaches real recipients.
 *
 * JWT-verified (deployed WITHOUT --no-verify-jwt): only signed-in dashboard users
 * can send. Uses the service-role client only to read the source row + stamp it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM         = Deno.env.get("MAIL_REPLY_FROM") ?? "Allocation Assist Team <hello@allocationassist.com>";
const MAIL_REPLY_DOMAIN = Deno.env.get("MAIL_REPLY_DOMAIN") ?? "reply.allocationassist.com";
const TEST_OVERRIDE     = (Deno.env.get("MAIL_TEST_RECIPIENT_OVERRIDE") ?? "").split(",").map(s => s.trim()).filter(Boolean)[0] ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Accept a comma/semicolon string or an array → deduped list of valid emails. */
function addrs(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? "").split(/[,;]/);
  const out: string[] = [];
  for (const item of raw) {
    const e = String(item ?? "").trim();
    if (e.includes("@") && !out.some(x => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

/** Base64-inline attachments by URL (skip anything that fails — never fail the
 *  send over one bad file). Mirrors send-batch's hardened builder. */
async function buildAttachments(v: unknown): Promise<Array<{ filename: string; content: string }>> {
  if (!Array.isArray(v) || v.length === 0) return [];
  const MAX = 25 * 1024 * 1024;
  const toB64 = (bytes: Uint8Array) => {
    let bin = ""; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const out: Array<{ filename: string; content: string }> = [];
  let total = 0;
  for (const a of v as Array<Record<string, unknown>>) {
    const path = String(a?.path ?? "");
    const filename = String(a?.filename ?? "attachment");
    if (!path.startsWith("http")) continue;
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0 || total + bytes.byteLength > MAX) continue;
      total += bytes.byteLength;
      out.push({ filename, content: toB64(bytes) });
    } catch { /* skip */ }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }

  const action   = body.action === "forward" ? "forward" : "reply";
  const replyId  = typeof body.reply_id === "string" ? body.reply_id : null;
  const to       = addrs(body.to);
  const cc       = addrs(body.cc);
  const bcc      = addrs(body.bcc);
  const subject  = String(body.subject ?? "").trim();
  const html     = typeof body.html === "string" ? body.html : "";
  const text     = typeof body.text === "string" ? body.text : "";

  if (!to.length)          return json({ ok: false, error: "No recipient." }, 400);
  if (!subject)            return json({ ok: false, error: "Subject is required." }, 400);
  if (!html && !text)      return json({ ok: false, error: "Message body is empty." }, 400);

  // Thread + run linkage from the source reply (if this is a reply to one).
  let runId: string | null = null, inReplyTo = "", references = "";
  if (replyId) {
    const { data: row } = await sb
      .from("hospital_replies")
      .select("run_id, reply_message_id, in_reply_to")
      .eq("id", replyId).maybeSingle();
    if (row) {
      runId      = (row as { run_id: string | null }).run_id ?? null;
      inReplyTo  = String((row as { reply_message_id: string | null }).reply_message_id ?? "").trim();
      references = [String((row as { in_reply_to: string | null }).in_reply_to ?? ""), inReplyTo].filter(Boolean).join(" ").trim();
    }
  }
  // Further replies come back into the inbox.
  const replyTo = runId ? `reply-${runId}@${MAIL_REPLY_DOMAIN}` : `inbox@${MAIL_REPLY_DOMAIN}`;

  const attachments = await buildAttachments(body.attachments);

  // TEST-mode: redirect the whole send to the test inbox; drop cc/bcc so nobody
  // real is looped in while the training wheels are on.
  const liveTo  = TEST_OVERRIDE ? [TEST_OVERRIDE] : to;
  const liveCc  = TEST_OVERRIDE ? [] : cc;
  const liveBcc = TEST_OVERRIDE ? [] : bcc;

  const headers: Record<string, string> = { "X-AA-Reply-Action": action };
  if (inReplyTo) { headers["In-Reply-To"] = inReplyTo; headers["References"] = references || inReplyTo; }

  const payload: Record<string, unknown> = {
    from: MAIL_FROM,
    to: liveTo,
    ...(liveCc.length  ? { cc:  liveCc }  : {}),
    ...(liveBcc.length ? { bcc: liveBcc } : {}),
    reply_to: replyTo,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    headers,
    ...(attachments.length ? { attachments } : {}),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const respText = await res.text();
  if (!res.ok) return json({ ok: false, error: `Resend ${res.status}: ${respText.slice(0, 300)}` }, 502);

  // Stamp the source reply so the inbox reflects what happened.
  if (replyId) {
    const patch = action === "forward"
      ? { forwarded_at: new Date().toISOString(), is_read: true }
      : { handled_at: new Date().toISOString(), is_read: true };
    await sb.from("hospital_replies").update(patch).eq("id", replyId);
  }

  return json({ ok: true, test_mode: !!TEST_OVERRIDE }, 200);
});

/**
 * send-cv-upload-link — Supabase Edge Function
 *
 * Generates a token-gated CV upload URL for a doctor, persists it to
 * cv_uploads, and emails the doctor with the link via Resend.
 *
 * Request:
 *   { doctor_id: string, doctor_name: string, doctor_email: string,
 *     app_origin: string, created_by?: string }
 *
 *   app_origin = window.location.origin from the caller. We don't hardcode
 *   it because dev runs at localhost:8081 while prod runs at the Railway
 *   URL or a future custom domain — and the link needs to work from the
 *   doctor's email client which only knows absolute URLs.
 *
 * Response:
 *   { ok: true, token: string, upload_url: string, message_id?: string }
 *   { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM      = Deno.env.get("MAIL_FROM") ?? "Hospital Intro <onboarding@resend.dev>";
// Comma-separated test recipients — first goes on To:, rest on Cc:
// so multiple internal addresses (Shaheer + Ammar) see test emails as
// they go out. Mirrors the pattern in send-flow-email + send-batch.
const TEST_OVERRIDE_LIST = (Deno.env.get("MAIL_TEST_RECIPIENT_OVERRIDE") ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);
const TEST_OVERRIDE      = TEST_OVERRIDE_LIST[0] ?? "";
const TEST_OVERRIDE_CC   = TEST_OVERRIDE_LIST.slice(1);

console.log("[send-cv-upload-link] booted. Resend key:", !!RESEND_API_KEY, "From:", MAIL_FROM, "Test override:", TEST_OVERRIDE_LIST.join(", ") || "(none)");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { doctor_id?: string; doctor_name?: string; doctor_email?: string; app_origin?: string; created_by?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { doctor_id, doctor_name, doctor_email, app_origin } = body;
  if (!doctor_id || !doctor_name) return json({ ok: false, error: "doctor_id and doctor_name required" }, 400);
  if (!doctor_email)               return json({ ok: false, error: "Doctor has no email on file" }, 400);
  if (!app_origin)                 return json({ ok: false, error: "app_origin required" }, 400);
  if (!RESEND_API_KEY)             return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);

  // Reuse an existing pending token for this doctor if one is still valid,
  // so spamming the button doesn't create N orphaned tokens.
  const { data: existing } = await supabase
    .from("cv_uploads")
    .select("*")
    .eq("doctor_id", doctor_id)
    .in("status", ["pending_upload"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token: string;
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    token = existing.token;
    console.log("[send-cv-upload-link] reusing existing token for", doctor_id);
  } else {
    token = crypto.randomUUID().replace(/-/g, "");  // 32 char hex
    const { error: insertErr } = await supabase.from("cv_uploads").insert({
      doctor_id,
      doctor_name,
      doctor_email,
      token,
      status:     "pending_upload",
      created_by: body.created_by ?? null,
    });
    if (insertErr) {
      console.error("[send-cv-upload-link] cv_uploads insert failed:", insertErr.message);
      return json({ ok: false, error: "Could not create upload slot", detail: insertErr.message }, 500);
    }
  }

  const trimmedOrigin = app_origin.replace(/\/+$/, "");
  const uploadUrl     = `${trimmedOrigin}/upload-cv/${token}`;

  // Resend
  const effectiveTo = TEST_OVERRIDE || doctor_email;
  const subject = `Quick step — upload your CV for Allocation Assist`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; color: #111; line-height: 1.5; padding: 24px; max-width: 560px; margin: 0 auto;">
  <p>Hi ${escapeHtml(doctor_name)},</p>
  <p>Quick step to keep your application moving — please upload your latest CV using the secure link below. It takes about 30 seconds.</p>
  <p style="margin: 24px 0;">
    <a href="${uploadUrl}" style="display: inline-block; background: #14a098; color: white; text-decoration: none; padding: 11px 22px; border-radius: 6px; font-size: 14px; font-weight: 600;">
      Upload my CV
    </a>
  </p>
  <p style="font-size: 12px; color: #555;">
    Or paste this link into your browser:<br>
    <a href="${uploadUrl}" style="color: #14a098; word-break: break-all;">${uploadUrl}</a>
  </p>
  <p style="font-size: 12px; color: #888; margin-top: 28px;">
    This link is unique to you and expires in 90 days. PDF or Word docs work best (max 10MB).
  </p>
  <p>Thanks!<br>The Allocation Assist team</p>
</body></html>`;
  const text = `Hi ${doctor_name},

Quick step to keep your application moving — please upload your latest CV using the secure link below. It takes about 30 seconds.

${uploadUrl}

This link is unique to you and expires in 90 days. PDF or Word docs work best (max 10MB).

Thanks!
The Allocation Assist team`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    MAIL_FROM,
      to:      [effectiveTo],
      ...(TEST_OVERRIDE && TEST_OVERRIDE_CC.length > 0 ? { cc: TEST_OVERRIDE_CC } : {}),
      subject,
      html,
      text,
      headers: {
        "X-AA-CV-Upload-Token":  token,
        "X-AA-Doctor-Id":        doctor_id,
        ...(TEST_OVERRIDE && effectiveTo !== doctor_email
          ? { "X-AA-Original-Recipient": doctor_email } : {}),
      },
    }),
  });
  const resendBody = await resendRes.text();
  if (!resendRes.ok) {
    console.error("[send-cv-upload-link] Resend rejected:", resendRes.status, resendBody.slice(0, 400));
    return json({ ok: false, error: `Resend ${resendRes.status}`, detail: resendBody.slice(0, 400) }, resendRes.status);
  }
  let messageId = "";
  try { messageId = (JSON.parse(resendBody) as { id?: string }).id ?? ""; } catch { /* fine */ }

  console.log("[send-cv-upload-link] link sent to", effectiveTo, "message_id:", messageId);

  return json({
    ok: true,
    token,
    upload_url: uploadUrl,
    message_id: messageId,
    to:         effectiveTo,
  }, 200);
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

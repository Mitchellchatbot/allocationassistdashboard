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
  // Plain-text Plinky style — matches the automations templates (no teal
  // button, no card frame, no rounded chrome). Single-image AA logo at
  // the bottom of the signature picks up from email-assets bucket.
  const sans       = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const logoUrl    = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/logo.png`;
  const html = `<div style="font-family:${sans};font-size:14px;color:#1a2332;line-height:1.55;">
<p>Hi ${escapeHtml(doctor_name)},</p>
<p>Quick step to keep your application moving — please upload your latest CV using the secure link below. It takes about 30 seconds.</p>
<p><a href="${uploadUrl}" style="color:#1d4ed8;text-decoration:underline;">${uploadUrl}</a></p>
<p>This link is unique to you and expires in 90 days. PDF or Word docs work best (max 10MB).</p>
<p>Thanks!</p>
<p style="margin:24px 0 0;font-family:${sans};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${sans};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${sans};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${sans};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${sans};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;"><img src="${logoUrl}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" /></td></tr>
</table>
</div>`;
  const text = `Hi ${doctor_name},

Quick step to keep your application moving — please upload your latest CV using the secure link below. It takes about 30 seconds.

${uploadUrl}

This link is unique to you and expires in 90 days. PDF or Word docs work best (max 10MB).

Thanks!

Warmest Regards,
The Allocation Assist team

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com`;

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

/**
 * Generic form webhook — handles Elementor + future non-Typeform sources.
 *
 * Endpoint:
 *   POST /functions/v1/form-webhook?key=<webhook_secret>
 *
 * The `key` query param identifies the form. We look up the row by
 * webhook_secret (unique per form) and store the entire payload in
 * form_responses. Whatever Elementor (or any other source) sends as
 * JSON or form-encoded body is stored verbatim in raw_payload + an
 * extracted key/value map in answers.
 *
 * Why this exists separately from typeform-webhook:
 *   - Typeform has a strict payload shape we can validate + flatten
 *     intelligently per-field-type.
 *   - Elementor / generic webhooks ship arbitrary shapes. We trust the
 *     URL secret and accept whatever comes.
 *
 * Idempotency: Elementor doesn't ship a stable response_id. We compute
 * one from a hash of (form_id + submitted_at + payload digest) so
 * accidental webhook retries don't double-insert.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notify } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  // ── 1. Find the form via the URL secret ─────────────────────────────
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!key) return json({ ok: false, error: "Missing ?key=<webhook_secret>" }, 400);

  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("*")
    .eq("webhook_secret", key)
    .maybeSingle();
  if (formErr) {
    console.error("[form-webhook] form lookup failed:", formErr);
    return json({ ok: false, error: "Lookup failed" }, 500);
  }
  if (!form) {
    console.warn("[form-webhook] no form with that key (key looks like ", key.slice(0, 6), "…)");
    return json({ ok: false, error: "Unknown form key" }, 401);
  }

  // ── 2. Read body as either JSON or form-encoded ─────────────────────
  // Elementor's webhook action defaults to form-encoded; most other
  // tools default to JSON. Handle both transparently.
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  let raw: Record<string, unknown> = {};
  let rawText = "";
  try {
    if (contentType.includes("application/json")) {
      rawText = await req.text();
      raw = rawText ? JSON.parse(rawText) : {};
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const obj: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) obj[k] = typeof v === "string" ? v : "(file)";
      raw    = obj;
      rawText = JSON.stringify(obj);
    } else {
      // Best-effort: try JSON first, fall back to text.
      rawText = await req.text();
      try { raw = JSON.parse(rawText); }
      catch { raw = { _raw: rawText }; }
    }
  } catch (e) {
    console.error("[form-webhook] body parse failed:", e);
    return json({ ok: false, error: "Body parse failed" }, 400);
  }

  // ── 3. Flatten + extract respondent name/email heuristically ────────
  // Different sources ship different shapes:
  //   - Elementor: top-level key/value, sometimes under `fields`
  //   - WooCommerce: deeply nested objects (billing.email, shipping.phone)
  //   - Generic webhooks: arbitrary JSON
  // Recursively flatten objects to depth 3 with dot notation so nested
  // structures render as clean key/value rows in the UI. Skip arrays
  // and overly-deep nesting (stringified as JSON fallback).
  const flat: Record<string, string> = {};
  const source = (raw && typeof raw === "object" && "fields" in raw && typeof (raw as Record<string, unknown>).fields === "object")
    ? (raw as { fields: Record<string, unknown> }).fields
    : raw;

  function flatten(obj: unknown, prefix: string, depth: number) {
    if (obj == null) return;
    if (depth > 3) {
      flat[prefix] = JSON.stringify(obj).slice(0, 200);
      return;
    }
    if (typeof obj !== "object") {
      flat[prefix] = String(obj);
      return;
    }
    if (Array.isArray(obj)) {
      // Arrays stringify — most form payloads don't have meaningful
      // arrays at this level (and when they do — e.g. line items in a
      // WC order — the team can drill into the raw_payload).
      flat[prefix] = obj.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(", ");
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Skip noisy WooCommerce-internal fields that pollute the answers
      // view with stuff the team doesn't care about.
      if (depth === 0 && (k === "_links" || k === "meta_data" || k === "links")) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      flatten(v, path, depth + 1);
    }
  }
  flatten(source, "", 0);

  // ── Heuristic respondent capture ────────────────────────────────────
  // Prefer top-level fields, fall back to billing.* / shipping.* which
  // WooCommerce uses on customer/order payloads.
  let respondentName  = "";
  let respondentEmail = "";

  const pickEmail = (...keys: string[]) => {
    for (const k of keys) if (flat[k] && /@/.test(flat[k])) return flat[k];
    return "";
  };
  const pickName = (...keyPairs: Array<string | [string, string]>) => {
    for (const k of keyPairs) {
      if (typeof k === "string" && flat[k]?.trim()) return flat[k].trim();
      if (Array.isArray(k)) {
        const f = flat[k[0]]?.trim() ?? "";
        const l = flat[k[1]]?.trim() ?? "";
        if (f || l) return [f, l].filter(Boolean).join(" ");
      }
    }
    return "";
  };

  respondentEmail =
    pickEmail("email", "Email", "your-email", "billing.email")
    || (Object.entries(flat).find(([k, v]) => /email|e-?mail/i.test(k) && /@/.test(v))?.[1] ?? "");

  respondentName =
    pickName(
      "name", "full_name", "your_name", "Name", "Full Name",
      ["first_name", "last_name"],
      ["billing.first_name", "billing.last_name"],
      ["shipping.first_name", "shipping.last_name"],
    )
    || (Object.entries(flat).find(([k]) => /\bname|full[\s_-]?name|your[\s_-]?name/i.test(k))?.[1] ?? "");

  // ── 4. Idempotent response_id ──────────────────────────────────────
  // Elementor doesn't ship one; derive a stable id from the payload so
  // retries (e.g. Elementor timing out the request despite us writing)
  // don't create duplicates. Hash of payload text limited to 32 hex.
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawText));
  const responseId = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

  // ── 5. Match respondent email to AA Zoho lead/DoB if possible ──────
  // Single RPC, canonical JSONB cache, DoB > Lead precedence baked in.
  // (Was reading from non-existent zoho_cache_dob / zoho_cache_leads
  // tables — silently failing to link.)
  let doctorId: string | null = null;
  if (respondentEmail) {
    const { data, error } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: respondentEmail });
    if (error) console.warn("[form-webhook] lookup_doctor_id_by_email:", error.message);
    else if (typeof data === "string") doctorId = data;
  }

  // ── 6. Insert (idempotent) ─────────────────────────────────────────
  const { error: insErr } = await supabase
    .from("form_responses")
    .upsert({
      form_id:               form.id,
      provider_response_id:  responseId,
      submitted_at:          new Date().toISOString(),
      raw_payload:           raw as Record<string, unknown>,
      answers:               flat,
      respondent_name:       respondentName || null,
      respondent_email:      respondentEmail || null,
      doctor_id:             doctorId,
    }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: true });

  if (insErr) {
    console.error("[form-webhook] insert failed:", insErr);
    return json({ ok: false, error: "Insert failed", detail: insErr.message }, 500);
  }

  await notify({
    kind:    "new_form_submission",
    // Slack only for doctor-intake forms (team's ask 2026-06-11).
    slack:   form?.form_type === "doctor_intake",
    title:   `New form submission${respondentName ? ` · ${respondentName}` : ""}`,
    body:    `${respondentEmail ?? "no email captured"} via ${form.provider ?? "form"}. Click to review the submission in the dashboard.`,
    link_path:         respondentEmail
      ? `/forms?q=${encodeURIComponent(respondentEmail)}`
      : `/forms`,
    related_doctor_id: doctorId,
  }).catch(e => console.error("[form-webhook] notify failed:", e));

  return json({ ok: true, form_id: form.id, response_id: responseId }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

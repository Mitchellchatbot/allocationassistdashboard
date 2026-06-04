/**
 * send-batch — Phase 6 recurring blast sender.
 *
 * Triggered manually (Send now button on the Batches page) or by
 * tick-scheduler when a scheduled date arrives.
 *
 * Reads a `scheduled_batch_sends` row, hydrates the picked doctors from
 * doctor_profiles + Zoho cache, renders the multi-doctor table HTML using
 * the columns Ammar showed in his "Available Doctor Format" template
 * (name / title / specialty / areas / training / years / nationality / age /
 * marital / family / license / salary / notice / mobile / email), then
 * sends the `profile_sent_hospital_batch` template via Resend with all
 * 95 hospital recruiter emails on BCC.
 *
 * On success: flips status='sent', records sent_at, hospital_count, message_id.
 * On failure: flips status='failed' and stores the error.
 *
 * For specialty_of_day batches, advances `specialty_rotation_state.cursor_index`
 * so tomorrow's batch lands on the next specialty automatically.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM                 = Deno.env.get("MAIL_FROM") ?? "Hospital Intro <onboarding@resend.dev>";

// Allocation Assist branded signature — same block as send-flow-email,
// duplicated here because Supabase edge functions can't share imports
// without a _shared dir. Keep these two definitions in lock-step.
const SIGNATURE_HTML = `
<div style="margin-top:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a2332;">
  <p style="margin:0 0 4px;color:#14b8a6;font-weight:700;font-size:15px;">Warmest Regards,</p>
  <p style="margin:0 0 4px;color:#14b8a6;font-weight:700;font-size:15px;">The Allocation Assist team,</p>
  <p style="margin:0 0 14px;color:#14b8a6;font-weight:700;font-size:15px;">Allocation Assist</p>
  <p style="margin:0 0 4px;color:#475569;font-size:14px;">
    <span style="display:inline-block;width:14px;color:#14b8a6;">&#9737;</span>
    <strong style="color:#475569;font-weight:600;">Jumeirah Lakes Towers, Dubai, UAE</strong>
  </p>
  <p style="margin:0 0 12px;font-size:14px;">
    <a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a>
  </p>
  <p style="margin:0;color:#14b8a6;font-weight:700;font-size:18px;letter-spacing:-0.3px;">
    Allocation Assist
  </p>
  <p style="margin:2px 0 0;color:#94a3b8;font-size:11px;letter-spacing:0.5px;">The source of workforce</p>
</div>`;

const SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team
Allocation Assist

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com
`;
// Comma-separated list of test recipients. When set, ALL hospital BCCs are
// replaced by these addresses — so demo runs land in the team's inboxes
// instead of every real hospital recruiter. Empty string disables the
// override and sends to the real hospital list.
const TEST_OVERRIDE_LIST = (Deno.env.get("MAIL_TEST_RECIPIENT_OVERRIDE") ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);
const TEST_OVERRIDE      = TEST_OVERRIDE_LIST[0] ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("[send-batch] booted. Resend key:", !!RESEND_API_KEY, "test override:", TEST_OVERRIDE || "(none)");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  if (!RESEND_API_KEY) return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);

  let body: { batch_id?: string; dry_run?: boolean; force?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  if (!body.batch_id) return json({ ok: false, error: "batch_id required" }, 400);
  const dryRun = !!body.dry_run;
  // `force: true` lets the user resend a batch that already fired. Used by
  // the Resend button in the UI. Cancelled batches are still blocked even
  // with force — they were deliberately torn down.
  const force = !!body.force;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load the batch ─────────────────────────────────────────────────────
  const { data: batch, error: batchErr } = await supabase
    .from("scheduled_batch_sends")
    .select("*")
    .eq("id", body.batch_id)
    .single();
  if (batchErr || !batch) return json({ ok: false, error: "Batch not found", detail: batchErr?.message }, 404);
  if (batch.status === "sent" && !force) return json({ ok: false, error: "Batch already sent (use force to resend)", sent_at: batch.sent_at }, 409);
  if (batch.status === "cancelled") return json({ ok: false, error: "Batch is cancelled" }, 409);

  const doctorIds: string[] = batch.doctor_ids ?? [];
  if (doctorIds.length === 0) return json({ ok: false, error: "No doctors queued for this batch" }, 400);

  // ── Load hospitals (recipients) ────────────────────────────────────────
  // batch.country (added 2026-06-03) scopes the send to one country.
  // Ammar's spec: 'two profiles to UAE, two to KSA, two to Qatar' — one
  // batch row per country per day. Null country = legacy/broadcast.
  const batchCountry = (batch.country as string | null) ?? null;
  let hospitalQuery = supabase
    .from("hospitals")
    .select("id, name, primary_contact_name, primary_recruiter_email, country")
    .not("primary_recruiter_email", "is", null);
  if (batchCountry) hospitalQuery = hospitalQuery.eq("country", batchCountry);
  const { data: hospitals, error: hospErr } = await hospitalQuery;
  if (hospErr) return json({ ok: false, error: "Hospital fetch failed", detail: hospErr.message }, 500);
  const recipients = (hospitals ?? [])
    .map(h => (h.primary_recruiter_email as string)?.trim())
    .filter(Boolean);
  if (recipients.length === 0 && TEST_OVERRIDE_LIST.length === 0) {
    const scope = batchCountry ? `in ${batchCountry}` : "on file";
    return json({ ok: false, error: `No hospitals ${scope} with a recruiter email. Add some in the Hospitals tab or change the batch's country.` }, 400);
  }

  // ── Load doctor profiles + Zoho cache for the picked doctors ───────────
  const { data: profiles } = await supabase
    .from("doctor_profiles")
    .select("*")
    .in("doctor_id", doctorIds);
  const profileById = new Map<string, Record<string, unknown>>();
  for (const p of (profiles ?? []) as Array<Record<string, unknown>>) profileById.set(p.doctor_id as string, p);

  // Zoho cache rows 1+2 merged
  const { data: cache } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
  const merged: Record<string, unknown> = {};
  for (const r of (cache ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    if (r.data) Object.assign(merged, r.data);
  }
  const leadsArr = (merged.leads as Array<{ id: string } & Record<string, unknown>>) ?? [];
  const dobsArr  = (merged.doctorsOnBoard as Array<{ id: string } & Record<string, unknown>>) ?? [];
  const leadById = new Map<string, Record<string, unknown>>();
  for (const l of leadsArr) leadById.set(`lead:${l.id}`, l);
  const dobById  = new Map<string, Record<string, unknown>>();
  for (const d of dobsArr)  dobById.set(`dob:${d.id}`, d);

  // ── Build per-doctor row objects in the order the team queued them ────
  const rows = doctorIds.map((did, idx) => {
    const p    = profileById.get(did) ?? null;
    const lead = leadById.get(did);
    const dob  = dobById.get(did);
    const name =
      (lead?.Full_Name as string) ??
      (dob?.Full_Name  as string) ??
      ((p?.doctor_name as string) ?? "(unknown)");
    return {
      idx:        idx + 1,
      name,
      title:        (p?.title              as string) ?? "",
      areas:        (p?.area_of_interest   as string) ?? "",
      training:     (p?.country_training   as string) ?? (lead?.Country_of_Specialty_training as string) ?? "",
      years:        p?.years_experience != null ? String(p?.years_experience) : "",
      nationality:  (p?.nationality        as string) ?? "",
      age:          p?.age != null ? String(p?.age) : (lead?.Age != null ? String(lead?.Age) : ""),
      marital:      (p?.marital_status     as string) ?? "",
      family:       (p?.family_status      as string) ?? "",
      license:      (p?.license            as string) ?? (lead?.License as string) ?? "",
      salary:       (p?.salary_expectation as string) ?? "",
      notice:       (p?.notice_period      as string) ?? "",
      mobile:       (lead?.Mobile as string) ?? (lead?.Phone as string) ?? (dob?.Mobile as string) ?? (dob?.Phone as string) ?? "",
      email:        (lead?.Email as string) ?? (dob?.Email as string) ?? "",
      specialty:    (lead?.Specialty_New as string) ?? (lead?.Specialty as string) ?? (dob?.Specialty as string) ?? "",
    };
  });

  // Specialty label for the email subject + template token.
  const specialtyLabel: string = batch.specialty
    ? String(batch.specialty)
    : (batch.kind === "daily_duo" || batch.kind === "tuesday_top_15"
        ? "Mixed Specialty Doctors"
        : (rows[0]?.specialty ?? "Doctors"));

  // ── Render the table HTML (mirrors Ammar's "Available Doctor Format") ─
  const doctorsTableHtml = renderDoctorsTable(rows);

  // ── Load the template ────────────────────────────────────────────────
  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("subject, body_html, body_text")
    .eq("key", "profile_sent_hospital_batch")
    .maybeSingle();
  if (tplErr || !tpl) return json({ ok: false, error: "Template profile_sent_hospital_batch not found" }, 500);

  const subject = renderText(String(tpl.subject ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team" });
  const html    = renderText(String(tpl.body_html ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team", doctors_table_html: doctorsTableHtml, signature: SIGNATURE_HTML });
  const text    = renderText(String(tpl.body_text ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team", doctors_table_html: stripHtml(doctorsTableHtml), signature: SIGNATURE_TEXT });

  // ── Dry run? ──────────────────────────────────────────────────────────
  if (dryRun) {
    return json({
      ok: true, dry_run: true,
      preview: { from: MAIL_FROM, bcc_count: recipients.length, subject, html, text },
      doctor_count: rows.length,
    }, 200);
  }

  // ── Send via Resend (BCC) ─────────────────────────────────────────────
  // Test override pattern matches send-flow-email: when set, all sends go
  // to the override address instead of the 95 hospital recipients. Lets us
  // demo end-to-end on the resend.dev sandbox without leaking emails.
  const bccList   = TEST_OVERRIDE_LIST.length > 0 ? TEST_OVERRIDE_LIST : recipients;
  const toAddress = TEST_OVERRIDE_LIST[0] || MAIL_FROM.replace(/.*<|>.*/g, "");

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    MAIL_FROM,
        to:      [toAddress],
        bcc:     bccList,
        subject, html, text,
        headers: {
          "X-AA-Batch-Id":  String(batch.id),
          "X-AA-Batch-Kind": String(batch.kind),
        },
      }),
    });
  } catch (e) {
    await supabase.from("scheduled_batch_sends")
      .update({ status: "failed", error: String(e), updated_at: new Date().toISOString() })
      .eq("id", batch.id);
    return json({ ok: false, error: "Network error reaching Resend", detail: String(e) }, 502);
  }

  const resendBody = await resendRes.text();
  if (!resendRes.ok) {
    console.error("[send-batch] Resend HTTP", resendRes.status, resendBody.slice(0, 300));
    await supabase.from("scheduled_batch_sends").update({
      status: "failed",
      error:  `Resend ${resendRes.status}: ${resendBody.slice(0, 300)}`,
      updated_at: new Date().toISOString(),
    }).eq("id", batch.id);
    return json({ ok: false, error: `Resend returned ${resendRes.status}`, detail: resendBody.slice(0, 500) }, resendRes.status);
  }

  let messageId = "";
  try { messageId = (JSON.parse(resendBody) as { id?: string }).id ?? ""; } catch { /* empty */ }

  await supabase.from("scheduled_batch_sends").update({
    status:          "sent",
    sent_at:         new Date().toISOString(),
    hospital_count:  bccList.length,
    sent_message_id: messageId,
    error:           null,
    updated_at:      new Date().toISOString(),
  }).eq("id", batch.id);

  // ── Stamp last-sent on the rotation, but DON'T advance the cursor ────
  // The cursor now auto-advances one per calendar day via the derived
  // effective_cursor_index in useSpecialtyRotation. Bumping it again on
  // send would double-count — sending today would push tomorrow's pick
  // two specialties forward instead of one.
  if (batch.kind === "specialty_of_day") {
    await markRotationSent(supabase, String(batch.specialty ?? ""));
  }

  return json({
    ok: true,
    batch_id: batch.id,
    message_id: messageId,
    bcc_count: bccList.length,
    doctor_count: rows.length,
    specialty: specialtyLabel,
  }, 200);
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function markRotationSent(supabase: ReturnType<typeof createClient>, sentSpecialty: string): Promise<void> {
  // Stamp last_sent_* for audit + the 'Last sent: X' line in the UI.
  // Do NOT touch cursor_index or cursor_anchor_at — the daily derivation
  // owns cursor progression now.
  try {
    await supabase.from("specialty_rotation_state").update({
      last_sent_specialty: sentSpecialty,
      last_sent_at:        new Date().toISOString(),
    }).eq("id", 1);
  } catch (e) {
    console.error("[send-batch] rotation last-sent stamp failed:", e);
  }
}

interface RowData {
  idx: number; name: string; title: string; areas: string; training: string;
  years: string; nationality: string; age: string; marital: string;
  family: string; license: string; salary: string; notice: string;
  mobile: string; email: string; specialty: string;
}

/** Render each doctor as a CARD instead of a wide 15-column table. The old
 *  table layout was unreadable in every email client — fonts shrank to 9px
 *  and headers like "Country of Training" wrapped over three lines. Cards
 *  let us use 14px body text + readable label/value pairs at any width.
 *
 *  Layout per card:
 *    ┌──────────────────────────────────────────┐
 *    │ #1  Dr. John Doe                         │  ← name header (large)
 *    │ Consultant Cardiologist                  │  ← title/specialty (sub)
 *    ├──────────────────────────────────────────┤
 *    │ Country of training : UK                 │  ← two-column label:value
 *    │ Years experience    : 12                 │     grid; "—" rows hidden
 *    │ Nationality         : British            │     so cards stay tight
 *    │ License             : DOH                │
 *    ├──────────────────────────────────────────┤
 *    │ ✉  john@example.com   ☎ +44 7xx xxx      │  ← contact strip
 *    └──────────────────────────────────────────┘
 */
function renderDoctorsTable(rows: RowData[]): string {
  if (rows.length === 0) return `<p style="color:#6c757d;font-size:14px;">No doctors queued.</p>`;
  return rows.map(renderDoctorCard).join("");
}

function renderDoctorCard(r: RowData): string {
  // Build attribute rows, skipping anything blank so cards don't bloat with
  // a wall of "—". Each row is "Label  Value" with the label dimmed.
  const attrs: Array<[string, string]> = [
    ["Areas of interest",  r.areas],
    ["Country of training", r.training],
    ["Years of experience", r.years],
    ["Nationality",         r.nationality],
    ["Age",                 r.age],
    ["Marital status",      r.marital],
    ["Family status",       r.family],
    ["License",             r.license],
    ["Salary expectation",  r.salary || "Market Range"],
    ["Notice period",       r.notice],
  ];
  const attrRowsHtml = attrs
    .filter(([, v]) => v && v.trim() && v.trim() !== "—")
    .map(([label, value]) => `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;width:42%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:4px 0;color:#1a2332;font-size:14px;font-weight:500;vertical-align:top;">${esc(value)}</td>
      </tr>`).join("");

  const titleLine = r.title || r.specialty;
  const contactPieces: string[] = [];
  if (r.email)  contactPieces.push(`<span style="color:#0f766e;">&#9993;</span> <a href="mailto:${esc(r.email)}" style="color:#0f766e;text-decoration:none;font-size:14px;">${esc(r.email)}</a>`);
  if (r.mobile) contactPieces.push(`<span style="color:#0f766e;">&#9742;</span> <span style="color:#1a2332;font-size:14px;">${esc(r.mobile)}</span>`);
  const contactHtml = contactPieces.length === 0 ? "" : `
    <div style="background:#f0fbfa;border-top:1px solid #d1f0ec;padding:12px 18px;display:block;">
      ${contactPieces.join(`<span style="display:inline-block;width:18px;"></span>`)}
    </div>`;

  return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 16px 0;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:14px 18px;color:#ffffff;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:0.8;">Profile #${r.idx}</div>
        <div style="font-size:18px;font-weight:700;line-height:1.3;margin-top:2px;">${esc(r.name)}</div>
        ${titleLine ? `<div style="font-size:13px;opacity:0.9;margin-top:2px;">${esc(titleLine)}</div>` : ""}
      </div>
      ${attrRowsHtml ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;padding:0;">
        <tbody style="display:table-row-group;">
          <tr><td style="padding:14px 18px 8px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
              <tbody>${attrRowsHtml}</tbody>
            </table>
          </td></tr>
        </tbody>
      </table>` : ""}
      ${contactHtml}
    </div>`;
}

function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Mustache-ish renderer (mirrors send-flow-email). Supports {{token}} and
 *  conditional sections {{#token}}...{{/token}}. */
function renderText(body: string, vars: Record<string, string>): string {
  body = body.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    return v === undefined || v === null || v === "" ? "" : inner;
  });
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{{${key}}}` : v;
  });
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

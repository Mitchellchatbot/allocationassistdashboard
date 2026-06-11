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

// Plinky-style plain signature — mirrors signatureHtml() in
// send-flow-email exactly. The "Allocation Assist" / "source of
// workforce" lines are baked into the AA logo image (uploaded to
// email-assets/logo.png), so the signature ends with that image
// instead of duplicating the text below it.
const SANS_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const LOGO_URL   = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/logo.png`;
const SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${SANS_STACK};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${SANS_STACK};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${SANS_STACK};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${SANS_STACK};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${SANS_STACK};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;"><img src="${LOGO_URL}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" /></td></tr>
</table>`;

const SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team

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
// Always CC Ammar on test batch emails so he sees every one going out.
const TEST_CC_ALWAYS     = "ammar@allocationassist.com";

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

  // ── WP candidate is the RICHEST profile source (specialty, area of
  //    interest, country of training, years, nationality, license, salary…).
  //    The single-doctor email already reads it; the batch path didn't — so
  //    cards came out near-empty (just name + "Market Range" + contact). Load
  //    by the linked doctor_id, and fall back to email for any unlinked row.
  const wpByDoctorId = new Map<string, Record<string, unknown>>();
  const wpByEmail    = new Map<string, Record<string, unknown>>();
  {
    const docEmails = [...new Set(doctorIds.map(did => {
      const l = leadById.get(did); const d = dobById.get(did);
      return String((l?.Email ?? d?.Email ?? "")).toLowerCase().trim();
    }).filter(Boolean))];
    const { data: wpById } = await supabase.from("wordpress_candidates").select("*").in("doctor_id", doctorIds);
    for (const w of (wpById ?? []) as Array<Record<string, unknown>>) {
      if (w.doctor_id) wpByDoctorId.set(String(w.doctor_id), w);
    }
    // Website-only doctors (no Zoho link) are queued as `wp:<numericId>` —
    // resolve them straight from wordpress_candidates by id and key them by
    // that same `wp:<id>` so the row builder below finds them.
    const wpNumericIds = doctorIds
      .filter(did => did.startsWith("wp:"))
      .map(did => Number(did.slice(3)))
      .filter(n => Number.isFinite(n));
    if (wpNumericIds.length) {
      const { data: wpRows } = await supabase.from("wordpress_candidates").select("*").in("id", wpNumericIds);
      for (const w of (wpRows ?? []) as Array<Record<string, unknown>>) {
        wpByDoctorId.set(`wp:${w.id}`, w);
      }
    }
    if (docEmails.length) {
      const { data: wpByEm } = await supabase.from("wordpress_candidates").select("*").in("email", docEmails);
      for (const w of (wpByEm ?? []) as Array<Record<string, unknown>>) {
        const e = String(w.email ?? "").toLowerCase().trim();
        if (e && !wpByEmail.has(e)) wpByEmail.set(e, w);
      }
    }
  }

  const pick = (...vs: unknown[]): string => {
    for (const v of vs) { const x = v == null ? "" : String(v).trim(); if (x) return x; }
    return "";
  };

  // ── Build per-doctor row objects in the order the team queued them ────
  const rows = doctorIds.map((did, idx) => {
    const p    = profileById.get(did) ?? null;
    const lead = leadById.get(did);
    const dob  = dobById.get(did);
    const email = String((lead?.Email ?? dob?.Email ?? "")).toLowerCase().trim();
    const wp   = wpByDoctorId.get(did) ?? (email ? wpByEmail.get(email) : undefined) ?? null;
    return {
      idx:        idx + 1,
      name:         pick(wp?.full_name, lead?.Full_Name, dob?.Full_Name, p?.doctor_name) || "(unknown)",
      title:        pick(wp?.job_title, p?.title),
      areas:        pick(wp?.area_of_interest, p?.area_of_interest),
      training:     pick(wp?.country_of_training, p?.country_training, lead?.Country_of_Specialty_training),
      years:        pick(wp?.years_experience, p?.years_experience),
      nationality:  pick(wp?.nationality, p?.nationality),
      age:          pick(p?.age, lead?.Age) || ageFromDob(wp?.date_of_birth),
      marital:      pick(wp?.family_status, p?.marital_status),
      family:       pick(wp?.family_status, p?.family_status),
      license:      pick(wp?.license_status, p?.license, lead?.License),
      salary:       pick(wp?.expected_salary, p?.salary_expectation),
      notice:       pick(wp?.notice_period, p?.notice_period),
      mobile:       pick(wp?.phone, lead?.Mobile, lead?.Phone, dob?.Mobile, dob?.Phone),
      email:        pick(wp?.email, lead?.Email, dob?.Email),
      specialty:    pick(wp?.specialty, lead?.Specialty_New, lead?.Specialty, dob?.Specialty),
      subspecialty: pick(wp?.subspecialty, p?.subspecialty),
      current_location: pick(wp?.current_location, p?.current_location),
      targeted:     Array.isArray(wp?.targeted_locations)
                      ? (wp!.targeted_locations as string[]).filter(Boolean).join(", ")
                      : pick(wp?.targeted_locations),
      languages:    pick(wp?.languages, p?.languages),
      english:      pick(wp?.english_level),
      // Public profile link — only published candidates have a live page.
      website:      (String(wp?.status ?? "") === "publish" && wp?.wp_link) ? String(wp!.wp_link) : "",
      cv:           pick(wp?.cv_url),
    };
  });

  // Area of Interest is sent in FULL (Ammar 2026-06-11 reversed the condense
  // — it cut sub-specialties). The cell wraps within a widened column.

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

  const subject     = renderText(String(tpl.subject ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team" });
  const renderedBody = renderText(String(tpl.body_html ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team", doctors_table_html: doctorsTableHtml, signature: SIGNATURE_HTML });
  // Match send-flow-email: wrap the rendered body in a sans-serif
  // <div> so every <p>/<table> inherits the AA dashboard's standard
  // typeface unless the element overrides explicitly.
  const html    = `<div style="font-family:${SANS_STACK};font-size:14px;color:#1a2332;line-height:1.55;">${renderedBody}</div>`;
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
  const bccListRaw = TEST_OVERRIDE_LIST.length > 0 ? TEST_OVERRIDE_LIST : recipients;
  const toAddress  = TEST_OVERRIDE_LIST[0] || MAIL_FROM.replace(/.*<|>.*/g, "");
  // In test mode, always CC Ammar (visible) so he sees every test send. Keep
  // him out of the To/Bcc to avoid double-listing.
  const inTestMode = TEST_OVERRIDE_LIST.length > 0;
  const testCc     = inTestMode && TEST_CC_ALWAYS.toLowerCase() !== toAddress.toLowerCase()
    ? [TEST_CC_ALWAYS] : undefined;
  const bccList    = testCc ? bccListRaw.filter(a => a.toLowerCase() !== TEST_CC_ALWAYS.toLowerCase()) : bccListRaw;

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    MAIL_FROM,
        to:      [toAddress],
        cc:      testCc,
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
  subspecialty: string; current_location: string; targeted: string;
  languages: string; english: string; website: string; cv: string;
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
  const titleLine = r.title || r.specialty;
  // Build attribute rows, skipping blanks so cards stay tight. Dedupe the
  // Specialty row when it already IS the title line, and the Family row when
  // it just duplicates Marital (both default to WP's family_status).
  const attrs: Array<[string, string]> = [
    ["Specialty",           r.specialty && r.specialty !== titleLine ? r.specialty : ""],
    ["Subspecialty",        r.subspecialty],
    ["Areas of interest",   r.areas],
    ["Country of training", r.training],
    ["Current location",    r.current_location],
    ["Targeted locations",  r.targeted],
    ["Years of experience", r.years],
    ["Nationality",         r.nationality],
    ["Languages",           r.languages],
    ["English level",       r.english],
    ["Age",                 r.age],
    ["Marital status",      r.marital],
    ["Family status",       r.family && r.family !== r.marital ? r.family : ""],
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

  const contactPieces: string[] = [];
  if (r.email)  contactPieces.push(`<span style="color:#0f766e;">&#9993;</span> <a href="mailto:${esc(r.email)}" style="color:#0f766e;text-decoration:none;font-size:14px;">${esc(r.email)}</a>`);
  if (r.mobile) contactPieces.push(`<span style="color:#0f766e;">&#9742;</span> <span style="color:#1a2332;font-size:14px;">${esc(r.mobile)}</span>`);
  const contactHtml = contactPieces.length === 0 ? "" : `
    <div style="background:#f0fbfa;border-top:1px solid #d1f0ec;padding:12px 18px;display:block;">
      ${contactPieces.join(`<span style="display:inline-block;width:18px;"></span>`)}
    </div>`;

  // Action buttons — view the candidate's live profile on the website (the
  // hospital can see the full picture: photo, CV, full education/experience)
  // and a direct CV link.
  const buttons: string[] = [];
  if (r.website) buttons.push(`<a href="${esc(r.website)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">View full profile on allocationassist.com &rarr;</a>`);
  if (r.cv)      buttons.push(`<a href="${esc(r.cv)}" style="display:inline-block;color:#0f766e;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border:1px solid #0f766e;border-radius:8px;">View CV</a>`);
  const buttonsHtml = buttons.length === 0 ? "" : `
    <div style="padding:14px 18px 4px;">
      ${buttons.join(`<span style="display:inline-block;width:10px;"></span>`)}
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
      ${buttonsHtml}
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

/** Age in years from a WP date_of_birth ("YYYYMMDD", "YYYY-MM-DD", or a
 *  free-text date). Returns "" when it can't parse a sane age. */
function ageFromDob(dob: unknown): string {
  const s = dob == null ? "" : String(dob).trim();
  if (!s) return "";
  let d: Date | null = null;
  if (/^\d{8}$/.test(s))                 d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  else                                   { const p = new Date(s); if (!isNaN(p.valueOf())) d = p; }
  if (!d || isNaN(d.valueOf())) return "";
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 18 && a < 100 ? String(a) : "";
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

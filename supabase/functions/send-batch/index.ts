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
// Garamond serif stack (team preference 2026-06-12 — "all emails Garamond,
// large"). Matches send-flow-email so batch + individual sends read alike.
const FONT_STACK = "Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif";
// Poppins (the website's font) scoped to the doctor CARDS only — the rest of
// the batch email stays Garamond. Matches send-flow-email.
const CARD_FONT   = "'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_IMPORT = `<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');</style>`;
const LOGO_URL   = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/logo.png`;
const SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${FONT_STACK};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${FONT_STACK};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${FONT_STACK};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${FONT_STACK};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
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
// Ammar left the team — never email him. He's stripped from every test
// recipient list below even if he's still named in MAIL_TEST_RECIPIENT_OVERRIDE.
const EXCLUDED_RECIPIENT = "ammar@allocationassist.com";

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

  let body: {
    batch_id?: string; dry_run?: boolean; force?: boolean;
    // Per-send overrides from the editable preview. When present (non-empty),
    // these replace the template-rendered subject/body so what the team typed
    // in the preview is exactly what goes out. Only honoured on a real send —
    // a dry run always returns the freshly-rendered template so "Reset to
    // template" works by simply re-previewing.
    subject_override?: string; html_override?: string; text_override?: string;
    // Extra recipients from the preview's CcBccPicker — added ON TOP of the
    // hospital BCC list (bcc) / shown to everyone (cc).
    cc_override?: string[]; bcc_override?: string[];
  };
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

  // Zoho cache is large — row 1 is ~27k leads (17 MB), row 2 is ~3k
  // doctors-on-board + calls/deals/etc (3 MB). Loading both on every send
  // was the bulk of the latency. Only load the row(s) this batch's queued
  // doctors actually reference: a dob-only batch skips the 17 MB leads blob.
  // Pull ONLY the sub-array we need (data->doctorsOnBoard / data->leads),
  // not the calls/deals/etc that share row 2 — and only the list(s) this
  // batch references. A dob-only batch loads ~1.5 MB instead of ~20 MB.
  const needLeads = doctorIds.some(d => d.startsWith("lead:"));
  const needDobs  = doctorIds.some(d => d.startsWith("dob:"));
  type ZRec = { id: string } & Record<string, unknown>;
  let leadsArr: ZRec[] = [];
  let dobsArr:  ZRec[] = [];
  if (needDobs) {
    const { data } = await supabase.from("zoho_cache").select("dob:data->doctorsOnBoard").eq("id", 2).maybeSingle();
    const arr = (data as { dob?: unknown } | null)?.dob;
    if (Array.isArray(arr)) dobsArr = arr as ZRec[];
  }
  if (needLeads) {
    const { data } = await supabase.from("zoho_cache").select("leads:data->leads").eq("id", 1).maybeSingle();
    const arr = (data as { leads?: unknown } | null)?.leads;
    if (Array.isArray(arr)) leadsArr = arr as ZRec[];
  }
  const leadById = new Map<string, Record<string, unknown>>();
  for (const l of leadsArr) leadById.set(`lead:${l.id}`, l);
  const dobById  = new Map<string, Record<string, unknown>>();
  for (const d of dobsArr)  dobById.set(`dob:${d.id}`, d);

  // ── WP candidate is the RICHEST profile source (specialty, area of
  //    interest, country of training, years, nationality, license, salary…).
  //    The picker is WP-spine: it pairs each doctor with their WP candidate
  //    by phone → email → name. The batch only stores the resulting
  //    doctor_id, so we must reconstruct the SAME pairing here. Matching on
  //    doctor_id + email alone is NOT enough — a doctor whose Zoho email
  //    differs from their WP email (and whose name is ambiguous between two
  //    WP records, e.g. two "Mohamed Ismail"s) would resolve to no WP
  //    candidate and the card came out near-empty. Phone is what
  //    disambiguates, so index on it the same way the picker does.
  const phoneKey = (p: unknown): string => {
    const d = String(p ?? "").replace(/\D/g, "");
    return d.length >= 9 ? d.slice(-9) : (d || "");
  };
  const normName = (n: unknown): string => String(n ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const WP_COLS = "id, doctor_id, status, full_name, job_title, email, phone, date_of_birth, nationality, specialty, subspecialty, area_of_interest, years_experience, license_status, family_status, expected_salary, notice_period, country_of_training, current_location, languages, english_level, targeted_locations, cv_url, wp_link";

  // Two-phase for speed: scan a LIGHTWEIGHT index (5 small columns) over all
  // published candidates to find each queued doctor's matching id, then fetch
  // the FULL row for only the handful of matched ids. Loading every column for
  // all ~1.3k candidates made the preview take ~7s; this keeps it snappy.
  const wpForDoctor = new Map<string, Record<string, unknown>>();
  {
    const idByDoctorId = new Map<string, number>();
    const idByWpKey    = new Map<string, number>();
    const idByPhone    = new Map<string, number>();
    const idByEmail    = new Map<string, number>();
    const idByName     = new Map<string, number>();
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data } = await supabase
        .from("wordpress_candidates")
        .select("id, doctor_id, phone, email, full_name")
        .eq("status", "publish")
        .range(from, from + PAGE - 1);
      const batch = (data ?? []) as Array<{ id: number; doctor_id: string | null; phone: string | null; email: string | null; full_name: string | null }>;
      for (const w of batch) {
        idByWpKey.set(`wp:${w.id}`, w.id);
        if (w.doctor_id) idByDoctorId.set(String(w.doctor_id), w.id);
        const ph = phoneKey(w.phone);                          if (ph && !idByPhone.has(ph)) idByPhone.set(ph, w.id);
        const em = String(w.email ?? "").toLowerCase().trim(); if (em && !idByEmail.has(em)) idByEmail.set(em, w.id);
        const nm = normName(w.full_name);                      if (nm && !idByName.has(nm)) idByName.set(nm, w.id);
      }
      if (batch.length < PAGE) break;
    }

    // Resolve each queued doctor → candidate id, same keys/priority as the
    // picker (linked doctor_id → website id → phone → email → name).
    const matchedIdByDoctor = new Map<string, number>();
    for (const did of doctorIds) {
      const lead = leadById.get(did); const dob = dobById.get(did);
      const zphone = phoneKey(lead?.Mobile ?? lead?.Phone ?? dob?.Mobile ?? dob?.Phone);
      const zemail = String((lead?.Email ?? dob?.Email ?? "")).toLowerCase().trim();
      const zname  = normName((lead?.Full_Name ?? dob?.Full_Name)
                      || `${lead?.First_Name ?? dob?.First_Name ?? ""} ${lead?.Last_Name ?? dob?.Last_Name ?? ""}`);
      const id = idByDoctorId.get(did)
              ?? idByWpKey.get(did)
              ?? (zphone ? idByPhone.get(zphone) : undefined)
              ?? (zemail ? idByEmail.get(zemail) : undefined)
              ?? (zname  ? idByName.get(zname)   : undefined);
      if (id != null) matchedIdByDoctor.set(did, id);
    }

    // Fetch full data for just the matched ids.
    const matchedIds = [...new Set([...matchedIdByDoctor.values()])];
    if (matchedIds.length) {
      const { data } = await supabase.from("wordpress_candidates").select(WP_COLS).in("id", matchedIds);
      const fullById = new Map<number, Record<string, unknown>>();
      for (const w of (data ?? []) as Array<Record<string, unknown>>) fullById.set(Number(w.id), w);
      for (const [did, id] of matchedIdByDoctor) {
        const full = fullById.get(id);
        if (full) wpForDoctor.set(did, full);
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
    const wp   = wpForDoctor.get(did) ?? null;
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
      specialty:    pick(wp?.specialty, lead?.Specialty_New, lead?.Specialty, dob?.Specialty, p?.specialty),
      subspecialty: pick(wp?.subspecialty, p?.subspecialty),
      current_location: pick(wp?.current_location, p?.current_location),
      targeted:     Array.isArray(wp?.targeted_locations)
                      ? (wp!.targeted_locations as string[]).filter(Boolean).join(", ")
                      : pick(wp?.targeted_locations),
      languages:    pick(wp?.languages, p?.languages),
      english:      pick(wp?.english_level, p?.english_level),
      // Public profile link — only published candidates have a live page.
      website:      (String(wp?.status ?? "") === "publish" && wp?.wp_link) ? String(wp!.wp_link) : "",
      cv:           pick(wp?.cv_url),
    };
  });

  // Area of Interest is sent in FULL (Ammar 2026-06-11 reversed the condense
  // — it cut sub-specialties). The cell wraps within a widened column.

  // Specialty label for the email subject + template token. Prefer the
  // batch's own specialty; otherwise, if every queued doctor shares one
  // specialty (a rotation-scoped daily_duo does), use that. Rendered as the
  // plural practitioner noun so the header reads "Available Cardiovascular
  // Surgeons" rather than "Mixed Specialty Doctors Doctors".
  const distinctSpecs = [...new Set(
    rows.map(r => (r.specialty || "").trim()).filter(Boolean).map(s => s.toLowerCase()),
  )];
  const sharedSpecialty = batch.specialty
    ? String(batch.specialty)
    : (distinctSpecs.length === 1 ? (rows.find(r => (r.specialty || "").trim())?.specialty ?? "").trim() : "");
  const specialtyLabel: string = sharedSpecialty ? practitionerNoun(sharedSpecialty) : "Mixed Specialty Doctors";

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
  const html    = `${FONT_IMPORT}<div style="font-family:${FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">${renderedBody}</div>`;
  const text    = renderText(String(tpl.body_text ?? ""), { specialty: specialtyLabel, hospital_contact_name: "Team", doctors_table_html: stripHtml(doctorsTableHtml), signature: SIGNATURE_TEXT });

  // ── Dry run? ──────────────────────────────────────────────────────────
  if (dryRun) {
    return json({
      ok: true, dry_run: true,
      preview: { from: MAIL_FROM, bcc_count: recipients.length, subject, html, text },
      doctor_count: rows.length,
    }, 200);
  }

  // ── Apply editable-preview overrides ──────────────────────────────────
  // If the team edited the preview before sending, ship their version verbatim
  // (subject as typed; the body's edited HTML; a text fallback derived from the
  // edit if they didn't pass one). Empty/whitespace overrides are ignored so a
  // blank field can't accidentally send an empty email.
  const finalSubject = (body.subject_override ?? "").trim() ? String(body.subject_override) : subject;
  const finalHtml    = (body.html_override ?? "").trim()    ? String(body.html_override)    : html;
  const finalText    = (body.text_override ?? "").trim()    ? String(body.text_override)
                     : (body.html_override ?? "").trim()    ? stripHtml(String(body.html_override))
                     : text;

  // ── Send via Resend (BCC) ─────────────────────────────────────────────
  // Test override pattern matches send-flow-email: when set, all sends go
  // to the override address instead of the 95 hospital recipients. Lets us
  // demo end-to-end on the resend.dev sandbox without leaking emails.
  const bccListRaw = TEST_OVERRIDE_LIST.length > 0 ? TEST_OVERRIDE_LIST : recipients;
  const toAddress  = TEST_OVERRIDE_LIST[0] || MAIL_FROM.replace(/.*<|>.*/g, "");
  // No automatic CC any more. Strip Ammar from the BCC list (he may still be in
  // the test-override env var) so he never receives a batch send.
  // Extra CC / BCC from the preview's CcBccPicker (added on top of the hospital
  // BCC list). Deduped, valid emails only, never the excluded recipient.
  const clean = (arr: unknown): string[] => Array.isArray(arr)
    ? [...new Set((arr as unknown[]).map(v => typeof v === "string" ? v.trim() : "").filter(v => v.includes("@") && v.toLowerCase() !== EXCLUDED_RECIPIENT))]
    : [];
  const extraBcc = clean(body.bcc_override);
  const extraCc  = clean(body.cc_override);
  const bccList    = [...new Set([...bccListRaw.filter(a => a.toLowerCase() !== EXCLUDED_RECIPIENT), ...extraBcc])];
  const testCc: string[] | undefined = extraCc.length ? extraCc : undefined;

  // ── Attachments (CVs / logbooks) ──────────────────────────────────────
  // Stored on the batch row by the Batches dialog as { filename, path, … };
  // Resend wants { filename, path } and fetches each public URL server-side.
  const attachRaw = (batch.attachments as unknown);
  const attachments: Array<{ filename: string; path: string }> = Array.isArray(attachRaw)
    ? (attachRaw as Array<Record<string, unknown>>)
        .map(a => ({ filename: String(a?.filename ?? "attachment"), path: String(a?.path ?? "") }))
        .filter(a => a.path.startsWith("http"))
    : [];

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
        subject: finalSubject, html: finalHtml, text: finalText,
        headers: {
          "X-AA-Batch-Id":  String(batch.id),
          "X-AA-Batch-Kind": String(batch.kind),
        },
        attachments: attachments.length > 0 ? attachments : undefined,
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
// Plain multi-row table — the same "Available Doctor Format" columns as the
// single-doctor hospital email, one row per queued doctor. Header cells nowrap +
// the whole table in an overflow-x:auto box, so a wide table scrolls (like
// Gmail) instead of crushing its columns — the reason it was cards before.
function renderDoctorsTable(rows: RowData[]): string {
  if (rows.length === 0) return `<p style="color:#6c757d;font-size:14px;">No doctors queued.</p>`;
  // Styled 1:1 with the single-doctor "Available Doctor Format" table in
  // send-flow-email — teal header row, no font-family override so the whole
  // table inherits the email's Garamond stack (Hasan 2026-07-06: "same font as
  // the rest of the emails, exact same styling"). The <div style> that wraps
  // the rendered body sets font-family:${FONT_STACK}, which cascades in here.
  const th = (label: string) =>
    `<th style="text-align:left;border:1px solid #cbd5e1;padding:8px 11px;background:#0f766e;color:#ffffff;font-size:13px;font-weight:600;white-space:nowrap;">${esc(label)}</th>`;
  const td = (val: string) =>
    `<td style="border:1px solid #cbd5e1;padding:8px 11px;font-size:14px;color:#1a2332;vertical-align:top;">${esc(val)}</td>`;
  const head =
    `<tr>${th("#")}${th("Name")}${th("Title and Specialty as per the UAE license")}${th("Country Of Training")}` +
    `${th("Years of Experience")}${th("Nationality")}${th("Age")}${th("Marital Status")}${th("Family Status")}` +
    `${th("UAE license type / Status")}${th("Salary Expectation")}${th("Notice Period")}${th("Mobile")}${th("Email")}</tr>`;
  const body = rows.map(r =>
    `<tr>${td(String(r.idx))}${td(r.name)}${td(r.title || r.specialty)}${td(r.training)}${td(r.years)}${td(r.nationality)}` +
    `${td(r.age)}${td(r.marital)}${td(r.family)}${td(r.license)}${td(r.salary)}${td(r.notice)}${td(r.mobile)}${td(r.email)}</tr>`,
  ).join("");
  return `<div style="overflow-x:auto;margin:18px 0;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #cbd5e1;">` +
    `<thead>${head}</thead><tbody>${body}</tbody></table></div>`;
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
        <td style="padding:5px 12px 5px 0;color:#64748b;font-size:15px;width:42%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:5px 0;color:#1a2332;font-size:16px;font-weight:500;vertical-align:top;">${esc(value)}</td>
      </tr>`).join("");

  const contactPieces: string[] = [];
  if (r.email)  contactPieces.push(`<span style="color:#0f766e;">&#9993;</span> <a href="mailto:${esc(r.email)}" style="color:#0f766e;text-decoration:none;font-size:15px;">${esc(r.email)}</a>`);
  if (r.mobile) contactPieces.push(`<span style="color:#0f766e;">&#9742;</span> <span style="color:#1a2332;font-size:15px;">${esc(r.mobile)}</span>`);
  const contactHtml = contactPieces.length === 0 ? "" : `
    <div style="background:#f0fbfa;border-top:1px solid #d1f0ec;padding:12px 18px;display:block;">
      ${contactPieces.join(`<span style="display:inline-block;width:18px;"></span>`)}
    </div>`;

  // Action buttons — view the candidate's live profile on the website (the
  // hospital can see the full picture: photo, CV, full education/experience)
  // and a direct CV link.
  const buttons: string[] = [];
  if (r.website) buttons.push(`<a href="${esc(r.website)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px;">View full profile on allocationassist.com &rarr;</a>`);
  if (r.cv)      buttons.push(`<a href="${esc(r.cv)}" style="display:inline-block;color:#0f766e;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border:1px solid #0f766e;border-radius:8px;">View CV</a>`);
  const buttonsHtml = buttons.length === 0 ? "" : `
    <div style="padding:14px 18px 4px;">
      ${buttons.join(`<span style="display:inline-block;width:10px;"></span>`)}
    </div>`;

  return `
    <div style="font-family:${CARD_FONT};border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 16px 0;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:14px 18px;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:0.8;">Profile #${r.idx}</div>
        <div style="font-size:21px;font-weight:700;line-height:1.3;margin-top:2px;">${esc(r.name)}</div>
        ${titleLine ? `<div style="font-size:15px;opacity:0.9;margin-top:2px;">${esc(titleLine)}</div>` : ""}
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

/** Turn a specialty name into the plural practitioner noun for the email
 *  header. Works across the WHOLE AA specialty list (142 entries), not just
 *  surgeons — verified against the website `sector` taxonomy:
 *    "Cardiology" → "Cardiologists", "Vascular Surgery" → "Vascular Surgeons",
 *    "Neurosurgeon" → "Neurosurgeons" (already a noun → pluralise),
 *    "Nurses" → "Nurses", "Midwife" → "Midwives", "Pediatrics" →
 *    "Pediatricians", "Psychiatry" → "Psychiatrists".
 *  Field names with no clean practitioner form fall back to
 *  "<Specialty> Doctors" (e.g. "Internal Medicine Doctors", "ENT Doctors"). */
function practitionerNoun(specialty: string): string {
  let s = specialty.trim().replace(/&amp;/g, "&").replace(/\s+/g, " ");
  if (!s) return "Doctors";
  s = s.replace(/\b\w/g, c => c.toUpperCase());

  const irregular: Record<string, string> = {
    pediatrics: "Pediatricians", geriatric: "Geriatricians",
    gp: "General Practitioners", midwife: "Midwives", nurses: "Nurses",
  };
  const lo = s.toLowerCase();
  if (irregular[lo]) return irregular[lo];

  const plural = (w: string): string =>
    /s$/i.test(w)         ? w :
    /fe$/i.test(w)        ? w.replace(/fe$/i, "ves") :
    /[^aeiou]y$/i.test(w) ? w.replace(/y$/i, "ies") :
                            `${w}s`;

  // Already a practitioner noun ("Neurosurgeon", "Allergist", "Dentist",
  // "Radiographer", "Radiation Therapist") → just pluralise it.
  if (/(ologist|iatrist|ist|surgeon|physician|practitioner|ician|grapher|therapist|nurse|midwife|dentist)$/i.test(s)) return plural(s);

  // Field name → its practitioner.
  if (/surgery$/i.test(s))   return s.replace(/surgery$/i, "Surgeons");
  if (/ology$/i.test(s))     return s.replace(/ology$/i, "ologists");
  if (/iatry$/i.test(s))     return s.replace(/iatry$/i, "iatrists");
  if (/ometry$/i.test(s))    return s.replace(/ometry$/i, "ometrists");
  if (/\sTherapy$/i.test(s)) return s.replace(/Therapy$/i, "Therapists");
  if (/therapy$/i.test(s))   return s.replace(/therapy$/i, "therapists");

  return `${s} Doctors`;
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

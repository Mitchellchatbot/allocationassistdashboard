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
import { buildWorkingOpBody, buildWorkingOpSubject } from "../_shared/doctor-working-op.ts";

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
    // Daily Duo sends one email per doctor, so edits arrive one body per doctor.
    per_doctor_html_override?: string[];
    per_doctor_subject_override?: string[];
    // Same, for the optional doctor "working opportunity" email leg. Each doctor
    // gets their own email, so edits arrive as an array (the singular form is
    // still honoured and applies to every doctor).
    doctor_subject_override?: string; doctor_html_override?: string;
    doctor_html_overrides?: string[];
    doctor_subject_overrides?: string[];
    // Extra recipients from the preview's CcBccPicker — added ON TOP of the
    // hospital BCC list (bcc) / shown to everyone (cc).
    cc_override?: string[]; bcc_override?: string[];
    // "Send to only this region" — an explicit recipient list that REPLACES the
    // batch-country hospital scope. Each becomes a personalised recipient.
    recipient_emails_override?: string[];
    // Per-hospital recipient choice from the preview: hospital id → the exact
    // contact emails to put in that hospital's To (for hospitals with several
    // reps). Overrides the hospital's contact_mode routing for this send only.
    contact_overrides?: Record<string, string[]>;
    // Recruiter emails to DROP from this send — hospitals the team unchecked in
    // the preview's "Sending to N hospitals" list.
    exclude_override?: string[];
    // Per-hospital greeting override from the preview's Auto / Name / Team control:
    // recruiter email (lowercased) → "contact" (greet the contact person) or
    // "team" ("<Hospital> team"). Hospitals not listed keep greetingFor()'s
    // stored-flag logic. Applied in BOTH the dry-run preview and the real send so
    // the preview matches what's actually sent.
    greet_overrides?: Record<string, "contact" | "team">;
    // ── Ad-hoc mode (Bulk send from Profile Sent) ──────────────────────────
    // Send a tabular multi-doctor blast WITHOUT a scheduled_batch_sends row: the
    // caller passes the doctors + recipient hospitals directly. No DB row is
    // created or mutated, and rotation is untouched — this is a one-off send.
    adhoc?: boolean;
    doctor_ids?: string[];
    include_doctor_email?: boolean;
    specialty?: string;
    attachments?: Array<{ filename: string; path: string }>;
    // Files to attach to the DOCTOR working-opportunity emails (separate from the
    // hospital-email `attachments`). Legacy: one global list for every doctor.
    doctor_attachments?: Array<{ filename: string; path: string }>;
    // PER-DOCTOR doctor-email attachments, index-aligned with the doctor emails
    // (doctorBlocks). A doctor-specific file (CV) reaches only that doctor. Falls
    // back to doctor_attachments per index when a slot is empty.
    per_doctor_attachments?: Array<Array<{ filename: string; path: string }>>;
    // Sender identity for the HOSPITAL emails — a full "Name <email>" header from
    // the preview's "Sending as" picker. Replaces MAIL_FROM for the hospital
    // emails only (the doctor working-op emails keep MAIL_FROM). Empty/absent →
    // MAIL_FROM, so an untouched picker sends exactly as before. Applied in BOTH
    // the dry-run preview and the real send.
    from_override?: string;
    // Free-text note from the preview's "Custom note" box. When non-empty, it's
    // injected into the HOSPITAL email body as a short paragraph placed right
    // after the greeting/intro and before the doctors table. Escaped. Applied in
    // BOTH the dry-run preview and the real send; empty → nothing injected.
    custom_message?: string;
  };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const adhoc = !!body.adhoc;
  if (!adhoc && !body.batch_id) return json({ ok: false, error: "batch_id required" }, 400);
  const dryRun = !!body.dry_run;
  // `force: true` lets the user resend a batch that already fired. Used by
  // the Resend button in the UI. Cancelled batches are still blocked even
  // with force — they were deliberately torn down.
  const force = !!body.force;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Load the batch ─────────────────────────────────────────────────────
  // maybeSingle() so a genuine "no such row" (data null, no error) is told apart
  // from a transient DB error (a timeout / dropped connection surfaces as an
  // error, NOT zero rows). The old .single() collapsed both into "Batch not
  // found", so a blip on the load read as "the batch doesn't exist". Retry the
  // read a couple of times to ride out a transient blip before giving up.
  // deno-lint-ignore no-explicit-any
  let batch: any = null;
  if (adhoc) {
    // Synthesize an in-memory batch from the request — no DB row involved. Uses
    // the tabular (non-daily-duo) render, so it's one multi-doctor table per
    // hospital, plus the per-doctor working-opportunity email when asked.
    batch = {
      id: "adhoc", kind: "tuesday_top_15", country: null,
      specialty: body.specialty ?? null, header_mode: null,
      include_doctor_email: !!body.include_doctor_email,
      status: "draft", doctor_ids: Array.isArray(body.doctor_ids) ? body.doctor_ids : [],
      doctor_card_image_urls: [], attachments: Array.isArray(body.attachments) ? body.attachments : [],
      excluded_emails: [],
    };
  } else {
    // maybeSingle() so a genuine "no such row" (data null, no error) is told apart
    // from a transient DB error (a timeout / dropped connection surfaces as an
    // error, NOT zero rows). Retry a couple of times to ride out a transient blip.
    let batchErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase
        .from("scheduled_batch_sends")
        .select("*")
        .eq("id", body.batch_id)
        .maybeSingle();
      batch = res.data;
      batchErr = res.error;
      if (batch || !batchErr) break;             // found, or a clean "0 rows" → stop
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));  // transient → back off + retry
    }
    if (batchErr) {
      console.error("[send-batch] batch load failed:", batchErr.message);
      return json({ ok: false, error: "Couldn't load the batch — the database didn't respond. Please try again.", detail: batchErr.message }, 503);
    }
    if (!batch) return json({ ok: false, error: "Batch not found", detail: `No batch with id ${body.batch_id}` }, 404);
    if (batch.status === "sent" && !force) return json({ ok: false, error: "Batch already sent (use force to resend)", sent_at: batch.sent_at }, 409);
    if (batch.status === "cancelled") return json({ ok: false, error: "Batch is cancelled" }, 409);
  }

  // Mark the batch failed with a HUMAN reason (skipped on a dry-run preview, so
  // previewing never mutates status) — a failed card then shows WHY it failed
  // ("No hospitals in Saudi Arabia with a recruiter email") instead of the vague
  // "No emails sent" the empty-recipient path used to leave behind.
  const failAndReturn = async (reason: string, code = 400) => {
    if (!dryRun && !adhoc) {
      await supabase.from("scheduled_batch_sends")
        .update({ status: "failed", error: reason, updated_at: new Date().toISOString() })
        .eq("id", batch.id);
    }
    return json({ ok: false, error: reason }, code);
  };

  const doctorIds: string[] = batch.doctor_ids ?? [];
  if (doctorIds.length === 0) return await failAndReturn("No doctors queued for this batch.");

  // ── Load hospitals (recipients) ────────────────────────────────────────
  // batch.country (added 2026-06-03) scopes the send to one country.
  // Ammar's spec: 'two profiles to UAE, two to KSA, two to Qatar' — one
  // batch row per country per day. Null country = legacy/broadcast.
  const batchCountry = (batch.country as string | null) ?? null;
  // Fetch every hospital with a recruiter email, then match the batch's country
  // IN CODE with alias tolerance (KSA ≡ Saudi Arabia, UAE ≡ United Arab Emirates,
  // …). The old `.ilike("country", batchCountry)` was an EXACT match, so a Saudi
  // hospital saved as "KSA" (the Hospitals UI still offers both labels) was
  // silently dropped from a "Saudi Arabia" batch → zero recipients → a failed
  // send. Normalising both sides makes label drift harmless.
  const { data: hospitals, error: hospErr } = await supabase
    .from("hospitals")
    .select("id, name, primary_contact_name, primary_recruiter_email, greet_with_contact_name, country, city, image_url, website, contact_mode, excluded_contact_emails, cc_emails, active")
    .not("primary_recruiter_email", "is", null);
  if (hospErr) return json({ ok: false, error: "Hospital fetch failed", detail: hospErr.message }, 500);
  const wantCountry = batchCountry ? normCountry(batchCountry) : null;
  // Send-state (the colour-coded sheet): NEVER email a hospital flagged
  // "don't send" (active === false), even if it matches the country / override.
  const activeHospitals = (hospitals ?? []).filter(h => h.active !== false);
  // Explicit recipient override (the preview's "send to only this region" picker):
  // when present, these EXACT hospitals are the personalised recipients, replacing
  // the batch-country filter entirely. Empty → fall back to the country scope.
  //
  // A ONE-OFF batch carries its explicit recipient hospitals on the ROW
  // (recipient_emails) — that is its whole target set, in place of a country
  // scope. The preview's per-send region picker (body.recipient_emails_override)
  // still wins when supplied.
  const explicitRecipients: unknown[] =
    (Array.isArray(body.recipient_emails_override) && body.recipient_emails_override.length)
      ? body.recipient_emails_override
      : (batch.kind === "one_off" && Array.isArray(batch.recipient_emails) ? batch.recipient_emails : []);
  const recipOverride = new Set(
    explicitRecipients.map(e => String(e).trim().toLowerCase()).filter(e => e.includes("@")),
  );
  const matchedHospitals = activeHospitals.filter(h =>
    recipOverride.size
      ? recipOverride.has(String(h.primary_recruiter_email ?? "").trim().toLowerCase())
      : (!wantCountry || normCountry(String(h.country ?? "")) === wantCountry));

  // 'all' contact_mode → this hospital's email lists EVERY eligible (checked)
  // contact in the To field. Those contacts live in Zoho (zoho_cache row 2 →
  // data->hospitalContacts), matched to the hospital BY NAME. To stop a
  // DIFFERENT hospital's contacts from leaking into this hospital's To, index
  // them two ways: by an exact-ish normalized name (preferred), and by the lossy
  // stopword-stripped "core" key — but the core key is trusted ONLY when it maps
  // to a single distinct hospital name (an ambiguous key is skipped below).
  const normHospName = (s: string) =>
    (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const contactsByExactName = new Map<string, string[]>();
  const contactsByCore = new Map<string, { emails: string[]; names: Set<string> }>();
  if (matchedHospitals.some(h => String(h.contact_mode ?? "primary") === "all")) {
    const { data: cRow } = await supabase.from("zoho_cache").select("contacts:data->hospitalContacts").eq("id", 2).maybeSingle();
    for (const c of ((cRow?.contacts ?? []) as Array<Record<string, unknown>>)) {
      const email = String(c.Email ?? "").trim();
      if (!email) continue;
      const hosp = c.Hospital as unknown;
      const hospName = typeof hosp === "string" ? hosp : String((hosp as Record<string, unknown>)?.name ?? "");
      const exact = normHospName(hospName);
      const key   = coreHospitalName(hospName);
      if (exact) (contactsByExactName.get(exact) ?? contactsByExactName.set(exact, []).get(exact)!).push(email);
      if (!key) continue;
      const bucket = contactsByCore.get(key) ?? contactsByCore.set(key, { emails: [], names: new Set<string>() }).get(key)!;
      bucket.emails.push(email);
      if (exact) bucket.names.add(exact);
    }
  }

  // Keep the hospital objects (name + contact + greeting flag) so each hospital
  // gets its OWN email greeting them by name (Sean: "hello team → hello name"),
  // plus toEmails — the actual To list for this hospital ('all' → every eligible
  // contact, deduped, falling back to the recruiter email if none matched).
  // Per-hospital recipient choice from the preview (hospital id → contact emails).
  const contactOverrides: Record<string, string[]> =
    (body.contact_overrides && typeof body.contact_overrides === "object")
      ? body.contact_overrides as Record<string, string[]>
      : {};
  const recipientHospitals = matchedHospitals
    .map(h => {
      const email = String(h.primary_recruiter_email ?? "").trim();
      let toEmails = email ? [email] : [];
      if (String(h.contact_mode ?? "primary") === "all") {
        const excluded = new Set((Array.isArray(h.excluded_contact_emails) ? h.excluded_contact_emails as string[] : []).map(e => e.toLowerCase()));
        // Prefer an EXACT normalized-name match; fall back to the lossy "core"
        // key ONLY when it's unambiguous (a single hospital name fed it). An
        // ambiguous core key could pull another hospital's contacts into this
        // hospital's To, so skip it and keep the recruiter-email fallback.
        const exact = normHospName(String(h.name ?? ""));
        let matched: string[] = contactsByExactName.get(exact) ?? [];
        if (!matched.length) {
          const core = contactsByCore.get(coreHospitalName(String(h.name ?? "")));
          if (core && core.names.size <= 1) matched = core.emails;
          else if (core) console.warn(`[send-batch] ambiguous hospital-name key for "${String(h.name ?? "")}" (${[...core.names].join(" | ")}) — skipping fuzzy contact match to avoid cross-hospital leakage`);
        }
        const seen = new Set<string>();
        const list: string[] = [];
        for (const e of matched) {
          const k = e.toLowerCase();
          if (!seen.has(k) && !excluded.has(k)) { seen.add(k); list.push(e); }
        }
        if (list.length) toEmails = list;   // else keep the recruiter-email fallback
      }
      // Preview's per-hospital pick wins over the mode-based routing above.
      const ov = contactOverrides[String(h.id)];
      if (Array.isArray(ov)) {
        const list = ov.map(e => String(e).trim()).filter(e => e.includes("@"));
        if (list.length) toEmails = [...new Set(list)];
      }
      return {
        name:         String(h.name ?? "").trim(),
        email,
        contact:      String(h.primary_contact_name ?? "").trim(),
        greetContact: h.greet_with_contact_name === true,
        city:         String(h.city ?? "").trim(),
        image_url:    String(h.image_url ?? "").trim(),
        link:         String(h.website ?? "").trim() || null,   // hospital website → link in the doctor email
        toEmails,
        // This hospital's OWN configured extra CC recipients (hospitals.cc_emails).
        // Ride only this hospital's own email, and only in production (see below).
        ccEmails:     Array.isArray(h.cc_emails)
          ? (h.cc_emails as unknown[]).map(e => String(e).trim()).filter(e => e.includes("@"))
          : [],
      };
    })
    .filter(h => h.email);
  const recipients = recipientHospitals.map(h => h.email);
  // Fire even in TEST mode: a test send still needs at least one real recipient
  // to build (redirected) copies from — zero recipients means nothing to send,
  // so surface the clear reason rather than proceeding to "No emails sent".
  if (recipients.length === 0) {
    if (recipOverride.size) return await failAndReturn(`None of the ${recipOverride.size} selected hospitals had a usable recruiter email.`);
    const scope = batchCountry ? `in ${batchCountry}` : "on file";
    return await failAndReturn(`No hospitals ${scope} with a recruiter email. Add them (or fill in their recruiter email) in the Hospitals tab, or change the batch's country.`);
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

  // Resolve each queued doctor → WP candidate. TARGETED queries (id / linked
  // doctor_id / email) for the 2–15 doctors we actually need — NOT a scan of the
  // whole candidate table, which used to dominate preview/send latency (~7s). A
  // bounded fallback scan runs ONLY if a doctor can't be matched that way (rare:
  // a Zoho-only doctor matched by phone/name), so matching never regresses.
  const wpForDoctor = new Map<string, Record<string, unknown>>();
  {
    // Per-doctor match keys (same priority as the picker).
    const zByDid = new Map<string, { zphone: string; zemail: string; zname: string }>();
    const wpIds: number[] = [], doctorIdVals: string[] = [], emails: string[] = [];
    for (const did of doctorIds) {
      if (did.startsWith("wp:")) { const n = Number(did.slice(3)); if (Number.isFinite(n)) wpIds.push(n); }
      else doctorIdVals.push(did);
      const lead = leadById.get(did); const dob = dobById.get(did);
      const zphone = phoneKey(lead?.Mobile ?? lead?.Phone ?? dob?.Mobile ?? dob?.Phone);
      const zemail = String((lead?.Email ?? dob?.Email ?? "")).toLowerCase().trim();
      const zname  = normName((lead?.Full_Name ?? dob?.Full_Name)
                      || `${lead?.First_Name ?? dob?.First_Name ?? ""} ${lead?.Last_Name ?? dob?.Last_Name ?? ""}`);
      zByDid.set(did, { zphone, zemail, zname });
      if (zemail) emails.push(zemail);
    }

    const fetched = new Map<number, Record<string, unknown>>();   // id → full row
    const absorb = (rows: Array<Record<string, unknown>> | null | undefined) => { for (const w of rows ?? []) fetched.set(Number(w.id), w); };
    await Promise.all([
      wpIds.length        ? supabase.from("wordpress_candidates").select(WP_COLS).in("id", [...new Set(wpIds)]).then(r => absorb(r.data as Array<Record<string, unknown>>)) : Promise.resolve(),
      doctorIdVals.length ? supabase.from("wordpress_candidates").select(WP_COLS).eq("status", "publish").in("doctor_id", [...new Set(doctorIdVals)]).then(r => absorb(r.data as Array<Record<string, unknown>>)) : Promise.resolve(),
      emails.length       ? supabase.from("wordpress_candidates").select(WP_COLS).eq("status", "publish").in("email", [...new Set(emails)]).then(r => absorb(r.data as Array<Record<string, unknown>>)) : Promise.resolve(),
    ]);

    const idByDoctorId = new Map<string, number>();
    const idByWpKey    = new Map<string, number>();
    const idByPhone    = new Map<string, number>();
    const idByEmail    = new Map<string, number>();
    const idByName     = new Map<string, number>();
    const indexRow = (w: Record<string, unknown>) => {
      const id = Number(w.id);
      idByWpKey.set(`wp:${id}`, id);
      if (w.doctor_id) idByDoctorId.set(String(w.doctor_id), id);
      const ph = phoneKey(w.phone);                          if (ph && !idByPhone.has(ph)) idByPhone.set(ph, id);
      const em = String(w.email ?? "").toLowerCase().trim(); if (em && !idByEmail.has(em)) idByEmail.set(em, id);
      const nm = normName(w.full_name);                      if (nm && !idByName.has(nm)) idByName.set(nm, id);
    };
    for (const w of fetched.values()) indexRow(w);
    const resolve = (did: string): number | undefined => {
      const z = zByDid.get(did);
      return idByDoctorId.get(did) ?? idByWpKey.get(did)
        ?? (z?.zphone ? idByPhone.get(z.zphone) : undefined)
        ?? (z?.zemail ? idByEmail.get(z.zemail) : undefined)
        ?? (z?.zname  ? idByName.get(z.zname)   : undefined);
    };

    // Bounded fallback: only if a doctor is still unresolved (needs phone/name
    // match against a candidate we didn't already fetch). Breaks early once all
    // are resolved, so the common (all-WP-linked) case never scans.
    let unresolved = doctorIds.filter(did => resolve(did) == null);
    if (unresolved.length) {
      const PAGE = 1000;
      for (let from = 0; from < 50000; from += PAGE) {
        const { data } = await supabase.from("wordpress_candidates").select(WP_COLS).eq("status", "publish").range(from, from + PAGE - 1);
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        for (const w of rows) { const id = Number(w.id); if (!fetched.has(id)) { fetched.set(id, w); indexRow(w); } }
        unresolved = unresolved.filter(did => resolve(did) == null);
        if (rows.length < PAGE || unresolved.length === 0) break;
      }
    }

    {
      for (const did of doctorIds) {
        const id = resolve(did);
        const full = id != null ? fetched.get(id) : undefined;
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
      areas:        formatAreasOfInterest(pick(wp?.area_of_interest, p?.area_of_interest), { fallback: pick(p?.specialty, wp?.specialty, wp?.job_title, p?.title) }),
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

  // ── Render the doctor block ──────────────────────────────────────────
  // Daily Duo (Hasan 2026-07-09): ship the two doctors as INDIVIDUAL profile
  // images — the exact Profile-Sent card, generated client-side when the duo
  // was built and stored on the row — stacked, instead of the wide combined
  // table. Any missing/empty image slot falls back to that doctor's server-
  // rendered card; every other kind keeps the table.
  const cardImageUrls: string[] =
    ((batch as Record<string, unknown>).doctor_card_image_urls as string[] | null) ?? [];
  const useCardImages = batch.kind === "daily_duo" && cardImageUrls.some(u => u && String(u).trim());
  const doctorsTableHtml = renderDoctorsTable(rows); // table (+ its text strip fallback)
  const doctorsHtmlBlock = useCardImages ? renderDoctorProfiles(rows, cardImageUrls) : doctorsTableHtml;
  const doctorsTextBlock = useCardImages ? renderDoctorsPlain(rows)                  : stripHtml(doctorsTableHtml);

  // Daily Duo (Hasan 2026-07-22): the hospital gets TWO DISTINCT emails — one
  // per doctor — each in the full Profile-Sent format, i.e. that doctor's card
  // image ABOVE their own data table. Previously a Daily Duo was ONE email with
  // both cards stacked and no table at all. Every other kind keeps its single
  // combined email.
  const perDoctorMode = batch.kind === "daily_duo";
  const perDoctorBlocks: Array<{ name: string; html: string; text: string }> = perDoctorMode
    ? rows.map((r, i) => {
        const url = String(cardImageUrls[i] ?? "").trim();
        // width attr as well as the style — Outlook ignores max-width.
        const card = url
          ? `<div style="margin:0 0 18px;"><img src="${esc(url)}" alt="${esc(r.name)}" width="700" style="display:block;width:100%;max-width:700px;height:auto;border:0;border-radius:14px;margin:0 auto;" /></div>`
          : renderDoctorCard(r);
        return { name: r.name, html: `${card}${renderDoctorsTable([r])}`, text: renderDoctorsPlain([r]) };
      })
    : [];
  // What actually gets sent per hospital: one block (combined) or N (per doctor).
  const sendBlocks: Array<{ name: string; html: string; text: string }> = perDoctorMode && perDoctorBlocks.length
    ? perDoctorBlocks
    : [{ name: "", html: doctorsHtmlBlock, text: doctorsTextBlock }];

  // ── Load the template ────────────────────────────────────────────────
  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("subject, body_html, body_text")
    .eq("key", "profile_sent_hospital_batch")
    .maybeSingle();
  if (tplErr || !tpl) return json({ ok: false, error: "Template profile_sent_hospital_batch not found" }, 500);

  // Sender identity for the HOSPITAL emails (preview's "Sending as" picker). When
  // a full "Name <email>" header is supplied, it replaces MAIL_FROM for the
  // hospital emails only — the doctor working-op emails keep MAIL_FROM. Empty →
  // MAIL_FROM, so an untouched picker sends exactly as before. Used in BOTH the
  // dry-run preview `from` and the real send.
  const hospitalFrom = String(body.from_override ?? "").trim() || MAIL_FROM;

  // Custom note (preview's "Custom note" box). When non-empty, it's injected into
  // the hospital body right after the greeting/intro and before the doctors
  // table — done by PREPENDING it to the doctors_table_html token below, so it
  // lands identically in the dry-run preview and the real send. Escaped; newlines
  // become <br>. Empty → nothing injected.
  const customMessageRaw = String(body.custom_message ?? "").trim();
  const customMessageHtml = customMessageRaw
    ? `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">${esc(customMessageRaw).replace(/\n/g, "<br>")}</p>`
    : "";
  const customMessageText = customMessageRaw ? `${customMessageRaw}\n\n` : "";

  // Render the email for ONE greeting. Each hospital gets its own copy so the
  // intro reads "Hello <hospital> team!" instead of a generic "Hello Team!".
  // Body is wrapped in the same Garamond shell send-flow-email uses.
  const wrapHtml = (bodyHtml: string) =>
    `${FONT_IMPORT}<div style="font-family:${FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">${bodyHtml}</div>`;
  // Subject "header mode" (Hasan 2026-07-20): recap vs specialty framing, with
  // the RECIPIENT HOSPITAL's city as the location (falls back to the batch
  // country, then drops the "Excited to work in …" tail if neither is known).
  // NULL mode keeps the legacy template subject.
  const headerMode = String((batch as Record<string, unknown>).header_mode ?? "").trim();
  const subjectFor = (city: string): string => {
    const loc = (city || String(batchCountry ?? "")).trim();
    const tail = loc ? ` - Excited to work in ${loc}` : "";
    if (headerMode === "recap")     return `This weeks available doctors - Allocation Assist Platform${tail}`;
    if (headerMode === "specialty") return `${specialtyLabel} available - Allocation Assist Platform${tail}`;
    return renderText(String(tpl.subject ?? ""), { specialty: specialtyLabel, hospital_contact_name: "" });
  };
  // blockHtml/blockText default to the combined block; per-doctor mode passes
  // one doctor's card+table so each email carries a single profile.
  // customMessageHtml/customMessageText are prepended to the doctors block so the
  // custom note sits after the greeting/intro and before the table (both empty
  // when no note was supplied → byte-for-byte the previous render).
  const renderFor = (contactName: string, city: string, blockHtml = doctorsHtmlBlock, blockText = doctorsTextBlock) => ({
    subject: subjectFor(city),
    html:    wrapHtml(renderText(String(tpl.body_html ?? ""), { specialty: specialtyLabel, hospital_contact_name: contactName, doctors_table_html: customMessageHtml + blockHtml, signature: SIGNATURE_HTML })),
    text:    renderText(String(tpl.body_text ?? ""), { specialty: specialtyLabel, hospital_contact_name: contactName, doctors_table_html: customMessageText + blockText, signature: SIGNATURE_TEXT }),
  });
  // A hospital's greeting: its contact person (when it greets by contact), else
  // "<Hospital name> team".
  const greetingFor = (h: { name: string; contact: string; greetContact: boolean }) =>
    (h.greetContact && h.contact) ? h.contact : (h.name ? `${h.name} team` : "Team");
  // Per-hospital greeting override from the preview's Auto / Name / Team control,
  // keyed by the hospital's recruiter email (lowercased). "contact" greets the
  // contact person (falling back to "<Hospital> team"), "team" forces the team
  // greeting; anything else defers to greetingFor()'s stored-flag logic.
  const greetOverrides: Record<string, string> =
    (body.greet_overrides && typeof body.greet_overrides === "object")
      ? body.greet_overrides as Record<string, string>
      : {};
  const greetingWithOverride = (h: { name: string; contact: string; greetContact: boolean; email: string }): string => {
    const ov = greetOverrides[String(h.email ?? "").trim().toLowerCase()];
    if (ov === "contact") return h.contact || `${h.name} team`;
    if (ov === "team")    return h.name ? `${h.name} team` : "Team";
    return greetingFor(h);
  };

  // ── Doctor "working opportunity" email (Hasan 2026-07-20) ──────────────
  // When include_doctor_email is on, each queued doctor also gets a note listing
  // the hospitals they're being recommended to (grouped by city, with photos).
  // Greets generically ("Hello Dr.") like the team's real template, so ONE body
  // serves every doctor and the edited preview can be sent verbatim.
  const includeDoctorEmail = (batch as Record<string, unknown>).include_doctor_email === true;
  // The consolidated doctor email is built by the SHARED composer
  // (_shared/doctor-working-op.ts) so the singular flow (send-flow-email)
  // produces an identical email. Subject is country-titled ("Working opportunity
  // in <country>"), falling back to the batch's country when the recipient rows
  // carry no country of their own.
  const doctorSubjectFresh = buildWorkingOpSubject(recipientHospitals, batchCountry);
  // One working-opportunity email per queued doctor, index-aligned with `rows`.
  const doctorBlocks = rows.map(r => ({
    name:    r.name,
    email:   String(r.email ?? "").trim(),
    subject: doctorSubjectFresh,
    html:    buildWorkingOpBody(r.name, recipientHospitals, SIGNATURE_HTML),
  }));

  // ── Dry run? Preview the FIRST hospital's personalised version ─────────
  if (dryRun) {
    const h0 = recipientHospitals[0];
    const greet = h0 ? greetingWithOverride(h0) : "Team";
    const city  = h0?.city ?? "";
    // sendBlocks[0] is the combined block for normal batches and the FIRST
    // doctor for a Daily Duo, so this preview always matches what really sends.
    const sample = renderFor(greet, city, sendBlocks[0].html, sendBlocks[0].text);
    return json({
      ok: true, dry_run: true,
      // Test-mode state so the preview can warn LOUDLY that a send won't reach
      // real hospitals (or, if off, that it WILL) before anyone clicks send.
      test_mode: TEST_OVERRIDE_LIST.length > 0,
      test_recipient: TEST_OVERRIDE_LIST[0] ?? null,
      preview: { from: hospitalFrom, bcc_count: recipients.length, subject: sample.subject, html: sample.html, text: sample.text },
      // Daily Duo: one pane per doctor — each is a separately-sent email, so the
      // team edits each one on its own.
      per_doctor: perDoctorMode
        ? sendBlocks.map((blk) => {
            const r = renderFor(greet, city, blk.html, blk.text);
            return { name: blk.name, subject: r.subject, html: r.html, text: r.text };
          })
        : [],
      email_count: recipientHospitals.length * sendBlocks.length,
      doctor_email: {
        included: includeDoctorEmail,
        subject:  doctorSubjectFresh,
        html:     wrapHtml(doctorBlocks[0]?.html ?? ""),
        text:     stripHtml(wrapHtml(doctorBlocks[0]?.html ?? "")),
        recipient_count: doctorBlocks.filter(d => d.email).length,
      },
      // One pane per doctor under the "Doctor email" tab — each is its own send.
      doctor_emails: doctorBlocks.map(d => ({
        name:    d.name,
        email:   d.email,
        subject: d.subject,
        html:    wrapHtml(d.html),
        text:    stripHtml(wrapHtml(d.html)),
      })),
      doctor_count: rows.length,
    }, 200);
  }

  // ── Editable-preview overrides + extra recipients + exclusions ────────
  // If the team edited the preview, ship their edited HTML to every hospital
  // (personalised greeting is lost when they hand-edit — their copy wins). Extra
  // CC/BCC ride only the FIRST email so the team gets one copy, not one per
  // hospital. Excluded hospitals + Ammar are dropped.
  const editedHtml    = (body.html_override ?? "").trim();
  const editedSubject = (body.subject_override ?? "").trim();
  const editedText    = (body.text_override ?? "").trim();
  const clean = (arr: unknown): string[] => Array.isArray(arr)
    ? [...new Set((arr as unknown[]).map(v => typeof v === "string" ? v.trim() : "").filter(v => v.includes("@") && v.toLowerCase() !== EXCLUDED_RECIPIENT))]
    : [];
  const extraBcc   = clean(body.bcc_override);
  const extraCc    = clean(body.cc_override);
  // Exclusions: those saved on the batch row (so a SCHEDULED fire honours them)
  // merged with any passed on this send (the send-now preview).
  const savedExcludes = Array.isArray((batch as Record<string, unknown>).excluded_emails)
    ? ((batch as Record<string, unknown>).excluded_emails as unknown[]).map(v => String(v).trim().toLowerCase()).filter(v => v.includes("@"))
    : [];
  const excludeSet = new Set([...clean(body.exclude_override).map(e => e.toLowerCase()), ...savedExcludes]);

  // Base64-inline an attachment list ONCE (same files for every recipient) so a
  // bad URL / oversized file is skipped rather than failing the send. Bulletproof
  // — the email always goes out even if an attachment can't be fetched.
  const MAX_TOTAL_ATTACH_BYTES = 25 * 1024 * 1024;
  const toBase64 = (bytes: Uint8Array): string => {
    let bin = ""; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const normAttach = (raw: unknown): Array<{ filename: string; path: string }> =>
    Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
          .map(a => ({ filename: String(a?.filename ?? "attachment"), path: String(a?.path ?? "") }))
          .filter(a => a.path.startsWith("http"))
      : [];
  const buildAttachments = async (list: Array<{ filename: string; path: string }>, tag: string) => {
    const built: Array<{ filename: string; content: string }> = [];
    let total = 0;
    for (const a of list) {
      try {
        // 10s cap per file: a hung storage URL must NOT stall the whole send past
        // the client's 90s timeout — that showed the user a failure while the
        // function kept running, and a retry then double-sent the batch.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10_000);
        let res: Response;
        try { res = await fetch(a.path, { signal: ctrl.signal }); } finally { clearTimeout(t); }
        if (!res.ok) { console.warn(`[send-batch] ${tag} "${a.filename}" HTTP ${res.status} — skipping`); continue; }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength === 0 || total + bytes.byteLength > MAX_TOTAL_ATTACH_BYTES) { console.warn(`[send-batch] ${tag} "${a.filename}" empty/oversized — skipping`); continue; }
        total += bytes.byteLength;
        built.push({ filename: a.filename, content: toBase64(bytes) });
      } catch (e) { console.warn(`[send-batch] ${tag} "${a.filename}" fetch failed — skipping`, e); }
    }
    return built;
  };
  // Hospital-email attachments. The row (batch.attachments) is the default;
  // a send-time body.attachments overrides it when present, so the one-off
  // dialog can attach files without persisting them on the row (adhoc did this
  // too, since its synthesized batch.attachments WAS body.attachments).
  const builtAttachments = await buildAttachments(
    normAttach(Array.isArray(body.attachments) ? body.attachments : batch.attachments),
    "hospital attachment",
  );
  // Doctor-email attachments — separate list so the two emails can carry
  // DIFFERENT files (the bulk preview attaches to each pane independently).
  // Legacy global list (applied to every doctor when no per-doctor list is set).
  const builtDoctorAttachments = await buildAttachments(normAttach(body.doctor_attachments), "doctor attachment");
  // PER-DOCTOR doctor attachments — index-aligned with doctorBlocks, so a
  // doctor-specific file reaches only that doctor (no cross-doctor fan-out).
  const perDoctorAtt: Array<Array<{ filename: string; path: string }>> =
    Array.isArray(body.per_doctor_attachments) ? body.per_doctor_attachments : [];
  const builtDoctorAttachmentsByDoctor = await Promise.all(
    perDoctorAtt.map(arr => buildAttachments(normAttach(arr), "doctor attachment")),
  );

  // Target hospitals — drop excluded + Ammar. In TEST mode every copy is
  // redirected to the test inbox (personalised copies still go there so the
  // greetings can be verified safely before real hospitals get them).
  const targets = recipientHospitals.filter(h =>
    h.email.toLowerCase() !== EXCLUDED_RECIPIENT && !excludeSet.has(h.email.toLowerCase()));
  if (targets.length === 0) {
    return await failAndReturn("No hospitals left to send to — every recipient was excluded for this send.");
  }

  // One personalised email per hospital — times one per doctor in per-doctor
  // (Daily Duo) mode, so a hospital receives a separate profile-sent email for
  // each doctor rather than one combined one.
  const perDoctorOverrides: string[] = Array.isArray(body.per_doctor_html_override)
    ? (body.per_doctor_html_override as unknown[]).map(v => typeof v === "string" ? v.trim() : "")
    : [];
  // Per-doctor SUBJECT edits, index-aligned with sendBlocks. A single
  // subject_override was previously applied to whichever doctor happened to have
  // a body edit — so doctor #2's email got doctor #0's subject, and subject-only
  // edits were dropped entirely.
  const perDoctorSubjects: string[] = Array.isArray(body.per_doctor_subject_override)
    ? (body.per_doctor_subject_override as unknown[]).map(v => typeof v === "string" ? v.trim() : "")
    : [];
  // An edited body (global html_override OR a per-doctor override) is baked from
  // the ONE hospital that was showing in the preview when the edit was made, so
  // its "Hello <strong>X team</strong>!" greeting names that single hospital. The
  // same override then goes to EVERY hospital — which is why all N copies came
  // out addressed to the first hospital ("three copies to Child Fertility").
  // Re-swap the greeting line to THIS hospital's greeting so every recruiter is
  // addressed by their own name. If the edit reshaped the greeting past this
  // pattern, the override is left verbatim (best-effort, matches old behaviour).
  const GREET_HTML_RE = /Hello\s*<strong>[^<]*<\/strong>\s*!/i;
  const personalizeGreeting = (html: string, greet: string) =>
    GREET_HTML_RE.test(html) ? html.replace(GREET_HTML_RE, `Hello <strong>${greet}</strong>!`) : html;
  const emails = targets.flatMap((h) =>
    sendBlocks.map((blk, di) => {
      // Preview edits: per-doctor mode carries one edited body per doctor (a
      // single html_override would send the SAME doctor to every slot).
      const ovRaw = perDoctorMode ? (perDoctorOverrides[di] ?? "") : editedHtml;
      // Re-personalise the baked greeting for THIS hospital (see note above).
      const ov = ovRaw ? personalizeGreeting(ovRaw, greetingWithOverride(h)) : ovRaw;
      const fresh = renderFor(greetingWithOverride(h), h.city, blk.html, blk.text);
      const subjOv = perDoctorMode ? (perDoctorSubjects[di] || editedSubject) : editedSubject;
      const rendered = (ov || subjOv)
        ? { subject: subjOv || fresh.subject, html: ov ? wrapHtml(ov) : fresh.html, text: ov ? ((perDoctorMode ? "" : editedText) || stripHtml(ov)) : fresh.text }
        : fresh;
      // Live To = this hospital's resolved list (one recruiter email, or EVERY
      // eligible contact for an 'all'-mode hospital), minus any batch-excluded /
      // Ammar addresses. Test mode still funnels every copy to the test inbox.
      const liveTo = h.toEmails.filter(e => !excludeSet.has(e.toLowerCase()) && e.toLowerCase() !== EXCLUDED_RECIPIENT);
      // This hospital's OWN cc_emails ride its OWN email — but NEVER in test mode.
      // Training wheels: the To is redirected to the test inbox, so the real CC
      // contacts MUST be dropped too, or they'd receive the "test" send. (A
      // dispatcher-typed extraCc is a deliberate team copy and still rides — it's
      // merged below.) Exclude the To, Ammar, and any batch-excluded address.
      const toLc = new Set((TEST_OVERRIDE_LIST.length ? [] : (liveTo.length ? liveTo : [h.email])).map(x => x.toLowerCase()));
      const hospCc = TEST_OVERRIDE_LIST.length
        ? []
        : h.ccEmails.filter(e => {
            const lc = e.toLowerCase();
            return lc !== EXCLUDED_RECIPIENT && !excludeSet.has(lc) && !toLc.has(lc);
          });
      return {
        from: hospitalFrom,
        to:   TEST_OVERRIDE_LIST.length ? [TEST_OVERRIDE_LIST[0]] : (liveTo.length ? liveTo : [h.email]),
        subject: rendered.subject,
        html:    rendered.html,
        text:    rendered.text,
        headers: { "X-AA-Batch-Id": String(batch.id), "X-AA-Batch-Kind": String(batch.kind) },
        ...(hospCc.length ? { cc: hospCc } : {}),
        ...(builtAttachments.length ? { attachments: builtAttachments } : {}),
      };
    })
  // Each hospital's own cc_emails already ride its own email (prod only, above).
  // The dispatcher-typed extraCc/extraBcc are ONE team copy on the FIRST email.
  ).map((e, i) => {
    const ccMerged = [...new Set([
      ...(((e as { cc?: string[] }).cc) ?? []),
      ...(i === 0 ? extraCc : []),
    ])];
    return {
      ...e,
      ...(ccMerged.length ? { cc: ccMerged } : {}),
      ...(i === 0 && extraBcc.length ? { bcc: extraBcc } : {}),
    };
  });

  // ── Send — one email per hospital ─────────────────────────────────────
  // Resend's /emails/batch sends up to 100 in one call (no per-request rate
  // limit) but does NOT support attachments OR per-message cc/bcc. So we fall
  // back to individual /emails sends when the batch carries a CV/logbook OR any
  // extra CC/BCC — putting cc/bcc on a /emails/batch payload returns a non-2xx
  // and failed the whole send (the Top-15-with-CC bug).
  // Resend's /emails/batch supports neither attachments nor per-message cc/bcc,
  // so drop to individual /emails sends whenever ANY email carries a cc (a
  // hospital's own cc_emails or the dispatcher's extraCc) or a bcc.
  const anyCc = emails.some(e => Array.isArray((e as { cc?: string[] }).cc) && (e as { cc?: string[] }).cc!.length > 0);
  const usePerEmail = builtAttachments.length > 0 || anyCc || extraBcc.length > 0;
  let sentCount = 0, failedCount = 0, messageId = "", lastError = "";
  // Retry a transient failure (429 rate-limit / 5xx) with backoff before giving
  // up — a single blip used to silently drop up to 100 hospitals.
  const postWithRetry = async (url: string, body: unknown): Promise<Response> => {
    let res!: Response;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok || (res.status !== 429 && res.status < 500)) return res;   // success or a non-transient error
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    return res;
  };
  try {
    if (!usePerEmail) {
      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const res = await postWithRetry("https://api.resend.com/emails/batch", chunk);
        const txt = await res.text();
        if (!res.ok) { failedCount += chunk.length; lastError = `Resend batch ${res.status}: ${txt.slice(0, 200)}`; continue; }
        sentCount += chunk.length;
        if (!messageId) { try { messageId = (JSON.parse(txt) as { data?: Array<{ id?: string }> }).data?.[0]?.id ?? ""; } catch { /* */ } }
      }
    } else {
      for (const payload of emails) {
        const res = await postWithRetry("https://api.resend.com/emails", payload);
        const txt = await res.text();
        if (res.ok) { sentCount++; if (!messageId) { try { messageId = (JSON.parse(txt) as { id?: string }).id ?? ""; } catch { /* */ } } }
        else { failedCount++; lastError = `Resend ${res.status}: ${txt.slice(0, 200)}`; }
        await new Promise(r => setTimeout(r, 120));   // stay under Resend's rate limit
      }
    }
  } catch (e) {
    if (!adhoc) await supabase.from("scheduled_batch_sends")
      .update({ status: "failed", error: String(e), updated_at: new Date().toISOString() })
      .eq("id", batch.id);
    return json({ ok: false, error: "Network error reaching Resend", detail: String(e) }, 502);
  }

  if (sentCount === 0) {
    if (!adhoc) await supabase.from("scheduled_batch_sends")
      .update({ status: "failed", error: lastError || "No emails sent", updated_at: new Date().toISOString() })
      .eq("id", batch.id);
    return json({ ok: false, error: "Batch failed to send", detail: lastError }, 502);
  }

  // ── Doctor "working opportunity" emails — one per queued doctor with an email
  // (test mode redirects to the test inbox). Sent AFTER the hospital emails
  // succeeded. Hospital-facing attachments are NOT attached to the doctor note.
  let doctorSent = 0, doctorFailed = 0;
  if (includeDoctorEmail) {
    // Per-doctor edits from the preview's profile sub-tabs, index-aligned with
    // doctorBlocks. The legacy single override still applies to every doctor.
    const docOverrides: string[] = Array.isArray(body.doctor_html_overrides)
      ? (body.doctor_html_overrides as unknown[]).map(v => typeof v === "string" ? v.trim() : "")
      : [];
    const legacyOverride = (body.doctor_html_override ?? "").trim();
    const legacySubject  = (body.doctor_subject_override ?? "").trim();
    const docSubjects: string[] = Array.isArray(body.doctor_subject_overrides)
      ? (body.doctor_subject_overrides as unknown[]).map(v => typeof v === "string" ? v.trim() : "")
      : [];
    for (let i = 0; i < doctorBlocks.length; i++) {
      const blk = doctorBlocks[i];
      const de  = blk.email;
      if (!de || de.toLowerCase() === EXCLUDED_RECIPIENT || excludeSet.has(de.toLowerCase())) continue;
      const finalDoctorHtml = wrapHtml(docOverrides[i] || legacyOverride || blk.html);
      const finalSubject    = docSubjects[i] || legacySubject || blk.subject || doctorSubjectFresh;
      // THIS doctor's own attachments (per-doctor list wins; else the legacy
      // global list). Never fan one doctor's file across the others.
      const docAtt = builtDoctorAttachmentsByDoctor[i]?.length ? builtDoctorAttachmentsByDoctor[i] : builtDoctorAttachments;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method:  "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from:    MAIL_FROM,
            to:      TEST_OVERRIDE_LIST.length ? [TEST_OVERRIDE_LIST[0]] : [de],
            subject: finalSubject,
            html:    finalDoctorHtml,
            text:    stripHtml(finalDoctorHtml),
            headers: { "X-AA-Batch-Id": String(batch.id), "X-AA-Kind": "doctor_working_op" },
            ...(docAtt.length ? { attachments: docAtt } : {}),
          }),
        });
        if (res.ok) doctorSent++; else doctorFailed++;
      } catch { doctorFailed++; }
      await new Promise(r => setTimeout(r, 120));
    }
  }

  // Ad-hoc sends own no DB row and never touch the rotation.
  if (!adhoc) {
    await supabase.from("scheduled_batch_sends").update({
      status:          "sent",
      sent_at:         new Date().toISOString(),
      hospital_count:  sentCount,
      sent_message_id: messageId,
      error:           failedCount > 0 ? `${failedCount} of ${emails.length} failed: ${lastError}` : null,
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
  }

  return json({
    ok: true,
    batch_id: batch.id,
    message_id: messageId,
    bcc_count: sentCount,           // hospitals actually emailed (one each now)
    doctor_count: rows.length,
    doctor_email_sent: doctorSent,  // doctors emailed the working-opportunity note
    doctor_email_failed: doctorFailed,
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
    `<th style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;background:#0f766e;color:#ffffff;font-size:13px;font-weight:600;white-space:nowrap;">${esc(label)}</th>`;
  const td = (val: string) =>
    `<td style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;font-size:14px;color:#1a2332;vertical-align:top;">${esc(val)}</td>`;
  // Column list kept 1:1 with send-flow-email's doctorRowTableHtml, including
  // Area of Interest — a Daily Duo now sends the same profile-sent format.
  const head =
    `<tr>${th("#")}${th("Name")}${th("Title and Specialty as per the UAE license")}${th("Area of Interest")}${th("Country Of Training")}` +
    `${th("Years of Experience")}${th("Nationality")}${th("Age")}${th("Marital Status")}${th("Family Status")}` +
    `${th("UAE license type / Status")}${th("Salary Expectation")}${th("Notice Period")}${th("Mobile")}${th("Email")}</tr>`;
  const body = rows.map(r =>
    `<tr>${td(String(r.idx))}${td(r.name)}${td(r.title || r.specialty)}${td(r.areas)}${td(r.training)}${td(r.years)}${td(r.nationality)}` +
    `${td(r.age)}${td(r.marital)}${td(r.family)}${td(r.license)}${td(r.salary)}${td(r.notice)}${td(r.mobile)}${td(r.email)}</tr>`,
  ).join("");
  return `<div style="overflow-x:auto;max-width:100%;margin:18px 0;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #cbd5e1;">` +
    `<thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// Daily Duo: each doctor as their OWN profile-card image (the exact Profile-Sent
// card, pre-rendered client-side to a PNG in `urls`, aligned to `rows` by index),
// stacked. A row with no image URL falls back to the server-rendered card so a
// single failed capture never blanks a profile. Styled like send-flow-email's
// {{doctor_card_image_url}} <img> swap so the duo matches the single send.
function renderDoctorProfiles(rows: RowData[], urls: string[]): string {
  return rows.map((r, i) => {
    const url = (urls[i] ?? "").trim();
    if (url) {
      return `<div style="margin:0 0 22px;">` +
        `<img src="${esc(url)}" alt="${esc(r.name)} — profile" ` +
        `style="display:block;width:100%;max-width:700px;height:auto;border:0;border-radius:14px;margin:0 auto;" />` +
        `</div>`;
    }
    return renderDoctorCard(r); // no image for this doctor → server-rendered card
  }).join("");
}

// Plain-text counterpart for the image block — a readable list of the queued
// doctors (stripHtml on an <img> block would yield nothing).
function renderDoctorsPlain(rows: RowData[]): string {
  return rows.map(r => {
    const parts: string[] = [`Profile #${r.idx}: ${r.name}`];
    if (r.title || r.specialty) parts.push(r.title || r.specialty);
    if (r.email)   parts.push(`Email: ${r.email}`);
    if (r.mobile)  parts.push(`Mobile: ${r.mobile}`);
    if (r.website) parts.push(`Profile: ${r.website}`);
    return parts.join("\n");
  }).join("\n\n");
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

/** Area-of-interest formatter — MIRROR of src/lib/format-list.ts (and
 *  send-flow-email's copy). `area_of_interest` often holds free-text BIO prose,
 *  so only segments that LOOK like interest terms are kept; if none do, we fall
 *  back to the job title rendered as a field ("Consultant Plastic Surgeon" →
 *  "Plastic Surgery"). Keep all three copies in lockstep. */
const PROSE_WORDS = new Set([
  "he", "she", "his", "her", "him", "they", "their", "them", "i", "we", "our", "who", "which", "that",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "holds", "holding",
  "with", "from", "the", "an", "including", "include", "includes", "also", "currently",
  "experience", "experienced", "extensive", "certification", "certified", "qualification", "qualified",
  "university", "master", "masters", "bachelor", "degree", "diploma", "training", "trained",
  "graduated", "graduate", "years", "year", "over", "more", "than", "after", "before", "during",
  "since", "worked", "works", "working", "completed", "obtained", "received", "awarded",
  "specialises", "specializes", "specialising", "specializing", "dr", "doctor", "consultant",
  "status", "registration", "registered", "chartered", "accredited", "license", "licensed",
  "roles", "role", "managerial", "management", "manager", "leadership", "leading", "led",
  "operations", "operational", "governance", "consultancy", "consulting", "organisation",
  "organisations", "organization", "organizations", "organizational", "teams", "team",
  "deputy", "service", "services", "held", "key", "senior", "head", "director", "board",
  "multisite", "multidisciplinary", "academic", "academia", "strategy", "strategic",
  "stakeholder", "delivery", "compliance", "audit", "policy",
]);
const GRADE_WORDS = new Set([
  "consultant", "specialist", "senior", "junior", "associate", "assistant", "attending",
  "registrar", "fellow", "head", "department", "chief", "staff", "locum", "trainee", "resident",
  "dr", "doctor", "of", "and",
]);
const ROLE_TO_FIELD: Array<[RegExp, string]> = [
  [/^surgeons?$/i,                                  "Surgery"],
  [/^physicians?$/i,                                "Medicine"],
  [/^an(a)?esthetists?$|^an(a)?esthesiologists?$/i, "Anaesthesia"],
  [/^obstetricians?$/i,                             "Obstetrics"],
  [/^gyn(a)?ecologists?$/i,                         "Gynaecology"],
  [/^p(a)?ediatricians?$/i,                         "Paediatrics"],
  [/^psychiatrists?$/i,                             "Psychiatry"],
  [/^dentists?$/i,                                  "Dentistry"],
  [/^radiographers?$/i,                             "Radiography"],
  [/^nurses?$/i,                                    "Nursing"],
  [/^midwi(fe|ves)$/i,                              "Midwifery"],
];
function isInterestTerm(term: string): boolean {
  if (!term) return false;
  if (/[0-9()]/.test(term)) return false;
  const words = term.split(/\s+/);
  if (words.length > 4) return false;
  return !words.some(w => PROSE_WORDS.has(w.replace(/[^a-z]/gi, "").toLowerCase()));
}
function capitaliseWord(w: string): string {
  if (!w) return w;
  if (w.length <= 4 && w === w.toUpperCase()) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}
function specialtyToField(title: string | null | undefined): string {
  if (!title) return "";
  const words = String(title)
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !GRADE_WORDS.has(w.toLowerCase()));
  if (!words.length) return "";
  const last = words[words.length - 1];
  let mapped = "";
  for (const [re, field] of ROLE_TO_FIELD) if (re.test(last)) { mapped = field; break; }
  if (!mapped && /ologist$/i.test(last)) mapped = last.replace(/ologist$/i, "ology");
  if (!mapped && /iatrist$/i.test(last)) mapped = last.replace(/iatrist$/i, "iatry");
  if (mapped) words[words.length - 1] = mapped;
  return words.map(capitaliseWord).join(" ");
}
function formatAreasOfInterest(
  raw: string | null | undefined,
  opts: { fallback?: string; maxWords?: number } = {},
): string {
  const { fallback = "", maxWords = 30 } = opts;
  const fromTitle = () => specialtyToField(fallback);
  if (!raw) return fromTitle();
  const parts = String(raw)
    .split(/\s*(?:[,;/\n·•]|\.\s|\band\b|&)\s*/i)
    .map(s => s.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const p of parts) {
    if (!isInterestTerm(p)) continue;
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); terms.push(p); }
  }
  const rawWords = String(raw).trim().split(/\s+/).length;
  if (!terms.length || rawWords > 14 || terms.length > 6) return fromTitle();
  const kept: string[] = [];
  let words = 0;
  for (const t of terms) { const w = t.split(/\s+/).length; if (kept.length && words + w > maxWords) break; kept.push(t); words += w; }
  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(", ")} & ${kept[kept.length - 1]}`;
}

function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Canonicalise a country label so alias variants collapse to one value — a batch
// set to "Saudi Arabia" then matches hospitals saved as "KSA" / "K.S.A." /
// "Kingdom of Saudi Arabia", "UAE" matches "United Arab Emirates", etc. Mirrors
// the hospital-normalise migration + the Zoho country normaliser, so batch
// country-matching survives the label drift the Hospitals UI still allows.
function normCountry(c: string): string {
  const s = (c || "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.includes("saudi")   || s === "ksa" || s === "sa") return "saudi arabia";
  if (s.includes("emirat")  || s === "uae")               return "uae";
  if (s.includes("qatar")   || s === "qa")                return "qatar";
  if (s.includes("oman")    || s === "om")                return "oman";
  if (s.includes("kuwait")  || s === "kw")                return "kuwait";
  if (s.includes("bahrain") || s === "bh")                return "bahrain";
  return s;
}

// Fuzzy hospital-name key for matching Zoho contacts to a hospital — mirrors
// `core()` in src/hooks/use-hospital-contacts.ts, dropping generic words so
// "NMC Healthcare" ≈ "NMC". Keep in sync with the client so 'all'-mode batches
// resolve the same contacts the Hospitals UI shows.
function coreHospitalName(s: string): string {
  const norm = (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  return norm
    .replace(/\b(hospital|hospitals|clinic|clinics|medical|centre|center|group|the|healthcare|health|university|llc|company)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * tick-scheduler — Supabase Edge Function
 *
 * Walks all active automation_flow_runs and advances any whose current_stage
 * is a *time-based* gate that's now due. Designed to be called every ~5 min
 * by pg_cron (see migration 20260524000009_tick_scheduler_cron.sql) and on
 * demand by the "Run scheduler now" button in the Automations UI.
 *
 * Stages handled (everything else is left untouched — UI / BoldSign / hospital
 * reply webhooks drive those):
 *
 *   Onboarding · `wait_for_form`         → 3d after last_event_at, advance to
 *                                          `reminder_form` and invoke
 *                                          send-flow-email.
 *
 *   Second Payment · `trigger_15_days`   → 15 days after joining_date (from
 *                                          metadata), advance to `send_invoice`
 *                                          and invoke send-flow-email.
 *
 *   Second Payment · `reminder_25_working` → ~25 working days after the run
 *                                          entered this stage (we approximate
 *                                          as 35 calendar days), invoke
 *                                          send-flow-email (which sends +
 *                                          advances to `reminder_day_before`).
 *
 *   Second Payment · `reminder_day_before` → 1 day before metadata.due_date,
 *                                          invoke send-flow-email.
 *
 *   Second Payment · `reminder_weekly`     → every 7 days while at this stage
 *                                          (self-loop until finance marks
 *                                          the invoice paid).
 *
 * Idempotency: send-flow-email's own duplicate-send guard prevents a stage
 * from being processed twice within the same `email_sent` event lifetime.
 * Reminder stages are explicitly allowed to repeat by that guard.
 *
 * Auth: deployed with --no-verify-jwt so pg_cron can hit it without a JWT.
 * Service role key is read from the env to talk to Supabase.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("[tick-scheduler] booted.");

interface FlowRun {
  id:            string;
  flow_key:      string;
  doctor_id:     string | null;
  doctor_name:   string;
  current_stage: string;
  status:        string;
  last_event_at: string;
  metadata:      Record<string, unknown>;
}

interface TickAction {
  run_id:   string;
  doctor:   string;
  flow:     string;
  stage:    string;
  reason:   string;
  result:   "advanced" | "sent" | "skipped" | "error";
  detail?:  string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  // Pull every active run. Volume here is small (hundreds at most), so a
  // single fetch + filter is simpler than per-stage queries.
  const { data: runs, error } = await supabase
    .from("automation_flow_runs")
    .select("id, flow_key, doctor_id, doctor_name, current_stage, status, last_event_at, metadata")
    .eq("status", "active")
    .in("current_stage", [
      "wait_for_form",
      "trigger_15_days",
      "reminder_25_working",
      "reminder_day_before",
      "reminder_weekly",
      "awaiting_response",   // profile_sent — chase nudge after 7d silence
      "awaiting_signature",  // contract_signing — fire reminder after 5d
      "interview_complete",  // interview — chase hospital after 3d
    ]);

  if (error) {
    console.error("[tick-scheduler] query failed:", error.message);
    return json({ ok: false, error: error.message }, 500);
  }

  console.log(`[tick-scheduler] inspecting ${runs?.length ?? 0} time-gated runs at ${now.toISOString()}`);
  const actions: TickAction[] = [];

  // ── Phase 3 · Vacancy follow-up reminders ────────────────────────────────
  // 3 days after a vacancy opens (and weekly after that), append a "note"
  // event onto the opener's record so it shows up in their Pending Actions
  // tray. Doesn't fire emails — Saif wanted nudges, not noise.
  try {
    const { data: vacancies } = await supabase
      .from("vacancies")
      .select("id, hospital_name, specialty, opened_at, opened_by, last_followup_at, status")
      .eq("status", "open");
    for (const v of (vacancies ?? []) as Array<{
      id: string; hospital_name: string; specialty: string;
      opened_at: string; opened_by: string | null; last_followup_at: string | null; status: string;
    }>) {
      const openedDaysAgo = (now.getTime() - new Date(v.opened_at).getTime()) / 86_400_000;
      const lastFollowupDaysAgo = v.last_followup_at
        ? (now.getTime() - new Date(v.last_followup_at).getTime()) / 86_400_000
        : Infinity;
      // First nudge at 3d. After that, every 7d while still open.
      const due = openedDaysAgo >= 3 && lastFollowupDaysAgo >= 7;
      if (!due) continue;
      await supabase.from("vacancies")
        .update({ last_followup_at: now.toISOString() })
        .eq("id", v.id);
      console.log(`[tick-scheduler] vacancy follow-up nudge for ${v.hospital_name} · ${v.specialty} (${openedDaysAgo.toFixed(1)}d open)`);
      actions.push({
        run_id: v.id, doctor: v.opened_by ?? "(opener)",
        flow:   "vacancy",
        stage:  "follow_up",
        reason: `Vacancy ${openedDaysAgo.toFixed(0)}d old — nudge ${v.opened_by ?? "the team"}`,
        result: "sent",
        detail: `${v.hospital_name} · ${v.specialty}`,
      });
    }
  } catch (e) {
    console.error("[tick-scheduler] vacancy follow-up sweep failed:", e);
  }

  for (const r of (runs ?? []) as FlowRun[]) {
    const md = r.metadata ?? {};
    const lastEvent = new Date(r.last_event_at).getTime();
    const ageMs = now.getTime() - lastEvent;
    const ageDays = ageMs / 86_400_000;

    try {
      switch (r.current_stage) {
        case "wait_for_form": {
          // 3 days of silence → fire the form reminder.
          if (ageDays < 3) {
            actions.push(rec(r, "skipped", `only ${ageDays.toFixed(1)}d since last event (need 3)`));
            break;
          }
          // Advance to reminder_form so send-flow-email knows what template
          // to use, then invoke it.
          await supabase.from("automation_flow_runs")
            .update({ current_stage: "reminder_form", last_event_at: now.toISOString() })
            .eq("id", r.id);
          await supabase.from("automation_flow_events").insert({
            run_id: r.id, stage_key: "reminder_form", event_type: "entered",
            message: "Scheduler advanced after 3d of no form completion.",
          });
          const sent = await invokeSendFlow(r.id);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "form reminder dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        case "trigger_15_days": {
          // Joining date + 15 calendar days. If joining_date isn't set yet,
          // we can't tick — leave it for the team to populate.
          const joiningRaw = md.joining_date as string | undefined;
          if (!joiningRaw) {
            actions.push(rec(r, "skipped", "metadata.joining_date not set"));
            break;
          }
          const joiningMs = new Date(joiningRaw).getTime();
          if (Number.isNaN(joiningMs)) {
            actions.push(rec(r, "error", `bad joining_date: ${joiningRaw}`));
            break;
          }
          const daysSinceJoining = (now.getTime() - joiningMs) / 86_400_000;
          if (daysSinceJoining < 15) {
            actions.push(rec(r, "skipped", `${daysSinceJoining.toFixed(1)}d since joining (need 15)`));
            break;
          }
          await supabase.from("automation_flow_runs")
            .update({ current_stage: "send_invoice", last_event_at: now.toISOString() })
            .eq("id", r.id);
          await supabase.from("automation_flow_events").insert({
            run_id: r.id, stage_key: "send_invoice", event_type: "entered",
            message: `Scheduler advanced 15d post-join (joined ${joiningRaw}).`,
          });
          const sent = await invokeSendFlow(r.id);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "invoice dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        case "reminder_25_working": {
          // 25 working days ≈ 35 calendar days. Good enough for a friendly
          // reminder — refining to a true working-day calc isn't worth the
          // complexity here.
          if (ageDays < 35) {
            actions.push(rec(r, "skipped", `${ageDays.toFixed(1)}d at stage (need ~35)`));
            break;
          }
          const sent = await invokeSendFlow(r.id);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "25-day reminder dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        case "reminder_day_before": {
          // Fire 24h (or less) before due_date. If due_date isn't set,
          // fall back to "send 7d after entering this stage" so we don't
          // get permanently stuck.
          const dueRaw = md.due_date as string | undefined;
          if (dueRaw) {
            const dueMs = new Date(dueRaw).getTime();
            if (Number.isNaN(dueMs)) {
              actions.push(rec(r, "error", `bad due_date: ${dueRaw}`));
              break;
            }
            const hoursUntilDue = (dueMs - now.getTime()) / 3_600_000;
            if (hoursUntilDue > 24) {
              actions.push(rec(r, "skipped", `${hoursUntilDue.toFixed(0)}h until due (need ≤24)`));
              break;
            }
            // Past due is fine — we'd still want them to know.
          } else if (ageDays < 7) {
            actions.push(rec(r, "skipped", `no due_date and only ${ageDays.toFixed(1)}d at stage`));
            break;
          }
          const sent = await invokeSendFlow(r.id);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "day-before reminder dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        case "awaiting_response": {
          // profile_sent: hospital hasn't replied 7d after the team sent
          // the profile. Don't spam-email the hospital — they'd
          // typically reply by phone. Instead write a team-facing
          // notification so it surfaces in the bell + PendingActions.
          if (ageDays < 7) {
            actions.push(rec(r, "skipped", `${ageDays.toFixed(1)}d since profile sent (need 7)`));
            break;
          }
          // Dedupe: only fire once per run. The 'last_event_at' check
          // below keeps us idempotent — once the notification is
          // logged we touch last_event_at so this branch won't re-fire.
          await supabase.from("notifications").insert({
            kind:              "hospital_reply_overdue",
            title:             `${r.hospital ?? "Hospital"} hasn't replied to ${r.doctor_name}'s profile`,
            body:              `7+ days since send. Chase the recruiter or mark the run completed if you've heard back another way.`,
            link_path:         `/automations?flow=profile_sent&run=${r.id}`,
            related_run_id:    r.id,
            related_doctor_id: r.doctor_id,
            for_user:          (r.metadata as Record<string, unknown> | null)?.assigned_to as string | null ?? null,
          }).catch(() => {/* harmless if dedupe constraint hits */});
          await supabase.from("automation_flow_runs")
            .update({ last_event_at: now.toISOString() })
            .eq("id", r.id);
          await supabase.from("automation_flow_events").insert({
            run_id: r.id, stage_key: "awaiting_response", event_type: "note",
            message: `Scheduler nudge: hospital hasn't replied in ${ageDays.toFixed(0)}d.`,
          });
          actions.push(rec(r, "sent", "hospital-reply-overdue notification logged"));
          break;
        }

        case "awaiting_signature": {
          // contract_signing: 5d at this stage with no team-confirmed
          // signature → advance to reminder_signature + fire the nudge
          // email to the doctor (template: contract_checkin_reminder).
          if (ageDays < 5) {
            actions.push(rec(r, "skipped", `${ageDays.toFixed(1)}d awaiting signature (need 5)`));
            break;
          }
          await supabase.from("automation_flow_runs")
            .update({ current_stage: "reminder_signature", last_event_at: now.toISOString() })
            .eq("id", r.id);
          await supabase.from("automation_flow_events").insert({
            run_id: r.id, stage_key: "reminder_signature", event_type: "entered",
            message: "Scheduler advanced after 5d at awaiting_signature (no team-confirmed signature).",
          });
          const sent = await invokeSendFlow(r.id);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "contract reminder dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        case "reminder_weekly": {
          // Self-loop. Send every 7 days based on last email_sent event at
          // this stage. last_event_at moves on every send (send-flow-email
          // updates it), so checking ageDays >= 7 against last_event_at is
          // sufficient.
          if (ageDays < 7) {
            actions.push(rec(r, "skipped", `${ageDays.toFixed(1)}d since last weekly send (need 7)`));
            break;
          }
          const sent = await invokeSendFlow(r.id, /* force */ true);
          actions.push(rec(r, sent.ok ? "sent" : "error", sent.ok ? "weekly reminder dispatched" : `send-flow-email failed: ${sent.detail}`));
          break;
        }

        default:
          actions.push(rec(r, "skipped", "stage not handled by scheduler"));
      }
    } catch (e) {
      console.error("[tick-scheduler] run", r.id, "threw:", e);
      actions.push(rec(r, "error", String(e)));
    }
  }

  // ── Phase 3 · Vacancy auto-match notifications ───────────────────────────
  // For every open vacancy, find doctors that strongly match (specialty + the
  // right license for the hospital's region) and write a notification — but
  // only for NEW pairings: the doctor is recent OR the vacancy is recent.
  // Otherwise we'd spam the whole back-catalogue on first run.
  const matchNotifs = await runVacancyMatchSweep(supabase, now);
  for (const n of matchNotifs) actions.push(n);

  // ── Phase 3 · 72-hour post-interview chase reminder ──────────────────────
  // When an Interview flow has been complete for 3+ days, nudge the team to
  // chase the hospital. Spec: "72 hours after an interview → system reminds
  // the team to follow up with the hospital."
  const interviewNotifs = await runInterviewFollowupSweep(supabase, now);
  for (const n of interviewNotifs) actions.push(n);

  // ── Phase 4 · Doctor unavailability check-in pings ───────────────────────
  // When a doctor was marked unavailable with a future check-in date and
  // that date has now arrived, write a notification so the team
  // re-confirms. Saif's spec: "If still unavailable, push back the check-in."
  const availNotifs = await runAvailabilityCheckInSweep(supabase, now);
  for (const n of availNotifs) actions.push(n);

  // ── Phase 5 · "Doctors on the way" weekly chase ──────────────────────────
  // Spec: "Weekly reminders to contact doctors on the way (signed but not yet
  // joined)." Fires once per week per doctor while they remain signed-but-
  // unjoined.
  const otwNotifs = await runDoctorsOnTheWaySweep(supabase, now);
  for (const n of otwNotifs) actions.push(n);

  // ── Phase 6 · Auto-fire scheduled batches ────────────────────────────────
  // Daily duo: Mon-Fri at/after 10:30 AM. Tuesday top 15: Tue 11 AM-4 PM.
  // Specialty of day: Wed-Fri any time. Each kind only fires once (status
  // flips to 'sent' on success), so multiple ticks in the window are safe.
  const batchActs = await runBatchSendSweep(supabase, now);
  for (const a of batchActs) actions.push(a);

  // ── Sheet connection auto-sync ───────────────────────────────────────────
  // Re-pull every active sheet whose last_synced_at is older than its
  // configured schedule_minutes. Mirrors what "Sync now" does manually.
  const syncActs = await runSheetSyncSweep(supabase, now);
  for (const a of syncActs) actions.push(a);

  const summary = {
    inspected:  runs?.length ?? 0,
    sent:       actions.filter(a => a.result === "sent").length,
    advanced:   actions.filter(a => a.result === "advanced").length,
    skipped:    actions.filter(a => a.result === "skipped").length,
    errors:     actions.filter(a => a.result === "error").length,
  };
  console.log("[tick-scheduler] tick complete", summary);

  return json({ ok: true, ran_at: now.toISOString(), summary, actions }, 200);
});

// ── Phase 3 · vacancy auto-match sweep ──────────────────────────────────────
async function runVacancyMatchSweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const [{ data: vacancies }, { data: hospitals }, { data: cache }] = await Promise.all([
      supabase.from("vacancies").select("id, hospital_id, hospital_name, specialty, opened_at, opened_by, priority, notes").eq("status", "open"),
      supabase.from("hospitals").select("id, name, city, country"),
      supabase.from("zoho_cache").select("id, data").in("id", [1, 2]),
    ]);
    if (!vacancies || vacancies.length === 0) return acts;

    const hospMap = new Map<string, { city: string | null; country: string | null }>();
    for (const h of (hospitals ?? []) as Array<{ id: string; city: string | null; country: string | null }>) {
      hospMap.set(h.id, { city: h.city, country: h.country });
    }

    // Merge zoho_cache rows 1+2 — leads/DOB live across the two split rows.
    const merged: Record<string, unknown> = {};
    for (const r of (cache ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
      if (r.data) Object.assign(merged, r.data);
    }
    const leads = (merged.leads as ZohoLeadLite[] | undefined) ?? [];
    const dobs  = (merged.doctorsOnBoard as ZohoDobLite[] | undefined) ?? [];

    const FRESH_DAYS = 14;
    const freshCut = now.getTime() - FRESH_DAYS * 86_400_000;

    for (const v of (vacancies ?? []) as VacancyLite[]) {
      const vacFresh = new Date(v.opened_at).getTime() >= freshCut;
      const hosp = v.hospital_id ? hospMap.get(v.hospital_id) ?? null : null;

      // Walk leads first, then DOB. Cap each side so a huge backlog can't
      // blow the tick budget — strong matches will surface within a couple
      // of ticks even if we don't process everyone in one pass.
      const candidates: Array<{ prefixedId: string; name: string; createdAt: string; specialty: string | null;
                                hasDha: boolean; hasDoh: boolean; hasMoh: boolean; licenseText: string | null }> = [];
      for (const l of leads) {
        candidates.push({
          prefixedId:  `lead:${l.id}`,
          name:        l.Full_Name ?? "",
          createdAt:   l.Created_Time ?? new Date(0).toISOString(),
          specialty:   l.Specialty_New ?? l.Specialty ?? null,
          hasDha:      truthy(l.Has_DHA),
          hasDoh:      truthy(l.Has_DOH),
          hasMoh:      truthy(l.Has_MOH),
          licenseText: l.License ?? null,
        });
      }
      for (const d of dobs) {
        candidates.push({
          prefixedId:  `dob:${d.id}`,
          name:        d.Full_Name ?? "",
          createdAt:   d.Created_Time ?? new Date(0).toISOString(),
          specialty:   d.Specialty ?? null,
          hasDha:      false, hasDoh: false, hasMoh: false, licenseText: null,
        });
      }

      for (const c of candidates) {
        if (!c.specialty) continue;
        // Specialty gate — exact or partial.
        const score = lightScore(c.specialty, v.specialty, c.hasDha, c.hasDoh, c.hasMoh, c.licenseText, hosp);
        if (score < 50) continue;  // skip weak matches — UI still shows them on demand

        // Freshness gate — at least one side of the pairing must be < FRESH_DAYS old.
        const docFresh = new Date(c.createdAt).getTime() >= freshCut;
        if (!vacFresh && !docFresh) continue;

        // Upsert via the unique partial index. On conflict, do nothing — we
        // don't want to re-notify after the team has dismissed.
        const { error: insErr } = await supabase.from("notifications").insert({
          kind:                "vacancy_match",
          title:               `New match · ${v.hospital_name}`,
          body:                `${c.name || "A doctor"} (${c.specialty}) matches ${v.specialty} at ${v.hospital_name}.`,
          link_path:           `/vacancies`,
          related_vacancy_id:  v.id,
          related_doctor_id:   c.prefixedId,
          for_user:            v.opened_by,
        });
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          console.error("[tick-scheduler] notif insert failed:", insErr.message);
          continue;
        }
        if (!insErr) {
          console.log(`[tick-scheduler] vacancy_match · ${v.hospital_name} ↔ ${c.name} (${score})`);
          acts.push({
            run_id: v.id, doctor: c.name || c.prefixedId,
            flow:   "vacancy_match", stage: v.specialty,
            reason: `score ${score} · ${vacFresh ? "fresh vacancy" : "fresh doctor"}`,
            result: "sent",
            detail: `${v.hospital_name} ↔ ${c.specialty}`,
          });
        }
      }
    }
  } catch (e) {
    console.error("[tick-scheduler] vacancy_match sweep failed:", e);
  }
  return acts;
}

// ── Phase 3 · 72h post-interview reminder ──────────────────────────────────
async function runInterviewFollowupSweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    // Look at interview runs that finished ≥72h ago — the spec's window.
    const cutoff = new Date(now.getTime() - 72 * 3_600_000).toISOString();
    const { data: runs, error } = await supabase
      .from("automation_flow_runs")
      .select("id, doctor_name, hospital, completed_at, flow_key, status, assigned_to")
      .eq("flow_key", "interview")
      .eq("status",   "completed")
      .lt("completed_at", cutoff);
    if (error) throw error;

    for (const r of (runs ?? []) as Array<{ id: string; doctor_name: string; hospital: string | null; completed_at: string; assigned_to: string | null }>) {
      const hoursSince = Math.floor((now.getTime() - new Date(r.completed_at).getTime()) / 3_600_000);
      const { error: insErr } = await supabase.from("notifications").insert({
        kind:           "interview_followup",
        title:          `Chase ${r.hospital ?? "hospital"} — ${r.doctor_name}`,
        body:           `Interview wrapped ${hoursSince}h ago. Spec says nudge the hospital at 72h. No reply logged yet — time to follow up.`,
        link_path:      `/automations?flow=interview`,
        related_run_id: r.id,
        for_user:       r.assigned_to,
      });
      if (insErr && !/duplicate key/i.test(insErr.message)) {
        console.error("[tick-scheduler] interview_followup insert failed:", insErr.message);
        continue;
      }
      if (!insErr) {
        console.log(`[tick-scheduler] interview_followup · ${r.doctor_name} ↔ ${r.hospital} (${hoursSince}h)`);
        acts.push({
          run_id: r.id, doctor: r.doctor_name,
          flow:   "interview_followup", stage: "post_interview",
          reason: `${hoursSince}h since interview`,
          result: "sent",
          detail: r.hospital ?? "",
        });
      }
    }
  } catch (e) {
    console.error("[tick-scheduler] interview_followup sweep failed:", e);
  }
  return acts;
}

// ── Phase 4 · availability check-in sweep ──────────────────────────────────
async function runAvailabilityCheckInSweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    // Rows where: unavailable AND check-in is past AND we haven't pinged
    // since the last check-in change (last_availability_ping_at < check_in_at).
    const { data: rows, error } = await supabase
      .from("doctor_lifecycle")
      .select("doctor_id, doctor_name, unavailable_reason, available_check_in_at, last_availability_ping_at")
      .eq("unavailable", true)
      .lte("available_check_in_at", now.toISOString());
    if (error) throw error;

    for (const r of (rows ?? []) as Array<{
      doctor_id: string; doctor_name: string | null;
      unavailable_reason: string | null;
      available_check_in_at: string | null;
      last_availability_ping_at: string | null;
    }>) {
      // Suppress if we already pinged at/after the latest check-in change.
      if (r.last_availability_ping_at && r.available_check_in_at &&
          new Date(r.last_availability_ping_at).getTime() >= new Date(r.available_check_in_at).getTime()) {
        continue;
      }
      const name = r.doctor_name ?? "(doctor)";
      const { error: insErr } = await supabase.from("notifications").insert({
        kind:                "availability_checkin",
        title:               `Re-check availability — ${name}`,
        body:                `${name} was paused${r.unavailable_reason ? ` ("${r.unavailable_reason}")` : ""}. Your check-in date has arrived. Confirm available, or push the check-in.`,
        link_path:           `/doctor-profiles`,
        related_doctor_id:   r.doctor_id,
      });
      // Bump last_availability_ping_at regardless — we don't want to spam
      // the notification table if the insert fails for some reason.
      await supabase.from("doctor_lifecycle")
        .update({ last_availability_ping_at: now.toISOString() })
        .eq("doctor_id", r.doctor_id);
      if (insErr && !/duplicate key/i.test(insErr.message)) {
        console.error("[tick-scheduler] availability_checkin insert failed:", insErr.message);
        continue;
      }
      console.log(`[tick-scheduler] availability_checkin · ${name}`);
      acts.push({
        run_id: r.doctor_id, doctor: name,
        flow:   "availability_checkin", stage: "checkin_due",
        reason: "check-in date reached",
        result: "sent",
      });
    }
  } catch (e) {
    console.error("[tick-scheduler] availability sweep failed:", e);
  }
  return acts;
}

// ── Phase 5 · doctors-on-the-way weekly nudge ──────────────────────────────
// Notifies for anyone signed >14 days and still not joined. Dedupes by
// looking for an existing notification within the past 7 days for the same
// doctor — so the team gets the nudge weekly, not every 5 minutes.
async function runDoctorsOnTheWaySweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const cutoff = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const { data: rows, error } = await supabase
      .from("doctor_lifecycle")
      .select("doctor_id, doctor_name, signed_at")
      .not("signed_at", "is", null)
      .is("joined_at", null)
      .lte("signed_at", cutoff);
    if (error) throw error;

    const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

    for (const r of (rows ?? []) as Array<{ doctor_id: string; doctor_name: string | null; signed_at: string }>) {
      const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("kind",              "signed_not_joined")
        .eq("related_doctor_id", r.doctor_id)
        .gt("created_at",        oneWeekAgo)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const days = Math.floor((now.getTime() - new Date(r.signed_at).getTime()) / 86_400_000);
      const name = r.doctor_name ?? "(doctor)";
      const { error: insErr } = await supabase.from("notifications").insert({
        kind:                "signed_not_joined",
        title:               `On the way — ${name}`,
        body:                `Signed ${days}d ago, no joining date logged yet. Time for a check-in. Once you set the joining date the second-payment invoice will arm automatically.`,
        link_path:           `/doctor-profiles`,
        related_doctor_id:   r.doctor_id,
      });
      if (insErr && !/duplicate key/i.test(insErr.message)) {
        console.error("[tick-scheduler] signed_not_joined insert failed:", insErr.message);
        continue;
      }
      acts.push({
        run_id: r.doctor_id, doctor: name,
        flow:   "signed_not_joined", stage: "post_signing",
        reason: `${days}d since signing`,
        result: "sent",
      });
    }
  } catch (e) {
    console.error("[tick-scheduler] signed_not_joined sweep failed:", e);
  }
  return acts;
}

// ── Sheet-connection auto-sync sweep ───────────────────────────────────────
async function runSheetSyncSweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const { data: conns, error } = await supabase
      .from("sheet_connections")
      .select("id, label, last_synced_at, schedule_minutes, target_kind, active")
      .eq("active", true);
    if (error) throw error;

    for (const c of (conns ?? []) as Array<{
      id: string; label: string; last_synced_at: string | null;
      schedule_minutes: number; target_kind: string; active: boolean;
    }>) {
      const dueMs = (c.schedule_minutes ?? 60) * 60_000;
      const lastMs = c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0;
      if (c.last_synced_at && now.getTime() - lastMs < dueMs) continue;

      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/sheets-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ connection_id: c.id }),
        });
        const txt = await r.text();
        if (r.ok) {
          acts.push({ run_id: c.id, doctor: c.label, flow: "sheets-sync", stage: c.target_kind, reason: "auto-pull due", result: "sent", detail: txt.slice(0, 120) });
        } else {
          acts.push({ run_id: c.id, doctor: c.label, flow: "sheets-sync", stage: c.target_kind, reason: `HTTP ${r.status}`, result: "error", detail: txt.slice(0, 120) });
        }
      } catch (e) {
        acts.push({ run_id: c.id, doctor: c.label, flow: "sheets-sync", stage: c.target_kind, reason: String(e), result: "error" });
      }
    }
  } catch (e) {
    console.error("[tick-scheduler] sheet-sync sweep failed:", e);
  }
  return acts;
}

// ── Phase 6 · Auto-fire scheduled batches ──────────────────────────────────
// Time windows are based on UTC for stable scheduling — Dubai is UTC+4 so
// 10:30 AM Dubai is 06:30 UTC, 11 AM is 07:00 UTC, 4 PM is 12:00 UTC.
async function runBatchSendSweep(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const dayOfWeek = now.getUTCDay();        // 0 Sun .. 6 Sat
    const hourUtc   = now.getUTCHours();
    const minUtc    = now.getUTCMinutes();
    const minsSinceMidnight = hourUtc * 60 + minUtc;
    const todayStr = now.toISOString().slice(0, 10);

    // Window decisions (Dubai local → UTC):
    //   Mon-Fri 10:30 Dubai = 06:30 UTC  → minute >= 390
    //   Tue     11:00 Dubai = 07:00 UTC  → minute >= 420  (until 16:00 Dubai = 12:00 UTC, minute <= 720)
    //   Wed-Fri any time today
    const dailyDuoFiresNow      = dayOfWeek >= 1 && dayOfWeek <= 5 && minsSinceMidnight >= 390;
    const tuesdayTop15FiresNow  = dayOfWeek === 2 && minsSinceMidnight >= 420 && minsSinceMidnight <= 720;
    const specialtyOfDayFires   = dayOfWeek >= 3 && dayOfWeek <= 5;

    const { data: batches, error } = await supabase
      .from("scheduled_batch_sends")
      .select("id, kind, doctor_ids")
      .eq("scheduled_for", todayStr)
      .eq("status", "draft");
    if (error) throw error;

    for (const b of (batches ?? []) as Array<{ id: string; kind: string; doctor_ids: string[] }>) {
      const shouldFire =
        (b.kind === "daily_duo"        && dailyDuoFiresNow)     ||
        (b.kind === "tuesday_top_15"   && tuesdayTop15FiresNow) ||
        (b.kind === "specialty_of_day" && specialtyOfDayFires);
      if (!shouldFire) continue;
      if (!b.doctor_ids || b.doctor_ids.length === 0) {
        acts.push({ run_id: b.id, doctor: "(batch)", flow: "batch_send", stage: b.kind, reason: "no doctors queued", result: "skipped" });
        continue;
      }
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-batch`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ batch_id: b.id }),
        });
        const txt = await r.text();
        if (r.ok) {
          acts.push({ run_id: b.id, doctor: "(batch)", flow: "batch_send", stage: b.kind, reason: "auto-fired", result: "sent", detail: txt.slice(0, 120) });
        } else {
          acts.push({ run_id: b.id, doctor: "(batch)", flow: "batch_send", stage: b.kind, reason: `HTTP ${r.status}`, result: "error", detail: txt.slice(0, 120) });
        }
      } catch (e) {
        acts.push({ run_id: b.id, doctor: "(batch)", flow: "batch_send", stage: b.kind, reason: String(e), result: "error" });
      }
    }
  } catch (e) {
    console.error("[tick-scheduler] batch sweep failed:", e);
  }
  return acts;
}

// ── Light scorer (Deno mirror of src/lib/match-score.ts, signals-only) ─────
// The Vacancies UI runs the full scorer client-side. This is just the gate
// for "is this match strong enough to notify?". Returns 0..100.
function lightScore(
  docSpec: string,
  vacSpec: string,
  hasDha: boolean, hasDoh: boolean, hasMoh: boolean,
  licText: string | null,
  hosp: { city: string | null; country: string | null } | null,
): number {
  const a = (docSpec ?? "").toLowerCase().trim();
  const b = (vacSpec ?? "").toLowerCase().trim();
  if (!a || !b) return 0;
  let s = 0;
  if (a === b) s += 60;
  else if (a.includes(b) || b.includes(a)) s += 45;
  else {
    const aT = new Set(a.split(/\s+/).filter(t => t.length > 3));
    const bT = new Set(b.split(/\s+/).filter(t => t.length > 3));
    let overlap = 0; for (const t of aT) if (bT.has(t)) overlap++;
    if (overlap >= 1) s += 25;
  }
  if (s === 0) return 0;
  // License × region — same heuristic the client scorer uses.
  if (hosp) {
    const city    = (hosp.city ?? "").toLowerCase();
    const country = (hosp.country ?? "").toLowerCase();
    const text    = (licText ?? "").toLowerCase();
    const wantsDha = city === "dubai";
    const wantsDoh = city === "abu dhabi" || city === "al ain";
    const wantsMoh = !wantsDha && !wantsDoh && (country === "uae" || country === "united arab emirates");
    if (wantsDha && (hasDha || /dha/.test(text)))   s += 25;
    else if (wantsDoh && (hasDoh || /doh|haad/.test(text))) s += 25;
    else if (wantsMoh && (hasMoh || /moh/.test(text)))     s += 20;
  }
  return s;
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

interface VacancyLite {
  id: string; hospital_id: string | null; hospital_name: string; specialty: string;
  opened_at: string; opened_by: string | null; priority: string; notes: string | null;
}
interface ZohoLeadLite {
  id: string; Full_Name: string | null; Created_Time: string | null;
  Specialty: string | null; Specialty_New: string | null;
  Has_DHA: unknown; Has_DOH: unknown; Has_MOH: unknown; License: string | null;
}
interface ZohoDobLite {
  id: string; Full_Name: string | null; Created_Time: string | null;
  Specialty: string | null;
}

function rec(r: FlowRun, result: TickAction["result"], detail: string): TickAction {
  return {
    run_id: r.id,
    doctor: r.doctor_name,
    flow:   r.flow_key,
    stage:  r.current_stage,
    reason: detail,
    result,
    detail,
  };
}

async function invokeSendFlow(runId: string, force = false): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-flow-email`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ run_id: runId, force }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

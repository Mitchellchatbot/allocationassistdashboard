/**
 * tick-sends — Supabase Edge Function (Amir #5)
 *
 * A DEDICATED, lightweight cron for scheduled email sends, split out from the
 * heavy tick-scheduler (which runs many sweeps and can hit the worker resource
 * limit). This one only does two fast things:
 *   1. Fire scheduled batch sends due now (honouring the per-row Gulf-time
 *      `scheduled_at_time`; legacy date-only rows keep the old per-kind windows).
 *   2. Fire scheduled Send-Profile campaigns (scheduled_profile_sends), replaying
 *      exactly what SendProfileDialog.handleConfirm builds.
 *
 * Idempotent: send-batch refuses an already-sent batch; profile rows are claimed
 * atomically (draft → scheduled) so overlapping ticks can't double-send. With
 * MAIL_TEST_RECIPIENT_OVERRIDE set, every send is redirected to the test inbox.
 *
 * Deployed with --no-verify-jwt so pg_cron (pg_net) can hit it. Scheduled by
 * migration 20260629000000_tick_sends_cron.sql every 5 minutes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface TickAction { id: string; kind: string; result: "sent" | "error" | "skipped"; detail?: string }

// ── Gulf-time helpers (GST = fixed UTC+4, no DST) ────────────────────────────
interface GulfNow { today: string; mins: number; dow: number }
function gulfParts(now: Date): GulfNow {
  const g = new Date(now.getTime() + 4 * 3600 * 1000);
  return { today: g.toISOString().slice(0, 10), mins: g.getUTCHours() * 60 + g.getUTCMinutes(), dow: g.getUTCDay() };
}
function hhmmToMins(t: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  return m ? (+m[1]) * 60 + (+m[2]) : 0;
}
/** Due on its own day once the time passes (a later same-day tick catches up).
 *  Cross-day-overdue rows are NOT retroactively fired. */
function dueAt(scheduledFor: string, time: string | null, g: GulfNow): boolean {
  return scheduledFor === g.today && g.mins >= hhmmToMins(time ?? "09:00");
}
function nextWorkingDay(fromStr: string, weekdays: number[]): string {
  const set = new Set(weekdays.length ? weekdays : [1, 2, 3, 4, 5]);
  const base = new Date(fromStr + "T00:00:00Z").getTime();
  for (let i = 1; i <= 14; i++) {
    const nd = new Date(base + i * 86_400_000);
    if (set.has(nd.getUTCDay())) return nd.toISOString().slice(0, 10);
  }
  return new Date(base + 86_400_000).toISOString().slice(0, 10);
}

async function invokeSendFlow(runId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-flow-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ run_id: runId }),
    });
    const body = await res.text();
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 160)}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

type DB = ReturnType<typeof createClient>;

interface BatchRow {
  id: string; kind: string; doctor_ids: string[]; scheduled_for: string;
  scheduled_at_time: string | null; country: string | null; specialty: string | null;
  recurrence: { freq?: string; weekdays?: number[]; until?: string | null } | null;
}

async function runBatchSendSweep(supabase: DB, g: GulfNow): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const { data, error } = await supabase
      .from("scheduled_batch_sends")
      .select("id, kind, doctor_ids, scheduled_for, scheduled_at_time, country, specialty, recurrence")
      .eq("status", "draft")
      .eq("scheduled_for", g.today);
    if (error) throw error;
    for (const b of (data ?? []) as BatchRow[]) {
      const due = b.scheduled_at_time
        ? dueAt(b.scheduled_for, b.scheduled_at_time, g)
        : (b.kind === "daily_duo"      && g.dow >= 1 && g.dow <= 5 && g.mins >= 630) ||
          (b.kind === "tuesday_top_15" && g.dow === 2 && g.mins >= 660 && g.mins <= 960) ||
          (b.kind === "specialty_of_day" && g.dow >= 3 && g.dow <= 5);
      if (!due) continue;
      if (!b.doctor_ids || b.doctor_ids.length === 0) { acts.push({ id: b.id, kind: "batch", result: "skipped", detail: "no doctors queued" }); continue; }
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ batch_id: b.id }),
        });
        const txt = await r.text();
        if (r.ok) { acts.push({ id: b.id, kind: "batch", result: "sent", detail: txt.slice(0, 120) }); await maybeRecurBatch(supabase, b); }
        else      { acts.push({ id: b.id, kind: "batch", result: "error", detail: `HTTP ${r.status}: ${txt.slice(0, 120)}` }); }
      } catch (e) { acts.push({ id: b.id, kind: "batch", result: "error", detail: String(e) }); }
    }
  } catch (e) { console.error("[tick-sends] batch sweep failed:", e); }
  return acts;
}

/** Weekly recurrence → seed the next working day's draft (empty queue). */
async function maybeRecurBatch(supabase: DB, b: BatchRow): Promise<void> {
  const rec = b.recurrence;
  if (!rec || rec.freq !== "weekly") return;
  const next = nextWorkingDay(b.scheduled_for, rec.weekdays ?? [1, 2, 3, 4, 5]);
  if (rec.until && next > rec.until) return;
  try {
    await supabase.from("scheduled_batch_sends").insert({
      kind: b.kind, scheduled_for: next, scheduled_at_time: b.scheduled_at_time,
      timezone: "Asia/Dubai", recurrence: rec, specialty: b.specialty, country: b.country,
      doctor_ids: [], status: "draft", created_by: "tick-sends",
    });
  } catch (e) { console.warn("[tick-sends] recur seed failed:", e); }
}

interface ProfileSendRow {
  id: string; doctor_id: string; doctor_name: string; doctor_email: string | null;
  doctor_phone: string | null; doctor_speciality: string | null; hospital_ids: string[];
  custom_message: string | null; bcc_override: string[] | null; cc_override: string[] | null;
  stage_overrides: Record<string, unknown> | null; template_overrides: Record<string, string> | null;
  attachments: unknown; scheduled_for: string; scheduled_at_time: string | null; created_by: string | null;
}

/** Fire due scheduled Send-Profile campaigns. Mirrors SendProfileDialog.handleConfirm. */
async function runScheduledProfileSweep(supabase: DB, now: Date, g: GulfNow): Promise<TickAction[]> {
  const acts: TickAction[] = [];
  try {
    const { data: rows, error } = await supabase
      .from("scheduled_profile_sends").select("*")
      .eq("status", "draft").eq("scheduled_for", g.today);
    if (error) throw error;
    for (const s of (rows ?? []) as ProfileSendRow[]) {
      if (!dueAt(s.scheduled_for, s.scheduled_at_time, g)) continue;
      const { data: claimed } = await supabase
        .from("scheduled_profile_sends")
        .update({ status: "scheduled", updated_at: now.toISOString() })
        .eq("id", s.id).eq("status", "draft").select("id");
      if (!claimed || claimed.length === 0) continue;

      const ids = s.hospital_ids ?? [];
      const { data: hospitals } = await supabase
        .from("hospitals").select("id, name, primary_recruiter_email").in("id", ids.length ? ids : ["__none__"]);
      const hmap = new Map((hospitals ?? []).map((h: { id: string }) => [h.id, h]));
      const batchId = crypto.randomUUID();
      let sent = 0, failed = 0, lastErr = "";

      for (const hid of ids) {
        const h = hmap.get(hid) as { id: string; name: string; primary_recruiter_email: string | null } | undefined;
        if (!h) { failed++; lastErr = "hospital not found"; continue; }
        const { data: runRow, error: runErr } = await supabase.from("automation_flow_runs").insert({
          flow_key: "profile_sent", doctor_id: s.doctor_id, doctor_name: s.doctor_name,
          doctor_email: s.doctor_email, doctor_phone: s.doctor_phone, hospital: h.name,
          current_stage: "email_hospital", status: "active", created_by: s.created_by,
          metadata: {
            batch_id: batchId, hospital_id: h.id, hospital_email: h.primary_recruiter_email,
            bcc: ids.length > 1, total_in_batch: ids.length,
            custom_message: s.custom_message ?? null, doctor_speciality: s.doctor_speciality ?? null,
            triggered_via: "scheduled_profile_send",
            ...(s.bcc_override ? { bcc_override: s.bcc_override } : {}),
            ...(s.cc_override ? { cc_override: s.cc_override } : {}),
            ...(s.stage_overrides ? { stage_overrides: s.stage_overrides } : {}),
            ...(s.template_overrides ? { template_overrides: s.template_overrides } : {}),
            ...(Array.isArray(s.attachments) && s.attachments.length ? { attachments: s.attachments } : {}),
          },
        }).select("id").single();
        if (runErr || !runRow) { failed++; lastErr = runErr?.message ?? "run insert failed"; continue; }
        const res = await invokeSendFlow((runRow as { id: string }).id);
        if (res.ok) sent++; else { failed++; lastErr = res.detail ?? "send failed"; }
      }

      await supabase.from("scheduled_profile_sends").update({
        status: sent > 0 ? "sent" : "failed",
        sent_at: now.toISOString(),
        error: failed > 0 ? lastErr.slice(0, 300) : null,
        updated_at: now.toISOString(),
      }).eq("id", s.id);
      acts.push({ id: s.id, kind: "profile_send", result: sent > 0 ? "sent" : "error", detail: `${sent} sent, ${failed} failed` });
    }
  } catch (e) { console.error("[tick-sends] profile sweep failed:", e); }
  return acts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const g = gulfParts(now);
  const batch   = await runBatchSendSweep(supabase, g);
  const profile = await runScheduledProfileSweep(supabase, now, g);
  const actions = [...batch, ...profile];
  console.log(`[tick-sends] ${g.today} ${g.mins}min GST — ${actions.length} action(s)`);
  return new Response(JSON.stringify({ ok: true, at: now.toISOString(), actions }), {
    status: 200, headers: { ...CORS, "Content-Type": "application/json" },
  });
});

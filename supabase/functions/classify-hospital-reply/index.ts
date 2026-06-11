/**
 * classify-hospital-reply — Supabase Edge Function
 *
 * Takes a hospital recruiter's reply (pasted by the team for now, eventually
 * delivered via Resend Inbound or Gmail webhook) and runs it through Claude
 * to figure out whether the doctor is shortlisted, declined, asked-for-more-info,
 * or something unclear. Then advances the Profile Sent flow accordingly:
 *
 *   shortlisted   → Profile Sent run completed, NEW Shortlist run created,
 *                   Shortlist Confirmation email auto-fires to the doctor
 *   declined      → Profile Sent run completed (no follow-on)
 *   needs_more_info → Note appended, run stays at awaiting_response,
 *                     team should respond manually
 *   unclear / wrong_doctor → Note appended for the team to review
 *
 * Request:
 *   { run_id: string, reply_text: string,
 *     reply_subject?: string, reply_from?: string,
 *     source?: 'manual_paste' | 'resend_inbound' | 'gmail' }
 *
 * Response:
 *   { ok: true,  classification, confidence, summary, action_taken, reply_id }
 *   { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notify } from "../_shared/notify.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

console.log("[classify-hospital-reply] booted. Has key:", !!ANTHROPIC_API_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProposedTime {
  iso:    string;   // 2026-07-02T14:00:00+04:00
  label:  string;   // "Wed 2 July at 14:00 UAE"
  format: "in_person" | "video" | "phone" | "unknown";
}

interface ClassificationResult {
  classification: "shortlisted" | "proposing_interview" | "declined" | "needs_more_info" | "unclear" | "wrong_doctor";
  confidence:     number;
  summary:        string;
  asked_for:      string | null;
  proposed_times: ProposedTime[] | null;
  next_steps:     string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY)        return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { run_id?: string; reply_text?: string; reply_subject?: string; reply_from?: string; source?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const { run_id, reply_text, reply_subject, reply_from, source = "manual_paste" } = body;
  if (!run_id)               return json({ ok: false, error: "run_id required" }, 400);
  if (!reply_text?.trim())   return json({ ok: false, error: "reply_text required" }, 400);

  // Load the run
  const { data: run, error: runErr } = await supabase
    .from("automation_flow_runs")
    .select("*")
    .eq("id", run_id)
    .single();
  if (runErr || !run) return json({ ok: false, error: "Run not found", detail: runErr?.message }, 404);
  if (run.flow_key !== "profile_sent") {
    return json({ ok: false, error: `Reply classification only supports profile_sent runs (this is ${run.flow_key})` }, 400);
  }

  // ── Build prompt + call Claude ──────────────────────────────────────────
  const doctorSpecialty = (run.metadata as Record<string, unknown>)?.doctor_speciality as string | undefined;
  const prompt = `You are classifying a hospital recruiter's reply to an introduction email we sent about a doctor.

Context:
- We introduced Dr. ${run.doctor_name}${doctorSpecialty ? ` (${doctorSpecialty})` : ""} to ${run.hospital ?? "[hospital]"}.
- The hospital's recruiter has now replied.${reply_subject ? `\n- Their reply subject: "${reply_subject}"` : ""}${reply_from ? `\n- Reply from: ${reply_from}` : ""}

Their reply (may include quoted text from the original email — focus on the NEW content at the top):
"""
${reply_text.slice(0, 6000)}
"""

Classify their response. Return a JSON object with these exact keys:

{
  "classification": one of:
    - "shortlisted": hospital wants to proceed with this specific doctor (asking for interview, "we'd like to see them", "yes please send more about Dr. X", "let's set up a meeting", etc.)
    - "proposing_interview": hospital is offering one or more specific date/time slots for the interview (e.g. "Can the doctor do Tuesday 3pm or Thursday 11am?", "I'm available next Monday at 10am UAE time", "Let's book Wed 2 July at 14:00"). Use this whenever the reply contains concrete time(s) — even if it also functions as a shortlist. The team will pick a slot, confirm with the doctor, then trigger the Interview flow.
    - "declined": hospital is not interested in this doctor ("thanks but not at this time", "doesn't fit our needs", "no open positions", "we'll keep on file")
    - "needs_more_info": hospital wants additional information before deciding (more about the CV, references, specific clinical experience questions, salary expectations, availability)
    - "unclear": you cannot confidently classify — autoresponder, out-of-office, off-topic, conversation about something else entirely
    - "wrong_doctor": the reply explicitly mentions or asks about a DIFFERENT doctor than ${run.doctor_name}
  "confidence": float 0.0-1.0 reflecting how sure you are
  "summary": one-sentence plain-English summary of what the hospital said
  "asked_for": if needs_more_info, a short string of what specifically they asked for; otherwise null
  "proposed_times": if proposing_interview, an array of objects:
    [{ "iso": ISO-8601 timestamp WITH timezone offset (assume UAE/+04:00 if none specified), "label": human-readable string from the reply like "Tuesday 3pm UAE", "format": "in_person" | "video" | "phone" | "unknown" }, ...]
    Otherwise null. Resolve relative dates ("next Tuesday", "tomorrow") against TODAY = ${new Date().toISOString().slice(0, 10)}.
  "next_steps": one sentence advising what the AA Hospital Intro team should do next
}

Output ONLY the JSON object. No markdown fences, no commentary, no preamble.`;

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return json({ ok: false, error: "Network error reaching Claude", detail: String(e) }, 502);
  }

  const claudeText = await claudeRes.text();
  if (!claudeRes.ok) {
    return json({ ok: false, error: `Claude HTTP ${claudeRes.status}`, detail: claudeText.slice(0, 400) }, claudeRes.status);
  }

  let parsedResult: ClassificationResult;
  let rawResponse: unknown;
  try {
    rawResponse = JSON.parse(claudeText);
    const textBlock = (rawResponse as { content?: { type: string; text?: string }[] }).content?.find(c => c.type === "text");
    if (!textBlock?.text) throw new Error("Claude response had no text content");
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsedResult = JSON.parse(cleaned) as ClassificationResult;
  } catch (e) {
    return json({ ok: false, error: `Could not parse Claude response: ${String(e)}`, raw: claudeText.slice(0, 400) }, 500);
  }

  console.log("[classify-hospital-reply] result:", parsedResult.classification, "confidence:", parsedResult.confidence);

  // ── Log the reply + classification ──────────────────────────────────────
  const { data: replyRow } = await supabase.from("hospital_replies").insert({
    run_id,
    doctor_id:       run.doctor_id,
    doctor_name:     run.doctor_name,
    hospital_name:   run.hospital,
    reply_from:      reply_from ?? null,
    reply_subject:   reply_subject ?? null,
    reply_text,
    classification:  parsedResult.classification,
    confidence:      parsedResult.confidence,
    ai_summary:      parsedResult.summary,
    ai_raw_response: rawResponse as Record<string, unknown>,
    source,
  }).select("id").single();

  // ── Take action based on classification ─────────────────────────────────
  let action_taken = "none";
  const nowIso = new Date().toISOString();

  if (parsedResult.classification === "shortlisted") {
    // SUGGESTION ONLY — do NOT auto-advance (Ammar 2026-06-03). Hospitals
    // rarely write "shortlisted" explicitly; most confirmations happen by
    // phone, and even text replies are ambiguous ("send salary expectations"
    // etc.). Store the suggestion on the run + write a notification so the
    // HI team can manually confirm the shortlist via the Trigger Shortlist
    // button. The Shortlist run + email only fire when the team clicks.
    const existingMd = (run.metadata as Record<string, unknown>) ?? {};
    await supabase.from("automation_flow_runs").update({
      last_event_at: nowIso,
      metadata: {
        ...existingMd,
        shortlist_suggested:       true,
        shortlist_suggested_at:    nowIso,
        shortlist_suggested_by:    "hospital_reply_classifier",
        shortlist_suggestion_text: parsedResult.summary,
        shortlist_reply_id:        replyRow?.id ?? null,
      },
    }).eq("id", run_id);

    await supabase.from("automation_flow_events").insert({
      run_id, stage_key: "awaiting_response", event_type: "note",
      message: `${run.hospital ?? "Hospital"} looks interested (confidence ${parsedResult.confidence.toFixed(2)}): ${parsedResult.summary}. Suggestion: mark as shortlisted manually if confirmed.`,
    });

    // Notification so the suggestion shows up in the HI team's bell + on
    // PendingActionsCard. for_user null = team-wide (the run's assignee
    // also has a chance to see this via their workspace).
    await notify({
      kind:           "shortlist_suggested",
      title:          `${run.hospital ?? "Hospital"} may have shortlisted ${run.doctor_name ?? "the doctor"}`,
      body:           parsedResult.summary,
      link_path:      `/automations?flow=profile_sent&run=${run_id}`,
      related_run_id: run_id,
      related_doctor_id: run.doctor_id,
      // Best signal we have for who's on the hook — the run's
      // assignee. Slack DM-equivalent (@-mention) routes to them.
      for_user:       (run as { assigned_to?: string | null }).assigned_to ?? null,
    });

    action_taken = `Shortlist suggestion stored on run; awaiting manual confirmation by HI team`;
  } else if (parsedResult.classification === "proposing_interview") {
    // Hospital is offering specific time(s). Store on the run's metadata
    // so the RunDetailSheet can render a "pick a time + confirm with the
    // doctor" UI. We DON'T auto-create the interview run yet — the team
    // needs to bounce the slot off the doctor first.
    const times = parsedResult.proposed_times ?? [];
    const existingMd = (run.metadata as Record<string, unknown>) ?? {};
    await supabase.from("automation_flow_runs").update({
      last_event_at: nowIso,
      metadata: {
        ...existingMd,
        proposed_interview_times: times,
        proposed_times_source:    "hospital_reply_classifier",
        proposed_times_reply_id:  replyRow?.id ?? null,
        proposed_times_at:        nowIso,
      },
    }).eq("id", run_id);

    await supabase.from("automation_flow_events").insert({
      run_id, stage_key: "awaiting_response", event_type: "note",
      message: `${run.hospital ?? "Hospital"} proposed ${times.length} interview time${times.length === 1 ? "" : "s"} (confidence ${parsedResult.confidence.toFixed(2)}): ${times.map(t => t.label).join(" · ") || "(could not parse specific times)"}. ${parsedResult.summary}`,
    });

    // Same Slack + bell ping as the shortlist case — a hospital offering
    // interview times is just as strong a "they want to go forward" signal,
    // and it's time-sensitive (the team has to pick a slot and confirm with
    // the doctor before the offered times pass).
    await notify({
      kind:              "interview_proposed",
      title:             `${run.hospital ?? "Hospital"} proposed interview times for ${run.doctor_name ?? "the doctor"}`,
      body:              `${times.length} slot${times.length === 1 ? "" : "s"}: ${times.map(t => t.label).join(" · ") || "(times unclear — open the reply)"}. ${parsedResult.summary} Pick a slot and confirm with the doctor.`,
      link_path:         `/automations?flow=profile_sent&run=${run_id}`,
      related_run_id:    run_id,
      related_doctor_id: run.doctor_id,
      for_user:          (run as { assigned_to?: string | null }).assigned_to ?? null,
    });

    action_taken = `Stored ${times.length} proposed interview times on run metadata; team notified`;
  } else if (parsedResult.classification === "declined") {
    await supabase.from("automation_flow_runs").update({
      current_stage: "introduction_complete",
      status:        "completed",
      completed_at:  nowIso,
      last_event_at: nowIso,
    }).eq("id", run_id);
    await supabase.from("automation_flow_events").insert({
      run_id, stage_key: "awaiting_response", event_type: "note",
      message: `${run.hospital ?? "Hospital"} declined (confidence ${parsedResult.confidence.toFixed(2)}): ${parsedResult.summary}`,
    });
    // The team wants to hear about every hospital reply — including a pass —
    // so the channel gets a heads-up (slack:true on the kind) and the run is
    // closed; consider re-sourcing the candidate elsewhere.
    await notify({
      kind:              "hospital_declined",
      title:             `${run.hospital ?? "Hospital"} passed on ${run.doctor_name ?? "the doctor"}`,
      body:              `${parsedResult.summary} (confidence ${parsedResult.confidence.toFixed(2)}). Profile Sent run closed.`,
      link_path:         `/automations?flow=profile_sent&run=${run_id}`,
      related_run_id:    run_id,
      related_doctor_id: run.doctor_id,
      for_user:          (run as { assigned_to?: string | null }).assigned_to ?? null,
    });
    action_taken = "Profile Sent marked completed (declined); team notified";
  } else if (parsedResult.classification === "needs_more_info") {
    await supabase.from("automation_flow_events").insert({
      run_id, stage_key: "awaiting_response", event_type: "note",
      message: `${run.hospital ?? "Hospital"} asked for more info (confidence ${parsedResult.confidence.toFixed(2)}): ${parsedResult.summary}${parsedResult.asked_for ? ` — they want: ${parsedResult.asked_for}` : ""}. Suggested: ${parsedResult.next_steps}`,
    });
    action_taken = "Note added; run stays at awaiting_response";
  } else {
    // unclear / wrong_doctor — leave the run untouched, just record the note
    await supabase.from("automation_flow_events").insert({
      run_id, stage_key: "awaiting_response", event_type: "note",
      message: `Reply received but classification was "${parsedResult.classification}" (confidence ${parsedResult.confidence.toFixed(2)}): ${parsedResult.summary}. Suggested: ${parsedResult.next_steps}`,
    });
    action_taken = `Note added (${parsedResult.classification}); run untouched`;
  }

  // Update hospital_replies with the action taken
  if (replyRow?.id) {
    await supabase.from("hospital_replies").update({ action_taken }).eq("id", replyRow.id);
  }

  return json({
    ok:             true,
    classification: parsedResult.classification,
    confidence:     parsedResult.confidence,
    summary:        parsedResult.summary,
    asked_for:      parsedResult.asked_for,
    next_steps:     parsedResult.next_steps,
    action_taken,
    reply_id:       replyRow?.id,
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

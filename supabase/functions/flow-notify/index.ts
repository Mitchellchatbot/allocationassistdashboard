/**
 * flow-notify — fire a Slack + dashboard notification for a manual flow
 * milestone that the frontend completes directly in the DB (no webhook in the
 * loop, so notify() never runs server-side otherwise).
 *
 * Today that's exactly one thing: the "Mark signed" action in the Contract
 * Check-in panel. The contract here is the DOCTOR ↔ HOSPITAL offer letter —
 * nothing to do with BoldSign or any AllocationAssist service agreement. HI
 * confirms the hospital's offer was signed, and the team wants the same Slack
 * ping the pipeline fires for shortlists and interviews.
 *
 * The browser can't call notify() directly — it's a server-side helper that
 * holds the Slack webhook URL + service-role key — so this thin endpoint does.
 * The surface is deliberately narrow (a fixed allow-list of events) so it
 * can't be used to spray arbitrary Slack messages.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notify } from "../_shared/notify.ts";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { run_id, event } = await req.json().catch(() => ({}));
    if (!run_id) return json({ ok: false, error: "run_id required" }, 400);
    // One supported event for now. Keep this explicit so the endpoint can't be
    // repurposed to fire any notification kind.
    if (event && event !== "contract_signed") {
      return json({ ok: false, error: `unsupported event: ${event}` }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: run, error } = await sb
      .from("automation_flow_runs")
      .select("id, doctor_name, doctor_id, hospital, assigned_to")
      .eq("id", run_id)
      .maybeSingle();
    if (error)  return json({ ok: false, error: error.message }, 500);
    if (!run)   return json({ ok: false, error: "run not found" }, 404);

    const who      = run.doctor_name ?? "The doctor";
    const hospital = run.hospital ?? "the hospital";

    const res = await notify({
      kind:    "contract_signed",
      title:   `${who} signed the offer from ${hospital}`,
      body:    `The hospital offer is signed — relocation can start. Log the joining date in Reports → Placements so the 45-day payment clock arms.`,
      link_path:         `/reports`,
      related_run_id:    run.id,
      related_doctor_id: run.doctor_id ?? null,
      for_user:          run.assigned_to ?? null,
    });

    return json({
      ok:                true,
      slack_sent:        res.slack_sent,
      slack_skip_reason: res.slack_skip_reason ?? null,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

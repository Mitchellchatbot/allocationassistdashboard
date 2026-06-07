/**
 * Throwaway diagnostic — service-role read of recent form_responses
 * and notifications. Useful for "I just submitted a form but nothing
 * showed up" troubleshooting where RLS hides the data from the anon
 * key.
 *
 * Delete after the issue is resolved; this bypasses RLS by design.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  // One-off cleanup helper: POST { delete_form_responses: ['Test Test', 'Anonymous submission'] }
  // deletes any form_responses whose respondent_name matches.
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => null) as { delete_form_response_names?: string[] } | null;
      if (body?.delete_form_response_names && Array.isArray(body.delete_form_response_names)) {
        const names = body.delete_form_response_names;
        const { error, count } = await sb.from("form_responses").delete({ count: "exact" }).in("respondent_name", names);
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, deleted: count, by_name: names }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { archive_test_probes?: boolean } | null)?.archive_test_probes) {
        // Soft-archive only the SYNTHETIC probe rows from this debug
        // session. ONLY example.com emails — avoids ever touching a
        // real doctor like Yahia (whose email I reused in a probe).
        const probeEmails = [
          "staging-test@example.com", "qa-test@example.com",
          "multipart-probe@example.com", "qa-h@example.com",
          "slack-probe-jotform@example.com", "probe@example.com",
          "slack-probe@example.com", "e2e-probe@example.com",
          "bisected@example.com",
        ];
        const { data, error } = await sb
          .from("form_responses")
          .update({ archived_at: new Date().toISOString() })
          .in("respondent_email", probeEmails)
          .is("archived_at", null)
          .select("id, respondent_name, respondent_email");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, archived: data?.length ?? 0, rows: data }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { list_probes?: boolean } | null)?.list_probes) {
        const probeEmails = [
          "staging-test@example.com", "qa-test@example.com",
          "multipart-probe@example.com", "qa-h@example.com",
          "slack-probe-jotform@example.com", "probe@example.com",
          "slack-probe@example.com", "e2e-probe@example.com",
          "bisected@example.com",
        ];
        const { data } = await sb
          .from("form_responses")
          .select("id, respondent_name, respondent_email, archived_at")
          .in("respondent_email", probeEmails);
        return new Response(JSON.stringify({ ok: true, probes: data ?? [] }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { archive_by_id?: string[] } | null)?.archive_by_id) {
        const ids = (body as { archive_by_id?: string[] }).archive_by_id ?? [];
        const { data, error } = await sb
          .from("form_responses")
          .update({ archived_at: new Date().toISOString() })
          .in("id", ids)
          .select("id, respondent_name");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, archived: data?.length ?? 0, rows: data }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { restore_yahia?: boolean } | null)?.restore_yahia) {
        // Un-archive Yahia Dakhel — accidentally caught in the probe
        // sweep because I'd used his email in a debug probe.
        const { data, error } = await sb
          .from("form_responses")
          .update({ archived_at: null })
          .eq("respondent_email", "dryahiadakhel@gmail.com")
          .select("id, respondent_name");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, restored: data?.length ?? 0, rows: data }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { delete_garbage_multipart?: boolean } | null)?.delete_garbage_multipart) {
        // Drop the corrupt multipart-boundary rows (RZR1KPQNDH5Fm…).
        const { error, count } = await sb
          .from("form_responses")
          .delete({ count: "exact" })
          .ilike("search_text", "%RZR1KPQNDH5Fm%");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, deleted: count, kind: "garbage_multipart" }), { headers: { "Content-Type": "application/json" } });
      }
    } catch { /* fall through to GET-style diag */ }
  }

  const [{ data: forms }, { data: responses }, { data: notifs }, { data: amani }, { data: latest }, { data: florRows }, { data: archivedRows }] = await Promise.all([
    sb.from("forms").select("id, name, provider, provider_form_id, webhook_secret, active, response_count").order("created_at", { ascending: false }),
    sb.from("form_responses").select("id, form_id, respondent_email, respondent_name, submitted_at, created_at, search_text, outreach_status").order("created_at", { ascending: false, nullsFirst: false }).limit(8),
    sb.from("notifications").select("id, kind, severity, title, slack_delivered_at, slack_skip_reason, created_at").order("created_at", { ascending: false }).limit(10),
    sb.from("form_responses").select("id, form_id, respondent_email, respondent_name, submitted_at, created_at, outreach_status").ilike("respondent_email", "%dr_amani.almalti%"),
    sb.from("form_responses").select("id, respondent_email, respondent_name, answers").order("created_at", { ascending: false }).limit(1),
    sb.from("form_responses").select("respondent_name, archived_at").not("archived_at", "is", null).order("archived_at", { ascending: false }).limit(15),
    sb.from("wordpress_candidates").select("id, full_name, email, status, last_synced_at").ilike("full_name", "%flor%"),
  ]);
  return new Response(JSON.stringify({
    SLACK_WEBHOOK_URL_set: !!Deno.env.get("SLACK_WEBHOOK_URL"),
    APP_ORIGIN:            Deno.env.get("APP_ORIGIN") ?? null,
    forms_count:           forms?.length ?? 0,
    forms:                 (forms ?? []).map(f => ({
      id: f.id, name: f.name, provider: f.provider, active: f.active, response_count: f.response_count,
      webhook_url: f.webhook_secret ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/${f.provider}-webhook?key=${f.webhook_secret}` : null,
    })),
    recent_responses: responses ?? [],
    recent_notifications: notifs ?? [],
    amani_rows: amani ?? [],
    latest_answers: latest ?? [],
    flor:           florRows ?? [],
    archived:       archivedRows ?? [],
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});

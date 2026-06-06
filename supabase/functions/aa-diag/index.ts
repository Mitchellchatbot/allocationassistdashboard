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

  const [{ data: forms }, { data: responses }, { data: notifs }, { data: amani }, { data: latest }, { data: florRows }] = await Promise.all([
    sb.from("forms").select("id, name, provider, provider_form_id, webhook_secret, active, response_count").order("created_at", { ascending: false }),
    sb.from("form_responses").select("id, form_id, respondent_email, respondent_name, submitted_at, created_at, search_text, outreach_status").order("created_at", { ascending: false, nullsFirst: false }).limit(8),
    sb.from("notifications").select("id, kind, severity, title, slack_delivered_at, slack_skip_reason, created_at").order("created_at", { ascending: false }).limit(10),
    sb.from("form_responses").select("id, form_id, respondent_email, respondent_name, submitted_at, created_at, outreach_status").ilike("respondent_email", "%dr_amani.almalti%"),
    sb.from("form_responses").select("id, respondent_email, respondent_name, answers").order("created_at", { ascending: false }).limit(1),
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
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});

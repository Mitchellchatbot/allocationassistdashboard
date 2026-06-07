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
      if ((body as { rerun_cv_extract_for_staged?: boolean } | null)?.rerun_cv_extract_for_staged) {
        // For each currently-staged row with an extracted_cv_data
        // already populated, re-fire cv-extract (with the existing
        // upload_id) so the new merge path lands the CV fields onto
        // staged.acf + flat columns. Useful right after deploying
        // the enrich expansion — backfills the staging area without
        // a user resubmitting their form.
        const { data: stagedRows } = await sb
          .from("staged_doctor_profiles")
          .select("id, cv_upload_id, extracted_cv_data, full_name");
        const out: unknown[] = [];
        for (const s of (stagedRows ?? []) as Array<{ id: string; cv_upload_id: string | null; extracted_cv_data: unknown; full_name: string | null }>) {
          if (!s.cv_upload_id) { out.push({ id: s.id, name: s.full_name, skipped: "no cv_upload_id" }); continue; }
          const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cv-extract`, {
            method:  "POST",
            headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ upload_id: s.cv_upload_id }),
          });
          out.push({ id: s.id, name: s.full_name, status: r.status });
        }
        return new Response(JSON.stringify({ ok: true, rerun: out }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { find_doctor?: string } | null)?.find_doctor) {
        const q = (body as { find_doctor: string }).find_doctor;
        const [wp, staged, forms] = await Promise.all([
          sb.from("wordpress_candidates").select("id, full_name, email, status").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`),
          sb.from("staged_doctor_profiles").select("id, full_name, email").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`),
          sb.from("form_responses").select("id, respondent_name, respondent_email, archived_at, submitted_at").or(`respondent_name.ilike.%${q}%,respondent_email.ilike.%${q}%`),
        ]);
        return new Response(JSON.stringify({ ok: true, wp: wp.data ?? [], staged: staged.data ?? [], forms: forms.data ?? [] }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { delete_wp_candidate?: number } | null)?.delete_wp_candidate) {
        const id = (body as { delete_wp_candidate: number }).delete_wp_candidate;
        // Reuse the dashboard's regular delete pathway — it deletes
        // from WP via REST AND drops the mirror row.
        const wpDel = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wordpress-candidate-delete`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ id }),
        });
        const txt = await wpDel.text();
        return new Response(JSON.stringify({ ok: wpDel.ok, status: wpDel.status, body: txt.slice(0, 400) }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { delete_staged?: string } | null)?.delete_staged) {
        const id = (body as { delete_staged: string }).delete_staged;
        const { error } = await sb.from("staged_doctor_profiles").delete().eq("id", id);
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { test_jotform?: boolean } | null)?.test_jotform) {
        // Hit JotForm's /user endpoint with the stored api_token to
        // confirm the key still works. Used after password / API-key
        // rotation in JotForm: if /user comes back 401, the team
        // generated a new key and we need a new one in forms.api_token.
        const { data: forms } = await sb
          .from("forms")
          .select("id, name, provider_form_id, api_token")
          .eq("provider", "jotform")
          .limit(5);
        const out: unknown[] = [];
        for (const f of (forms ?? []) as Array<{ id: string; name: string; provider_form_id: string | null; api_token: string | null }>) {
          if (!f.api_token) { out.push({ name: f.name, token: "MISSING" }); continue; }
          // /user is the cheapest auth check.
          const uRes = await fetch(`https://api.jotform.com/user?apiKey=${encodeURIComponent(f.api_token)}`);
          const uTxt = await uRes.text();
          // Then probe the form itself + a recent submissions request — the
          // historical-sync path uses /form/{id}/submissions.
          const sRes = await fetch(`https://api.jotform.com/form/${f.provider_form_id}/submissions?limit=1&apiKey=${encodeURIComponent(f.api_token)}`);
          const sTxt = await sRes.text();
          out.push({
            name: f.name,
            form_id: f.provider_form_id,
            token_preview: `${f.api_token.slice(0, 4)}…${f.api_token.slice(-4)} (${f.api_token.length} chars)`,
            user_status: uRes.status,
            user_excerpt: uTxt.slice(0, 200),
            submissions_status: sRes.status,
            submissions_excerpt: sTxt.slice(0, 200),
          });
        }
        return new Response(JSON.stringify({ ok: true, jotform_probe: out }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { set_jotform_token?: { form_id: string; api_token: string } } | null)?.set_jotform_token) {
        // Rotate the JotForm api_token on a specific forms row in-place.
        const { form_id, api_token } = (body as { set_jotform_token: { form_id: string; api_token: string } }).set_jotform_token;
        if (!form_id || !api_token) return new Response(JSON.stringify({ ok: false, error: "form_id + api_token required" }), { headers: { "Content-Type": "application/json" } });
        const { data, error } = await sb
          .from("forms")
          .update({ api_token })
          .eq("id", form_id)
          .select("id, name");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, updated: data }), { headers: { "Content-Type": "application/json" } });
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

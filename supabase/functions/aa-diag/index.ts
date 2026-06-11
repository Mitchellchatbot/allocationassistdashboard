/**
 * Throwaway diagnostic — service-role read of recent form_responses
 * and notifications. Useful for "I just submitted a form but nothing
 * showed up" troubleshooting where RLS hides the data from the anon
 * key.
 *
 * Delete after the issue is resolved; this bypasses RLS by design.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enrichProfile } from "../_shared/enrich-profile.ts";

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
      if ((body as { inspect_response?: string } | null)?.inspect_response) {
        const id = (body as { inspect_response: string }).inspect_response;
        const { data } = await sb.from("form_responses").select("id, respondent_name, respondent_email, answers, raw_payload, search_text, form_id, submitted_at").eq("id", id).single();
        return new Response(JSON.stringify({ ok: true, response: data }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { list_templates?: boolean } | null)?.list_templates) {
        const { data } = await sb.from("email_templates").select("key, subject, body_html");
        return new Response(JSON.stringify({ ok: true, templates: data ?? [] }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { inspect_run?: string } | null)?.inspect_run) {
        const id = (body as { inspect_run: string }).inspect_run;
        const { data } = await sb.from("automation_flow_runs").select("*").eq("id", id).single();
        return new Response(JSON.stringify({ ok: true, run: data }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { upload_email_asset?: { path: string; base64: string; mime?: string } } | null)?.upload_email_asset) {
        const { path, base64, mime } = (body as { upload_email_asset: { path: string; base64: string; mime?: string } }).upload_email_asset;
        // Decode base64 → bytes. The bucket policy allows service-role inserts only.
        const bin = atob(base64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const { error } = await sb.storage.from("email-assets").upload(path, arr, {
          contentType: mime ?? "image/png",
          upsert: true,
        });
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/email-assets/${path}`;
        return new Response(JSON.stringify({ ok: true, public_url: publicUrl }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { make_test_run?: { staged_id: string; flow_key?: string; current_stage?: string } } | null)?.make_test_run) {
        // Create a throwaway profile_sent run pointing at a staged row.
        // Used to dry-run-render the email template against a real
        // staged profile without touching the real flow tables.
        const { staged_id, flow_key, current_stage } = (body as { make_test_run: { staged_id: string; flow_key?: string; current_stage?: string } }).make_test_run;
        const { data: s } = await sb.from("staged_doctor_profiles").select("*").eq("id", staged_id).single();
        if (!s) return new Response(JSON.stringify({ ok: false, error: "staged not found" }), { headers: { "Content-Type": "application/json" } });
        const { data: run, error } = await sb.from("automation_flow_runs").insert({
          flow_key:      flow_key ?? "profile_sent",
          current_stage: current_stage ?? "email_hospital",
          status:        "in_progress",
          doctor_id:     `staged:${staged_id}`,
          doctor_name:   s.full_name,
          doctor_email:  s.email,
          doctor_phone:  s.phone,
          assigned_to:   "ammar@allocationassist.com",
          metadata:      { test_run: true },
        }).select("id").single();
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, run_id: run.id }), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { recent_runs?: boolean } | null)?.recent_runs) {
        const { data } = await sb.from("automation_flow_runs").select("id, flow_key, current_stage, doctor_id, assigned_to, last_event_at, metadata").order("last_event_at", { ascending: false, nullsFirst: false }).limit(5);
        return new Response(JSON.stringify({ ok: true, runs: data ?? [] }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { fix_templates?: boolean } | null)?.fix_templates) {
        // Mirror of migration 20260612000001: strip the dead {{logo_header}}
        // token and the hardcoded "Dr. " prefix before {{doctor_name}} (the
        // name token already carries the title). Applied via PostgREST since
        // direct db push can't reach Postgres from here.
        const { data: rows } = await sb.from("email_templates").select("key, body_html");
        const changed: string[] = [];
        for (const t of (rows ?? []) as Array<{ key: string; body_html: string | null }>) {
          const orig = String(t.body_html ?? "");
          const next = orig
            .replace(/\{\{logo_header\}\}/g, "")
            .replace(/Dr\. \{\{doctor_name\}\}/g, "{{doctor_name}}")
            .replace(/^\s+/, "");
          if (next !== orig) {
            const { error } = await sb.from("email_templates").update({ body_html: next }).eq("key", t.key);
            changed.push(error ? `${t.key} (ERR: ${error.message})` : t.key);
          }
        }
        return new Response(JSON.stringify({ ok: true, changed }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { reorg_relocation?: boolean } | null)?.reorg_relocation) {
        // _default/ is attached to EVERY relocation email, but it's full of
        // Dubai-specific docs (school lists) + a Dubai/Abu-Dhabi rental sheet,
        // so an Al Ain/Sharjah doctor wrongly receives Dubai material. Move
        // the Dubai-only school PDFs into dubai/, copy the Dubai+Abu-Dhabi
        // rental sheet into both those folders, and leave only the genuinely
        // UAE-wide "Useful Apps" in _default. (City guides already embed their
        // own schools.)
        const B = sb.storage.from("relocation-guides");
        const log: string[] = [];
        for (const f of [
          "British Curriculum Schools Dubai.pdf",
          "Dubai_Schools_Information.pdf",
          "IB and European Curriculum Schools Dubai.pdf",
          "US Curriculum Schools Dubai.pdf",
        ]) {
          const { error } = await B.move(`_default/${f}`, `dubai/${f}`);
          log.push(error ? `MOVE ${f} -> dubai/ ERR: ${error.message}` : `moved _default/${f} -> dubai/`);
        }
        const prop = "Property Rental Prices - March2024.pdf";
        const c1 = await B.copy(`_default/${prop}`, `dubai/${prop}`);
        log.push(c1.error ? `COPY dubai ERR: ${c1.error.message}` : `copied ${prop} -> dubai/`);
        const c2 = await B.copy(`_default/${prop}`, `abu-dhabi/${prop}`);
        log.push(c2.error ? `COPY abu-dhabi ERR: ${c2.error.message}` : `copied ${prop} -> abu-dhabi/`);
        if (!c1.error && !c2.error) {
          const rm = await B.remove([`_default/${prop}`]);
          log.push(rm.error ? `REMOVE _default ERR: ${rm.error.message}` : `removed _default/${prop}`);
        }
        return new Response(JSON.stringify({ ok: true, log }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { resend_domains?: boolean } | null)?.resend_domains) {
        const key = Deno.env.get("RESEND_API_KEY") ?? "";
        const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
        const j = await r.json().catch(() => null);
        return new Response(JSON.stringify({ ok: r.ok, status: r.status, domains: j }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { recent_inbound?: boolean } | null)?.recent_inbound) {
        const [replies, notifs] = await Promise.all([
          sb.from("hospital_replies").select("id, run_id, doctor_name, hospital_name, reply_from, reply_subject, classification, source, created_at").order("created_at", { ascending: false }).limit(8),
          sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(12),
        ]);
        return new Response(JSON.stringify({
          ok: true,
          replies: replies.data ?? [], replies_err: replies.error?.message,
          notifs: (notifs.data ?? []).map((n: Record<string, unknown>) => ({ kind: n.kind, title: n.title, created_at: n.created_at, slack_skip_reason: n.slack_skip_reason, slack_delivered_at: n.slack_delivered_at, related_run_id: n.related_run_id })),
          notifs_err: notifs.error?.message,
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { find_doctor?: string } | null)?.find_doctor) {
        const q = (body as { find_doctor: string }).find_doctor;
        const [wp, staged, forms] = await Promise.all([
          sb.from("wordpress_candidates").select("id, full_name, email, status").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`),
          sb.from("staged_doctor_profiles").select("*").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`),
          sb.from("form_responses").select("id, respondent_name, respondent_email, archived_at, submitted_at").or(`respondent_name.ilike.%${q}%,respondent_email.ilike.%${q}%`),
        ]);
        // Pull cv_upload status for each staged row so we can debug
        // why an extraction didn't land.
        const uploadIds = (staged.data ?? []).map((s: { cv_upload_id?: string }) => s.cv_upload_id).filter(Boolean) as string[];
        let cvUploads: unknown[] = [];
        if (uploadIds.length) {
          const { data } = await sb.from("cv_uploads").select("id, status, file_path, file_mime, extraction_error, extracted_at, extracted_data").in("id", uploadIds);
          cvUploads = data ?? [];
        }
        return new Response(JSON.stringify({ ok: true, wp: wp.data ?? [], staged: staged.data ?? [], forms: forms.data ?? [], cv_uploads: cvUploads }, null, 2), { headers: { "Content-Type": "application/json" } });
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
      if ((body as { probe_cv_url?: string } | null)?.probe_cv_url) {
        const url = (body as { probe_cv_url: string }).probe_cv_url;
        const { data: forms } = await sb.from("forms").select("api_token").eq("provider", "jotform").limit(1);
        const tok = (forms as Array<{ api_token: string }> | null)?.[0]?.api_token;
        if (!tok) return new Response(JSON.stringify({ ok: false, error: "no api_token" }), { headers: { "Content-Type": "application/json" } });
        const r = await fetch(url, { headers: { APIKEY: tok } });
        const ct = r.headers.get("content-type");
        const len = r.headers.get("content-length");
        const peek = ct?.startsWith("text/") || ct?.includes("json") ? (await r.text()).slice(0, 300) : null;
        return new Response(JSON.stringify({ ok: true, status: r.status, content_type: ct, content_length: len, text_peek: peek }, null, 2), { headers: { "Content-Type": "application/json" } });
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
      if ((body as { jotform_cv_to_wp?: { response_id: string; wp_search?: string; wp_candidate_id?: number } } | null)?.jotform_cv_to_wp) {
        // One-shot: pull a CV URL out of a form_response's raw_payload,
        // download it from JotForm (APIKEY), and attach to a WP candidate's
        // cv_resume. Pass wp_search first to find the candidate id, then call
        // again with wp_candidate_id to actually attach. Repairs records
        // whose CV was missed (URL was only in raw_payload).
        const p = (body as { jotform_cv_to_wp: { response_id: string; wp_search?: string; wp_candidate_id?: number } }).jotform_cv_to_wp;
        const wpBase = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
        const basic = "Basic " + btoa(`${Deno.env.get("WP_USERNAME")}:${(Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "")}`);
        const { data: resp } = await sb.from("form_responses").select("raw_payload, form_id, respondent_name").eq("id", p.response_id).single();
        if (!resp) return new Response(JSON.stringify({ ok: false, error: "response not found" }), { headers: { "Content-Type": "application/json" } });
        const rawStr = (() => { try { return JSON.stringify((resp as { raw_payload?: unknown }).raw_payload ?? ""); } catch { return ""; } })();
        const cvMatch = /(https?:\/\/[^\s,;"'\\]+\/uploads\/[^\s,;"'\\]+\.(?:pdf|doc|docx))/i.exec(rawStr);
        const cvUrl = cvMatch ? cvMatch[1].replace(/\\\//g, "/") : null;
        if (!cvUrl) return new Response(JSON.stringify({ ok: false, error: "no CV url in raw_payload" }), { headers: { "Content-Type": "application/json" } });
        // Find the candidate if not given.
        if (!p.wp_candidate_id) {
          const q = encodeURIComponent(p.wp_search ?? (resp as { respondent_name?: string }).respondent_name ?? "");
          // status[]=… needs auth (we have it) — default REST search only
          // returns published posts, so a draft candidate would be invisible.
          const statusQ = "&status[]=publish&status[]=draft&status[]=pending&status[]=private&status[]=future";
          const sRes = await fetch(`${wpBase}/wp-json/wp/v2/candidate?search=${q}${statusQ}&_fields=id,title,status&per_page=30`, { headers: { Authorization: basic } });
          const cands = await sRes.json().catch(() => []) as Array<{ id: number; title?: { rendered?: string }; status?: string }>;
          return new Response(JSON.stringify({ ok: true, cv_url: cvUrl, search_status: sRes.status, candidates: Array.isArray(cands) ? cands.map(c => ({ id: c.id, title: c.title?.rendered, status: c.status })) : cands }, null, 2), { headers: { "Content-Type": "application/json" } });
        }
        // Download the CV from JotForm with the form's APIKEY.
        const { data: formRow } = await sb.from("forms").select("api_token").eq("id", (resp as { form_id: string }).form_id).single();
        const tok = (formRow as { api_token?: string } | null)?.api_token;
        const dl = await fetch(cvUrl, { headers: tok ? { APIKEY: tok } : {} });
        if (!dl.ok) return new Response(JSON.stringify({ ok: false, error: `CV download ${dl.status}` }), { headers: { "Content-Type": "application/json" } });
        const bytes = await dl.arrayBuffer();
        const fileName = (cvUrl.split("/").pop() || "cv.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        const mime = dl.headers.get("content-type") || "application/pdf";
        const mediaRes = await fetch(`${wpBase}/wp-json/wp/v2/media`, {
          method: "POST", headers: { Authorization: basic, "Content-Type": mime, "Content-Disposition": `attachment; filename="${fileName}"` }, body: bytes,
        });
        const mj = await mediaRes.json().catch(() => null) as { id?: number; source_url?: string; code?: string } | null;
        if (!mediaRes.ok || !mj?.id) return new Response(JSON.stringify({ ok: false, error: `media upload ${mediaRes.status}: ${mj?.code ?? ""}` }), { headers: { "Content-Type": "application/json" } });
        const patch = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${p.wp_candidate_id}`, {
          method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" }, body: JSON.stringify({ acf: { cv_resume: mj.id } }),
        });
        const vRes = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${p.wp_candidate_id}?_fields=acf.cv_resume`, { headers: { Authorization: basic } });
        const after = vRes.ok ? ((await vRes.json()) as { acf?: { cv_resume?: unknown } })?.acf?.cv_resume : null;
        if (mj.source_url) await sb.from("wordpress_candidates").update({ cv_url: mj.source_url }).eq("id", p.wp_candidate_id);
        return new Response(JSON.stringify({ ok: true, cv_url: cvUrl, media_id: mj.id, source_url: mj.source_url, patch_status: patch.status, cv_resume_after: after }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { clear_cv?: number } | null)?.clear_cv) {
        // Clear cv_resume on a candidate. ACF File fields don't clear with
        // `false`; try null then "" and report which emptied it.
        const cid = (body as { clear_cv: number }).clear_cv;
        const wpBase = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
        const basic = "Basic " + btoa(`${Deno.env.get("WP_USERNAME")}:${(Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "")}`);
        const getField = async () => {
          const r = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${cid}?_fields=acf.cv_resume`, { headers: { Authorization: basic } });
          return r.ok ? ((await r.json()) as { acf?: { cv_resume?: unknown } })?.acf?.cv_resume ?? null : `GET ${r.status}`;
        };
        const steps: unknown[] = [];
        for (const shape of [null, ""] as unknown[]) {
          const pr = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${cid}`, {
            method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" },
            body: JSON.stringify({ acf: { cv_resume: shape } }),
          });
          const after = await getField();
          steps.push({ shape, status: pr.status, after });
          if (after === null || after === "" || after === false || after === 0) break;
        }
        return new Response(JSON.stringify({ ok: true, candidate_id: cid, steps, final: await getField() }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { test_upload_cv?: number } | null)?.test_upload_cv) {
        // End-to-end test of the deployed wordpress-candidate-upload-cv:
        // upload a tiny real PDF to a candidate and report the function's
        // response (attached_key proves cv_resume took). Clear afterwards.
        const cid = (body as { test_upload_cv: number }).test_upload_cv;
        const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 4>>\nstartxref\n0\n%%EOF";
        const fd = new FormData();
        fd.append("file", new File([pdf], "diagnostic-cv.pdf", { type: "application/pdf" }));
        fd.append("candidate_id", String(cid));
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wordpress-candidate-upload-cv`, {
          method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: fd,
        });
        const j = await r.json().catch(() => null);
        return new Response(JSON.stringify({ ok: true, http_status: r.status, function_response: j }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { probe_cv_write?: boolean } | null)?.probe_cv_write) {
        // Definitively learn what write SHAPE the cv_resume ACF File field
        // accepts: PATCH a known-valid media id as int, numeric-string, and
        // {id} object, re-reading after each; then restore the field to empty.
        // Reveals whether the verify-loop's bare-int write actually sticks.
        const wpBase = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
        const basic = "Basic " + btoa(`${Deno.env.get("WP_USERNAME")}:${(Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "")}`);
        const { data: rows } = await sb
          .from("wordpress_candidates")
          .select("id, full_name, raw_acf")
          .not("raw_acf", "is", null)
          .limit(80);
        let cid: number | null = null, name: string | null = null, mediaId: number | null = null;
        for (const r of (rows ?? []) as Array<{ id: number; full_name: string; raw_acf: Record<string, unknown> }>) {
          const pp = r.raw_acf?.profile_picture;
          const id = typeof pp === "number" ? pp : (/^\d+$/.test(String(pp)) ? parseInt(String(pp), 10) : null);
          if (id) { cid = r.id; name = r.full_name; mediaId = id; break; }
        }
        if (!cid || !mediaId) return new Response(JSON.stringify({ ok: false, error: "no candidate with a valid media id" }), { headers: { "Content-Type": "application/json" } });
        const getField = async () => {
          const r = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${cid}?_fields=acf.cv_resume`, { headers: { Authorization: basic } });
          return r.ok ? ((await r.json()) as { acf?: { cv_resume?: unknown } })?.acf?.cv_resume ?? null : `GET ${r.status}`;
        };
        const before = await getField();
        const tries: unknown[] = [];
        for (const shape of [mediaId, String(mediaId), { id: mediaId }] as unknown[]) {
          const pr = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${cid}`, {
            method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" },
            body: JSON.stringify({ acf: { cv_resume: shape } }),
          });
          const pj = await pr.json().catch(() => null) as { code?: string; message?: string } | null;
          const after = await getField();
          tries.push({ shape, patch_status: pr.status, patch_code: pj?.code ?? null, patch_msg: pj?.message ?? null, after });
        }
        // Restore to empty (false clears an ACF File field).
        await fetch(`${wpBase}/wp-json/wp/v2/candidate/${cid}`, {
          method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" },
          body: JSON.stringify({ acf: { cv_resume: false } }),
        });
        const restored = await getField();
        return new Response(JSON.stringify({ ok: true, candidate: { id: cid, name }, media_id: mediaId, before, tries, restored }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { fix_phones?: boolean } | null)?.fix_phones) {
        // Repair every WP candidate whose phone_number is the raw
        // {area,phone} JSON: normalise to "+area phone", PATCH WP, and
        // refresh the mirror. body.dry_run=true to preview without writing.
        const dry = (body as { dry_run?: boolean }).dry_run === true;
        const wpBase = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
        const basic = "Basic " + btoa(`${Deno.env.get("WP_USERNAME")}:${(Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "")}`);
        const norm = (raw: unknown): string | null => {
          let o: { area?: unknown; phone?: unknown; full?: unknown } | null = null;
          if (raw && typeof raw === "object") o = raw as typeof o;
          else if (typeof raw === "string" && raw.trim().startsWith("{") && raw.includes("phone")) {
            try { o = JSON.parse(raw); } catch { /* not json */ }
          }
          if (!o) return null; // already plain or not a phone object
          if (typeof o.full === "string" && o.full.trim()) return o.full.trim();
          const a = o.area != null ? String(o.area).trim() : "";
          const p = o.phone != null ? String(o.phone).trim() : "";
          const j = [a, p].filter(Boolean).join(" ");
          return j || null;
        };
        const { data: rows } = await sb
          .from("wordpress_candidates")
          .select("id, full_name, phone, raw_acf")
          .not("raw_acf", "is", null)
          .limit(1000);
        const fixed: unknown[] = [];
        for (const r of (rows ?? []) as Array<{ id: number; full_name: string; phone: string | null; raw_acf: Record<string, unknown> }>) {
          const cur = r.raw_acf?.phone_number;
          const clean = norm(cur);
          if (!clean) continue; // nothing to fix
          if (dry) { fixed.push({ id: r.id, name: r.full_name, from: cur, to: clean, dry: true }); continue; }
          const pr = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${r.id}`, {
            method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" },
            body: JSON.stringify({ acf: { phone_number: clean } }),
          });
          const ok = pr.ok;
          if (ok) {
            await sb.from("wordpress_candidates").update({ phone: clean, updated_at: new Date().toISOString() }).eq("id", r.id);
          }
          fixed.push({ id: r.id, name: r.full_name, from: cur, to: clean, patch_status: pr.status, ok });
        }
        return new Response(JSON.stringify({ ok: true, dry_run: dry, count: fixed.length, fixed }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { backfill_wp_from_cv?: { upload_id: string; wp_candidate_id: number; email?: string } } | null)?.backfill_wp_from_cv) {
        // Repair an already-published record: run enrichProfile over a CV
        // upload's extracted_data and PATCH ONLY the missing education /
        // experience / years fields onto the WP candidate (a targeted subset
        // so WP can't reject the whole write on an unrelated field).
        const p = (body as { backfill_wp_from_cv: { upload_id: string; wp_candidate_id: number; email?: string } }).backfill_wp_from_cv;
        const { data: up } = await sb.from("cv_uploads").select("extracted_data, doctor_email").eq("id", p.upload_id).single();
        const extracted = (up as { extracted_data?: Record<string, unknown> } | null)?.extracted_data;
        if (!extracted) return new Response(JSON.stringify({ ok: false, error: "no extracted_data on that upload" }), { headers: { "Content-Type": "application/json" } });
        const { mergedAcf } = await enrichProfile({
          supabase: sb,
          email: p.email ?? (up as { doctor_email?: string }).doctor_email ?? null,
          formAcf: {},
          responseRow: null,
          cvExtracted: extracted,
        });
        const KEYS = ["years_of_experience_post_specialization", "academy1", "level_1", "start_date1", "end_date1", "present1", "description1", "title1", "company2", "title2", "title3", "title4", "start_date_2", "end_date2", "present2", "description2", "description4", "year4", "bio", "job_title", "subspecialty", "specific_areas_of_interests_within_the_specialization"];
        const patchAcf: Record<string, unknown> = {};
        for (const k of KEYS) if (mergedAcf[k] !== undefined && mergedAcf[k] !== null && mergedAcf[k] !== "") patchAcf[k] = mergedAcf[k];
        if ((body as { backfill_wp_from_cv: { dry_run?: boolean } }).backfill_wp_from_cv.dry_run) {
          return new Response(JSON.stringify({ ok: true, dry_run: true, mapped: patchAcf }, null, 2), { headers: { "Content-Type": "application/json" } });
        }
        const wpBase = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
        const basic = "Basic " + btoa(`${Deno.env.get("WP_USERNAME")}:${(Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "")}`);
        const patch = await fetch(`${wpBase}/wp-json/wp/v2/candidate/${p.wp_candidate_id}`, {
          method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" }, body: JSON.stringify({ acf: patchAcf }),
        });
        const pj = await patch.json().catch(() => null) as { code?: string; message?: string } | null;
        return new Response(JSON.stringify({ ok: patch.ok && !pj?.code, patch_status: patch.status, code: pj?.code ?? null, message: pj?.message ?? null, fields_sent: Object.keys(patchAcf), years: patchAcf.years_of_experience_post_specialization, academy1: patchAcf.academy1, title1: patchAcf.title1, company2: patchAcf.company2 }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { test_cv_extract?: { email?: string; upload_id?: string } } | null)?.test_cv_extract) {
        // Find a doctor's most recent cv_upload and re-run cv-extract on it —
        // verifies the extractor handles the file (e.g. the .docx fix) and
        // returns the extracted fields.
        const p = (body as { test_cv_extract: { email?: string; upload_id?: string } }).test_cv_extract;
        let uploadId = p.upload_id ?? null;
        let meta: unknown = null;
        if (!uploadId && p.email) {
          const { data } = await sb.from("cv_uploads")
            .select("id, status, file_path, file_mime, extraction_error, uploaded_at, doctor_id")
            .ilike("doctor_email", `%${p.email}%`)
            .order("uploaded_at", { ascending: false })
            .limit(1);
          const r = (data as Array<{ id: string }> | null)?.[0];
          uploadId = r?.id ?? null;
          meta = r ?? null;
        }
        if (!uploadId) return new Response(JSON.stringify({ ok: false, error: "no cv_upload found" }), { headers: { "Content-Type": "application/json" } });
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cv-extract`, {
          method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id: uploadId }),
        });
        const j = await res.json().catch(() => null) as { ok?: boolean; error?: string; extracted?: Record<string, unknown> } | null;
        const ex = j?.extracted ?? {};
        return new Response(JSON.stringify({
          ok: true, upload_id: uploadId, cv_upload: meta, http_status: res.status,
          extract_ok: j?.ok ?? false, extract_error: j?.error ?? null,
          extracted_summary: {
            years_experience: ex.years_experience, specialty: ex.specialty, title: ex.title,
            education_entries: Array.isArray(ex.education) ? ex.education.length : 0,
            experience_entries: Array.isArray(ex.experience) ? ex.experience.length : 0,
            keys: Object.keys(ex),
          },
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { edu_exp_probe?: number } | null)?.edu_exp_probe) {
        // Inspect a candidate's education/experience/years ACF + find
        // populated examples to learn the (cryptic) repeater field schema.
        const targetId = (body as { edu_exp_probe: number }).edu_exp_probe;
        const EDU_KEYS = ["years_of_experience_post_specialization", "academy1", "level_1", "start_date1", "end_date1", "present1", "description1", "company2", "title1", "title2", "title3", "title4", "start_date_2", "end_date2", "present2", "description2", "description4", "year4", "label", "label1", "percentage", "percentage1"];
        const pickKeys = (acf: Record<string, unknown>) => {
          const o: Record<string, unknown> = {};
          for (const k of EDU_KEYS) if (acf[k] !== undefined && acf[k] !== null && acf[k] !== "") o[k] = acf[k];
          return o;
        };
        const { data: target } = await sb.from("wordpress_candidates").select("id, full_name, raw_acf").eq("id", targetId).maybeSingle();
        const { data: rows } = await sb.from("wordpress_candidates").select("id, full_name, raw_acf").not("raw_acf", "is", null).limit(120);
        const populated: unknown[] = [];
        for (const r of (rows ?? []) as Array<{ id: number; full_name: string; raw_acf: Record<string, unknown> }>) {
          const acf = r.raw_acf ?? {};
          if ((acf.academy1 && acf.academy1 !== "") || (acf.title1 && acf.title1 !== "") || (acf.company2 && acf.company2 !== "")) {
            populated.push({ id: r.id, name: r.full_name, fields: pickKeys(acf) });
            if (populated.length >= 3) break;
          }
        }
        return new Response(JSON.stringify({
          ok: true,
          target: target ? { id: (target as { id: number }).id, name: (target as { full_name: string }).full_name, edu_exp_fields: pickKeys((target as { raw_acf: Record<string, unknown> }).raw_acf ?? {}) } : null,
          populated_examples: populated,
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { list_forms?: boolean } | null)?.list_forms) {
        const { data } = await sb.from("forms").select("id, name, provider, provider_form_id, form_type, active, api_token, webhook_secret, metadata");
        return new Response(JSON.stringify({
          ok: true,
          forms: ((data ?? []) as Array<{ id: string; name: string; provider: string; provider_form_id: string | null; form_type: string | null; active: boolean; api_token: string | null; webhook_secret: string | null; metadata: unknown }>)
            .map(f => ({ id: f.id, name: f.name, provider: f.provider, provider_form_id: f.provider_form_id, form_type: f.form_type, active: f.active, has_api_token: !!f.api_token, has_webhook_secret: !!f.webhook_secret })),
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { connect_typeform?: { provider_form_id: string; name?: string } } | null)?.connect_typeform) {
        // Register a new Typeform form, copying the api_token from an existing
        // Typeform form (so the CV download + historical sync work) and the
        // form_type from the JotForm doctor form (so it's treated the same).
        const p = (body as { connect_typeform: { provider_form_id: string; name?: string } }).connect_typeform;
        const { data: all } = await sb.from("forms").select("id, name, provider, provider_form_id, form_type, api_token, metadata, active");
        const forms = (all ?? []) as Array<{ id: string; name: string; provider: string; provider_form_id: string | null; form_type: string | null; api_token: string | null; metadata: unknown }>;
        // Already registered?
        const existing = forms.find(f => f.provider === "typeform" && f.provider_form_id === p.provider_form_id);
        if (existing) return new Response(JSON.stringify({ ok: true, already_exists: true, form_id: existing.id }), { headers: { "Content-Type": "application/json" } });
        const tokenSrc = forms.find(f => f.provider === "typeform" && f.api_token);
        const jotformDoc = forms.find(f => f.provider === "jotform");
        const { data: inserted, error } = await sb.from("forms").insert({
          name:             p.name ?? "Doctor Qualification (Typeform)",
          provider:         "typeform",
          provider_form_id: p.provider_form_id,
          api_token:        tokenSrc?.api_token ?? null,
          form_type:        jotformDoc?.form_type ?? null,
          active:           true,
        }).select("id, name, provider_form_id").single();
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({
          ok: true,
          created: inserted,
          token_copied_from: tokenSrc ? tokenSrc.name : null,
          had_token_source: !!tokenSrc,
          form_type_from: jotformDoc ? jotformDoc.name : null,
          webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/typeform-webhook`,
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { recent_batches?: boolean } | null)?.recent_batches) {
        const { data } = await sb.from("scheduled_batch_sends")
          .select("id, kind, specialty, country, status, scheduled_for, doctor_ids")
          .order("scheduled_for", { ascending: false }).limit(12);
        return new Response(JSON.stringify({
          ok: true,
          batches: ((data ?? []) as Array<{ id: string; kind: string; specialty: string | null; country: string | null; status: string; scheduled_for: string; doctor_ids: string[] | null }>)
            .map(b => ({ id: b.id, kind: b.kind, specialty: b.specialty, country: b.country, status: b.status, scheduled_for: b.scheduled_for, n_doctors: (b.doctor_ids ?? []).length })),
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { pool_coverage?: boolean } | null)?.pool_coverage) {
        // How many PUBLISHED website doctors would the batch/vacancy picker
        // miss? The picker's spine is Zoho "Doctors on Board"; a published WP
        // candidate linked to a lead (or unlinked) never appears.
        const { data } = await sb.from("wordpress_candidates").select("doctor_id, status, license_status, license_types");
        const pub = ((data ?? []) as Array<{ doctor_id: string | null; status: string | null; license_status: string | null; license_types: string[] | null }>).filter(c => c.status === "publish");
        const byLink = { dob: 0, lead: 0, none: 0, other: 0 };
        let licenseTypesButThinText = 0;
        for (const c of pub) {
          const d = c.doctor_id;
          if (!d) byLink.none++;
          else if (d.startsWith("dob:")) byLink.dob++;
          else if (d.startsWith("lead:")) byLink.lead++;
          else byLink.other++;
          // doctors whose structured licenses wouldn't be detected from the
          // free-text license_status regex (the license_types[] gap)
          const types = c.license_types ?? [];
          const text = c.license_status ?? "";
          if (types.length && !/dha|doh|moh|scfhs|qchp/i.test(text)) licenseTypesButThinText++;
        }
        return new Response(JSON.stringify({
          ok: true, published_total: pub.length, by_link: byLink,
          excluded_from_batch_picker: byLink.lead + byLink.none + byLink.other,
          license_types_invisible_in_text: licenseTypesButThinText,
        }, null, 2), { headers: { "Content-Type": "application/json" } });
      }
      if ((body as { dump_acf?: boolean } | null)?.dump_acf) {
        // Union of every ACF key across real WP candidates (from the
        // mirror's raw_acf), plus a sample value for any cv/resume/file/
        // phone key — reveals the real "CV/ Resume" slug + how phone is
        // actually stored, without touching a specific (now-deleted) record.
        const { data } = await sb
          .from("wordpress_candidates")
          .select("id, full_name, raw_acf")
          .not("raw_acf", "is", null)
          .limit(40);
        const keyCounts: Record<string, number> = {};
        const samples: Record<string, unknown> = {};
        for (const row of (data ?? []) as Array<{ raw_acf: Record<string, unknown> | null }>) {
          const acf = row.raw_acf ?? {};
          for (const k of Object.keys(acf)) {
            keyCounts[k] = (keyCounts[k] ?? 0) + 1;
            const val = acf[k];
            if (/cv|resume|curriculum|file|document|phone/i.test(k) &&
                samples[k] === undefined && val !== null && val !== "") {
              samples[k] = val;
            }
          }
        }
        return new Response(JSON.stringify({
          ok: true,
          candidates_scanned: data?.length ?? 0,
          all_keys: Object.keys(keyCounts).sort(),
          cv_phone_file_samples: samples,
        }, null, 2), { headers: { "Content-Type": "application/json" } });
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

/**
 * JotForm → historical backfill.
 *
 * Pulls every submission from a JotForm via its public API and runs
 * each one through the same pipeline the live webhook uses:
 *   - extract + map answers (shared module)
 *   - upsert WordPress candidate (email-matched; new ones land as draft)
 *   - auto-link to Zoho lead/DoB
 *   - record a form_responses row
 *
 * Endpoint: POST /functions/v1/jotform-historical-sync
 * Body:    { form_id: <dashboard form uuid> }
 *
 * Required state on the `forms` row:
 *   - api_token       — JotForm Personal API Key (Settings → API)
 *   - provider_form_id — JotForm form ID (URL slug after /form/)
 *
 * Returns { ok, fetched, inserted, skipped, wp_created, wp_updated,
 *           total_reported, durationMs }.
 *
 * Idempotent — re-running upserts on (form_id, submission_id) so the
 * second run is a no-op. The first run does the real work.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flattenAnswers, mapToProfile } from "../_shared/jotform-extract.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(supabaseUrl, serviceKey);
  const started = Date.now();

  let body: { form_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  const formId = body.form_id;
  if (!formId) return json({ ok: false, error: "form_id is required" }, 400);

  // ── Look up the dashboard form row to get API key + JotForm form id ──
  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("id, provider, provider_form_id, api_token")
    .eq("id", formId)
    .single();
  if (formErr || !form) return json({ ok: false, error: "Form not found" }, 404);
  if (form.provider !== "jotform") {
    return json({ ok: false, error: `Form is provider="${form.provider}", expected "jotform"` }, 400);
  }
  if (!form.api_token)       return json({ ok: false, error: "JotForm API token not set (forms.api_token). Open the form in /forms → Sync history to enter it." }, 400);
  if (!form.provider_form_id) return json({ ok: false, error: "JotForm form_id not set (forms.provider_form_id). It's the slug in the form URL (jotform.com/form/<id>)." }, 400);

  // ── Walk /form/<id>/submissions ─────────────────────────────────────
  // JotForm's `limit` is capped per plan tier (free: 20, basic: 100,
  // pro: 1000). We ASK for 1000 but the server silently returns fewer
  // when a tier cap is in effect. The earlier version broke when
  // items.length < PAGE_SIZE (= 1000), so on a tier-capped plan we
  // bailed after page 0 with only N items fetched ("stuck at 225").
  //
  // Robust pagination:
  //   - Advance offset by the ACTUAL page length, not the requested PAGE_SIZE
  //   - Terminate when the server returns 0 items, OR when offset has
  //     reached resultSet.count (JotForm's reported total).
  //   - Hard cap 100k as a safety net.
  const PAGE_SIZE  = 1000;
  const HARD_CAP   = 100_000;
  const MAX_PAGES  = 2000;
  let offset = 0;
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let wpCreated = 0;
  let wpUpdated = 0;
  let totalReported = 0;

  for (let page = 0; page < MAX_PAGES && fetched < HARD_CAP; page++) {
    const url = new URL(`https://api.jotform.com/form/${form.provider_form_id}/submissions`);
    url.searchParams.set("apiKey", form.api_token);
    url.searchParams.set("limit",  String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("orderby","created_at");
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json({ ok: false, error: `JotForm API ${res.status}: ${text.slice(0, 300)}`, fetched, inserted }, 502);
    }
    const payload = await res.json() as {
      responseCode?: number;
      message?:      string;
      content?:      Array<{ id: string; form_id?: string; created_at?: string; answers?: Record<string, unknown> }>;
      resultSet?:    { count?: number };
      limit?:        number;
    };
    if (payload.responseCode && payload.responseCode !== 200) {
      return json({ ok: false, error: `JotForm: ${payload.message ?? "unknown error"}`, fetched, inserted }, 502);
    }
    const items = payload.content ?? [];
    if (page === 0) totalReported = payload.resultSet?.count ?? 0;
    if (items.length === 0) break;
    fetched += items.length;

    // ── Process each submission ──────────────────────────────────────
    // Sequential rather than parallel — each call hits WP REST + Supabase,
    // and JotForm sub-1000 pages aren't huge enough to justify the
    // concurrency complexity (or the risk of WP rate-limiting). ~2-4
    // submissions/sec is fine for a one-shot backfill.
    for (const sub of items) {
      try {
        const flat = flattenAnswers(sub.answers ?? {});
        const profile = mapToProfile(flat);
        const submittedAt = sub.created_at ? new Date(sub.created_at.replace(" ", "T") + "Z").toISOString() : new Date().toISOString();

        // No email? Still record the form_response so the team can see
        // the submission, but skip WP upsert (we'd have nothing to
        // match on for the email-based dedup).
        let wpId: number | null = null;
        let wpAction: "created" | "updated" | "skipped" = "skipped";

        if (profile.email) {
          // Lookup existing WP candidate by email.
          const { data: existing } = await supabase
            .from("wordpress_candidates")
            .select("id")
            .ilike("email", profile.email)
            .order("wp_modified", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          const upsertBody = {
            id:     existing?.id,
            status: existing ? undefined : "draft",
            title:  profile.full_name || "JotForm intake",
            acf:    profile.acf,
          };
          try {
            const upRes = await fetch(`${supabaseUrl}/functions/v1/wordpress-candidate-upsert`, {
              method:  "POST",
              headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body:    JSON.stringify(upsertBody),
            });
            const upJson = await upRes.json().catch(() => null) as { ok: boolean; id?: number } | null;
            if (upRes.ok && upJson?.ok && typeof upJson.id === "number") {
              wpId = upJson.id;
              wpAction = existing ? "updated" : "created";
              if (existing) wpUpdated++; else wpCreated++;
            }
          } catch (e) {
            console.warn("[jotform-historical-sync] WP upsert failed for submission", sub.id, e);
          }
        }

        // Auto-link to Zoho lead/DoB.
        let doctorId: string | null = null;
        if (profile.email) {
          const { data: linkData } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: profile.email });
          if (typeof linkData === "string") doctorId = linkData;
        }

        // Record the form_response. Upsert on (form_id, provider_response_id)
        // so a re-run is a no-op for already-imported rows.
        const { data: upserted, error: upErr } = await supabase
          .from("form_responses")
          .upsert({
            form_id:               form.id,
            provider_response_id:  sub.id,
            submitted_at:          submittedAt,
            raw_payload:           sub as unknown as Record<string, unknown>,
            answers:               flat,
            respondent_name:       profile.full_name || null,
            respondent_email:      profile.email     || null,
            doctor_id:             doctorId,
            outreach_status:       "new",
            outreach_notes:        wpId
              ? `Historical sync · WP candidate #${wpId} (${wpAction}).`
              : profile.email
                ? `Historical sync · WP upsert skipped (failed).`
                : `Historical sync · no email on submission, WP candidate not touched.`,
          }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false })
          .select("id");
        if (upErr) {
          console.warn("[jotform-historical-sync] form_responses upsert error", upErr);
          skipped++;
        } else if (upserted && upserted.length > 0) {
          inserted++;
        }
      } catch (e) {
        console.error("[jotform-historical-sync] submission failed:", sub.id, e);
        skipped++;
      }
    }

    // Advance by the ACTUAL number of items returned (tier-cap-safe).
    offset += items.length;
    // Stop once we've covered the reported total. If the API didn't
    // report a total (totalReported = 0), keep walking until we get
    // an empty page on the next loop iteration.
    if (totalReported > 0 && offset >= totalReported) break;
  }

  return json({
    ok:              true,
    fetched,
    inserted,
    skipped,
    wp_created:      wpCreated,
    wp_updated:      wpUpdated,
    total_reported:  totalReported,
    durationMs:      Date.now() - started,
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

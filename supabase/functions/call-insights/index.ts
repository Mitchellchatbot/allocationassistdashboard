/**
 * call-insights — cross-call AI synthesis for the sales Calls page.
 *
 * Per-call summaries answer "what happened on THIS call". This answers the
 * question a single call can't: across the team's recent calls, what are the
 * recurring themes, objections, what's landing, what's at risk, and what
 * should the reps do next. Reads the recent calls' summaries (not full
 * transcripts — summaries are concise and bound the token cost) and asks
 * Claude for a structured rollup.
 *
 * Endpoint:  POST /functions/v1/call-insights
 * Body:      { host_emails?: string[], limit?: number }
 * Auth:      verify_jwt (called from the authenticated dashboard). Reads use
 *            the service role internally.
 *
 * Required secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Keep per-call context bounded — summaries are usually short, but cap the
// long ones, and cap the number of calls so a busy week can't blow up cost.
const MAX_SUMMARY_CHARS = 1_800;
const DEFAULT_LIMIT     = 30;
const MAX_LIMIT         = 60;

const SECTION_KEYS = ["themes", "objections", "winning", "risks", "coaching", "followups"] as const;
type SectionKey = typeof SECTION_KEYS[number];
type Insights = { overview: string } & Record<SectionKey, string[]>;

function actionItemsText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  const lines = items.map((a) => {
    if (typeof a === "string") return a;
    const o = (a ?? {}) as Record<string, unknown>;
    const text = (o.text ?? o.description ?? o.title ?? o.action ?? "") as string;
    return typeof text === "string" ? text : "";
  }).filter(Boolean);
  return lines.length ? lines.map(l => `    - ${l}`).join("\n") : "";
}

function buildPrompt(rows: Array<Record<string, unknown>>): string {
  const blocks = rows.map((r, i) => {
    const title = (r.title as string) || "Untitled call";
    const date  = (r.recording_start as string)?.slice(0, 10) ?? "";
    const host  = (r.host_name as string) || (r.host_email as string) || "";
    let summary = ((r.summary as string) || "").trim();
    if (summary.length > MAX_SUMMARY_CHARS) summary = summary.slice(0, MAX_SUMMARY_CHARS) + "…";
    const actions = actionItemsText(r.action_items);
    return [
      `### Call ${i + 1}: ${title} (${date}${host ? ", host " + host : ""})`,
      summary || "(no summary)",
      actions ? `  Action items:\n${actions}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `You are a sharp sales coach reviewing recent recruitment sales calls for Allocation Assist, a company that places UK/Western-trained doctors into Gulf (UAE, Saudi, Qatar) hospital jobs. Reps qualify doctors, pitch the relocation package + Allocation Assist's service, and aim to get them signed and onto "Doctors on Board".

Below are summaries of the ${rows.length} most recent calls. Produce CROSS-CALL insights — patterns ACROSS the calls, not a recap of each one. Be concrete: cite specialties, packages, numbers, objections, and rep behaviours when the calls support it. Skip anything generic that would be true of any sales team.

Respond with ONLY a JSON object (no markdown, no code fences) of exactly this shape:
{
  "overview": "1-2 sentence headline of what's happening across these calls",
  "themes": ["recurring topics / what doctors keep asking about or caring about"],
  "objections": ["common concerns, hesitations, pushback — include pricing/fee and timing objections"],
  "winning": ["specific tactics, framing, or messaging that seems to land well"],
  "risks": ["deals or patterns at risk, warning signs, dropped follow-ups"],
  "coaching": ["specific, actionable coaching for the reps based on what you saw"],
  "followups": ["concrete suggested next steps across the pipeline"]
}
Each array: 2-5 short, specific bullet strings (one sentence each). Use an empty array for a section with nothing real to say. Output JSON only.

CALLS:
${blocks}`;
}

function emptyInsights(): Insights {
  return { overview: "", themes: [], objections: [], winning: [], risks: [], coaching: [], followups: [] };
}

function coerceInsights(raw: unknown): Insights {
  const out = emptyInsights();
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  if (typeof o.overview === "string") out.overview = o.overview.trim();
  for (const k of SECTION_KEYS) {
    const v = o[k];
    if (Array.isArray(v)) out[k] = v.map(x => String(x).trim()).filter(Boolean).slice(0, 6);
  }
  return out;
}

async function generate(rows: Array<Record<string, unknown>>): Promise<{ insights?: Insights; error?: string }> {
  if (!ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY is not set on the project" };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: buildPrompt(rows) }],
      }),
    });
  } catch (e) {
    return { error: `Anthropic request failed: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[call-insights] anthropic non-200:", res.status, body);
    return { error: `Anthropic ${res.status}: ${body.slice(0, 300)}` };
  }

  let raw = "";
  try {
    const j = await res.json() as { content?: { type: string; text?: string }[] };
    raw = (j.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
  } catch (e) {
    return { error: `Unreadable Anthropic response: ${(e as Error).message}` };
  }
  if (!raw) return { error: "Anthropic returned an empty response" };

  // Robustly isolate the JSON object even if the model wraps it in fences or
  // adds a sentence before/after it.
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const first = cleaned.indexOf("{");
  const last  = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);

  try {
    return { insights: coerceInsights(JSON.parse(cleaned)) };
  } catch (e) {
    console.error("[call-insights] parse failed. raw:", raw.slice(0, 500));
    return { error: `Could not parse AI output: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, reason: "POST only" }, 405);

  let body: { host_emails?: unknown; limit?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const hostEmails = Array.isArray(body.host_emails)
    ? (body.host_emails as unknown[]).map(String).filter(Boolean)
    : [];
  const limit = Math.min(MAX_LIMIT, Math.max(5, Number(body.limit) || DEFAULT_LIMIT));

  let q = supabase
    .from("fathom_calls")
    .select("title, recording_start, host_name, host_email, summary, action_items")
    .not("summary", "is", null)
    .order("recording_start", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (hostEmails.length) q = q.in("host_email", hostEmails);

  const { data, error } = await q;
  if (error) return json({ ok: false, reason: error.message }, 500);

  const rows = (data ?? []).filter(r => (r.summary as string)?.trim());
  if (rows.length < 2) {
    return json({ ok: false, reason: "Not enough summarized calls to draw insights yet. Open a few calls (or hit Sync) so summaries generate, then try again." }, 422);
  }

  const { insights, error: aiError } = await generate(rows);
  if (!insights) return json({ ok: false, reason: aiError || "AI insights are unavailable right now." }, 502);

  return json({ ok: true, count: rows.length, ...insights });
});

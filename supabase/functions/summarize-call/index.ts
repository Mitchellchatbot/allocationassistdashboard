/**
 * summarize-call — generate an AI summary + action items for a recorded call.
 *
 * Fathom gives us the transcript but not always a summary, so we generate one
 * from the transcript with Claude and persist it back onto the fathom_calls
 * row. Idempotent: a call that already has a summary is returned as-is (no
 * second spend) unless { force: true } is passed.
 *
 * Endpoint:  POST /functions/v1/summarize-call
 * Body:      { fathom_id?: string, call_id?: string, force?: boolean }
 * Auth:      verify_jwt (called from the authenticated dashboard). Writes use
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

// Big enough to capture an entire ~40-min call most of the time; caps cost on
// the rare monster transcript.
const MAX_TRANSCRIPT_CHARS = 48_000;

function transcriptText(row: Record<string, unknown>): string {
  const plain = typeof row.transcript_plaintext === "string" ? row.transcript_plaintext : "";
  if (plain.trim()) return plain;
  const segs = Array.isArray(row.transcript_segments) ? row.transcript_segments : [];
  return segs
    .map((s) => {
      const o = (s ?? {}) as { speaker?: string; text?: string };
      return o.text ? `${o.speaker ? o.speaker + ": " : ""}${o.text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

interface AiResult { summary: string; action_items: string[] }

async function generate(title: string, host: string, transcript: string): Promise<AiResult | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const clipped = transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n…[transcript truncated]"
    : transcript;

  const prompt =
`You are summarizing a recorded sales call for Allocation Assist, a medical recruitment agency that relocates Western-trained doctors into hospitals in the UAE, Saudi Arabia, and Qatar. The call is between a sales consultant${host ? ` (${host})` : ""} and a doctor (or a doctor's contact).

Write for a colleague who didn't attend the call. Produce:
1. "summary": 3 to 5 sentences covering who the doctor is and their situation, what they want, any concerns or objections raised, and how the call ended / what was agreed.
2. "action_items": concrete follow-ups that came out of the call (who needs to do what next). Use an empty array if there were none.

Return ONLY valid JSON in exactly this shape — no markdown fences, no preamble:
{"summary": "...", "action_items": ["...", "..."]}

Call title: ${title || "(untitled)"}

Transcript:
${clipped}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("[summarize-call] anthropic non-200:", res.status, await res.text());
      return null;
    }
    const j = await res.json() as { content?: { type: string; text?: string }[] };
    const raw = (j.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
    // Strip accidental ```json fences before parsing.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { summary?: string; action_items?: unknown };
    const summary = (parsed.summary ?? "").trim();
    if (!summary) return null;
    const items = Array.isArray(parsed.action_items)
      ? parsed.action_items.map(x => String(x).trim()).filter(Boolean)
      : [];
    return { summary, action_items: items };
  } catch (e) {
    console.error("[summarize-call] generate failed:", (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, reason: "POST only" }, 405);

  let body: { fathom_id?: string; call_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad json" }, 400); }

  const fathomId = body.fathom_id ?? null;
  const callId   = body.call_id ?? null;
  if (!fathomId && !callId) return json({ ok: false, reason: "fathom_id or call_id required" }, 400);

  let q = supabase
    .from("fathom_calls")
    .select("id, fathom_id, title, host_name, summary, action_items, transcript_plaintext, transcript_segments");
  q = fathomId ? q.eq("fathom_id", fathomId) : q.eq("id", callId);
  const { data: row, error } = await q.maybeSingle();
  if (error) return json({ ok: false, reason: error.message }, 500);
  if (!row)  return json({ ok: false, reason: "Call not found" }, 404);

  // Idempotent — don't re-spend on a call that already has a summary.
  if (!body.force && typeof row.summary === "string" && row.summary.trim()) {
    return json({ ok: true, summary: row.summary, action_items: row.action_items ?? [], cached: true });
  }

  const transcript = transcriptText(row);
  if (!transcript.trim()) return json({ ok: false, reason: "No transcript available for this call." }, 200);

  const ai = await generate(String(row.title ?? ""), String(row.host_name ?? ""), transcript);
  if (!ai) return json({ ok: false, reason: "Could not generate a summary (model unavailable or unparseable)." }, 502);

  // Store action items in the same shape the UI + Fathom use: [{ text }].
  const actionItems = ai.action_items.map(text => ({ text }));
  const { error: upErr } = await supabase
    .from("fathom_calls")
    .update({ summary: ai.summary, action_items: actionItems })
    .eq("id", row.id);
  if (upErr) return json({ ok: false, reason: upErr.message }, 500);

  return json({ ok: true, summary: ai.summary, action_items: actionItems });
});

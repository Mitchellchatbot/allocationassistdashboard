/**
 * chatbot-lead-detail — full detail for one chatbot lead, for the dashboard.
 *
 * Pulls the chatbot's captured visitor record + conversation transcript (via
 * partner-lead-detail), enriches with this org's Zoho status (Lead_Status,
 * owner, converted-to-Doctor-on-Board, hospital) by matching email/phone/name,
 * and AI-summarises the conversation.
 *
 * POST { visitor_id }  ·  Auth: verify_jwt (browser-invoked).
 * Secrets: CHATBOT_PARTNER_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHATBOT_REF = "oiigbvfzovhnuitprsjt";
const DETAIL_FN   = `https://${CHATBOT_REF}.supabase.co/functions/v1/partner-lead-detail`;
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const normEmail = (s: unknown) => (typeof s === "string" ? s : "").trim().toLowerCase();
const normPhone = (s: unknown) => (typeof s === "string" ? s : "").replace(/\D/g, "");
const normName  = (f: unknown, l: unknown) => `${(typeof f === "string" ? f : "").trim().toLowerCase()} ${(typeof l === "string" ? l : "").trim().toLowerCase()}`.trim();
const splitName = (full: string) => { const p = full.trim().split(/\s+/); return { f: p[0] ?? "", l: p.slice(1).join(" ") }; };

interface Msg { sender_type: string; content: string; created_at: string }

async function aiSummary(visitor: Record<string, unknown>, messages: Msg[]): Promise<{ summary: string; facts: string[] } | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key || messages.length === 0) return null;
  const transcript = messages.map(m => `${m.sender_type === "visitor" ? "Doctor" : "Assistant"}: ${m.content}`).join("\n").slice(0, 12000);
  const prompt = `This is a chat between a doctor and the Allocation Assist website assistant (which places doctors into Gulf hospital jobs). Summarise it for the sales team.
Doctor: ${visitor.name ?? "?"}${visitor.specialty ? `, ${visitor.specialty}` : ""}${visitor.country ? `, trained in ${visitor.country}` : ""}.
Respond with ONLY JSON (no fences): {"summary":"2-3 sentences: what they want, their situation, and whether they seem qualified/serious","facts":["3-4 short key facts captured in the chat — specialty, location, timeline, intent, any objection"]}.
Output JSON only.

TRANSCRIPT:
${transcript}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const j = await res.json() as { content?: { type: string; text?: string }[] };
    let raw = (j.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
    const p = JSON.parse(raw) as { summary?: string; facts?: unknown };
    return {
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
      facts:   Array.isArray(p.facts) ? p.facts.map(x => String(x).trim()).filter(Boolean).slice(0, 6) : [],
    };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, reason: "POST only" }, 405);

  let body: { visitor_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const visitorId = (body.visitor_id ?? "").trim();
  if (!visitorId) return json({ ok: false, reason: "visitor_id required" }, 400);

  const partnerKey = Deno.env.get("CHATBOT_PARTNER_KEY") ?? "";
  if (!partnerKey) return json({ ok: false, reason: "CHATBOT_PARTNER_KEY not set" }, 500);

  // 1. Chatbot detail (visitor + transcript).
  let detail: { visitor: Record<string, unknown>; messages: Msg[]; conversationStatus: string | null };
  try {
    const res = await fetch(DETAIL_FN, {
      method: "POST",
      headers: { "x-partner-key": partnerKey, "content-type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return json({ ok: false, reason: `chatbot detail failed: ${j.reason || res.status}` }, 502);
    detail = { visitor: j.visitor ?? {}, messages: (j.messages ?? []) as Msg[], conversationStatus: j.conversationStatus ?? null };
  } catch (e) {
    return json({ ok: false, reason: `chatbot unreachable: ${(e as Error).message}` }, 502);
  }

  const v = detail.visitor;
  const e = normEmail(v.email), p = normPhone(v.phone), n = normName(splitName(String(v.name ?? "")).f, splitName(String(v.name ?? "")).l);

  // 2. Zoho enrichment from the cache (leads = id1, DoB = id2).
  const [r1, r2] = await Promise.all([
    supabase.from("zoho_cache").select("data").eq("id", 1).maybeSingle(),
    supabase.from("zoho_cache").select("data").eq("id", 2).maybeSingle(),
  ]);
  const leads = (((r1.data?.data as Record<string, unknown>)?.leads) ?? []) as Array<Record<string, unknown>>;
  const dob   = (((r2.data?.data as Record<string, unknown>)?.doctorsOnBoard) ?? []) as Array<Record<string, unknown>>;

  const matches = (row: Record<string, unknown>) => {
    const re = normEmail(row.Email), rp = normPhone(row.Phone ?? row.Mobile), rn = normName(row.First_Name, row.Last_Name);
    return (!!e && re === e) || (!!p && rp === p) || (!!n && rn === n);
  };
  const lead = leads.find(matches);
  const dobRow = dob.find(matches);

  const zoho = {
    inZoho:      !!lead || !!dobRow,
    leadStatus:  (lead?.Lead_Status as string) ?? null,
    leadSource:  (lead?.Lead_Source as string) ?? (dobRow?.Lead_Source as string) ?? null,
    owner:       ((lead?.Owner as Record<string, string>)?.name) ?? ((dobRow?.Owner as Record<string, string>)?.name) ?? null,
    converted:   !!dobRow,
    hospital:    ((dobRow?.Account_Name as Record<string, string>)?.name) ?? null,
    convertedAt: (dobRow?.Created_Time as string) ?? null,
  };

  const ai = await aiSummary(v, detail.messages);

  return json({
    ok: true,
    visitor: v,
    conversationStatus: detail.conversationStatus,
    messages: detail.messages,
    zoho,
    ai,
  });
});

/**
 * chatbot-stats — chatbot (Care Assist) lead + conversion stats for the dashboard.
 *
 * Pulls the chatbot's exported leads from ITS Supabase (via the partner-leads
 * function, shared-secret auth), then matches them against this org's Doctors
 * on Board (the conversion metric, from zoho_cache) by email / phone / name.
 * Computes leads / conversions / rate / qualified + a monthly trend + a recent
 * list, all scoped to a date range (by the lead's exported_at).
 *
 * Endpoint: POST /functions/v1/chatbot-stats  { from?: ISO, to?: ISO }
 * Auth: verify_jwt (browser-invoked). Secrets: CHATBOT_PARTNER_KEY,
 *       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHATBOT_REF = "oiigbvfzovhnuitprsjt";  // Care Assist Supabase project (not secret)
const CHATBOT_FN  = `https://${CHATBOT_REF}.supabase.co/functions/v1/partner-leads`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const normEmail = (s: unknown) => (typeof s === "string" ? s : "").trim().toLowerCase();
const normPhone = (s: unknown) => (typeof s === "string" ? s : "").replace(/\D/g, "");
const normName  = (f: unknown, l: unknown) =>
  `${(typeof f === "string" ? f : "").trim().toLowerCase()} ${(typeof l === "string" ? l : "").trim().toLowerCase()}`.trim();

interface CbLead {
  name: string | null; email: string | null; phone: string | null;
  specialty: string | null; qualified: boolean | null; exported_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, reason: "POST only" }, 405);

  let body: { from?: string; to?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  // Default window: last 12 months.
  const now = new Date();
  const to   = body.to   ? new Date(body.to)   : now;
  const from = body.from ? new Date(body.from) : new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const partnerKey = Deno.env.get("CHATBOT_PARTNER_KEY") ?? "";
  if (!partnerKey) return json({ ok: false, reason: "CHATBOT_PARTNER_KEY not set" }, 500);

  // 1. Pull the chatbot's exported leads.
  let cbLeads: CbLead[] = [];
  try {
    const res = await fetch(CHATBOT_FN, {
      method: "POST",
      headers: { "x-partner-key": partnerKey, "content-type": "application/json" },
      body: JSON.stringify({}),  // pull all; we window client-side for trend accuracy
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) return json({ ok: false, reason: `chatbot fetch failed: ${j.reason || res.status}` }, 502);
    cbLeads = (j.leads ?? []) as CbLead[];
  } catch (e) {
    return json({ ok: false, reason: `chatbot unreachable: ${(e as Error).message}` }, 502);
  }

  // 2. Load Doctors on Board (conversions) from this org's cache (row id=2).
  const { data: cacheRow } = await supabase.from("zoho_cache").select("data").eq("id", 2).maybeSingle();
  const dob = ((cacheRow?.data as Record<string, unknown>)?.doctorsOnBoard ?? []) as Array<Record<string, unknown>>;
  const dobEmail = new Set<string>(), dobPhone = new Set<string>(), dobName = new Set<string>();
  for (const d of dob) {
    const e = normEmail(d.Email); if (e) dobEmail.add(e);
    const p = normPhone(d.Phone ?? d.Mobile); if (p) dobPhone.add(p);
    const n = normName(d.First_Name, d.Last_Name); if (n) dobName.add(n);
  }
  const isConverted = (l: CbLead) => {
    const e = normEmail(l.email), p = normPhone(l.phone);
    let f = "", last = "";
    if (l.name) { const parts = l.name.trim().split(/\s+/); f = parts[0] ?? ""; last = parts.slice(1).join(" "); }
    const n = normName(f, last);
    return (!!e && dobEmail.has(e)) || (!!p && dobPhone.has(p)) || (!!n && dobName.has(n));
  };

  // 3. Window by exported_at + compute.
  const inRange = cbLeads.filter(l => {
    const t = new Date(l.exported_at).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });

  let conversions = 0, qualified = 0;
  for (const l of inRange) {
    if (l.qualified) qualified++;
    if (isConverted(l)) conversions++;
  }
  const leadsCount = inRange.length;
  const conversionRate = leadsCount > 0 ? +(100 * conversions / leadsCount).toFixed(1) : 0;

  // Monthly trend across the window.
  const monthKeys: string[] = [];
  {
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= end && monthKeys.length < 36) {
      monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  const idx = new Map(monthKeys.map((k, i) => [k, i]));
  const trend = monthKeys.map(month => ({ month, leads: 0, conversions: 0 }));
  for (const l of inRange) {
    const k = l.exported_at.slice(0, 7);
    const i = idx.get(k);
    if (i !== undefined) { trend[i].leads++; if (isConverted(l)) trend[i].conversions++; }
  }

  const recent = [...inRange]
    .sort((a, b) => new Date(b.exported_at).getTime() - new Date(a.exported_at).getTime())
    .slice(0, 15)
    .map(l => ({
      name:        l.name || "—",
      specialty:   l.specialty || "—",
      exported_at: l.exported_at,
      qualified:   !!l.qualified,
      converted:   isConverted(l),
    }));

  return json({
    ok: true,
    leads: leadsCount,
    conversions,
    conversionRate,
    qualified,
    trend,
    recent,
  });
});

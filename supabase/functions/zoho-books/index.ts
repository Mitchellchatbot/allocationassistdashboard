/**
 * zoho-books — pull actual revenue + expenses from Zoho Books for a date range.
 *
 * PLUG-AND-PLAY: this is fully wired but dormant until the four Zoho Books
 * secrets are set. With none set it returns { configured: false } and the
 * Finance page keeps showing its estimate. Add the secrets (below) and it
 * lights up automatically — no code change needed.
 *
 * Required Supabase secrets (set via `supabase secrets set …`):
 *   ZOHO_BOOKS_CLIENT_ID
 *   ZOHO_BOOKS_CLIENT_SECRET
 *   ZOHO_BOOKS_REFRESH_TOKEN     (self-client / OAuth refresh token with a
 *                                 ZohoBooks read scope, e.g. ZohoBooks.fullaccess.all)
 *   ZOHO_BOOKS_ORG_ID            (Zoho Books Organization ID)
 * Optional:
 *   ZOHO_BOOKS_DC                Data-center suffix: "com" (default), "eu",
 *                                "in", "sa", "com.au", "jp"… Match your account.
 *
 * Endpoint:  POST /functions/v1/zoho-books   body { from: ISO, to: ISO }
 * Returns:   { configured, ok, error?, currency, revenue, expenses, profit,
 *              outstanding, invoiceCount, expenseCount, byMonth[], byCategory[],
 *              expenseBreakdown[] (per-category, with drill-down txns) }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CID     = Deno.env.get("ZOHO_BOOKS_CLIENT_ID")     ?? "";
const SECRET  = Deno.env.get("ZOHO_BOOKS_CLIENT_SECRET") ?? "";
const REFRESH = Deno.env.get("ZOHO_BOOKS_REFRESH_TOKEN") ?? "";
const ORG     = Deno.env.get("ZOHO_BOOKS_ORG_ID")        ?? "";
const DC      = (Deno.env.get("ZOHO_BOOKS_DC") ?? "com").replace(/^\.+/, "");
const CONFIGURED = !!(CID && SECRET && REFRESH && ORG);

const ACCOUNTS_BASE = `https://accounts.zoho.${DC}`;
const API_BASE      = `https://www.zohoapis.${DC}/books/v3`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const ymd = (iso: string) => {
  // Accept ISO datetime or YYYY-MM-DD; return YYYY-MM-DD.
  const d = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
};
const monthKey = (date: string) => String(date).slice(0, 7); // YYYY-MM
const num = (v: unknown) => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n; };

// Zoho Books list endpoints return each document in its OWN currency (USD, GBP,
// SAR…) with an `exchange_rate` to the AED base — and an EMPTY `bcy_total`. So
// convert to base ourselves: base = amount × exchange_rate. The rate is
// AED-per-foreign-unit (USD→3.6725, GBP→4.94, SAR→0.98); AED docs have rate 1,
// and a missing/zero rate falls back to 1 so AED amounts pass through unchanged.
const baseAmt = (row: Record<string, unknown>, field = "total") =>
  num(row[field]) * (num(row.exchange_rate) || 1);

async function getAccessToken(): Promise<string | null> {
  const url = `${ACCOUNTS_BASE}/oauth/v2/token?refresh_token=${encodeURIComponent(REFRESH)}`
    + `&client_id=${encodeURIComponent(CID)}&client_secret=${encodeURIComponent(SECRET)}`
    + `&grant_type=refresh_token`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) { console.error("[zoho-books] token refresh failed:", res.status, await res.text()); return null; }
  const j = await res.json() as { access_token?: string; error?: string };
  if (j.error || !j.access_token) { console.error("[zoho-books] token error:", j.error); return null; }
  return j.access_token;
}

/** Page through a Zoho Books list endpoint and return every row of `listKey`. */
async function fetchAll(token: string, path: string, listKey: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ organization_id: ORG, per_page: "200", page: String(page), ...params });
    const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (!res.ok) { console.error(`[zoho-books] ${path} page ${page} failed:`, res.status, await res.text()); break; }
    const j = await res.json() as Record<string, unknown> & { page_context?: { has_more_page?: boolean } };
    const rows = Array.isArray(j[listKey]) ? j[listKey] as Record<string, unknown>[] : [];
    out.push(...rows);
    if (!j.page_context?.has_more_page) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ configured: CONFIGURED, ok: false, error: "POST only" }, 405);

  if (!CONFIGURED) return json({ configured: false, ok: false });

  let body: { from?: string; to?: string; action?: string };
  try { body = await req.json(); } catch { body = {}; }

  const token = await getAccessToken();
  if (!token) return json({ configured: true, ok: false, error: "Could not authenticate with Zoho Books (check the refresh token / client credentials / data center)." }, 502);

  // ── action=invoices: flat list of ALL invoices (all-time) with customer
  //    info, so the dashboard can map each doctor (customer) to their billing.
  if (body.action === "invoices") {
    try {
      const invs = await fetchAll(token, "invoices", "invoices", {});
      return json({
        configured: true, ok: true,
        invoices: invs.map(i => ({
          date:     String(i.date ?? ""),
          number:   String(i.invoice_number ?? ""),
          customer: String(i.customer_name ?? ""),
          customerId: String(i.customer_id ?? ""),
          total:    num(i.total),
          balance:  num(i.balance),
          status:   String(i.status ?? ""),
        })),
      });
    } catch (e) {
      return json({ configured: true, ok: false, error: (e as Error).message }, 500);
    }
  }

  const from = ymd(body.from ?? "");
  const to   = ymd(body.to ?? "");
  if (!from || !to) return json({ configured: true, ok: false, error: "from/to (YYYY-MM-DD) required" }, 400);

  try {
    const dateParams = { date_start: from, date_end: to };
    const [invoices, expenses, bills] = await Promise.all([
      fetchAll(token, "invoices", "invoices", dateParams),
      fetchAll(token, "expenses", "expenses", dateParams),
      // Most marketing spend is booked as BILLS to vendors (Scaled AI,
      // LinkedIn, GoHire, Meta…), not expenses — so the channel attribution
      // needs them. Vendor name is the channel signal.
      fetchAll(token, "bills", "bills", dateParams),
    ]);

    const byMonth: Record<string, { month: string; revenue: number; expenses: number }> = {};
    const bump = (m: string) => (byMonth[m] ??= { month: m, revenue: 0, expenses: 0 });
    // Per-DAY buckets too, so the dashboard's Daily / Weekly digest can be
    // sourced from Books (the monthly buckets can't be split back to days).
    const byDayMap: Record<string, { date: string; revenue: number; expenses: number }> = {};
    const bumpDay = (d: string) => (byDayMap[d] ??= { date: d, revenue: 0, expenses: 0 });

    // Everything is converted to the AED base currency below, so the reported
    // currency is always AED (the org base). Don't read it off individual
    // invoices — a USD/GBP/SAR invoice would otherwise mislabel the whole panel.
    let revenue = 0, outstanding = 0;
    const currency = "AED";
    for (const inv of invoices) {
      const total = baseAmt(inv);
      revenue     += total;
      outstanding += baseAmt(inv, "balance");
      const date   = String(inv.date ?? "");
      bump(monthKey(date)).revenue += total;
      if (date) bumpDay(date.slice(0, 10)).revenue += total;
    }

    // Marketing/advertising transactions, returned so the dashboard can
    // attribute spend to a channel by reading the account / reference /
    // description text (the only place the channel is recorded — e.g. a bank
    // line "FACEBK *…FB.ME/ADS" or reference "Facebook - No Invoice").
    const CHANNEL_RE = /market|advertis|\bads?\b|digital|media|promo|facebook|instagram|fb\.me|facebk|\bmeta\b|google\s*ad|adwords|linkedin|tiktok|snap|youtube|twitter|whatsapp|influencer|\bseo\b/i;
    const marketingTxns: { date: string; amount: number; text: string }[] = [];

    const byCategoryMap: Record<string, number> = {};
    // Per-category expense detail for the Operating Expense Breakdown table —
    // category (account name, e.g. "Salaries & Wages", "Rent", "Software") →
    // running total, transaction count, and its individual transactions so the
    // dashboard can drill into each one.
    const expenseDetail: Record<string, { amount: number; count: number; txns: { date: string; amount: number; text: string }[] }> = {};
    let expenseTotal = 0;
    for (const e of expenses) {
      const total = baseAmt(e);
      expenseTotal += total;
      const cat = (e.account_name as string) || (e.category_name as string) || "Uncategorized";
      byCategoryMap[cat] = (byCategoryMap[cat] ?? 0) + total;
      const date = String(e.date ?? "");
      bump(monthKey(date)).expenses += total;
      if (date) bumpDay(date.slice(0, 10)).expenses += total;

      const detail = (expenseDetail[cat] ??= { amount: 0, count: 0, txns: [] });
      detail.amount += total;
      detail.count  += 1;
      detail.txns.push({
        date: date.slice(0, 10),
        amount: total,
        text: String(e.description ?? e.vendor_name ?? e.reference_number ?? "").replace(/\s+/g, " ").trim(),
      });

      const text = `${e.account_name ?? ""} | ${e.reference_number ?? ""} | ${e.description ?? ""}`.replace(/\s+/g, " ").trim();
      if (CHANNEL_RE.test(text)) marketingTxns.push({ date: date.slice(0, 10), amount: total, text });
    }

    // Bills → channel candidates. The VENDOR is the channel signal, so include
    // every bill (the dashboard maps vendor → channel and ignores non-marketing
    // vendors). Use the base-currency total (bcy_total) so USD vendors like
    // "Scaled AI LLC" convert to AED.
    for (const b of bills) {
      const date = String(b.date ?? "").slice(0, 10);
      if (!date) continue;
      const amount = baseAmt(b);
      const text = `${b.vendor_name ?? ""} | ${b.reference_number ?? ""} | ${b.description ?? ""}`.replace(/\s+/g, " ").trim();
      marketingTxns.push({ date, amount, text });
    }
    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

    const byCategory = Object.entries(byCategoryMap)
      .map(([name, amount]) => ({ name, amount: +amount.toFixed(2) }))
      .sort((a, b) => b.amount - a.amount);
    // Full per-category expense breakdown with drill-down transactions.
    const expenseBreakdown = Object.entries(expenseDetail)
      .map(([category, v]) => ({
        category,
        amount: +v.amount.toFixed(2),
        count: v.count,
        txns: v.txns.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 250),
      }))
      .sort((a, b) => b.amount - a.amount);
    const byMonthArr = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

    return json({
      configured:   true,
      ok:           true,
      currency,
      revenue:      +revenue.toFixed(2),
      expenses:     +expenseTotal.toFixed(2),
      profit:       +(revenue - expenseTotal).toFixed(2),
      outstanding:  +outstanding.toFixed(2),
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      byMonth:      byMonthArr,
      byDay,
      byCategory,
      expenseBreakdown,
      marketingTxns,
    });
  } catch (e) {
    console.error("[zoho-books] fetch failed:", (e as Error).message);
    return json({ configured: true, ok: false, error: (e as Error).message }, 500);
  }
});

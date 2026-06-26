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

/** Calendar months (YYYY-MM + start/end dates) spanned by a from→to range. */
function monthsBetween(from: string, to: string): { key: string; start: string; end: string }[] {
  const out: { key: string; start: string; end: string }[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const key  = `${y}-${String(m).padStart(2, "0")}`;
    const last = new Date(y, m, 0).getDate(); // last day of 1-based month m
    out.push({ key, start: `${key}-01`, end: `${key}-${String(last).padStart(2, "0")}` });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// Zoho Books list endpoints return each document in its OWN currency (USD, GBP,
// SAR…) with an `exchange_rate` to the AED base — and an EMPTY `bcy_total`. So
// convert to base ourselves: base = amount × exchange_rate. The rate is
// AED-per-foreign-unit (USD→3.6725, GBP→4.94, SAR→0.98); AED docs have rate 1,
// and a missing/zero rate falls back to 1 so AED amounts pass through unchanged.
const baseAmt = (row: Record<string, unknown>, field = "total") =>
  num(row[field]) * (num(row.exchange_rate) || 1);

// Cache the access token across invocations on a warm instance. Zoho throttles
// token GENERATION (refreshing on every request trips it and the whole panel
// then shows "could not authenticate"), so reuse a token until it's near expiry.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;
  const url = `${ACCOUNTS_BASE}/oauth/v2/token?refresh_token=${encodeURIComponent(REFRESH)}`
    + `&client_id=${encodeURIComponent(CID)}&client_secret=${encodeURIComponent(SECRET)}`
    + `&grant_type=refresh_token`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    console.error("[zoho-books] token refresh failed:", res.status, await res.text());
    // If a refresh fails but we still hold a non-expired token, keep using it.
    if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;
    return null;
  }
  const j = await res.json() as { access_token?: string; error?: string; expires_in?: number };
  if (j.error || !j.access_token) { console.error("[zoho-books] token error:", j.error); return null; }
  cachedToken = { token: j.access_token, expiresAt: now + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

// ── Zoho's official Profit & Loss report (accrual) ─────────────────────────
// The dashboard previously summed invoice/expense RECORDS itself, which missed
// vendor bills and journal entries — so revenue, expenses and per-account
// figures (e.g. Salaries) didn't match Zoho's P&L. We now read the report
// directly so everything ties out to Zoho exactly.
interface PLNode { name?: string; total?: number; account_transactions?: PLNode[] }
interface PLAccount { name: string; total: number }

function findPLNode(nodes: PLNode[], name: string): PLNode | null {
  for (const n of nodes) {
    if (n.name === name) return n;
    if (n.account_transactions) { const f = findPLNode(n.account_transactions, name); if (f) return f; }
  }
  return null;
}

async function fetchPnL(token: string, from: string, to: string): Promise<{ revenue: number; expenses: number; expenseAccounts: PLAccount[] } | null> {
  const url = `${API_BASE}/reports/profitandloss?organization_id=${ORG}&from_date=${from}&to_date=${to}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (!res.ok) { console.error("[zoho-books] P&L report failed:", res.status, await res.text()); return null; }
  const j = await res.json() as { profit_and_loss?: PLNode[] };
  const pl = j.profit_and_loss ?? [];
  let revenue = 0;
  for (const nm of ["Operating Income", "Non Operating Income", "Other Income"]) {
    const n = findPLNode(pl, nm); if (n) revenue += num(n.total);
  }
  let expenses = 0;
  const expenseAccounts: PLAccount[] = [];
  for (const nm of ["Cost of Goods Sold", "Operating Expense", "Non Operating Expense", "Other Expense"]) {
    const n = findPLNode(pl, nm);
    if (!n) continue;
    expenses += num(n.total);
    for (const a of n.account_transactions ?? []) if (a.name) expenseAccounts.push({ name: String(a.name), total: num(a.total) });
  }
  return { revenue: +revenue.toFixed(2), expenses: +expenses.toFixed(2), expenseAccounts };
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

  // ── action=bills: read-only dump of vendor bills in a date range, for
  //    auditing (e.g. checking Scaled AI bills for duplicates). TEMP/debug.
  if (body.action === "bills") {
    try {
      const f = ymd(body.from ?? ""); const t = ymd(body.to ?? "");
      const params = f && t ? { date_start: f, date_end: t } : {};
      const bs = await fetchAll(token, "bills", "bills", params);
      return json({
        configured: true, ok: true,
        bills: bs.map(b => ({
          date:      String(b.date ?? ""),
          number:    String(b.bill_number ?? ""),
          reference: String(b.reference_number ?? ""),
          vendor:    String(b.vendor_name ?? ""),
          status:    String(b.status ?? ""),
          currency:  String(b.currency_code ?? ""),
          total:     num(b.total),
          rate:      num(b.exchange_rate) || 1,
          base:      baseAmt(b),
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
    const [invoices, expenses, bills, pnl, allInvoices] = await Promise.all([
      fetchAll(token, "invoices", "invoices", dateParams),
      fetchAll(token, "expenses", "expenses", dateParams),
      // Most marketing spend is booked as BILLS to vendors (Scaled AI,
      // LinkedIn, GoHire, Meta…), not expenses — so the channel attribution
      // needs them. Vendor name is the channel signal.
      fetchAll(token, "bills", "bills", dateParams),
      // Authoritative income / expenses / per-account totals (incl. bills &
      // journals) — so the headline numbers tie out to Zoho's P&L.
      fetchPnL(token, from, to),
      // ALL invoices, all-time — for the Outstanding (receivables) snapshot.
      // Receivables is a point-in-time balance, NOT a period flow, so it must
      // not be date-scoped; this matches Zoho's "Total Receivables" widget.
      fetchAll(token, "invoices", "invoices", {}),
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
    let revenue = 0;
    const currency = "AED";
    for (const inv of invoices) {
      const total = baseAmt(inv);
      revenue     += total;
      const date   = String(inv.date ?? "");
      bump(monthKey(date)).revenue += total;
      if (date) bumpDay(date.slice(0, 10)).revenue += total;
    }
    // Outstanding = receivables snapshot = open balance of every SENT invoice,
    // all-time (paid ones carry a 0 balance). NOT period-scoped, and DRAFT/VOID
    // invoices are excluded (they're not real receivables) — so this matches
    // Zoho's "Total Receivables" widget.
    let outstanding = 0;
    for (const inv of allInvoices) {
      const st = String(inv.status ?? "").toLowerCase();
      if (st === "draft" || st === "void") continue;
      outstanding += baseAmt(inv, "balance");
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

    // ── Scaled AI correction (standing rule) ──────────────────────────────
    // Zoho's Bills list double-enters Scaled AI bills (the same bill once in
    // AED, once tagged "USD" ×3.6725), and some months carry EXTRA Scaled-AI
    // bills beyond the single monthly retainer. Zoho's P&L already drops the
    // inflated USD twins, but per the finance owner ONLY the one monthly
    // retainer is a real cost — any additional same-month Scaled-AI bill is
    // treated as suspect (duplicate / mis-entry) and removed. Rule: dedupe by
    // bill number (keeping the AED copy, which is what the P&L counted), then
    // keep the largest Scaled-AI bill per month (the retainer) and subtract the
    // rest from expenses.
    const SCALED_RE = /scaled\s*ai/i;
    const scaledExcessByMonth: Record<string, number> = {};
    {
      const deduped = new Map<string, { month: string; base: number; rate: number }>();
      for (const b of bills) {
        if (!SCALED_RE.test(String(b.vendor_name ?? ""))) continue;
        const date = String(b.date ?? "").slice(0, 10);
        if (!date) continue;
        const no   = String(b.bill_number ?? b.reference_number ?? date);
        const rate = num(b.exchange_rate) || 1;
        const prev = deduped.get(no);
        if (!prev || rate < prev.rate) deduped.set(no, { month: monthKey(date), base: baseAmt(b), rate });
      }
      const perMonth: Record<string, number[]> = {};
      for (const d of deduped.values()) (perMonth[d.month] ??= []).push(d.base);
      for (const [mk, arr] of Object.entries(perMonth)) {
        arr.sort((a, b) => b - a);
        const excess = arr.slice(1).reduce((s, v) => s + v, 0); // everything except the retainer
        if (excess > 0.005) scaledExcessByMonth[mk] = +excess.toFixed(2);
      }
    }
    const scaledExcessTotal = +Object.values(scaledExcessByMonth).reduce((s, v) => s + v, 0).toFixed(2);

    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

    // Record-based expense breakdown (with per-txn detail) — used only as the
    // fallback if the P&L report is unavailable.
    const recordBreakdown = Object.entries(expenseDetail)
      .map(([category, v]) => ({
        category,
        amount: +v.amount.toFixed(2),
        count: v.count,
        txns: v.txns.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 250),
      }))
      .sort((a, b) => b.amount - a.amount);

    // Headline revenue/expenses/profit + the per-account breakdown come from
    // Zoho's P&L report (matches Zoho exactly — includes bills + journals).
    // Per-transaction detail is attached from the expense records where the
    // account name matches; salary-type accounts booked via journals show
    // fewer line items than their P&L total.
    const txnByCat = new Map(Object.entries(expenseDetail).map(([cat, v]) => [cat, v.txns.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 250)]));
    const rptRevenue  = pnl ? pnl.revenue  : +revenue.toFixed(2);
    // The suspect Scaled-AI excess only exists in the P&L (bills), so the cut is
    // applied against the P&L figures, not the expense-record fallback.
    const scaledCut   = pnl ? scaledExcessTotal : 0;
    const rptExpenses = +((pnl ? pnl.expenses : expenseTotal) - scaledCut).toFixed(2);
    const SCALED_ACCOUNT = "Website design & maintenance"; // GL account Scaled AI is booked to
    const expenseBreakdown = pnl
      ? pnl.expenseAccounts
          .filter(a => a.total > 0)
          .map(a => {
            const txns = txnByCat.get(a.name) ?? [];
            // Strip the suspect Scaled-AI excess from its account so the graph
            // + breakdown reconcile with the corrected expense total.
            const amount = a.name === SCALED_ACCOUNT ? +(a.total - scaledCut).toFixed(2) : +a.total.toFixed(2);
            return { category: a.name, amount, count: txns.length, txns };
          })
          .filter(a => a.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      : recordBreakdown;
    const byCategory = expenseBreakdown.map(c => ({ name: c.category, amount: c.amount }));

    // Accurate per-month P&L (one report call per month) so the Digest trend +
    // the monthly mini-bars tie out to Zoho. Capped to keep the call count
    // sane; beyond that we fall back to the record-summed monthly buckets.
    // Zoho rate-limits concurrent report calls, so run at most a few at a time
    // and re-fetch any that got throttled (null) sequentially — otherwise some
    // months silently come back 0.
    const monthList = monthsBetween(from, to);
    let byMonthArr: { month: string; revenue: number; expenses: number }[];
    if (pnl && monthList.length <= 13) {
      const res: ({ revenue: number; expenses: number } | null)[] = new Array(monthList.length).fill(null);
      let next = 0;
      const worker = async () => { while (next < monthList.length) { const i = next++; res[i] = await fetchPnL(token, monthList[i].start, monthList[i].end); } };
      await Promise.all(Array.from({ length: Math.min(3, monthList.length) }, worker));
      for (let i = 0; i < monthList.length; i++) if (!res[i]) res[i] = await fetchPnL(token, monthList[i].start, monthList[i].end);
      byMonthArr = monthList.map((mo, i) => ({ month: mo.key, revenue: res[i]?.revenue ?? 0, expenses: res[i]?.expenses ?? 0 }));
      // Strip the suspect Scaled-AI excess from each month too, so the Digest
      // trend + the per-day scaling below match the corrected period total.
      for (const m of byMonthArr) { const cut = scaledExcessByMonth[m.month]; if (cut) m.expenses = +(m.expenses - cut).toFixed(2); }

      // Tie the per-DAY records to each month's report total so the daily/weekly
      // Digest reconciles with the monthly P&L (records miss bills + journals).
      // Revenue records already match (accrual = invoice date); expenses get
      // scaled, and a month booked entirely off-record (journals) is spread
      // evenly across its days.
      const recMonth: Record<string, { revenue: number; expenses: number }> = {};
      const daysOf: Record<string, typeof byDay> = {};
      for (const d of byDay) {
        const mk = d.date.slice(0, 7);
        (recMonth[mk] ??= { revenue: 0, expenses: 0 });
        recMonth[mk].revenue += d.revenue; recMonth[mk].expenses += d.expenses;
        (daysOf[mk] ??= []).push(d);
      }
      for (const m of byMonthArr) {
        const rec = recMonth[m.month]; const days = daysOf[m.month];
        if (!days?.length || !rec) continue;
        if (rec.revenue > 0) { const f = m.revenue / rec.revenue; for (const d of days) d.revenue = +(d.revenue * f).toFixed(2); }
        if (rec.expenses > 0) { const f = m.expenses / rec.expenses; for (const d of days) d.expenses = +(d.expenses * f).toFixed(2); }
        else if (m.expenses > 0) { const per = +(m.expenses / days.length).toFixed(2); for (const d of days) d.expenses = per; }
      }
    } else {
      byMonthArr = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    }

    return json({
      configured:   true,
      ok:           true,
      currency,
      revenue:      rptRevenue,
      expenses:     rptExpenses,
      profit:       +(rptRevenue - rptExpenses).toFixed(2),
      outstanding:  +outstanding.toFixed(2),
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      byMonth:      byMonthArr,
      byDay,
      byCategory,
      expenseBreakdown,
      marketingTxns,
      scaledAiCorrection: scaledCut, // suspect Scaled-AI excess removed from expenses
    });
  } catch (e) {
    console.error("[zoho-books] fetch failed:", (e as Error).message);
    return json({ configured: true, ok: false, error: (e as Error).message }, 500);
  }
});

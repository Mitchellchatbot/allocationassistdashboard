/**
 * FinanceDigest — Daily / Weekly / Monthly breakdown of revenue, spend, and
 * profit. Spend is bucketed from the dated marketing-expense rows; revenue is
 * the per-conversion estimate (× Doctors-on-Board in the bucket) until Zoho
 * Books is connected. A chart + a per-period table.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useFilters } from "@/lib/filters";
import { useCurrency } from "@/lib/CurrencyProvider";
import { REVENUE_PER_CONVERSION_AED } from "@/lib/revenue";
import { GranularityToggle } from "@/components/GranularityToggle";
import { bucketKey, bucketLabel, parseDate, type Granularity } from "@/lib/time-buckets";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";

interface DigestRow { key: string; label: string; revenue: number; spend: number; profit: number; cumulative: number; conversions: number; projRevenue: number; }

export function FinanceDigest() {
  const { rows: expenseRows } = useMarketingExpenses();
  const { data: zoho } = useZohoData();
  const { dateRange } = useFilters();
  const { data: books, isLoading: booksLoading } = useZohoBooks(dateRange);
  const { fmt, fromAED } = useCurrency();
  const [gran, setGran] = useState<Granularity>("month");

  const fromMs = dateRange.from.getTime();
  const toMs   = dateRange.to.getTime() + 86_400_000;

  // When Zoho Books is connected, revenue + spend are the REAL invoiced
  // revenue and full expenses (per-day, bucketed). Otherwise the estimate.
  const useBooks = !!(books?.configured && books?.ok && books?.byDay);

  const digest = useMemo<DigestRow[]>(() => {
    const map = new Map<string, DigestRow>();
    const get = (k: string): DigestRow => {
      let r = map.get(k);
      if (!r) { r = { key: k, label: bucketLabel(k, gran), revenue: 0, spend: 0, profit: 0, cumulative: 0, conversions: 0, projRevenue: 0 }; map.set(k, r); }
      return r;
    };
    // Conversions (operational placement count) — always from Zoho DoB.
    for (const dob of zoho?.rawDoctorsOnBoard ?? []) {
      const d = parseDate(dob.Created_Time);
      if (!d) continue;
      const t = d.getTime();
      if (t < fromMs || t >= toMs) continue;
      get(bucketKey(d, gran)).conversions += 1;
    }

    if (useBooks) {
      if (gran === "month") {
        // Monthly view: exact per-month P&L from Zoho's report (incl. bills +
        // journals) so it ties out to Zoho.
        for (const m of books!.byMonth ?? []) {
          const d = parseDate(`${m.month}-01`);
          if (!d) continue;
          const r = get(bucketKey(d, gran));
          r.revenue += m.revenue;
          r.spend   += m.expenses;
        }
      } else {
        // Day / week: finer than the P&L report supports, so these come from
        // dated invoice/expense records (a record-based trend).
        for (const day of books!.byDay ?? []) {
          const d = parseDate(day.date);
          if (!d) continue;
          const r = get(bucketKey(d, gran));
          r.revenue += day.revenue;
          r.spend   += day.expenses;
        }
      }
    } else {
      // Estimate: spend from the marketing sheet, revenue = conversions × fee.
      for (const e of expenseRows ?? []) {
        const d = parseDate(e.expense_date);
        if (d) get(bucketKey(d, gran)).spend += e.amount ?? 0;
      }
      for (const dob of zoho?.rawDoctorsOnBoard ?? []) {
        const d = parseDate(dob.Created_Time);
        if (!d) continue;
        const t = d.getTime();
        if (t < fromMs || t >= toMs) continue;
        get(bucketKey(d, gran)).revenue += REVENUE_PER_CONVERSION_AED;
      }
    }
    const out = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    // Running cumulative profit across the period, so the chart shows the
    // period's net building up to its end total.
    let run = 0;
    for (const r of out) {
      r.profit = r.revenue - r.spend; run += r.profit; r.cumulative = run;
      // Projected revenue (translucent bar): only in Books mode, and only for a
      // bucket that has NOT been invoiced yet (revenue === 0) but does have
      // placements — i.e. the current month, where the work is done but the
      // invoices lag. Shows the expected value from those conversions
      // (× the standard fee) so a not-yet-billed month isn't read as "£0 earned".
      // Never feeds profit/cumulative — those stay hard actuals.
      r.projRevenue = useBooks && r.revenue === 0 && r.conversions > 0
        ? r.conversions * REVENUE_PER_CONVERSION_AED
        : 0;
    }
    return out;
  }, [expenseRows, zoho, gran, fromMs, toMs, useBooks, books]);

  const totals = useMemo(
    () => digest.reduce((a, r) => ({
      revenue: a.revenue + r.revenue, spend: a.spend + r.spend,
      profit: a.profit + r.profit, conversions: a.conversions + r.conversions,
    }), { revenue: 0, spend: 0, profit: 0, conversions: 0 }),
    [digest],
  );

  const compact = (v: number) => {
    const x = fromAED(v), abs = Math.abs(x);
    if (abs >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${Math.round(x / 1_000)}K`;
    return String(Math.round(x));
  };

  // Wait for the Zoho Books query to settle before rendering — otherwise the
  // chart paints the estimate for a beat, then snaps to Books actuals (the
  // "graph changes when I load in" flicker).
  if (booksLoading) {
    return (
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold text-foreground">Digest</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-6">
          <div className="h-[288px] grid place-items-center text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading actuals from Zoho Books…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (digest.length === 0) return null;

  return (
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-[13px] font-semibold text-foreground">Digest</CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Revenue, spend &amp; P/L per {gran === "day" ? "day" : gran === "week" ? "week" : "month"} · {useBooks
                ? <span className="text-emerald-700 font-medium">actuals from Zoho Books</span>
                : "estimate until Zoho Books is connected"}
            </p>
            <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${totals.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {totals.profit >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              Cumulative P/L this period: {fmt(totals.profit)}
            </div>
          </div>
          <GranularityToggle value={gran} onChange={setGran} />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={288}>
          <ComposedChart data={digest} margin={{ top: 12, right: 12, left: -2, bottom: 4 }} barCategoryGap={gran === "day" ? "12%" : "28%"} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={gran === "day" ? "preserveStartEnd" : 0} minTickGap={4} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
            <Tooltip
              cursor={{ fill: "rgba(100,116,139,0.10)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                // Drop the projected series when it's 0 (every already-invoiced
                // month) so the tooltip doesn't read "Projected: AED 0".
                const rows = payload.filter(p => !(p.dataKey === "projRevenue" && !p.value));
                if (!rows.length) return null;
                return (
                  <div className="rounded-lg border border-border/60 bg-white/95 px-2.5 py-2 shadow-md text-[11px]">
                    <div className="font-semibold text-foreground mb-1">{label}</div>
                    {rows.map(p => (
                      <div key={p.dataKey as string} className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-muted-foreground">{p.name}</span>
                        <span className="ml-auto tabular-nums font-medium text-foreground">{fmt(Number(p.value) || 0)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar dataKey="revenue"     name="Revenue"           stackId="rev" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={gran === "day" ? 8 : 40} />
            {/* Projected revenue for an un-invoiced (current) month — translucent
                green, stacked on the revenue slot so it fills the same column. */}
            <Bar dataKey="projRevenue" name="Projected (conv.)"  stackId="rev" fill="#10b981" fillOpacity={0.22} stroke="#10b981" strokeOpacity={0.55} strokeDasharray="4 2" radius={[3, 3, 0, 0]} maxBarSize={gran === "day" ? 8 : 40} />
            <Bar dataKey="spend"       name="Spend"             fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={gran === "day" ? 8 : 40} />
            <Line dataKey="profit" name="Net P/L"  stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            {/* Cumulative P/L only on the monthly view — for day/week the net
                P/L line is smoother and easier to read (cumulative lives in the
                KPI chip above). */}
            {gran === "month" && (
              <Line dataKey="cumulative" name="Cumulative P/L" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead className="border-y border-border/60 bg-muted/30">
              <tr>
                {["Period", "Revenue", "Spend", "Net P/L", ...(gran === "month" ? ["Cumulative P/L"] : []), "Conv."].map((h, i) => (
                  <th key={h} className={`py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide ${i === 0 ? "" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {digest.map(r => (
                <tr key={r.key} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-2 px-3 font-medium">{r.label}</td>
                  {/* Un-invoiced (current) month: show the conversion-based
                      projection in muted italics so it's clearly not an actual. */}
                  {r.projRevenue > 0
                    ? <td className="py-2 px-3 text-right tabular-nums text-emerald-600/70 italic" title="Projected from this month's placements — not yet invoiced in Zoho Books">≈ {fmt(r.projRevenue)}<span className="not-italic text-muted-foreground/70 text-[10px]"> proj.</span></td>
                    : <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{fmt(r.revenue)}</td>}
                  <td className="py-2 px-3 text-right tabular-nums text-rose-700">{fmt(r.spend)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${r.profit >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmt(r.profit)}</td>
                  {gran === "month" && <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.cumulative >= 0 ? "text-violet-700" : "text-rose-700"}`}>{fmt(r.cumulative)}</td>}
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{r.conversions}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/60 font-semibold">
                <td className="py-2 px-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{fmt(totals.revenue)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-rose-700">{fmt(totals.spend)}</td>
                <td className={`py-2 px-3 text-right tabular-nums ${totals.profit >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmt(totals.profit)}</td>
                {gran === "month" && <td className={`py-2 px-3 text-right tabular-nums ${totals.profit >= 0 ? "text-violet-700" : "text-rose-700"}`}>{fmt(totals.profit)}</td>}
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{totals.conversions}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

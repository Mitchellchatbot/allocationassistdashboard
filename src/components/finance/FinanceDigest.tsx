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

interface DigestRow { key: string; label: string; revenue: number; spend: number; profit: number; conversions: number; }

export function FinanceDigest() {
  const { rows: expenseRows } = useMarketingExpenses();
  const { data: zoho } = useZohoData();
  const { dateRange } = useFilters();
  const { data: books } = useZohoBooks(dateRange);
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
      if (!r) { r = { key: k, label: bucketLabel(k, gran), revenue: 0, spend: 0, profit: 0, conversions: 0 }; map.set(k, r); }
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
      // Real revenue + expenses from Zoho Books, bucketed by day → gran.
      for (const day of books!.byDay ?? []) {
        const d = parseDate(day.date);
        if (!d) continue;
        const r = get(bucketKey(d, gran));
        r.revenue += day.revenue;
        r.spend   += day.expenses;
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
    for (const r of out) r.profit = r.revenue - r.spend;
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

  if (digest.length === 0) return null;

  return (
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-[13px] font-semibold text-foreground">Digest</CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Revenue, spend &amp; profit per {gran === "day" ? "day" : gran === "week" ? "week" : "month"} · {useBooks
                ? <span className="text-emerald-700 font-medium">actuals from Zoho Books</span>
                : "estimate until Zoho Books is connected"}
            </p>
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
            <Tooltip formatter={(v: number, n) => [fmt(v), n]} contentStyle={{ fontSize: 11, borderRadius: 8 }} cursor={{ fill: "rgba(100,116,139,0.10)" }} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={gran === "day" ? 8 : 40} />
            <Bar dataKey="spend"   name="Spend"   fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={gran === "day" ? 8 : 40} />
            <Line dataKey="profit" name="Profit"  stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead className="border-y border-border/60 bg-muted/30">
              <tr>
                {["Period", "Revenue", "Spend", "Profit", "Conv."].map((h, i) => (
                  <th key={h} className={`py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide ${i === 0 ? "" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {digest.map(r => (
                <tr key={r.key} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-2 px-3 font-medium">{r.label}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{fmt(r.revenue)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-rose-700">{fmt(r.spend)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${r.profit >= 0 ? "text-blue-700" : "text-rose-700"}`}>{fmt(r.profit)}</td>
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
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{totals.conversions}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

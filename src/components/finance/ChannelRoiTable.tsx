/**
 * ChannelRoiTable — per-channel Return on Investment, month by month.
 *
 * For each channel we can attribute (Meta, Website/SEO, Go Hire, LinkedIn) it
 * shows three rows — Spend, Profit and ROI — across every month of the
 * selected period plus a period total. Spend comes from the Monthly Marketing
 * Spend by Channel table; profit = revenue − spend, where revenue is the
 * invoiced total of the doctors who converted from that channel in the month.
 * ROI = profit ÷ spend (a percentage).
 */
import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/lib/CurrencyProvider";

export interface ChannelRoiMonth { key: string; spend: number; revenue: number; conversions: number; }
export interface ChannelRoiRow {
  channel:    string;
  perMonth:   ChannelRoiMonth[];
  totalSpend: number;
  totalRev:   number;
  totalConv:  number;
}

export function ChannelRoiTable({ months, rows }: {
  months: { key: string; label: string }[];
  rows: ChannelRoiRow[];
}) {
  const { fmt } = useCurrency();
  if (rows.length === 0 || months.length === 0) return null;

  // ROI = profit ÷ spend, as a percentage (profit = revenue − spend).
  const roiText = (rev: number, spend: number) => {
    if (spend <= 0) return "—";
    const pct = ((rev - spend) / spend) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  };
  const roiClass = (rev: number, spend: number) => {
    if (spend <= 0) return "text-muted-foreground/40";
    return rev - spend >= 0 ? "text-emerald-700" : "text-rose-700";
  };
  const byKey = (r: ChannelRoiRow, key: string) => r.perMonth.find(p => p.key === key);

  return (
    <Card className="shadow-md border-border/60 mb-5">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-[14px] font-semibold text-foreground">Return on Investment by Channel</CardTitle>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Spend vs. profit per month, per channel. <span className="text-rose-700/90">Spend</span> is from the table above;
          {" "}<span className="text-emerald-700">profit</span> = revenue − spend, where revenue is the invoiced total of the
          doctors who converted from that channel that month (the per-conversion estimate is used where they aren't invoiced
          yet). ROI = profit ÷ spend.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-3 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/40 border-y border-border/60">
            <tr>
              <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
              <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Metric</th>
              {months.map(m => (
                <th key={m.key} className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">{m.label}</th>
              ))}
              <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <Fragment key={r.channel}>
                {/* Spend */}
                <tr className="border-t-2 border-border/50 hover:bg-muted/20">
                  <td rowSpan={3} className="align-top py-3 px-5 text-[14px] font-semibold text-foreground border-r border-border/30">
                    <div>{r.channel}</div>
                    <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.totalSpend > 0 && r.totalRev - r.totalSpend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      ROI {roiText(r.totalRev, r.totalSpend)}
                    </div>
                    <div className="mt-1 text-[10px] font-normal text-muted-foreground">{r.totalConv} conv.</div>
                  </td>
                  <td className="py-2 px-3 text-[11px] text-muted-foreground">Spend</td>
                  {months.map(m => {
                    const v = byKey(r, m.key)?.spend ?? 0;
                    return <td key={m.key} className="py-2 px-3 text-[13px] text-right tabular-nums text-rose-700/90">{v > 0 ? `(${fmt(v)})` : <span className="text-muted-foreground/30">—</span>}</td>;
                  })}
                  <td className="py-2 px-5 text-[13px] text-right tabular-nums font-bold text-rose-700">({fmt(r.totalSpend)})</td>
                </tr>
                {/* Profit = revenue − spend */}
                <tr className="hover:bg-muted/20">
                  <td className="py-2 px-3 text-[11px] text-muted-foreground">Profit</td>
                  {months.map(m => {
                    const pm = byKey(r, m.key);
                    const rev = pm?.revenue ?? 0, spend = pm?.spend ?? 0;
                    if (rev === 0 && spend === 0) return <td key={m.key} className="py-2 px-3 text-[13px] text-right tabular-nums text-muted-foreground/30">—</td>;
                    const profit = rev - spend;
                    return <td key={m.key} className={`py-2 px-3 text-[13px] text-right tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{profit < 0 ? `(${fmt(Math.abs(profit))})` : fmt(profit)}</td>;
                  })}
                  {(() => {
                    const profit = r.totalRev - r.totalSpend;
                    return <td className={`py-2 px-5 text-[13px] text-right tabular-nums font-bold ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{profit < 0 ? `(${fmt(Math.abs(profit))})` : fmt(profit)}</td>;
                  })()}
                </tr>
                {/* ROI */}
                <tr className="border-b border-border/40 hover:bg-muted/20">
                  <td className="py-2 px-3 text-[11px] text-muted-foreground font-medium">ROI</td>
                  {months.map(m => {
                    const pm = byKey(r, m.key);
                    const rev = pm?.revenue ?? 0, spend = pm?.spend ?? 0;
                    return <td key={m.key} className={`py-2 px-3 text-[13px] text-right tabular-nums font-semibold ${roiClass(rev, spend)}`}>{roiText(rev, spend)}</td>;
                  })}
                  <td className={`py-2 px-5 text-[14px] text-right tabular-nums font-bold ${roiClass(r.totalRev, r.totalSpend)}`}>{roiText(r.totalRev, r.totalSpend)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

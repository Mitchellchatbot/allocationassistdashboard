/**
 * PeriodPnlSummary — the headline Profit & Loss for the selected date range,
 * in concrete (un-abbreviated) numbers, plus a comparison against the previous
 * equal-length period.
 *
 * Backed by Zoho Books actuals. Renders nothing until Books is connected and a
 * successful fetch returns — the rest of the Finance page keeps showing its
 * estimate sections in that case.
 */
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";

const DAY_MS = 86_400_000;

/** Exact currency, full digits — no K/M abbreviation. */
function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

function rangeLabel(r: { from: Date; to: Date }) {
  const f = r.from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const t = r.to.toLocaleDateString("en-GB",   { day: "numeric", month: "short", year: "numeric" });
  return `${f} → ${t}`;
}

/** Compact range for the comparison column headers, e.g. "1 Jan – 30 Jun 26".
 *  The start year is dropped when both ends share it. */
function rangeShort(r: { from: Date; to: Date }) {
  const sameYear = r.from.getFullYear() === r.to.getFullYear();
  const f = r.from.toLocaleDateString("en-GB", sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "2-digit" });
  const t = r.to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  return `${f} – ${t}`;
}

/** Previous period of equal length, ending the day before `from`. */
function priorRange(r: { from: Date; to: Date }) {
  const lenMs   = r.to.getTime() - r.from.getTime();
  const prevTo   = new Date(r.from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - lenMs);
  return { from: prevFrom, to: prevTo };
}

/** % change vs a base. null when there's no base to compare against. */
function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** A "this vs prior" comparison row with a coloured ↑/↓ delta. */
function CompareRow({ label, curr, prev, currency, higherIsBetter = true }: {
  label: string; curr: number; prev: number; currency: string; higherIsBetter?: boolean;
}) {
  const delta = pctDelta(curr, prev);
  const up    = curr >= prev;
  // "Good" = moving in the desired direction.
  const good  = delta === null ? true : (higherIsBetter ? up : !up);
  const color = delta === null ? "text-muted-foreground" : good ? "text-emerald-700" : "text-rose-700";
  const Arrow = delta === null ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 py-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold text-foreground text-right w-[120px]">{money(curr, currency)}</span>
      <span className="tabular-nums text-muted-foreground text-right w-[120px] hidden sm:inline">{money(prev, currency)}</span>
      <span className={`tabular-nums font-semibold inline-flex items-center justify-end gap-0.5 w-[78px] ${color}`}>
        <Arrow className="h-3.5 w-3.5" />
        {delta === null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
      </span>
    </div>
  );
}

export function PeriodPnlSummary({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const prior = priorRange(dateRange);
  const { data: cur, isLoading } = useZohoBooks(dateRange);
  const { data: prev }           = useZohoBooks(prior);

  // Slim skeleton while the current-period actuals load.
  if (isLoading) {
    return (
      <div className="mb-5 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading profit &amp; loss…
      </div>
    );
  }

  // No actuals to show — stay quiet, the page's estimate sections cover it.
  if (!cur?.configured || !cur.ok) return null;

  const currency    = cur.currency ?? "AED";
  const revenue     = cur.revenue ?? 0;
  const expenses    = cur.expenses ?? 0;
  const profit      = cur.profit ?? 0;
  const margin      = revenue > 0 ? (profit / revenue) * 100 : 0;
  const isLoss      = profit < 0;

  const prevOk      = !!(prev?.configured && prev.ok);
  const prevRevenue = prevOk ? (prev!.revenue ?? 0) : 0;
  const prevProfit  = prevOk ? (prev!.profit ?? 0)  : 0;
  const prevExpense = prevOk ? (prev!.expenses ?? 0) : 0;

  // Months in the red, this period vs prior.
  const lossMonths  = (cur.byMonth ?? []).filter(m => m.revenue - m.expenses < 0).length;
  const prevLoss    = prevOk ? (prev!.byMonth ?? []).filter(m => m.revenue - m.expenses < 0).length : 0;

  return (
    <div className="mb-5 rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-border/40">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Profit &amp; Loss</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{rangeLabel(dateRange)}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · actuals
        </span>
      </div>

      {/* Three headline tiles — exact numbers, no abbreviation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Revenue</p>
          <p className="text-[26px] font-bold tabular-nums text-emerald-700 leading-tight mt-1">{money(revenue, currency)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{cur.invoiceCount ?? 0} invoice{(cur.invoiceCount ?? 0) === 1 ? "" : "s"}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Expenses</p>
          <p className="text-[26px] font-bold tabular-nums text-rose-700 leading-tight mt-1">{money(expenses, currency)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{cur.expenseCount ?? 0} expense{(cur.expenseCount ?? 0) === 1 ? "" : "s"}</p>
        </div>
        <div className={`px-5 py-4 ${isLoss ? "bg-rose-50/50" : "bg-emerald-50/50"}`}>
          <p className={`text-[10px] uppercase tracking-wide font-bold inline-flex items-center gap-1 ${isLoss ? "text-rose-700" : "text-emerald-700"}`}>
            {isLoss ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            Net {isLoss ? "Loss" : "Profit"}
          </p>
          <p className={`text-[26px] font-bold tabular-nums leading-tight mt-1 ${isLoss ? "text-rose-700" : "text-emerald-700"}`}>
            {isLoss ? `(${money(Math.abs(profit), currency)})` : money(profit, currency)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{margin.toFixed(1)}% margin</p>
        </div>
      </div>

      {/* Comparison vs prior equal-length period */}
      <div className="px-5 py-3 border-t border-border/40 bg-muted/20">
        {prevOk ? (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-x-3 text-[9px] text-muted-foreground/70 font-semibold pb-1">
              <span className="uppercase tracking-wide">Period comparison</span>
              <span className="text-right w-[120px] whitespace-nowrap text-foreground/70">{rangeShort(dateRange)}</span>
              <span className="text-right w-[120px] whitespace-nowrap hidden sm:inline">{rangeShort(prior)}</span>
              <span className="text-right w-[78px] uppercase tracking-wide">Change</span>
            </div>
            <div className="divide-y divide-border/30">
              <CompareRow label="Revenue"     curr={revenue}  prev={prevRevenue} currency={currency} />
              <CompareRow label="Expenses"    curr={expenses} prev={prevExpense} currency={currency} higherIsBetter={false} />
              <CompareRow label="Net profit"  curr={profit}   prev={prevProfit}  currency={currency} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {lossMonths === 0
                ? "No loss-making months this period"
                : `${lossMonths} loss-making month${lossMonths === 1 ? "" : "s"} this period`}
              {prevOk && ` · ${prevLoss} prior`}
            </p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">No Zoho Books actuals for the prior period ({rangeLabel(prior)}) to compare against.</p>
        )}
      </div>
    </div>
  );
}

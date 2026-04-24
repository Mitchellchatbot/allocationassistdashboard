import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useMarketingExpenses, type CategorySpend, type MonthlyPoint, type TopTransaction } from "@/hooks/use-marketing-expenses";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  AreaChart, Area, PieChart, Pie, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, Crown, Receipt, Award, CalendarDays, ArrowUpRight,
} from "lucide-react";

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtAED(n: number): string {
  if (!Number.isFinite(n)) return "AED 0";
  const sign = n < 0 ? "-" : "";
  const abs  = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}AED ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}AED ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}AED ${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtN(n: number): string {
  return Number(n ?? 0).toLocaleString();
}
function fmtPct(n: number): string {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "6px",
  fontSize: "11px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const CAT_COLORS = [
  "hsl(170,55%,45%)", "hsl(210,75%,52%)", "hsl(280,55%,55%)", "hsl(35,85%,55%)",
  "hsl(340,60%,55%)", "hsl(145,55%,45%)", "hsl(200,70%,50%)", "hsl(260,55%,60%)",
  "hsl(20,85%,55%)",  "hsl(320,55%,55%)", "hsl(160,55%,48%)", "hsl(240,60%,55%)",
  "hsl(50,85%,50%)",  "hsl(190,60%,50%)",
];

// ── Flippable KPI card ────────────────────────────────────────────────────────

function FlipKpiCard({
  icon: Icon, label, value, sub, color, bg, back, backHeight = 240,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
  back: React.ReactNode;
  backHeight?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="cursor-pointer select-none"
      style={{
        perspective: "1200px",
        height: flipped ? `${backHeight}px` : "96px",
        transition: "height 0.45s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={() => setFlipped(f => !f)}
    >
      <div style={{
        transformStyle: "preserve-3d",
        transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
        transform: flipped ? "rotateX(-180deg)" : "rotateX(0deg)",
        position: "relative", height: "100%",
      }}>
        {/* Front */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 flex items-start justify-between shadow-sm hover:shadow-md hover:scale-[1.01] transition-all"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
            <p className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-1.5">{sub}</p>}
          </div>
          <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center shrink-0 ml-2`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        {/* Back */}
        <div
          style={{
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-md flex flex-col overflow-hidden"
        >
          <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${bg} shrink-0`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${color}`} />
              <span className="text-[11px] font-semibold">{label}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">click to close</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 text-[11px]">{back}</div>
        </div>
      </div>
    </div>
  );
}

// ── Back-panel builders ───────────────────────────────────────────────────────

function TotalSpendBack({ byCategory, total }: { byCategory: CategorySpend[]; total: number }) {
  const top5 = byCategory.slice(0, 5);
  const max  = top5[0]?.amount ?? 1;
  if (top5.length === 0) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Top 5 Channels</p>
      {top5.map((c, i) => (
        <div key={c.category}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="truncate max-w-[130px]">{c.category}</span>
            <span className="font-semibold text-primary tabular-nums">{fmtAED(c.amount)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${(c.amount / max) * 100}%`,
              backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
            }} />
          </div>
          <p className="text-[9px] text-muted-foreground mt-0.5">{c.pct.toFixed(1)}% of {fmtAED(total)}</p>
        </div>
      ))}
    </div>
  );
}

function MonthlyBack({ monthly }: { monthly: MonthlyPoint[] }) {
  if (monthly.length === 0) return <p className="text-muted-foreground">No data in this period</p>;
  const max = Math.max(...monthly.map(m => m.amount), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">By Month</p>
      {monthly.slice(-8).map(m => (
        <div key={m.monthKey}>
          <div className="flex items-center justify-between mb-0.5">
            <span>{m.month}</span>
            <span className="font-semibold tabular-nums">{fmtAED(m.amount)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(m.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopCategoryBack({ top }: { top?: CategorySpend }) {
  if (!top) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Channel</p>
        <p className="text-[14px] font-semibold">{top.category}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[8px] text-muted-foreground uppercase tracking-wide">Transactions</p>
          <p className="text-[14px] font-bold tabular-nums">{top.count}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2">
          <p className="text-[8px] text-muted-foreground uppercase tracking-wide">Avg / txn</p>
          <p className="text-[14px] font-bold tabular-nums">{fmtAED(top.avg)}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        {top.pct.toFixed(1)}% of all marketing spend in this period
      </p>
    </div>
  );
}

function GrowthBack({ growthPct, total, prevTotal }: { growthPct: number; total: number; prevTotal: number }) {
  const up = growthPct >= 0;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Previous period</p>
        <p className="text-[14px] font-semibold tabular-nums">{fmtAED(prevTotal)}</p>
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">This period</p>
        <p className="text-[14px] font-semibold tabular-nums">{fmtAED(total)}</p>
      </div>
      <div className="pt-1 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground">Change</p>
        <p className={`text-[15px] font-bold ${up ? "text-rose-600" : "text-emerald-600"}`}>
          {up ? "↑" : "↓"} {fmtPct(Math.abs(growthPct))}
        </p>
        <p className="text-[9px] text-muted-foreground mt-1">
          {up ? "Spending increased" : "Spending decreased"} compared to the prior period of the same length.
        </p>
      </div>
    </div>
  );
}

function TransactionsBack({ txns }: { txns: TopTransaction[] }) {
  if (txns.length === 0) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Top 10 largest</p>
      {txns.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="truncate">{t.description || t.category}</p>
            <p className="text-[9px] text-muted-foreground">{t.category} · {t.date}</p>
          </div>
          <span className="font-semibold tabular-nums shrink-0">{fmtAED(t.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function BiggestBack({ biggest }: { biggest?: TopTransaction }) {
  if (!biggest) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Amount</p>
        <p className="text-[18px] font-bold text-amber-600 tabular-nums">{fmtAED(biggest.amount)}</p>
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Channel</p>
        <p className="font-semibold">{biggest.category}</p>
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Description</p>
        <p className="text-[11px] break-words">{biggest.description || "—"}</p>
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Date</p>
        <p className="font-mono text-[11px]">{biggest.date}</p>
      </div>
    </div>
  );
}

function AvgMonthlyBack({ monthly, avg }: { monthly: MonthlyPoint[]; avg: number }) {
  if (monthly.length === 0) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Months tracked</p>
      <p className="text-[18px] font-bold tabular-nums">{monthly.length}</p>
      <p className="text-[10px] text-muted-foreground">
        Average of {fmtAED(avg)}/month across {monthly.length} month{monthly.length === 1 ? "" : "s"}
      </p>
      <div className="pt-2 border-t border-border/40">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Highest vs lowest</p>
        {(() => {
          const sorted = monthly.slice().sort((a, b) => b.amount - a.amount);
          return (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span>Highest ({sorted[0].month})</span>
                <span className="font-semibold">{fmtAED(sorted[0].amount)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>Lowest ({sorted[sorted.length - 1].month})</span>
                <span className="font-semibold">{fmtAED(sorted[sorted.length - 1].amount)}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Finance = () => {
  const { roiData } = useFilteredData();
  const {
    total, prevTotal, growthPct, avgMonthly, byCategory, monthly,
    topTransactions, biggest, topCategory, transactionCount,
  } = useMarketingExpenses();

  const hasData = transactionCount > 0;

  return (
    <DashboardLayout title="Finance" subtitle="Track revenue, spending, and how much return you're getting on investment">
      {!hasData && (
        <div className="mb-5 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <p className="text-[12px] font-medium mb-1">No expense data in this period</p>
          <p className="text-[11px] text-muted-foreground">
            Try a wider date range (top-right), or import your Digital Marketing sheet via the <strong>Import Data</strong> page → Marketing Spend tab.
          </p>
        </div>
      )}

      {/* ── Flippable KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <FlipKpiCard
          icon={DollarSign} label="Total Spend" color="text-primary" bg="bg-primary/10"
          value={fmtAED(total)}
          sub={`${transactionCount} transactions`}
          back={<TotalSpendBack byCategory={byCategory} total={total} />}
        />
        <FlipKpiCard
          icon={growthPct >= 0 ? TrendingUp : TrendingDown}
          label="vs Previous Period"
          color={growthPct >= 0 ? "text-rose-600" : "text-emerald-600"}
          bg={growthPct >= 0 ? "bg-rose-50" : "bg-emerald-50"}
          value={fmtPct(growthPct)}
          sub={`vs ${fmtAED(prevTotal)}`}
          back={<GrowthBack growthPct={growthPct} total={total} prevTotal={prevTotal} />}
        />
        <FlipKpiCard
          icon={CalendarDays} label="Avg Monthly" color="text-sky-600" bg="bg-sky-50"
          value={fmtAED(avgMonthly)}
          sub={`across ${monthly.length} month${monthly.length === 1 ? "" : "s"}`}
          back={<AvgMonthlyBack monthly={monthly} avg={avgMonthly} />}
        />
        <FlipKpiCard
          icon={Crown} label="Top Channel" color="text-amber-600" bg="bg-amber-50"
          value={topCategory?.category ?? "—"}
          sub={topCategory ? `${fmtAED(topCategory.amount)} · ${topCategory.pct.toFixed(1)}%` : ""}
          back={<TopCategoryBack top={topCategory} />}
        />
        <FlipKpiCard
          icon={Award} label="Biggest Expense" color="text-orange-600" bg="bg-orange-50"
          value={biggest ? fmtAED(biggest.amount) : "—"}
          sub={biggest ? biggest.category : ""}
          back={<BiggestBack biggest={biggest} />}
        />
        <FlipKpiCard
          icon={Receipt} label="Transactions" color="text-violet-600" bg="bg-violet-50"
          value={fmtN(transactionCount)}
          sub={byCategory.length > 0 ? `across ${byCategory.length} channels` : ""}
          back={<TransactionsBack txns={topTransactions} />}
        />
      </div>

      {/* ── Monthly trend ── */}
      {monthly.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Monthly Spend Trend</CardTitle>
              <span className="text-[10px] text-muted-foreground">{monthly.length} month{monthly.length === 1 ? "" : "s"}</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(170,55%,45%)" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" vertical={false} />
                <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
                <Tooltip contentStyle={tip}
                  formatter={(v: number, _n, p) => [fmtAED(v), `${p.payload.count} txns`]} />
                <Area type="monotone" dataKey="amount" stroke="hsl(170,55%,45%)" fill="url(#spendGrad)"
                  strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Two-column: bar + donut ── */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
          <Card className="shadow-sm border-border/50 lg:col-span-3">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend by Channel</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={Math.max(320, byCategory.length * 28)}>
                <BarChart data={byCategory} layout="vertical" barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false}
                    stroke="hsl(220,10%,55%)" tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
                  <YAxis dataKey="category" type="category" fontSize={10} tickLine={false} axisLine={false}
                    width={95} stroke="hsl(220,10%,55%)" />
                  <Tooltip contentStyle={tip}
                    formatter={(v: number, _n, p) => [fmtAED(v), `${p.payload.count} txns · ${p.payload.pct.toFixed(1)}%`]} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50 lg:col-span-2">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Mix</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={byCategory.slice(0, 8)}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={95}
                    paddingAngle={2} dataKey="amount" nameKey="category"
                  >
                    {byCategory.slice(0, 8).map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v: number) => fmtAED(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }}
                    formatter={v => <span style={{ color: "hsl(220,10%,35%)" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Top transactions table ── */}
      {topTransactions.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Top 10 Largest Transactions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2">Date</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2">Channel</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2">Description</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {topTransactions.map(t => (
                    <tr key={t.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{t.date}</td>
                      <td className="py-2 text-[12px] font-medium">{t.category}</td>
                      <td className="py-2 text-[11px] text-muted-foreground max-w-[400px] truncate" title={t.description}>
                        {t.description || "—"}
                      </td>
                      <td className="py-2 text-[12px] text-right tabular-nums font-semibold">{fmtAED(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Full breakdown ── */}
      {byCategory.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Full Breakdown by Channel</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2">Channel</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">Txns</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">Avg / Txn</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">Total</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((c, i) => (
                    <tr key={c.category} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2 text-[12px] font-medium flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                        {c.category}
                      </td>
                      <td className="py-2 text-[12px] text-right tabular-nums text-muted-foreground">{c.count}</td>
                      <td className="py-2 text-[12px] text-right tabular-nums text-muted-foreground">{fmtAED(c.avg)}</td>
                      <td className="py-2 text-[12px] text-right tabular-nums font-semibold">{fmtAED(c.amount)}</td>
                      <td className="py-2 text-[12px] text-right tabular-nums text-muted-foreground">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border/80 font-semibold bg-muted/10">
                    <td className="py-2 text-[12px]">Total</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">{byCategory.reduce((s, c) => s + c.count, 0)}</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">—</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">{fmtAED(total)}</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Zoho ROI chart (kept) ── */}
      {roiData?.length > 0 && (
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Return on Investment by Channel</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={roiData} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={v => `${v}x`} />
                <YAxis dataKey="channel" type="category" fontSize={10} tickLine={false} axisLine={false} width={95} stroke="hsl(220,10%,55%)" />
                <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}x return`, "For every $1 spent"]} />
                <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                  {roiData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "hsl(170,55%,45%)" : "hsl(210,75%,52%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
};

export default Finance;

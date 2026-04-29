import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useMarketingExpenses, type CategorySpend, type MonthlyPoint, type TopTransaction } from "@/hooks/use-marketing-expenses";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { ChannelWinnerCards } from "@/components/ChannelEconomics";
import { useCurrency } from "@/lib/CurrencyProvider";
import { normalizeChannelKey } from "@/lib/channel-mapping";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  AreaChart, Area, PieChart, Pie, Legend, LineChart, Line, ComposedChart,
} from "recharts";
import { InfoIcon } from "@/components/InfoIcon";
import {
  DollarSign, TrendingUp, TrendingDown, Crown, Receipt, Award, CalendarDays, ArrowUpRight,
  Wallet, Target, Zap, Users, Search, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

// Short {meaning, source} pair for every Finance KPI label.
const FINANCE_KPI_HINTS: Record<string, { meaning: string; source: string }> = {
  "Marketing Spend":     { meaning: "Total spend across the SELECTED date range — not a monthly figure. Multi-month windows show the avg/mo in the sub-line.", source: "Marketing-spend imports." },
  "Leads Generated":     { meaning: "Zoho leads created in the period across every source.",                                    source: "Zoho CRM (Leads — Created_Time)." },
  "Cost Per Lead":       { meaning: "Marketing spend ÷ leads generated. Includes every lead regardless of quality.",            source: "Marketing-spend imports + Zoho CRM." },
  "Cost Per Qualified":  { meaning: 'Marketing spend ÷ qualified leads. "Contact in Future" excluded.',                          source: "Marketing-spend imports + Zoho CRM (Lead_Status)." },
  "Top Channel":         { meaning: "Channel that generated the most leads this period.",                                       source: "Zoho CRM (Lead_Source)." },
  "Biggest Expense":     { meaning: "Largest single expense category in the period.",                                           source: "Marketing-spend imports." },
  "Avg Monthly":         { meaning: "Average monthly marketing spend across the selected range.",                               source: "Marketing-spend imports." },
  "Transactions":        { meaning: "Expense rows recorded in the period.",                                                     source: "Marketing-spend imports." },
};

// ── Formatting ────────────────────────────────────────────────────────────────
// fmtAED is provided by useCurrency() inside each component that needs it.
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
  const hint = FINANCE_KPI_HINTS[label];
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
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 flex items-start justify-between shadow-sm hover:shadow-md hover:scale-[1.01] transition-all"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              {hint && <InfoIcon meaning={hint.meaning} source={hint.source} side="bottom" />}
            </div>
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
  const { fmt: fmtAED } = useCurrency();
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
  const { fmt: fmtAED } = useCurrency();
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
  const { fmt: fmtAED } = useCurrency();
  if (!top) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Channel</p>
        <p className="text-[14px] font-semibold">{normalizeChannelKey(top.category)}</p>
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
  const { fmt: fmtAED } = useCurrency();
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
  const { fmt: fmtAED } = useCurrency();
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
  const { fmt: fmtAED } = useCurrency();
  if (!biggest) return <p className="text-muted-foreground">No data in this period</p>;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Amount</p>
        <p className="text-[18px] font-bold text-amber-600 tabular-nums">{fmtAED(biggest.amount)}</p>
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Channel</p>
        <p className="font-semibold">{normalizeChannelKey(biggest.category)}</p>
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
  const { fmt: fmtAED } = useCurrency();
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

// Back panel: Revenue breakdown by source channel (from Zoho deals)
function RevenueBack({ bySource, total }: { bySource: { source: string; amount: number; count: number }[]; total: number }) {
  const { fmt: fmtAED } = useCurrency();
  if (bySource.length === 0) return <p className="text-muted-foreground">No closed deals in this period</p>;
  const max = bySource[0]?.amount ?? 1;
  return (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">By lead source</p>
      {bySource.slice(0, 6).map((s, i) => (
        <div key={s.source}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="truncate max-w-[140px]">{s.source}</span>
            <span className="font-semibold text-emerald-600 tabular-nums">{fmtAED(s.amount)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${(s.amount / max) * 100}%`,
              backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
            }} />
          </div>
          <p className="text-[9px] text-muted-foreground mt-0.5">{s.count} deal{s.count === 1 ? "" : "s"} · {((s.amount / total) * 100).toFixed(1)}%</p>
        </div>
      ))}
    </div>
  );
}

function ProfitBack({ revenue, spend, profit }: { revenue: number; spend: number; profit: number }) {
  const { fmt: fmtAED } = useCurrency();
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-semibold tabular-nums">{fmtAED(revenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Marketing spend</span><span className="font-semibold tabular-nums">-{fmtAED(spend)}</span></div>
      <div className="pt-2 border-t border-border/40 flex justify-between">
        <span className="font-semibold">Net</span>
        <span className={`font-bold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtAED(profit)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        Net margin: <span className="font-semibold text-foreground">{margin.toFixed(1)}%</span>
        {profit < 0 && <span className="block mt-0.5">⚠ Spending more than closing. Check ROAS or reduce spend on low-performing channels.</span>}
      </p>
    </div>
  );
}

function RoasBack({ roas, revenue, spend }: { roas: number; revenue: number; spend: number }) {
  const { fmt: fmtAED } = useCurrency();
  const rating = roas >= 4 ? "Excellent" : roas >= 2 ? "Healthy" : roas >= 1 ? "Break-even" : "Losing money";
  const ratingColor = roas >= 4 ? "text-emerald-600" : roas >= 2 ? "text-sky-600" : roas >= 1 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Formula</p>
      <p className="text-[11px]">Revenue ÷ Marketing Spend</p>
      <p className="text-[11px] font-mono">{fmtAED(revenue)} ÷ {fmtAED(spend)} = <span className="font-bold">{roas.toFixed(2)}x</span></p>
      <div className="pt-2 border-t border-border/40">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Rating</p>
        <p className={`text-[14px] font-bold ${ratingColor}`}>{rating}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {roas >= 4 && "Every AED 1 spent returns AED 4+. Scale the winning channels."}
          {roas >= 2 && roas < 4 && "Profitable. Keep optimising top-performing channels."}
          {roas >= 1 && roas < 2 && "Barely breaking even. Review cost-per-lead by channel."}
          {roas < 1 && "Spending more than earning. Cut low-performing channels."}
        </p>
      </div>
    </div>
  );
}

function CostPerConversionBack({ cpc, spend, conversions }: { cpc: number; spend: number; conversions: number }) {
  const { fmt: fmtAED } = useCurrency();
  return (
    <div className="space-y-2">
      <div className="flex justify-between"><span className="text-muted-foreground">Total spend</span><span className="font-semibold tabular-nums">{fmtAED(spend)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Conversions (Doctors on Board)</span><span className="font-semibold tabular-nums">{conversions}</span></div>
      <div className="pt-2 border-t border-border/40 flex justify-between">
        <span className="font-semibold">Cost per conversion</span>
        <span className="font-bold text-orange-600 tabular-nums">{fmtAED(cpc)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        {conversions === 0
          ? "No conversions recorded in this period. Source: Zoho Doctors on Board module."
          : "Lower is better."}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Finance = () => {
  const { roiData } = useFilteredData();
  const { preset, setPreset, dateRange } = useFilters();
  const { data: zoho } = useZohoData();
  const { fmt: fmtAED, currency } = useCurrency();
  const {
    rows: allTransactions,
    total: spend, prevTotal: prevSpend, growthPct, avgMonthly, byCategory, monthly,
    topTransactions, biggest, topCategory, transactionCount,
  } = useMarketingExpenses();

  // Auto-switch to "This Year" the first time Finance page mounts,
  // since the imported data is mostly historical (2025 + early 2026).
  const didAutoSetRef = useRef(false);
  useEffect(() => {
    if (!didAutoSetRef.current && preset !== "year" && preset !== "custom") {
      didAutoSetRef.current = true;
      setPreset("year");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transactions table — sort + search state
  const [txnSortKey, setTxnSortKey] = useState<"date" | "amount" | "category">("date");
  const [txnSortDir, setTxnSortDir] = useState<"asc" | "desc">("desc");
  const [txnSearch, setTxnSearch] = useState("");
  const sortedTransactions = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    const filtered = q
      ? allTransactions.filter(t =>
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q)
        )
      : allTransactions;
    return filtered.slice().sort((a, b) => {
      let cmp = 0;
      if (txnSortKey === "date")     cmp = (a.expense_date ?? "").localeCompare(b.expense_date ?? "");
      else if (txnSortKey === "amount") cmp = (a.amount ?? 0) - (b.amount ?? 0);
      else if (txnSortKey === "category") cmp = (a.category ?? "").localeCompare(b.category ?? "");
      return txnSortDir === "asc" ? cmp : -cmp;
    });
  }, [allTransactions, txnSortKey, txnSortDir, txnSearch]);

  function toggleTxnSort(key: "date" | "amount" | "category") {
    if (txnSortKey === key) {
      setTxnSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setTxnSortKey(key);
      setTxnSortDir(key === "amount" || key === "date" ? "desc" : "asc");
    }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
    if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />;
    return dir === "asc"
      ? <ArrowUp className="h-3 w-3 text-primary shrink-0" />
      : <ArrowDown className="h-3 w-3 text-primary shrink-0" />;
  }

  // Zoho leads created in the selected period — the real signal of marketing working.
  // Revenue is not used here because Zoho Deals module has almost no data
  // (only ~4 Closed Won deals ever); using spend/leads is far more accurate.
  // "Contact in Future" is NOT qualified — recruiter deferred, not a pass.
  const QUALIFIED_STATUSES = new Set([
    "Initial Sales Call Completed",
    "High Priority Follow up",
  ]);

  const leadStats = useMemo(() => {
    const leads = zoho?.rawLeads ?? [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    const inPeriod = leads.filter(l => {
      const t = l.Created_Time ? new Date(l.Created_Time).getTime() : NaN;
      return !isNaN(t) && t >= fromMs && t < toMs;
    });

    // Prior period (equal length, immediately before)
    const spanMs   = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFromMs = dateRange.from.getTime() - spanMs - 86_400_000;
    const prevToMs   = dateRange.from.getTime() - 86_400_000;
    const prevInPeriod = leads.filter(l => {
      const t = l.Created_Time ? new Date(l.Created_Time).getTime() : NaN;
      return !isNaN(t) && t >= prevFromMs && t < prevToMs;
    });

    const totalLeads     = inPeriod.length;
    const prevTotalLeads = prevInPeriod.length;
    const qualified      = inPeriod.filter(l => QUALIFIED_STATUSES.has(l.Lead_Status)).length;
    const qualRate       = totalLeads > 0 ? (qualified / totalLeads) * 100 : 0;
    const leadGrowth     = prevTotalLeads > 0 ? ((totalLeads - prevTotalLeads) / prevTotalLeads) * 100 : 0;

    // By source — use displaySource-like normalisation
    const sourceCounts = new Map<string, { total: number; qualified: number }>();
    for (const l of inPeriod) {
      const src = (l.Lead_Source ?? "").trim() || "Unknown";
      const cur = sourceCounts.get(src) ?? { total: 0, qualified: 0 };
      cur.total++;
      if (QUALIFIED_STATUSES.has(l.Lead_Status)) cur.qualified++;
      sourceCounts.set(src, cur);
    }
    const leadsBySource = Array.from(sourceCounts.entries())
      .map(([source, v]) => ({
        source,
        leads: v.total,
        qualified: v.qualified,
        qualRate: v.total > 0 ? (v.qualified / v.total) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 12);

    return { totalLeads, prevTotalLeads, qualified, qualRate, leadGrowth, leadsBySource };
  }, [zoho?.rawLeads, dateRange]);

  const costPerLead   = leadStats.totalLeads     > 0 ? spend / leadStats.totalLeads     : 0;
  const costPerQualified = leadStats.qualified   > 0 ? spend / leadStats.qualified     : 0;

  // Monthly spend + leads generated — what the team should actually watch
  const monthlySpendLeads = useMemo(() => {
    const map = new Map<string, { month: string; monthKey: string; spend: number; leads: number }>();
    for (const m of monthly) {
      map.set(m.monthKey, { month: m.month, monthKey: m.monthKey, spend: m.amount, leads: 0 });
    }
    const leads = zoho?.rawLeads ?? [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    for (const l of leads) {
      const t = l.Created_Time ? new Date(l.Created_Time).getTime() : NaN;
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      const key = (l.Created_Time ?? "").slice(0, 7);
      if (!key) continue;
      const label = new Date(key + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
      const cur = map.get(key) ?? { month: label, monthKey: key, spend: 0, leads: 0 };
      cur.leads += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [monthly, zoho?.rawLeads, dateRange]);

  const hasData = transactionCount > 0 || leadStats.totalLeads > 0;

  // ── Monthly Spend × Channel grid (for the CEO-glanceable section) ─────────
  // Builds rows = channel, cols = months in the selected period. Used by the
  // "Monthly Marketing Spend by Channel" section + the profit P&L beneath it.
  const monthlySpendByChannel = useMemo(() => {
    if (allTransactions.length === 0 || monthly.length === 0) {
      return { months: [] as { key: string; label: string }[], channels: [] as { channel: string; perMonth: Record<string, number>; total: number }[] };
    }
    const months = monthly
      .slice()
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map(m => ({ key: m.monthKey, label: m.month }));

    const grid = new Map<string, Map<string, number>>();
    for (const t of allTransactions) {
      const ch = normalizeChannelKey(t.category);
      const key = (t.expense_date ?? "").slice(0, 7);
      if (!key) continue;
      const row = grid.get(ch) ?? new Map<string, number>();
      row.set(key, (row.get(key) ?? 0) + (t.amount ?? 0));
      grid.set(ch, row);
    }

    const channels = Array.from(grid.entries())
      .map(([channel, perMonthMap]) => {
        const perMonth: Record<string, number> = {};
        let total = 0;
        for (const m of months) {
          const v = perMonthMap.get(m.key) ?? 0;
          perMonth[m.key] = v;
          total += v;
        }
        return { channel, perMonth, total };
      })
      .sort((a, b) => b.total - a.total);

    return { months, channels };
  }, [allTransactions, monthly]);

  // ── Profit P&L placeholders ───────────────────────────────────────────────
  // Marketing spend is real; payroll + other expenses + revenue are stubbed
  // until the new accountant delivers numbers. Structure shipped now so we
  // only have to fill in values when they land.
  const profitRows = useMemo(() => {
    const months = monthlySpendByChannel.months;
    const marketingByMonth: Record<string, number> = {};
    let marketingTotal = 0;
    for (const c of monthlySpendByChannel.channels) {
      for (const m of months) {
        marketingByMonth[m.key] = (marketingByMonth[m.key] ?? 0) + c.perMonth[m.key];
      }
      marketingTotal += c.total;
    }
    // Conversions from Zoho "Doctors on Board" module — the SOLE source of
    // truth for converted doctors. Bucketed by Created_Time per month.
    const conversionsByMonth: Record<string, number> = {};
    let conversionsTotal = 0;
    for (const dob of (zoho as { rawDoctorsOnBoard?: { Created_Time: string }[] } | undefined)?.rawDoctorsOnBoard ?? []) {
      if (!dob.Created_Time) continue;
      const t = new Date(dob.Created_Time).getTime();
      if (isNaN(t) || t < dateRange.from.getTime() || t >= dateRange.to.getTime() + 86_400_000) continue;
      const key = dob.Created_Time.slice(0, 7);
      conversionsByMonth[key] = (conversionsByMonth[key] ?? 0) + 1;
      conversionsTotal += 1;
    }
    return { marketingByMonth, marketingTotal, conversionsByMonth, conversionsTotal, months };
  }, [monthlySpendByChannel, zoho, dateRange]);

  return (
    <DashboardLayout title="Finance" subtitle="Revenue, spend, profit, and ROI across all channels">
      {/* ── Period banner — explicit date range + currency lock ───────────────
          Designed to remove ambiguity: every figure on this tab is for the
          stated period, in the stated currency. Reduces "is that monthly or
          the whole quarter?" / "is that AED or USD?" confusion. */}
      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-primary/70 mb-0.5">
            Showing finance for
          </p>
          <p className="text-[14px] font-semibold text-foreground">
            {dateRange.from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {" → "}
            {dateRange.to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            <span className="text-[12px] font-normal text-muted-foreground ml-2">
              ({monthly.length} {monthly.length === 1 ? "month" : "months"})
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-primary/70 mb-0.5">
            All values in
          </p>
          <p className="text-[14px] font-semibold text-foreground">
            {currency}
            <span className="text-[11px] font-normal text-muted-foreground ml-1">
              · toggle in header
            </span>
          </p>
        </div>
      </div>

      {!hasData && (
        <div className="mb-5 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
          <p className="text-[12px] font-medium mb-1">No activity in this period</p>
          <p className="text-[11px] text-muted-foreground">
            This period has no marketing expenses and no Zoho leads. Try a wider date range (top-right), or import the Digital Marketing sheet via <strong>Import Data → Marketing Spend</strong>.
          </p>
        </div>
      )}

      {/* Channel winner KPIs (best volume / lowest CPL / lowest CPQ / highest conversion) */}
      <ChannelWinnerCards />

      {/* ── Row 1: Spend + Lead Economics ── */}
      {/* Only render lead KPIs when we actually have leads in the period — otherwise just show spend */}
      <div className={`grid grid-cols-2 ${leadStats.totalLeads > 0 ? "lg:grid-cols-4" : "lg:grid-cols-2"} gap-3 mb-3`}>
        <FlipKpiCard
          icon={DollarSign}
          // Label explicitly says "(period total)" so a multi-month figure
          // can never be mistaken for a monthly number — Yemima saw 121K
          // and assumed it was monthly when it was a 3-month aggregate.
          label={monthly.length > 1 ? "Marketing Spend (period total)" : "Marketing Spend"}
          color="text-primary" bg="bg-primary/10"
          value={fmtAED(spend)}
          sub={monthly.length > 1
            ? `${monthly.length} months · ${fmtAED(avgMonthly)} / month avg`
            : `${transactionCount} transactions · ${byCategory.length} channels`}
          back={<TotalSpendBack byCategory={byCategory} total={spend} />}
        />
        {leadStats.totalLeads > 0 && (
          <FlipKpiCard
            icon={Users} label="Leads Generated" color="text-emerald-600" bg="bg-emerald-50"
            value={fmtN(leadStats.totalLeads)}
            sub={leadStats.prevTotalLeads > 0
              ? `${fmtPct(leadStats.leadGrowth)} vs prior`
              : "Zoho CRM · created in period"}
            back={
              <div className="space-y-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Top sources</p>
                {leadStats.leadsBySource.slice(0, 6).map((s, i) => {
                  const max = leadStats.leadsBySource[0]?.leads ?? 1;
                  return (
                    <div key={s.source}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="truncate max-w-[140px]">{s.source}</span>
                        <span className="font-semibold tabular-nums">{s.leads}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${(s.leads / max) * 100}%`,
                          backgroundColor: CAT_COLORS[i % CAT_COLORS.length],
                        }} />
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {s.qualified} qualified · {s.qualRate.toFixed(0)}% rate
                      </p>
                    </div>
                  );
                })}
              </div>
            }
          />
        )}
        {leadStats.totalLeads > 0 && spend > 0 && (
          <FlipKpiCard
            icon={Target} label="Cost Per Lead" color="text-orange-600" bg="bg-orange-50"
            value={fmtAED(costPerLead)}
            sub={`${fmtAED(spend)} / ${fmtN(leadStats.totalLeads)}`}
            back={
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Marketing spend</span><span className="font-semibold tabular-nums">{fmtAED(spend)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Leads generated</span><span className="font-semibold tabular-nums">{fmtN(leadStats.totalLeads)}</span></div>
                <div className="pt-2 border-t border-border/40 flex justify-between">
                  <span className="font-semibold">Cost per lead</span>
                  <span className="font-bold text-orange-600 tabular-nums">{fmtAED(costPerLead)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Includes all leads regardless of quality. See Cost Per Qualified for the more meaningful figure.
                </p>
              </div>
            }
          />
        )}
        {leadStats.qualified > 0 && spend > 0 && (
          <FlipKpiCard
            icon={Zap} label="Cost Per Qualified"
            color={costPerQualified < 500 ? "text-emerald-600" : costPerQualified < 2000 ? "text-amber-600" : "text-rose-600"}
            bg={costPerQualified < 500 ? "bg-emerald-50" : costPerQualified < 2000 ? "bg-amber-50" : "bg-rose-50"}
            value={fmtAED(costPerQualified)}
            sub={`${fmtN(leadStats.qualified)} qualified · ${leadStats.qualRate.toFixed(0)}% rate`}
            back={
              <div className="space-y-2">
                <p className="text-[10px]">Qualified = reached <strong>Initial Sales Call Completed</strong> or <strong>High Priority Follow up</strong>. Conversions are tracked separately via the <strong>Doctors on Board</strong> module; "Contact in Future" is a deferred conversation, not a qualification.</p>
                <div className="pt-2 border-t border-border/40 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total leads</span><span className="font-semibold tabular-nums">{fmtN(leadStats.totalLeads)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Qualified</span><span className="font-semibold tabular-nums">{fmtN(leadStats.qualified)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-semibold tabular-nums">{leadStats.qualRate.toFixed(1)}%</span></div>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Lower is better. Compare channels on the Leads by Source chart below.
                </p>
              </div>
            }
          />
        )}
      </div>

      {/* Helpful note when we have spend but no leads (so users know why the lead KPIs are missing) */}
      {spend > 0 && leadStats.totalLeads === 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900">
          <strong>No Zoho leads created in this period.</strong> Cost Per Lead / Cost Per Qualified cards are hidden because they'd divide by zero. If you expect leads here, check whether your lead capture forms are creating records in Zoho (not just in Meta / a landing page).
        </div>
      )}

      {/* ── Row 2: Top channel / Biggest expense / Spend growth / Avg monthly / Txns ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <FlipKpiCard
          icon={Crown} label="Top Channel (period)" color="text-amber-600" bg="bg-amber-50"
          value={topCategory ? normalizeChannelKey(topCategory.category) : "—"}
          sub={topCategory ? `${fmtAED(topCategory.amount)} period total · ${topCategory.pct.toFixed(1)}%` : ""}
          back={<TopCategoryBack top={topCategory} />}
        />
        <FlipKpiCard
          icon={Award} label="Biggest Single Expense" color="text-orange-600" bg="bg-orange-50"
          value={biggest ? fmtAED(biggest.amount) : "—"}
          sub={biggest ? `${normalizeChannelKey(biggest.category)} · single transaction` : ""}
          back={<BiggestBack biggest={biggest} />}
        />
        <FlipKpiCard
          icon={growthPct >= 0 ? TrendingUp : TrendingDown}
          label={growthPct >= 0 ? "Spend Increased" : "Spend Reduced"}
          color={growthPct >= 0 ? "text-rose-600" : "text-emerald-600"}
          bg={growthPct >= 0 ? "bg-rose-50" : "bg-emerald-50"}
          value={`${growthPct >= 0 ? "↑" : "↓"} ${Math.abs(growthPct).toFixed(1)}%`}
          sub={`vs ${fmtAED(prevSpend)} prior`}
          back={<GrowthBack growthPct={growthPct} total={spend} prevTotal={prevSpend} />}
        />
        <FlipKpiCard
          icon={CalendarDays} label="Avg Monthly" color="text-sky-600" bg="bg-sky-50"
          value={fmtAED(avgMonthly)}
          sub={`across ${monthly.length} month${monthly.length === 1 ? "" : "s"}`}
          back={<AvgMonthlyBack monthly={monthly} avg={avgMonthly} />}
        />
        <FlipKpiCard
          icon={Receipt} label="Transactions" color="text-violet-600" bg="bg-violet-50"
          value={fmtN(transactionCount)}
          sub={byCategory.length > 0 ? `across ${byCategory.length} channels` : ""}
          back={<TransactionsBack txns={topTransactions} />}
        />
      </div>

      {/* ── CEO View: Monthly Marketing Spend by Channel + Profit P&L ─────
          Built for Emilie. Rows = channels (canonical names — Meta, LinkedIn,
          etc.), cols = months in the selected period. Profit P&L underneath
          uses real marketing-spend + Zoho Closed Won revenue; payroll and
          other expenses are placeholder rows that read "—" until the new
          accountant's numbers are imported. */}
      {monthlySpendByChannel.months.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Monthly Marketing Spend by Channel
              <span className="ml-2 normal-case font-normal text-muted-foreground/60">
                · all values in {currency} per month
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Channel</th>
                  {monthlySpendByChannel.months.map(m => (
                    <th key={m.key} className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Period total</th>
                </tr>
              </thead>
              <tbody>
                {monthlySpendByChannel.channels.map(c => (
                  <tr key={c.channel} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-2 px-3 text-[12px] font-medium">{c.channel}</td>
                    {monthlySpendByChannel.months.map(m => {
                      const v = c.perMonth[m.key];
                      return (
                        <td key={m.key} className="py-2 px-3 text-[11px] text-right tabular-nums">
                          {v > 0 ? fmtAED(v) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-[12px] text-right tabular-nums font-semibold text-primary">
                      {fmtAED(c.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border/80 font-semibold bg-muted/20">
                  <td className="py-2 px-3 text-[12px]">Total marketing spend</td>
                  {monthlySpendByChannel.months.map(m => {
                    const v = monthlySpendByChannel.channels.reduce((s, c) => s + (c.perMonth[m.key] ?? 0), 0);
                    return (
                      <td key={m.key} className="py-2 px-3 text-[12px] text-right tabular-nums">
                        {fmtAED(v)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-[13px] text-right tabular-nums font-bold text-primary">
                    {fmtAED(profitRows.marketingTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground px-4 pt-2 pb-1">
              Each cell shows that channel's spend during that single month. Hover the date-range banner above to confirm the window.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Profit P&L (structure shipped, numbers fill in as data arrives) ─ */}
      {monthlySpendByChannel.months.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Profit P&amp;L (per month)
              <span className="ml-2 normal-case font-normal text-amber-700/80">
                · payroll &amp; other expenses pending from accountant — structure shown, numbers filling in
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Line item</th>
                  {profitRows.months.map(m => (
                    <th key={m.key} className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Period</th>
                </tr>
              </thead>
              <tbody>
                {/* Conversions — real count, from Zoho "Doctors on Board" module */}
                <tr className="border-b border-border/30 bg-emerald-50/30">
                  <td className="py-2 px-3 text-[12px] font-medium text-emerald-800">
                    Conversions (Doctors on Board)
                    <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1 py-0.5 ml-1 font-normal">value pending</span>
                  </td>
                  {profitRows.months.map(m => {
                    const v = profitRows.conversionsByMonth[m.key] ?? 0;
                    return (
                      <td key={m.key} className="py-2 px-3 text-[11px] text-right tabular-nums text-emerald-700">
                        {v > 0 ? `${v} doctor${v === 1 ? "" : "s"}` : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-[12px] text-right tabular-nums font-semibold text-emerald-700">
                    {profitRows.conversionsTotal} doctors
                  </td>
                </tr>
                {/* Marketing spend — real */}
                <tr className="border-b border-border/30">
                  <td className="py-2 px-3 text-[12px] font-medium">Marketing spend</td>
                  {profitRows.months.map(m => {
                    const v = profitRows.marketingByMonth[m.key] ?? 0;
                    return (
                      <td key={m.key} className="py-2 px-3 text-[11px] text-right tabular-nums">
                        {v > 0 ? `(${fmtAED(v)})` : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-[12px] text-right tabular-nums font-semibold">
                    ({fmtAED(profitRows.marketingTotal)})
                  </td>
                </tr>
                {/* Payroll — placeholder until accountant delivers */}
                <tr className="border-b border-border/30">
                  <td className="py-2 px-3 text-[12px] font-medium text-muted-foreground">
                    Payroll <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1 py-0.5 ml-1">pending</span>
                  </td>
                  {profitRows.months.map(m => (
                    <td key={m.key} className="py-2 px-3 text-[11px] text-right text-muted-foreground/40">—</td>
                  ))}
                  <td className="py-2 px-3 text-[12px] text-right text-muted-foreground/40">—</td>
                </tr>
                {/* Other operating expenses — placeholder */}
                <tr className="border-b border-border/30">
                  <td className="py-2 px-3 text-[12px] font-medium text-muted-foreground">
                    Other operating expenses <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1 py-0.5 ml-1">pending</span>
                  </td>
                  {profitRows.months.map(m => (
                    <td key={m.key} className="py-2 px-3 text-[11px] text-right text-muted-foreground/40">—</td>
                  ))}
                  <td className="py-2 px-3 text-[12px] text-right text-muted-foreground/40">—</td>
                </tr>
                {/* Cost per Conversion — real, from spend ÷ Doctors on Board count */}
                <tr className="border-t-2 border-border/80 bg-muted/20 font-semibold">
                  <td className="py-2 px-3 text-[12px]">
                    Cost per Conversion <span className="text-[9px] uppercase tracking-wide bg-muted text-muted-foreground rounded px-1 py-0.5 ml-1 font-normal">marketing only — payroll/other pending</span>
                  </td>
                  {profitRows.months.map(m => {
                    const conversions = profitRows.conversionsByMonth[m.key] ?? 0;
                    const spd         = profitRows.marketingByMonth[m.key] ?? 0;
                    if (conversions === 0 || spd === 0) {
                      return <td key={m.key} className="py-2 px-3 text-[11px] text-right text-muted-foreground/30">—</td>;
                    }
                    const cpc = spd / conversions;
                    return (
                      <td key={m.key} className="py-2 px-3 text-[12px] text-right tabular-nums text-foreground">
                        {fmtAED(cpc)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-[13px] text-right tabular-nums font-bold">
                    {profitRows.conversionsTotal > 0 && profitRows.marketingTotal > 0
                      ? fmtAED(profitRows.marketingTotal / profitRows.conversionsTotal)
                      : <span className="text-muted-foreground/30">—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 pt-3 pb-1 text-[10px] text-muted-foreground/80 leading-relaxed">
              <p className="mb-1"><strong className="text-foreground/70">How to read:</strong> Conversions come from the Zoho <code>Doctors on Board</code> module — each row is one converted doctor. Marketing spend is from imported expenses. Payroll &amp; other expenses are placeholders until the accountant delivers monthly numbers.</p>
              <p>The <strong className="text-foreground/70">Cost per Conversion</strong> row divides marketing spend by conversion count. Once payroll + other expenses are filled in, we'll add a true Profit row that subtracts them too.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Monthly: Spend + Leads combined ── */}
      {monthlySpendLeads.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend vs Leads Generated</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Spend ({currency})</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Leads</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlySpendLeads} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" vertical={false} />
                <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis yAxisId="spend" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(170,55%,45%)"
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
                <YAxis yAxisId="leads" orientation="right" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(142,70%,45%)" />
                <Tooltip contentStyle={tip}
                  formatter={(v: number, name: string) => [
                    name === "Spend" ? fmtAED(v) : `${v} leads`,
                    name,
                  ]} />
                <Bar yAxisId="spend" dataKey="spend" name="Spend" fill="hsl(170,55%,45%)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="leads" type="monotone" dataKey="leads" name="Leads"
                  stroke="hsl(142,70%,45%)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
      {allTransactions.length > 0 && (
        <Card className="shadow-sm border-border/50 mb-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">All Transactions</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {sortedTransactions.length.toLocaleString()} of {allTransactions.length.toLocaleString()} · click column headers to sort
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search description or channel…"
                  value={txnSearch}
                  onChange={e => setTxnSearch(e.target.value)}
                  className="w-[260px] rounded-md border border-border/60 bg-background pl-7 pr-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border/60">
                    <th className="py-2">
                      <button onClick={() => toggleTxnSort("date")} className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                        Date <SortIcon active={txnSortKey === "date"} dir={txnSortDir} />
                      </button>
                    </th>
                    <th className="py-2">
                      <button onClick={() => toggleTxnSort("category")} className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                        Channel <SortIcon active={txnSortKey === "category"} dir={txnSortDir} />
                      </button>
                    </th>
                    <th className="py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Description</th>
                    <th className="py-2 text-right">
                      <button onClick={() => toggleTxnSort("amount")} className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
                        Amount <SortIcon active={txnSortKey === "amount"} dir={txnSortDir} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[11px] text-muted-foreground">
                        No transactions match "{txnSearch}"
                      </td>
                    </tr>
                  ) : sortedTransactions.map(t => (
                    <tr key={t.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{t.expense_date}</td>
                      <td className="py-2 text-[12px] font-medium">{t.category}</td>
                      <td className="py-2 text-[11px] text-muted-foreground max-w-[400px] truncate" title={t.description ?? ""}>
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
                    <td className="py-2 text-[12px] text-right tabular-nums">{fmtAED(spend)}</td>
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

      {/* Channel-economics table lives on Marketing — no duplicate here. */}
    </DashboardLayout>
  );
};

export default Finance;

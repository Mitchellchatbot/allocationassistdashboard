import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SectionDateRange } from "@/components/SectionDateRange";
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
  Wallet, Target, Zap, Users, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight,
} from "lucide-react";

// Short {meaning, source} pair for every Finance KPI label.
const FINANCE_KPI_HINTS: Record<string, { meaning: string; source: string }> = {
  "Marketing Spend":     { meaning: "Total spend across the SELECTED date range — not a monthly figure. Multi-month windows show the avg/mo in the sub-line.", source: "Marketing-spend imports." },
  "Leads Generated":     { meaning: "Zoho leads created in the period across every source.",                                    source: "Zoho CRM (Leads — Created_Time)." },
  "Cost Per Conversion": { meaning: "Marketing spend ÷ doctors onboarded (Doctors on Board rows in the period). The single ROI number across all channels.", source: "Marketing-spend imports + Zoho Doctors on Board." },
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

// Revenue per converted doctor lives in @/lib/revenue so Marketing + Finance
// rank channels using the same fee.
import { REVENUE_PER_CONVERSION_AED } from "@/lib/revenue";

// ── Flippable KPI card ────────────────────────────────────────────────────────

function FlipKpiCard({
  icon: Icon, label, value, sub, tone = "neutral", accent = "slate", back, backHeight = 240,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  /** Signal tone — colors the VALUE. Use sparingly for true positive/negative signals. */
  tone?: "neutral" | "good" | "bad" | "pending";
  /** Decorative tint for the icon chip only — gives each KPI a category color
   *  without bleeding into the value. Pick something that fits the metric. */
  accent?: "slate" | "blue" | "emerald" | "amber" | "violet" | "sky" | "rose" | "orange";
  back: React.ReactNode;
  backHeight?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const hint = FINANCE_KPI_HINTS[label];
  // Tone colors the VALUE only — used when the number is itself good/bad news.
  const valueColor =
    tone === "good"      ? "text-emerald-700"
    : tone === "bad"     ? "text-rose-700"
    : tone === "pending" ? "text-amber-700"
    : "text-foreground";
  // Accent colors the ICON CHIP, the top color stripe, and the card's
  // background gradient — gives each KPI a category identity without
  // shouting at the user.
  const ACCENTS = {
    slate:   { bg: "bg-slate-100",   fg: "text-slate-600",   stripe: "bg-slate-300",   gradient: "from-slate-50 to-card",   border: "border-slate-200"   },
    blue:    { bg: "bg-blue-50",     fg: "text-blue-600",    stripe: "bg-blue-400",    gradient: "from-blue-50 to-card",    border: "border-blue-200"    },
    emerald: { bg: "bg-emerald-50",  fg: "text-emerald-600", stripe: "bg-emerald-400", gradient: "from-emerald-50 to-card", border: "border-emerald-200" },
    amber:   { bg: "bg-amber-50",    fg: "text-amber-600",   stripe: "bg-amber-400",   gradient: "from-amber-50 to-card",   border: "border-amber-200"   },
    violet:  { bg: "bg-violet-50",   fg: "text-violet-600",  stripe: "bg-violet-400",  gradient: "from-violet-50 to-card",  border: "border-violet-200"  },
    sky:     { bg: "bg-sky-50",      fg: "text-sky-600",     stripe: "bg-sky-400",     gradient: "from-sky-50 to-card",     border: "border-sky-200"     },
    rose:    { bg: "bg-rose-50",     fg: "text-rose-600",    stripe: "bg-rose-400",    gradient: "from-rose-50 to-card",    border: "border-rose-200"    },
    orange:  { bg: "bg-orange-50",   fg: "text-orange-600",  stripe: "bg-orange-400",  gradient: "from-orange-50 to-card",  border: "border-orange-200"  },
  } as const;
  const a = ACCENTS[accent];
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
          className={`absolute inset-0 rounded-xl border ${a.border} bg-gradient-to-br ${a.gradient} shadow-sm hover:shadow-md hover:scale-[1.01] transition-all overflow-hidden flex flex-col`}
        >
          <div className={`h-1 ${a.stripe} shrink-0`} />
          <div className="px-4 py-3 flex items-start justify-between flex-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                {hint && <InfoIcon meaning={hint.meaning} source={hint.source} side="bottom" />}
              </div>
              <p className={`text-[22px] font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
              {sub && <p className="text-[10px] text-muted-foreground mt-1.5">{sub}</p>}
            </div>
            <div className={`h-8 w-8 rounded-lg ${a.bg} flex items-center justify-center shrink-0 ml-2`}>
              <Icon className={`h-4 w-4 ${a.fg}`} />
            </div>
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
          <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${a.bg} shrink-0`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${a.fg}`} />
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
            <span className="font-semibold tabular-nums">{fmtAED(c.amount)}</span>
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
        <p className={`text-[15px] font-bold ${up ? "text-rose-700" : "text-emerald-700"}`}>
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
        <p className="text-[18px] font-bold tabular-nums">{fmtAED(biggest.amount)}</p>
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
            <span className="font-semibold tabular-nums">{fmtAED(s.amount)}</span>
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
        <span className={`font-bold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtAED(profit)}</span>
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
  // Three-tone signal only — good / pending / bad. No more sky-blue mid tier.
  const ratingColor = roas >= 2 ? "text-emerald-700" : roas >= 1 ? "text-amber-700" : "text-rose-700";
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
        <span className="font-bold tabular-nums">{fmtAED(cpc)}</span>
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

  // Channel-breakdown drill-down — click a channel row to expand its
  // individual transactions inline. Single-channel expansion at a time keeps
  // the page short.
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const txnsByCategory = useMemo(() => {
    const m = new Map<string, typeof allTransactions>();
    for (const t of allTransactions) {
      const list = m.get(t.category) ?? [];
      list.push(t);
      m.set(t.category, list);
    }
    // Sort each list by date desc so the most recent shows first when expanded
    for (const list of m.values()) {
      list.sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? ""));
    }
    return m;
  }, [allTransactions]);

  // Legacy refs — kept for any back-card consumers (TopCategoryBack etc.)
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
      ? <ArrowUp className="h-3 w-3 text-foreground shrink-0" />
      : <ArrowDown className="h-3 w-3 text-foreground shrink-0" />;
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

  const costPerQualified  = leadStats.qualified  > 0 ? spend / leadStats.qualified  : 0;

  // Monthly P&L series — revenue, spend, and resulting profit per month.
  // Drives the chart at the bottom of the page so it tells the same story as
  // the P&L table above (Conversions × per-doctor fee − Marketing spend).
  const monthlyPnl = useMemo(() => {
    const map = new Map<string, { month: string; monthKey: string; spend: number; revenue: number; profit: number }>();
    for (const m of monthly) {
      map.set(m.monthKey, { month: m.month, monthKey: m.monthKey, spend: m.amount, revenue: 0, profit: 0 });
    }
    // Layer revenue from DoB conversions in window
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    for (const dob of zoho?.rawDoctorsOnBoard ?? []) {
      if (!dob.Created_Time) continue;
      const t = new Date(dob.Created_Time).getTime();
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      const key = dob.Created_Time.slice(0, 7);
      if (!key) continue;
      const label = new Date(key + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
      const cur = map.get(key) ?? { month: label, monthKey: key, spend: 0, revenue: 0, profit: 0 };
      cur.revenue += REVENUE_PER_CONVERSION_AED;
      map.set(key, cur);
    }
    // Compute profit per month
    for (const row of map.values()) {
      row.profit = row.revenue - row.spend;
    }
    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [monthly, zoho?.rawDoctorsOnBoard, dateRange]);

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
    // Revenue = conversions × fee per placement (5,000 AED). Computed per
    // month so the P&L lines up cleanly with marketing spend per month.
    const revenueByMonth: Record<string, number> = {};
    for (const m of months) {
      revenueByMonth[m.key] = (conversionsByMonth[m.key] ?? 0) * REVENUE_PER_CONVERSION_AED;
    }
    const revenueTotal = conversionsTotal * REVENUE_PER_CONVERSION_AED;
    return {
      marketingByMonth, marketingTotal,
      conversionsByMonth, conversionsTotal,
      revenueByMonth, revenueTotal,
      months,
    };
  }, [monthlySpendByChannel, zoho, dateRange]);

  return (
    <DashboardLayout title="Finance" subtitle="Revenue, spend, profit, and ROI across all channels">
      <SectionDateRange />
      {/* ── Period banner — explicit date range + currency lock ───────────────
          Designed to remove ambiguity: every figure on this tab is for the
          stated period, in the stated currency. Reduces "is that monthly or
          the whole quarter?" / "is that AED or USD?" confusion. */}
      <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-blue-700/80 mb-0.5">
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
          <p className="text-[10px] uppercase tracking-widest font-semibold text-blue-700/80 mb-0.5">
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
          icon={DollarSign} accent="blue"
          // Label explicitly says "(period total)" so a multi-month figure
          // can never be mistaken for a monthly number — Yemima saw 121K
          // and assumed it was monthly when it was a 3-month aggregate.
          label={monthly.length > 1 ? "Marketing Spend (period total)" : "Marketing Spend"}
          value={fmtAED(spend)}
          sub={monthly.length > 1
            ? `${monthly.length} months · ${fmtAED(avgMonthly)} / month avg`
            : `${transactionCount} transactions · ${byCategory.length} channels`}
          back={<TotalSpendBack byCategory={byCategory} total={spend} />}
        />
        {leadStats.totalLeads > 0 && (
          <FlipKpiCard
            icon={Users} label="Leads Generated" accent="emerald"
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
        {profitRows.conversionsTotal > 0 && spend > 0 && (() => {
          const cpc = spend / profitRows.conversionsTotal;
          return (
            <FlipKpiCard
              icon={Target} label="Cost Per Conversion" accent="orange"
              value={fmtAED(cpc)}
              sub={`${fmtAED(spend)} / ${fmtN(profitRows.conversionsTotal)} doctors`}
              back={
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Marketing spend</span><span className="font-semibold tabular-nums">{fmtAED(spend)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Doctors onboarded</span><span className="font-semibold tabular-nums">{fmtN(profitRows.conversionsTotal)}</span></div>
                  <div className="pt-2 border-t border-border/40 flex justify-between">
                    <span className="font-semibold">Cost per conversion</span>
                    <span className="font-bold tabular-nums">{fmtAED(cpc)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    The single ROI number across all channels. Lower = more efficient marketing spend per placement. Source: Zoho Doctors on Board × marketing_expenses.
                  </p>
                </div>
              }
            />
          );
        })()}
        {leadStats.qualified > 0 && spend > 0 && (
          <FlipKpiCard
            icon={Zap} label="Cost Per Qualified" accent="amber"
            tone={costPerQualified < 500 ? "good" : costPerQualified < 2000 ? "neutral" : "bad"}
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
          <strong>No Zoho leads created in this period.</strong> Cost Per Qualified is hidden because it'd divide by zero. If you expect leads here, check whether your lead capture forms are creating records in Zoho (not just in Meta / a landing page).
        </div>
      )}

      {/* ── Row 2: Top channel / Biggest expense / Spend growth / Avg monthly / Txns ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <FlipKpiCard
          icon={Crown} label="Top Channel (period)" accent="amber"
          value={topCategory ? normalizeChannelKey(topCategory.category) : "—"}
          sub={topCategory ? `${fmtAED(topCategory.amount)} period total · ${topCategory.pct.toFixed(1)}%` : ""}
          back={<TopCategoryBack top={topCategory} />}
        />
        <FlipKpiCard
          icon={Award} label="Biggest Single Expense" accent="orange"
          value={biggest ? fmtAED(biggest.amount) : "—"}
          sub={biggest ? `${normalizeChannelKey(biggest.category)} · single transaction` : ""}
          back={<BiggestBack biggest={biggest} />}
        />
        <FlipKpiCard
          icon={growthPct >= 0 ? TrendingUp : TrendingDown}
          label={growthPct >= 0 ? "Spend Increased" : "Spend Reduced"}
          // Spend going UP = bad (red), going DOWN = good (green).
          tone={growthPct >= 0 ? "bad" : "good"}
          accent={growthPct >= 0 ? "rose" : "emerald"}
          value={`${growthPct >= 0 ? "↑" : "↓"} ${Math.abs(growthPct).toFixed(1)}%`}
          sub={`vs ${fmtAED(prevSpend)} prior`}
          back={<GrowthBack growthPct={growthPct} total={spend} prevTotal={prevSpend} />}
        />
        <FlipKpiCard
          icon={CalendarDays} label="Avg Monthly" accent="sky"
          value={fmtAED(avgMonthly)}
          sub={`across ${monthly.length} month${monthly.length === 1 ? "" : "s"}`}
          back={<AvgMonthlyBack monthly={monthly} avg={avgMonthly} />}
        />
        <FlipKpiCard
          icon={Receipt} label="Transactions" accent="violet"
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
        <Card className="shadow-md border-border/60 mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">
              Monthly Marketing Spend by Channel
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">All values in {currency}, per month — channels sorted by period total</p>
          </CardHeader>
          <CardContent className="px-0 pb-3 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted/40 border-y border-border/60">
                <tr>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
                  {monthlySpendByChannel.months.map(m => (
                    <th key={m.key} className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Period total</th>
                </tr>
              </thead>
              <tbody>
                {monthlySpendByChannel.channels.map(c => (
                  <tr key={c.channel} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-5 text-[14px] font-semibold text-foreground">{c.channel}</td>
                    {monthlySpendByChannel.months.map(m => {
                      const v = c.perMonth[m.key];
                      return (
                        <td key={m.key} className="py-3.5 px-3 text-[14px] text-right tabular-nums text-foreground/80">
                          {v > 0 ? fmtAED(v) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-3.5 px-5 text-[14px] text-right tabular-nums font-bold text-blue-700">
                      {fmtAED(c.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-blue-50/60 font-semibold border-t-2 border-blue-200">
                  <td className="py-3.5 px-5 text-[13px] text-foreground">Total marketing spend</td>
                  {monthlySpendByChannel.months.map(m => {
                    const v = monthlySpendByChannel.channels.reduce((s, c) => s + (c.perMonth[m.key] ?? 0), 0);
                    return (
                      <td key={m.key} className="py-3.5 px-3 text-[14px] text-right tabular-nums">
                        {fmtAED(v)}
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-5 text-[15px] text-right tabular-nums font-bold text-blue-700">
                    {fmtAED(profitRows.marketingTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Profit P&L (structure shipped, numbers fill in as data arrives) ─ */}
      {monthlySpendByChannel.months.length > 0 && (
        <Card className="shadow-md border-border/60 mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">
              Profit &amp; Loss <span className="font-normal text-muted-foreground">(per month)</span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">Conversions × {fmtAED(REVENUE_PER_CONVERSION_AED)} per doctor − marketing spend. Payroll &amp; other operating costs fill in once the accountant delivers them.</p>
          </CardHeader>
          <CardContent className="px-0 pb-3 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted/40 border-y border-border/60">
                <tr>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Line item</th>
                  {profitRows.months.map(m => (
                    <th key={m.key} className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">
                      {m.label}
                    </th>
                  ))}
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right whitespace-nowrap">Period</th>
                </tr>
              </thead>
              <tbody>
                {/* Conversions — money brought in from Doctors on Board
                    placements (count × per-doctor revenue). */}
                <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 px-5 text-[14px] font-semibold text-foreground">Conversions</td>
                  {profitRows.months.map(m => {
                    const v = profitRows.revenueByMonth[m.key] ?? 0;
                    const n = profitRows.conversionsByMonth[m.key] ?? 0;
                    return (
                      <td key={m.key} className="py-3.5 px-3 text-[14px] text-right tabular-nums text-emerald-700 font-semibold">
                        {v > 0
                          ? <>{fmtAED(v)} <span className="text-[10px] text-emerald-700/70 font-normal ml-0.5">({n})</span></>
                          : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-5 text-[14px] text-right tabular-nums font-bold text-emerald-700">
                    {fmtAED(profitRows.revenueTotal)} <span className="text-[10px] text-emerald-700/70 font-normal ml-0.5">({profitRows.conversionsTotal})</span>
                  </td>
                </tr>
                {/* Marketing spend — real */}
                <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 px-5 text-[14px] font-semibold text-foreground">Marketing spend</td>
                  {profitRows.months.map(m => {
                    const v = profitRows.marketingByMonth[m.key] ?? 0;
                    return (
                      <td key={m.key} className="py-3.5 px-3 text-[14px] text-right tabular-nums text-rose-700/90">
                        {v > 0 ? `(${fmtAED(v)})` : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-5 text-[14px] text-right tabular-nums font-bold text-rose-700">
                    ({fmtAED(profitRows.marketingTotal)})
                  </td>
                </tr>
                {/* Payroll — placeholder until accountant delivers */}
                <tr className="border-b border-border/30">
                  <td className="py-3.5 px-5 text-[13px] font-medium text-muted-foreground">Payroll</td>
                  {profitRows.months.map(m => (
                    <td key={m.key} className="py-3.5 px-3 text-[13px] text-right text-muted-foreground/40">—</td>
                  ))}
                  <td className="py-3.5 px-5 text-[13px] text-right text-muted-foreground/40">—</td>
                </tr>
                {/* Other operating expenses — placeholder */}
                <tr className="border-b border-border/30">
                  <td className="py-3.5 px-5 text-[13px] font-medium text-muted-foreground">Other operating expenses</td>
                  {profitRows.months.map(m => (
                    <td key={m.key} className="py-3.5 px-3 text-[13px] text-right text-muted-foreground/40">—</td>
                  ))}
                  <td className="py-3.5 px-5 text-[13px] text-right text-muted-foreground/40">—</td>
                </tr>
                {/* Profit (marketing-only) — Revenue − Marketing spend.
                    True net profit will subtract payroll + other once those land. */}
                <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-bold">
                  <td className="py-4 px-5 text-[14px] text-foreground">Profit <span className="text-[11px] font-normal text-muted-foreground">(marketing-only)</span></td>
                  {profitRows.months.map(m => {
                    const rev = profitRows.revenueByMonth[m.key] ?? 0;
                    const spd = profitRows.marketingByMonth[m.key] ?? 0;
                    if (rev === 0 && spd === 0) {
                      return <td key={m.key} className="py-4 px-3 text-[13px] text-right text-muted-foreground/30">—</td>;
                    }
                    const profit = rev - spd;
                    return (
                      <td key={m.key} className={`py-4 px-3 text-[15px] text-right tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {profit < 0 ? `(${fmtAED(Math.abs(profit))})` : fmtAED(profit)}
                      </td>
                    );
                  })}
                  {(() => {
                    const profit = profitRows.revenueTotal - profitRows.marketingTotal;
                    return (
                      <td className={`py-4 px-5 text-[16px] text-right tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {profit < 0 ? `(${fmtAED(Math.abs(profit))})` : fmtAED(profit)}
                      </td>
                    );
                  })()}
                </tr>
                {/* Cost per Conversion — supplementary row, shown smaller below the Profit total */}
                <tr className="border-t border-border/40">
                  <td className="py-2.5 px-5 text-[11px] text-muted-foreground">Cost per Conversion</td>
                  {profitRows.months.map(m => {
                    const conversions = profitRows.conversionsByMonth[m.key] ?? 0;
                    const spd         = profitRows.marketingByMonth[m.key] ?? 0;
                    if (conversions === 0 || spd === 0) {
                      return <td key={m.key} className="py-2.5 px-3 text-[11px] text-right text-muted-foreground/30">—</td>;
                    }
                    return (
                      <td key={m.key} className="py-2.5 px-3 text-[11px] text-right tabular-nums text-muted-foreground">
                        {fmtAED(spd / conversions)}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-5 text-[11px] text-right tabular-nums text-muted-foreground font-medium">
                    {profitRows.conversionsTotal > 0 && profitRows.marketingTotal > 0
                      ? fmtAED(profitRows.marketingTotal / profitRows.conversionsTotal)
                      : <span className="text-muted-foreground/30">—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Monthly P&L: Revenue / Spend / Profit ── */}
      {monthlyPnl.length > 0 && (
        <Card className="shadow-md border-border/60 mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-[14px] font-semibold text-foreground">Revenue vs Spend vs Profit</CardTitle>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">Monthly P&amp;L — same numbers as the table above, in chart form</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Revenue</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />Spend</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-violet-500 rounded-full" />Profit</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyPnl} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" vertical={false} />
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(220,10%,45%)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="hsl(220,10%,45%)"
                  tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                                  : v >= 1_000     ? `${(v / 1_000).toFixed(0)}K`
                                  : `${v}`} />
                <Tooltip contentStyle={tip}
                  formatter={(v: number, name: string) => [fmtAED(v), name]} />
                <Bar  dataKey="revenue" name="Revenue" fill="hsl(160,65%,45%)" radius={[4, 4, 0, 0]} />
                <Bar  dataKey="spend"   name="Spend"   fill="hsl(0,75%,68%)"   radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Profit"
                  stroke="hsl(265,65%,55%)" strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(265,65%,55%)", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6 }} />
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

      {/* ── Spend Breakdown by Channel — click a row to drill into its
          individual transactions inline. Replaces the old standalone
          per-transaction table that was overwhelming. ── */}
      {byCategory.length > 0 && (
        <Card className="shadow-md border-border/60 mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">Spend Breakdown by Channel</CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">Click any channel row to see its individual transactions</p>
          </CardHeader>
          <CardContent className="px-0 pb-3 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-muted/40 border-y border-border/60">
                <tr>
                  <th className="py-3 px-2 w-8"></th>
                  <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
                  <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Txns</th>
                  <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Avg / Txn</th>
                  <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</th>
                  <th className="py-3 px-5 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c, i) => {
                  const isOpen = expandedCategory === c.category;
                  const txns = txnsByCategory.get(c.category) ?? [];
                  return (
                    <Fragment key={c.category}>
                      <tr
                        className={`border-b border-border/30 cursor-pointer transition-colors ${isOpen ? "bg-violet-50/60" : "hover:bg-muted/30"}`}
                        onClick={() => setExpandedCategory(isOpen ? null : c.category)}
                      >
                        <td className="py-3.5 px-2 text-center">
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform inline-block ${isOpen ? "rotate-90 text-violet-700" : ""}`} />
                        </td>
                        <td className="py-3.5 px-3 text-[14px] font-semibold">
                          <div className="flex items-center gap-2.5">
                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                            <span className="text-foreground">{c.category}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-[14px] text-right tabular-nums text-muted-foreground">{c.count}</td>
                        <td className="py-3.5 px-3 text-[14px] text-right tabular-nums text-muted-foreground">{fmtAED(c.avg)}</td>
                        <td className="py-3.5 px-3 text-[14px] text-right tabular-nums font-bold text-violet-700">{fmtAED(c.amount)}</td>
                        <td className="py-3.5 px-5 text-[14px] text-right tabular-nums text-muted-foreground">{c.pct.toFixed(1)}%</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-violet-50/30 border-b border-border/30">
                          <td colSpan={6} className="py-3 px-5">
                            <div className="overflow-x-auto" style={{ maxHeight: 320 }}>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border/40">
                                    <th className="py-2 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Date</th>
                                    <th className="py-2 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Description</th>
                                    <th className="py-2 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {txns.length === 0 ? (
                                    <tr><td colSpan={3} className="py-3 text-center text-[12px] text-muted-foreground">No transactions in this period</td></tr>
                                  ) : txns.map(t => (
                                    <tr key={t.id} className="border-b border-border/20 last:border-0">
                                      <td className="py-2 text-[12px] font-mono text-muted-foreground whitespace-nowrap pr-3">{t.expense_date}</td>
                                      <td className="py-2 text-[12px] text-foreground/80 max-w-[480px] truncate" title={t.description ?? ""}>
                                        {t.description || <span className="text-muted-foreground/40">—</span>}
                                      </td>
                                      <td className="py-2 text-[12px] text-right tabular-nums font-semibold">{fmtAED(t.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-violet-200 bg-violet-50/60 font-bold">
                  <td></td>
                  <td className="py-3.5 px-3 text-[14px] text-foreground">Total</td>
                  <td className="py-3.5 px-3 text-[14px] text-right tabular-nums">{byCategory.reduce((s, c) => s + c.count, 0)}</td>
                  <td className="py-3.5 px-3 text-[14px] text-right tabular-nums">—</td>
                  <td className="py-3.5 px-3 text-[15px] text-right tabular-nums text-violet-700">{fmtAED(spend)}</td>
                  <td className="py-3.5 px-5 text-[14px] text-right tabular-nums">100%</td>
                </tr>
              </tbody>
            </table>
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

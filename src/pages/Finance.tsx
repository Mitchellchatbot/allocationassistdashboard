import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SectionDateRange } from "@/components/SectionDateRange";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useMarketingExpenses, type CategorySpend, type MonthlyPoint, type TopTransaction } from "@/hooks/use-marketing-expenses";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { ChannelWinnerCards } from "@/components/ChannelEconomics";
import { ZohoBooksPanel } from "@/components/finance/ZohoBooksPanel";
import { PeriodPnlSummary } from "@/components/finance/PeriodPnlSummary";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useMetaAdsApi } from "@/hooks/use-meta-ads-api";
import { FinanceDigest } from "@/components/finance/FinanceDigest";
import { useCurrency } from "@/lib/CurrencyProvider";
import { normalizeChannelKey, classifyChannel, WEBSITE_SEO_RETAINER_AED, WEBSITE_SEO_START_MONTH, WEBSITE_SEO_ACTUALS, type ChannelKey } from "@/lib/channel-mapping";
import { useDoctorRevenue } from "@/hooks/use-doctor-dossier";
import { ChannelRoiTable } from "@/components/finance/ChannelRoiTable";
import { CompanyFinanceSankey } from "@/components/finance/CompanyFinanceSankey";
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
  sub?: React.ReactNode;
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

function TopCategoryBack({ top, conversions, revenue }: { top?: CategorySpend; conversions?: number; revenue?: number }) {
  const { fmt: fmtAED } = useCurrency();
  if (!top) return <p className="text-muted-foreground">No data in this period</p>;
  const attributed = conversions != null || (revenue != null && revenue > 0);
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Channel</p>
        <p className="text-[14px] font-semibold">{normalizeChannelKey(top.category)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="rounded-lg bg-emerald-50 p-2">
          <p className="text-[8px] text-emerald-700/70 uppercase tracking-wide">Conversions</p>
          <p className="text-[14px] font-bold tabular-nums text-emerald-700">{conversions != null ? conversions : "—"}</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-2">
          <p className="text-[8px] text-blue-700/70 uppercase tracking-wide">Revenue generated</p>
          <p className="text-[14px] font-bold tabular-nums text-blue-700">{revenue != null && revenue > 0 ? fmtAED(revenue) : "—"}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        {fmtAED(top.amount)} spent · {top.pct.toFixed(1)}% of marketing spend
        {attributed ? "" : ". No conversions are attributed to this channel yet (most Doctors-on-Board have no lead source set)."}
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
  const { data: books } = useZohoBooks(dateRange);
  const { data: metaAds } = useMetaAdsApi(dateRange);
  const { revenueForDoctor } = useDoctorRevenue();
  const { fmt: fmtAED, currency, rate, rateSource } = useCurrency();
  const {
    rows: allTransactions,
    total: spend, prevTotal: prevSpend, growthPct, avgMonthly, byCategory, monthly,
    topTransactions, biggest, topCategory, transactionCount,
  } = useMarketingExpenses();

  // Calendar months the SELECTED RANGE spans (e.g. 1 Jan → 25 Jun = 6), for the
  // period banner. Not monthly.length — that only counts months that actually
  // have marketing-sheet rows, so it undercounts the range (showed "3 months"
  // for a Jan–Jun range).
  const rangeMonthCount = useMemo(() => {
    const { from, to } = dateRange;
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  }, [dateRange]);

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

  // Per Islam (2026-05-04 onboarding): Meta spend is so high it skews the
  // blended Cost per Conversion. Allow excluding Meta from the average to
  // see what other channels look like in isolation. Meta is identified via
  // normalizeChannelKey on the marketing_expenses category column AND on
  // Doctors on Board's Lead_Source.
  const [cpcExcludeMeta, setCpcExcludeMeta] = useState(false);
  const metaSpend = useMemo(() => {
    return byCategory
      .filter(c => normalizeChannelKey(c.category) === "Meta")
      .reduce((s, c) => s + c.amount, 0);
  }, [byCategory]);
  const metaConversions = useMemo(() => {
    const dob = (zoho as { rawDoctorsOnBoard?: { Created_Time: string; Lead_Source: string | null }[] } | undefined)?.rawDoctorsOnBoard ?? [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return dob.filter(d => {
      if (normalizeChannelKey(d.Lead_Source) !== "Meta") return false;
      const t = d.Created_Time ? new Date(d.Created_Time).getTime() : NaN;
      return !isNaN(t) && t >= fromMs && t < toMs;
    }).length;
  }, [zoho, dateRange]);


  const hasData = transactionCount > 0 || leadStats.totalLeads > 0;

  // ── Monthly Spend × Channel grid (for the CEO-glanceable section) ─────────
  // Builds rows = channel, cols = months in the selected period. Used by the
  // "Monthly Marketing Spend by Channel" section + the profit P&L beneath it.
  type ChannelSpendRow = { channel: string; perMonth: Record<string, number>; total: number; source: "sheet" | "meta" | "books" };
  const monthlySpendByChannel = useMemo(() => {
    // Meta — REAL spend straight from the Meta Marketing API (live), by month.
    const metaByMonth: Record<string, number> = {};
    for (const d of metaAds?.dailySeries ?? []) {
      const k = (d.dateISO ?? "").slice(0, 7);
      if (k) metaByMonth[k] = (metaByMonth[k] ?? 0) + d.spend;
    }
    const hasMeta = Object.values(metaByMonth).some(v => v > 0);

    // Non-Meta channels. Prefer Zoho Books marketing transactions — each is
    // attributed to a channel by classifying its text (account / reference /
    // description). Meta-classified txns are dropped (the live API covers Meta).
    // Falls back to the marketing-expenses sheet when Books isn't connected.
    const booksTxns = books?.marketingTxns;
    const usingBooks = !!(booksTxns && booksTxns.length);
    const grid = new Map<string, Map<string, number>>();
    if (usingBooks) {
      for (const t of booksTxns!) {
        const ch = classifyChannel(t.text);
        // Meta → live API; "Other" → unmapped vendors (operational / unknown),
        // deliberately excluded so the table shows only real, mapped channels.
        if (ch === "Meta" || ch === "Other") continue;
        const key = (t.date ?? "").slice(0, 7);
        if (!key) continue;
        const row = grid.get(ch) ?? new Map<string, number>();
        row.set(key, (row.get(key) ?? 0) + (t.amount ?? 0));
        grid.set(ch, row);
      }
    } else {
      for (const t of allTransactions) {
        const ch = normalizeChannelKey(t.category);
        if (ch === "Meta" && hasMeta) continue;  // live API replaces the sheet's Meta
        const key = (t.expense_date ?? "").slice(0, 7);
        if (!key) continue;
        const row = grid.get(ch) ?? new Map<string, number>();
        row.set(key, (row.get(key) ?? 0) + (t.amount ?? 0));
        grid.set(ch, row);
      }
    }

    // Column set = union of all months that actually have spend (sheet, Books
    // channels, and Meta), so no month with data is hidden.
    const monthSet = new Set<string>();
    if (!usingBooks) for (const m of monthly) monthSet.add(m.monthKey);
    for (const k of Object.keys(metaByMonth)) monthSet.add(k);
    for (const row of grid.values()) for (const k of row.keys()) monthSet.add(k);
    // The Website / SEO retainer shows for every month of the selected range
    // from its start month on — even months with no booked bill — so make sure
    // those months are columns.
    const rangeMonths: string[] = [];
    {
      const d   = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1);
      const end = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), 1);
      while (d <= end) {
        rangeMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        d.setMonth(d.getMonth() + 1);
      }
    }
    for (const k of rangeMonths) if (k >= WEBSITE_SEO_START_MONTH) monthSet.add(k);
    if (monthSet.size === 0) {
      return { months: [] as { key: string; label: string }[], channels: [] as ChannelSpendRow[] };
    }
    const months = Array.from(monthSet).sort().map(k => ({
      key:   k,
      label: new Date(`${k}-01`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }));

    const channels: ChannelSpendRow[] = Array.from(grid.entries()).map(([channel, perMonthMap]) => {
      const perMonth: Record<string, number> = {};
      let total = 0;
      for (const m of months) { const v = perMonthMap.get(m.key) ?? 0; perMonth[m.key] = v; total += v; }
      return { channel, perMonth, total, source: usingBooks ? "books" : "sheet" };
    });

    if (hasMeta) {
      const perMonth: Record<string, number> = {};
      let total = 0;
      for (const m of months) { const v = metaByMonth[m.key] ?? 0; perMonth[m.key] = v; total += v; }
      channels.push({ channel: "Meta", perMonth, total, source: "meta" });
    }

    // Website / SEO = Scaled AI retainer model (see channel-mapping). Replaces
    // the unreliable bill-derived row with a fixed monthly retainer + the
    // confirmed actuals, from the retainer's start month on.
    {
      const perMonth: Record<string, number> = {};
      let total = 0;
      for (const m of months) {
        if (m.key < WEBSITE_SEO_START_MONTH) { perMonth[m.key] = 0; continue; }
        const v = WEBSITE_SEO_ACTUALS[m.key] ?? WEBSITE_SEO_RETAINER_AED;
        perMonth[m.key] = v; total += v;
      }
      const existing = channels.find(c => c.channel === "Website / SEO");
      if (existing) { existing.perMonth = perMonth; existing.total = total; }
      else channels.push({ channel: "Website / SEO", perMonth, total, source: "books" });
    }

    channels.sort((a, b) => b.total - a.total);
    return { months, channels };
  }, [allTransactions, monthly, metaAds, books, dateRange]);

  // ── Return on Investment by channel (spend vs revenue, per month) ──────────
  // Only the channels we can attribute. Spend reuses monthlySpendByChannel;
  // revenue = invoiced total of the doctors who CONVERTED from each channel,
  // bucketed by their conversion month. DoB Lead_Source is often empty, so we
  // recover it by matching the doctor to their Lead (email → phone → name).
  const channelRoi = useMemo(() => {
    const TARGET: ChannelKey[] = ["Meta", "Website / SEO", "Go Hire", "LinkedIn"];
    const months = monthlySpendByChannel.months;
    const spendByChannel = new Map(monthlySpendByChannel.channels.map(c => [c.channel, c.perMonth]));

    const nEmail = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const nPhone = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
    const nName  = (f: string | null | undefined, l: string | null | undefined) =>
      `${(f ?? "").trim().toLowerCase()} ${(l ?? "").trim().toLowerCase()}`.trim();
    const leadByEmail = new Map<string, { Lead_Source: string | null }>();
    const leadByPhone = new Map<string, { Lead_Source: string | null }>();
    const leadByName  = new Map<string, { Lead_Source: string | null }>();
    for (const l of zoho?.rawLeads ?? []) {
      const e = nEmail(l.Email), p = nPhone(l.Phone ?? l.Mobile), n = nName(l.First_Name, l.Last_Name);
      if (e && !leadByEmail.has(e)) leadByEmail.set(e, l);
      if (p && !leadByPhone.has(p)) leadByPhone.set(p, l);
      if (n && !leadByName.has(n))  leadByName.set(n, l);
    }

    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    const rev  = new Map<string, Map<string, number>>();
    const conv = new Map<string, Map<string, number>>();
    for (const dob of zoho?.rawDoctorsOnBoard ?? []) {
      if (!dob.Created_Time) continue;
      const d = new Date(dob.Created_Time);
      const t = d.getTime();
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      let src = dob.Lead_Source;
      if (!src) {
        const lead = leadByEmail.get(nEmail(dob.Email))
          || leadByPhone.get(nPhone(dob.Phone ?? dob.Mobile))
          || leadByName.get(nName(dob.First_Name, dob.Last_Name));
        src = lead?.Lead_Source ?? null;
      }
      const ch = normalizeChannelKey(src);
      if (!TARGET.includes(ch)) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const name = dob.Full_Name || `${dob.First_Name ?? ""} ${dob.Last_Name ?? ""}`.trim();
      if (!rev.has(ch))  rev.set(ch, new Map());
      if (!conv.has(ch)) conv.set(ch, new Map());
      rev.get(ch)!.set(key,  (rev.get(ch)!.get(key)  ?? 0) + revenueForDoctor(name));
      conv.get(ch)!.set(key, (conv.get(ch)!.get(key) ?? 0) + 1);
    }

    const rows = TARGET.map(ch => {
      const spend = spendByChannel.get(ch) ?? {};
      const rMap = rev.get(ch)  ?? new Map<string, number>();
      const cMap = conv.get(ch) ?? new Map<string, number>();
      const perMonth = months.map(m => ({
        key: m.key,
        spend:       spend[m.key] ?? 0,
        revenue:     rMap.get(m.key) ?? 0,
        conversions: cMap.get(m.key) ?? 0,
      }));
      return {
        channel:    ch,
        perMonth,
        totalSpend: perMonth.reduce((s, x) => s + x.spend, 0),
        totalRev:   perMonth.reduce((s, x) => s + x.revenue, 0),
        totalConv:  perMonth.reduce((s, x) => s + x.conversions, 0),
      };
    }).filter(r => r.totalSpend > 0 || r.totalRev > 0);

    return { months, rows };
  }, [monthlySpendByChannel, zoho, dateRange, revenueForDoctor]);

  // ── Profit P&L placeholders ───────────────────────────────────────────────
  // Marketing spend is real; payroll + other expenses + revenue are stubbed
  // until the new accountant delivers numbers. Structure shipped now so we
  // only have to fill in values when they land.
  const profitRows = useMemo(() => {
    const marketingByMonth: Record<string, number> = {};
    let marketingTotal = 0;
    for (const c of monthlySpendByChannel.channels) {
      for (const m of monthlySpendByChannel.months) {
        marketingByMonth[m.key] = (marketingByMonth[m.key] ?? 0) + c.perMonth[m.key];
      }
      marketingTotal += c.total;
    }
    // Conversions from Zoho "Doctors on Board" — bucket by Created_Time per
    // month. We use this to BOTH compute revenue AND to extend the column
    // set, because the team often closes deals in months where there's no
    // marketing spend on record (back-dated transactions, fee-only periods,
    // etc.) and they still want to see the conversions land.
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
    // Union of spend-months + conversion-months so the table never hides
    // a month that has revenue but no spend (or vice versa).
    const allKeys = new Set<string>();
    for (const m of monthlySpendByChannel.months)   allKeys.add(m.key);
    for (const k of Object.keys(conversionsByMonth)) allKeys.add(k);
    const months = Array.from(allKeys).sort().map(k => ({
      key:   k,
      label: new Date(`${k}-01`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }));

    // Revenue = conversions × fee per placement (AED 20,000).
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

  // ── Zoho Books actuals → P&L (when connected) ─────────────────────────────
  // When Zoho Books is wired up, the P&L table + chart use REAL invoiced
  // revenue and full expenses from Books instead of the conversions×fee
  // estimate. Falls back to the estimate when Books isn't connected.
  const booksPnl = useMemo(() => {
    if (!books?.configured || !books?.ok || !books.byMonth?.length) return null;
    const convByMonth = profitRows.conversionsByMonth;
    const months = [...books.byMonth]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => {
        let revenue = m.revenue;
        let estimated = false;
        // No invoiced revenue booked for this month yet (invoices lag) — fall
        // back to the conversions × per-doctor estimate, flagged with an *.
        if (revenue <= 0) {
          const est = (convByMonth[m.month] ?? 0) * REVENUE_PER_CONVERSION_AED;
          if (est > 0) { revenue = est; estimated = true; }
        }
        return {
          key:      m.month,
          label:    new Date(`${m.month}-01`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
          revenue,
          expenses: m.expenses,
          profit:   revenue - m.expenses,
          estimated,
        };
      });
    const revenueTotal = months.reduce((s, m) => s + m.revenue, 0);
    const expensesTotal = books.expenses ?? 0;
    return {
      months,
      revenueTotal,
      expensesTotal,
      profitTotal: revenueTotal - expensesTotal,
      outstanding: books.outstanding ?? 0,
      anyEstimated: months.some(m => m.estimated),
    };
  }, [books, profitRows.conversionsByMonth]);
  const useBooks = !!booksPnl;

  // Marketing spend from the Monthly Marketing Spend by Channel table (Meta
  // live + Books vendor bills + the Website/SEO retainer) — the period total
  // and a per-channel breakdown for the Marketing Spend KPI card.
  const marketingPeriodTotal = monthlySpendByChannel.channels.reduce((s, c) => s + c.total, 0);
  const marketingByChannel: CategorySpend[] = monthlySpendByChannel.channels
    .map(c => ({
      category: c.channel,
      amount: c.total,
      pct: marketingPeriodTotal > 0 ? (c.total / marketingPeriodTotal) * 100 : 0,
      count: 0,
      avg: 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Conversions + revenue attributed to the top channel (for its KPI back).
  const topChannelRoi = topCategory
    ? channelRoi.rows.find(r => r.channel === normalizeChannelKey(topCategory.category))
    : undefined;

  return (
    <DashboardLayout title="Finance" subtitle="Revenue, spend, profit, and ROI across all channels" docSlug="growth/finance">
      <SectionDateRange />
      {/* ── Period banner — explicit date range + currency lock ───────────────
          Designed to remove ambiguity: every figure on this tab is for the
          stated period, in the stated currency. Reduces "is that monthly or
          the whole quarter?" / "is that AED or USD?" confusion. */}
      <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3" data-tour="finance-banner">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-blue-700/80 mb-0.5">
            Showing finance for
          </p>
          <p className="text-[14px] font-semibold text-foreground">
            {dateRange.from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {" → "}
            {dateRange.to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            <span className="text-[12px] font-normal text-muted-foreground ml-2">
              ({rangeMonthCount} {rangeMonthCount === 1 ? "month" : "months"})
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
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            1 USD = {rate.toFixed(4)} AED
            <span className="ml-1">{rateSource === "live" ? "· live rate" : "· pegged"}</span>
          </p>
        </div>
      </div>

      {/* Headline P&L for the selected period — exact numbers + comparison to
          the previous equal-length period (Zoho Books actuals). */}
      <PeriodPnlSummary dateRange={dateRange} />

      {/* Actual revenue/expenses from Zoho Books (dormant until connected). */}
      <ZohoBooksPanel dateRange={dateRange} />

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
          // From the Monthly Marketing Spend by Channel table (Meta live + Books
          // vendor bills + Website/SEO retainer) — the period total. Label says
          // "(period total)" so a multi-month figure can't be mistaken for a
          // monthly number.
          label={monthly.length > 1 ? "Marketing Spend (period total)" : "Marketing Spend"}
          value={fmtAED(marketingPeriodTotal)}
          sub={`${marketingByChannel.length} channel${marketingByChannel.length === 1 ? "" : "s"}${monthly.length > 1 ? ` · ${monthly.length} months` : ""}`}
          back={<TotalSpendBack byCategory={marketingByChannel} total={marketingPeriodTotal} />}
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
          // When the "exclude Meta" toggle is on, subtract Meta's spend AND
          // Meta's conversions from the totals — gives a clearer view of what
          // every other channel costs per placement, since Meta's spend is so
          // high it tends to dominate the blended figure.
          const effSpend       = cpcExcludeMeta ? Math.max(0, spend - metaSpend)         : spend;
          const effConversions = cpcExcludeMeta ? Math.max(0, profitRows.conversionsTotal - metaConversions) : profitRows.conversionsTotal;
          const cpc            = effConversions > 0 ? effSpend / effConversions : 0;
          if (effConversions === 0 || effSpend === 0) return null;
          return (
            <FlipKpiCard
              icon={Target}
              label={cpcExcludeMeta ? "Cost Per Conversion (excl. Meta)" : "Cost Per Conversion"}
              accent="orange"
              value={fmtAED(cpc)}
              sub={
                <span className="flex items-center justify-between gap-2">
                  <span>{`${fmtAED(effSpend)} / ${fmtN(effConversions)} doctors`}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCpcExcludeMeta(v => !v); }}
                    className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold transition-colors ${
                      cpcExcludeMeta
                        ? "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"
                        : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
                    }`}
                    title={cpcExcludeMeta
                      ? "Currently excluding Meta. Click to include all channels."
                      : "Meta is the highest-spend channel — exclude it to see what other channels look like in isolation."}
                  >
                    {cpcExcludeMeta ? "Excl. Meta ✓" : "Excl. Meta"}
                  </button>
                </span>
              }
              back={
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Marketing spend{cpcExcludeMeta ? " (excl. Meta)" : ""}</span><span className="font-semibold tabular-nums">{fmtAED(effSpend)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Doctors onboarded{cpcExcludeMeta ? " (excl. Meta)" : ""}</span><span className="font-semibold tabular-nums">{fmtN(effConversions)}</span></div>
                  {cpcExcludeMeta && (
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Excluded — Meta</span>
                      <span className="tabular-nums">{fmtAED(metaSpend)} · {fmtN(metaConversions)} doctors</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border/40 flex justify-between">
                    <span className="font-semibold">Cost per conversion</span>
                    <span className="font-bold tabular-nums">{fmtAED(cpc)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    {cpcExcludeMeta
                      ? "Excluding Meta. Useful when Meta's high spend skews the blended figure and you want to see what other channels cost per placement on their own."
                      : "Blended ROI across all channels. Lower = more efficient marketing spend per placement. Toggle 'Excl. Meta' on the front to remove Meta from the average."}
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

      {/* ── Row 2: Top channel / Biggest expense / Spend growth / Txns ──
          (Avg Monthly dropped — it's already in the Marketing Spend card's
          subtext, so it was duplicate information.) */}
      <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <FlipKpiCard
          icon={Crown} label="Top Channel (period)" accent="amber"
          value={topCategory ? normalizeChannelKey(topCategory.category) : "—"}
          sub={topCategory ? `${fmtAED(topCategory.amount)} period total · ${topCategory.pct.toFixed(1)}%` : ""}
          back={<TopCategoryBack top={topCategory} conversions={topChannelRoi?.totalConv} revenue={topChannelRoi?.totalRev} />}
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
          icon={Receipt} label="Transactions" accent="violet"
          value={fmtN(transactionCount)}
          sub={byCategory.length > 0 ? `across ${byCategory.length} channels` : ""}
          back={<TransactionsBack txns={topTransactions} />}
        />
      </div>

      {/* Daily / Weekly / Monthly digest of revenue, spend & profit — sits
          below all the headline KPI cards so the numbers read first, then the
          trend chart. */}
      <FinanceDigest />

      {/* ── Monthly Marketing Spend by Channel ─────────────────────────────
          Built for Emilie. Rows = channels (canonical names — Meta, LinkedIn,
          etc.), cols = months in the selected period. Meta is live from the
          Meta API; other channels come from Zoho Books vendor bills. */}
      {monthlySpendByChannel.months.length > 0 && (
        <Card className="shadow-md border-border/60 mb-5">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">
              Monthly Marketing Spend by Channel
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">All values in {currency}, per month. <span className="text-emerald-700 font-medium">Meta is pulled live from the Meta Ads API</span>; LinkedIn and Go Hire come from Zoho Books vendor bills. <span className="text-foreground/70">Website / SEO is the Scaled AI retainer (~{fmtAED(WEBSITE_SEO_RETAINER_AED)}/mo), with confirmed actuals for Jan–Mar 2026 — the raw Books bills for this vendor are unreliable, so it's modelled.</span> Unmapped vendors are excluded.</p>
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
                    <td className="py-3.5 px-5 text-[14px] font-semibold text-foreground">
                      {c.channel}
                      {c.source === "meta" && <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 align-middle"><span className="h-1 w-1 rounded-full bg-emerald-500" /> live</span>}
                    </td>
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
                    {fmtAED(monthlySpendByChannel.channels.reduce((s, c) => s + c.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Return on Investment by channel — spend vs revenue per month, for the
          channels we can attribute (Meta, Website/SEO, Go Hire, LinkedIn). */}
      <ChannelRoiTable months={channelRoi.months} rows={channelRoi.rows} />

      {/* Company income-statement Sankey: revenue → expense groups → profit.
          Sits under the ROI table. */}
      <CompanyFinanceSankey dateRange={dateRange} />

      {/* Revenue vs Expenses vs Profit chart removed — the Digest's monthly
          chart already covers it. */}

      {/* Monthly Spend Trend area chart removed — the Digest above already
          plots spend per month, and the Spend Breakdown table covers the
          per-channel detail. */}

      {/* Channel Mix donut removed per request. */}

      {/* Old single-bar "ROI by channel" chart removed — the Return on
          Investment by Channel table above supersedes it (per-month spend +
          revenue + ROI). Channel-economics detail lives on Marketing. */}
    </DashboardLayout>
  );
};

export default Finance;

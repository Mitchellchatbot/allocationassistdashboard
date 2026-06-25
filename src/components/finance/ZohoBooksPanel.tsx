/**
 * ZohoBooksPanel — the Finance page's actual-numbers section, backed by
 * Zoho Books. Dormant-but-wired: until the Zoho Books secrets are set it shows
 * a "connect" prompt; once connected it shows real invoiced revenue, expenses,
 * profit, and outstanding for the selected period. The rest of the Finance page
 * keeps using its marketing-based estimate.
 *
 * The four headline cards FLIP (tap / click) to reveal deeper insights —
 * monthly breakdowns, top expense categories, the profit equation, and the
 * collection rate — without crowding the page with extra tables.
 */
import { useState, type ReactNode } from "react";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import { TrendingUp, Receipt, Wallet, Clock, Loader2, PlugZap, AlertCircle, RotateCw, type LucideIcon } from "lucide-react";

/** Format a value (already in display currency) with the given code. */
function fmtMoney(n: number, code: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${code} ${Math.round(n).toLocaleString()}`;
  }
}

/** "2026-04" → "Apr". Falls back to the raw key if it can't parse. */
function monthShort(ym: string): string {
  const [y, m] = (ym ?? "").split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

const ACCENTS: Record<string, { fg: string; bg: string; stripe: string; gradient: string; border: string; bar: string }> = {
  emerald: { fg: "text-emerald-700", bg: "bg-emerald-50", stripe: "bg-emerald-400", gradient: "from-emerald-50 to-card", border: "border-emerald-200", bar: "hsl(160,84%,39%)" },
  rose:    { fg: "text-rose-700",    bg: "bg-rose-50",    stripe: "bg-rose-400",    gradient: "from-rose-50 to-card",    border: "border-rose-200",    bar: "hsl(350,89%,60%)" },
  blue:    { fg: "text-blue-700",    bg: "bg-blue-50",    stripe: "bg-blue-400",    gradient: "from-blue-50 to-card",    border: "border-blue-200",    bar: "hsl(217,91%,60%)" },
  amber:   { fg: "text-amber-700",   bg: "bg-amber-50",   stripe: "bg-amber-400",   gradient: "from-amber-50 to-card",   border: "border-amber-200",   bar: "hsl(38,92%,50%)"  },
};

/** A flippable headline stat: front = the number, back = the insights. */
function FlipStat({ icon: Icon, label, value, sub, accent, back, backHeight = 248 }: {
  icon: LucideIcon; label: string; value: string; sub?: string;
  accent: keyof typeof ACCENTS; back: ReactNode; backHeight?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const a = ACCENTS[accent];
  return (
    <div
      className="cursor-pointer select-none"
      style={{
        perspective: "1200px",
        height: flipped ? `${backHeight}px` : "88px",
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
          className={`absolute inset-0 rounded-xl border ${a.border} bg-gradient-to-br ${a.gradient} shadow-sm hover:shadow-md hover:scale-[1.01] transition-all overflow-hidden flex flex-col`}
        >
          <div className={`h-1 ${a.stripe} shrink-0`} />
          <div className="px-3.5 py-2.5 flex items-start justify-between flex-1">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">{label}</p>
              <p className={`text-[20px] font-bold tabular-nums leading-none ${a.fg}`}>{value}</p>
              {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
            </div>
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.bg} ${a.fg} shrink-0 ml-2`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          <span className="absolute bottom-1.5 right-2 inline-flex items-center gap-0.5 text-[8px] text-muted-foreground/50">
            <RotateCw className="h-2.5 w-2.5" /> insights
          </span>
        </div>
        {/* Back */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-md flex flex-col overflow-hidden"
        >
          <div className={`flex items-center justify-between px-3.5 py-2 border-b border-border/30 ${a.bg} shrink-0`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${a.fg}`} />
              <span className="text-[11px] font-semibold">{label}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">tap to close</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3.5 py-2.5 min-h-0 text-[11px]">{back}</div>
        </div>
      </div>
    </div>
  );
}

/** Small labelled value chip used on the card backs. */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[12px] font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Horizontal mini-bars for a small ranked/timeline list. */
function MiniBars({ rows, money, color, signed }: {
  rows: { label: string; value: number }[]; money: (n: number) => string; color: string; signed?: boolean;
}) {
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const neg = signed && r.value < 0;
        return (
          <div key={`${r.label}-${i}`}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-muted-foreground truncate max-w-[120px]">{r.label}</span>
              <span className={`font-semibold tabular-nums ${neg ? "text-rose-700" : ""}`}>{money(r.value)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${(Math.abs(r.value) / max) * 100}%`,
                backgroundColor: neg ? "hsl(350,89%,60%)" : color,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ZohoBooksPanel({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { data, isLoading } = useZohoBooks(dateRange);
  const { fromAED, currency } = useCurrency();
  // Books amounts are in AED; convert to the header's display currency.
  const money = (n: number) => fmtMoney(fromAED(n), currency);

  if (isLoading) {
    return (
      <div className="mb-5 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Zoho Books…
      </div>
    );
  }

  // Not connected yet — show the plug-and-play prompt.
  if (!data?.configured) {
    return (
      <div className="mb-5 rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
            <PlugZap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Connect Zoho Books for actual revenue &amp; expenses</p>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">
              The numbers below are an <strong>estimate</strong> (conversions × placement fee) with marketing-only spend.
              Once Zoho Books is connected, this section shows your real invoiced revenue, full expenses, and true
              profit for the selected period — no code change needed.
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-1.5">
              Ready to plug in: set <code className="text-amber-700">ZOHO_BOOKS_CLIENT_ID</code>,{" "}
              <code className="text-amber-700">ZOHO_BOOKS_CLIENT_SECRET</code>,{" "}
              <code className="text-amber-700">ZOHO_BOOKS_REFRESH_TOKEN</code>,{" "}
              <code className="text-amber-700">ZOHO_BOOKS_ORG_ID</code>{" "}
              (+ optional <code className="text-amber-700">ZOHO_BOOKS_DC</code>) in the Supabase function secrets.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Connected but the live fetch failed.
  if (!data.ok) {
    return (
      <div className="mb-5 rounded-xl border border-rose-200/70 bg-rose-50/50 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12.5px] font-semibold text-foreground">Zoho Books is connected, but the fetch failed</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{data.error || "Unknown error. Check the refresh token, organization id, and data center."}</p>
        </div>
      </div>
    );
  }

  // Connected + live data.
  const revenue      = data.revenue ?? 0;
  const expenses     = data.expenses ?? 0;
  const profit       = data.profit ?? 0;
  const outstanding  = data.outstanding ?? 0;
  const invoiceCount = data.invoiceCount ?? 0;
  const expenseCount = data.expenseCount ?? 0;
  const margin       = revenue > 0 ? (profit / revenue) * 100 : 0;
  const byCategory   = data.byCategory ?? [];
  const topCats      = byCategory.slice(0, 4);

  // Per-month series (revenue / expenses / derived profit), most-recent last.
  const months = (data.byMonth ?? []).map(m => ({
    label: monthShort(m.month), revenue: m.revenue, expenses: m.expenses, profit: m.revenue - m.expenses,
  }));
  const lastMonths = months.slice(-5);

  // Derived insight figures.
  const avgInvoice       = invoiceCount > 0 ? revenue / invoiceCount : 0;
  const avgExpense       = expenseCount > 0 ? expenses / expenseCount : 0;
  const bestRevMonth     = months.length ? months.reduce((b, m) => (m.revenue > b.revenue ? m : b)) : null;
  const bestProfitMonth  = months.length ? months.reduce((b, m) => (m.profit > b.profit ? m : b)) : null;
  const avgMonthlyProfit = months.length ? months.reduce((s, m) => s + m.profit, 0) / months.length : 0;
  const collected        = Math.max(0, revenue - outstanding);
  const collectRate      = revenue > 0 ? Math.min(100, (collected / revenue) * 100) : 0;
  const outstandingPct   = revenue > 0 ? (outstanding / revenue) * 100 : 0;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · live
        </span>
        <span className="text-[10px] text-muted-foreground">Actuals for the selected period · shown in {currency} · tap a card for insights</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {/* ── Revenue ── */}
        <FlipStat
          icon={TrendingUp} label="Revenue (invoiced)" value={money(revenue)}
          sub={`${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}`} accent="emerald"
          back={
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <KV label="Invoices" value={String(invoiceCount)} />
                <KV label="Avg / invoice" value={money(avgInvoice)} />
              </div>
              {bestRevMonth && months.length > 1 && (
                <p className="text-[10px] text-muted-foreground">
                  Best month: <span className="font-semibold text-foreground">{bestRevMonth.label}</span> · {money(bestRevMonth.revenue)}
                </p>
              )}
              {lastMonths.length > 1 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5">Revenue by month</p>
                  <MiniBars rows={lastMonths.map(m => ({ label: m.label, value: m.revenue }))} money={money} color={ACCENTS.emerald.bar} />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground pt-1.5 border-t border-border/30">
                {money(collected)} collected · <span className="text-amber-700 font-medium">{money(outstanding)} outstanding</span>
              </p>
            </div>
          }
        />
        {/* ── Expenses ── */}
        <FlipStat
          icon={Receipt} label="Expenses" value={money(expenses)}
          sub={`${expenseCount} expense${expenseCount === 1 ? "" : "s"}`} accent="rose"
          back={
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <KV label="Transactions" value={String(expenseCount)} />
                <KV label="Avg / expense" value={money(avgExpense)} />
              </div>
              {topCats.length > 0 ? (
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5">Top categories</p>
                  <MiniBars rows={topCats.map(c => ({ label: c.name, value: c.amount }))} money={money} color={ACCENTS.rose.bar} />
                </div>
              ) : lastMonths.length > 1 ? (
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5">Expenses by month</p>
                  <MiniBars rows={lastMonths.map(m => ({ label: m.label, value: m.expenses }))} money={money} color={ACCENTS.rose.bar} />
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No category breakdown available for this period.</p>
              )}
            </div>
          }
        />
        {/* ── Profit ── */}
        <FlipStat
          icon={Wallet} label="Profit" value={money(profit)}
          sub={`${margin.toFixed(0)}% margin`} accent={profit >= 0 ? "blue" : "rose"}
          back={
            <div className="space-y-2.5">
              <div className="rounded-lg bg-muted/40 px-2.5 py-2 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="tabular-nums font-semibold text-emerald-700">{money(revenue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">− Expenses</span><span className="tabular-nums font-semibold text-rose-700">{money(expenses)}</span></div>
                <div className="flex justify-between pt-1 border-t border-border/40"><span className="font-semibold">= Profit</span><span className={`tabular-nums font-bold ${profit >= 0 ? "text-blue-700" : "text-rose-700"}`}>{money(profit)}</span></div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Margin</span>
                <span className="font-semibold tabular-nums">{margin.toFixed(1)}%</span>
              </div>
              {months.length > 1 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1.5">Profit by month</p>
                  <MiniBars rows={lastMonths.map(m => ({ label: m.label, value: m.profit }))} money={money} color={ACCENTS.blue.bar} signed />
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Best: <span className="font-semibold text-foreground">{bestProfitMonth?.label}</span> · Avg/mo {money(avgMonthlyProfit)}
                  </p>
                </div>
              )}
            </div>
          }
        />
        {/* ── Outstanding ── */}
        <FlipStat
          icon={Clock} label="Outstanding" value={money(outstanding)}
          sub="unpaid invoices" accent="amber"
          back={
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1 text-[10px]">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="font-semibold tabular-nums">{collectRate.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${collectRate}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${100 - collectRate}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground">
                  <span>{money(collected)} in</span>
                  <span>{money(outstanding)} due</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <KV label="Invoiced" value={money(revenue)} />
                <KV label="% Outstanding" value={`${outstandingPct.toFixed(0)}%`} />
              </div>
              <p className="text-[10px] text-muted-foreground pt-1.5 border-t border-border/30">
                Unpaid balance on invoices raised. Lower is better — money earned but not yet in the bank.
              </p>
            </div>
          }
        />
      </div>
      {topCats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topCats.map(c => (
            <span key={c.name} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
              {c.name}: <span className="font-semibold text-foreground">{money(c.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

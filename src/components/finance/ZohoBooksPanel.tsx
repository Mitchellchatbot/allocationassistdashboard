/**
 * ZohoBooksPanel — the Finance page's actual-numbers section, backed by
 * Zoho Books. Dormant-but-wired: until the Zoho Books secrets are set it shows
 * a "connect" prompt; once connected it shows real invoiced revenue, expenses,
 * profit, and outstanding for the selected period. The rest of the Finance page
 * keeps using its marketing-based estimate.
 */
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { TrendingUp, Receipt, Wallet, Clock, Loader2, PlugZap, AlertCircle, type LucideIcon } from "lucide-react";

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

const ACCENTS: Record<string, { fg: string; bg: string }> = {
  emerald: { fg: "text-emerald-700", bg: "bg-emerald-50" },
  rose:    { fg: "text-rose-700",    bg: "bg-rose-50"    },
  blue:    { fg: "text-blue-700",    bg: "bg-blue-50"    },
  amber:   { fg: "text-amber-700",   bg: "bg-amber-50"   },
};

function Stat({ icon: Icon, label, value, sub, accent }: {
  icon: LucideIcon; label: string; value: string; sub?: string; accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="rounded-xl border border-border/50 bg-card p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.bg} ${a.fg}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-[20px] font-bold tabular-nums ${a.fg}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function ZohoBooksPanel({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { data, isLoading } = useZohoBooks(dateRange);

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
  const cur     = data.currency ?? "AED";
  const revenue = data.revenue ?? 0;
  const profit  = data.profit ?? 0;
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
  const topCats = (data.byCategory ?? []).slice(0, 4);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · live
        </span>
        <span className="text-[10px] text-muted-foreground">Actuals for the selected period</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={TrendingUp} label="Revenue (invoiced)" value={fmt(revenue, cur)} sub={`${data.invoiceCount ?? 0} invoices`} accent="emerald" />
        <Stat icon={Receipt}    label="Expenses"           value={fmt(data.expenses ?? 0, cur)} sub={`${data.expenseCount ?? 0} expenses`} accent="rose" />
        <Stat icon={Wallet}     label="Profit"             value={fmt(profit, cur)} sub={`${margin.toFixed(0)}% margin`} accent={profit >= 0 ? "blue" : "rose"} />
        <Stat icon={Clock}      label="Outstanding"        value={fmt(data.outstanding ?? 0, cur)} sub="unpaid invoices" accent="amber" />
      </div>
      {topCats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topCats.map(c => (
            <span key={c.name} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
              {c.name}: <span className="font-semibold text-foreground">{fmt(c.amount, cur)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

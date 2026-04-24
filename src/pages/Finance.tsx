import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  AreaChart, Area,
} from "recharts";

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
  "hsl(50,85%,50%)",
];

function fmtAED(n: number): string {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `AED ${(n / 1_000).toFixed(1)}K`;
  return `AED ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const Finance = () => {
  const { finance, roiData } = useFilteredData();
  const { total, byCategory, monthly } = useMarketingExpenses();

  const marketingKpi = {
    label:  "Marketing Spend",
    value:  fmtAED(total),
    icon:   "dollar" as const,
    change: 0,
    period: byCategory.length > 0 ? `across ${byCategory.length} channels` : "no data — import sheet",
  };

  // Replace the first Zoho finance KPI if it's the placeholder "Marketing Spend N/A"
  const financeCards = finance.map(f => f.label === "Marketing Spend" ? marketingKpi : f);

  return (
    <DashboardLayout title="Finance" subtitle="Track revenue, spending, and how much return you're getting on investment">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {financeCards.map(m => <KpiCard key={m.label} {...m} />)}
      </div>

      {/* ── Marketing spend breakdown ──────────────────────────────── */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Spend by Channel
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={byCategory} layout="vertical" barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false}
                    stroke="hsl(220,10%,55%)" tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`} />
                  <YAxis dataKey="category" type="category" fontSize={10} tickLine={false} axisLine={false}
                    width={90} stroke="hsl(220,10%,55%)" />
                  <Tooltip contentStyle={tip}
                    formatter={(v: number, _n, p) => [fmtAED(v), p.payload.category]} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Monthly Spend Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={320}>
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
                  <Tooltip contentStyle={tip} formatter={(v: number) => [fmtAED(v), "Spend"]} />
                  <Area type="monotone" dataKey="amount" stroke="hsl(170,55%,45%)" fill="url(#spendGrad)"
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Return on Investment by Channel</CardTitle>
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

      {/* Detailed ledger */}
      {byCategory.length > 0 && (
        <Card className="shadow-sm border-border/50 mt-5">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Spend Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-left">Channel</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right"># Entries</th>
                    <th className="text-[10px] uppercase tracking-wide text-muted-foreground py-2 text-right">Total Spend</th>
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
                      <td className="py-2 text-[12px] text-right tabular-nums font-semibold">{fmtAED(c.amount)}</td>
                      <td className="py-2 text-[12px] text-right tabular-nums text-muted-foreground">{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border/80 font-semibold">
                    <td className="py-2 text-[12px]">Total</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">
                      {byCategory.reduce((s, c) => s + c.count, 0)}
                    </td>
                    <td className="py-2 text-[12px] text-right tabular-nums">{fmtAED(total)}</td>
                    <td className="py-2 text-[12px] text-right tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
};

export default Finance;

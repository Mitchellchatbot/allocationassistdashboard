/**
 * CompanyFinanceSankey — an income-statement Sankey for the selected period.
 * Revenue (the single source) flows out into each bucketed expense category and
 * whatever is left over lands in Profit (retained). It's value-conserving:
 * revenue = Σ expense buckets + profit.
 *
 * Backed by Zoho Books actuals (revenue + the per-category expense breakdown).
 * Renders nothing until Books is connected and a fetch succeeds.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";

// How many expense buckets to show before rolling the rest into "Other".
const TOP_BUCKETS = 12;

const REVENUE_COLOR = "#2563eb";
const PROFIT_COLOR  = "#10b981";
// Muted warm palette for the expense buckets.
const EXPENSE_COLORS = [
  "#f43f5e", "#fb7185", "#f97316", "#fb923c", "#f59e0b", "#fbbf24",
  "#e879f9", "#c084fc", "#a78bfa", "#94a3b8", "#cbd5e1", "#fda4af", "#fca5a5",
];

interface SankeyNodeProps {
  x: number; y: number; width: number; height: number;
  payload: { name: string; color?: string; value: number };
  containerWidth: number;
}

export function CompanyFinanceSankey({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { data } = useZohoBooks(dateRange);
  const { fmt } = useCurrency();

  const model = useMemo(() => {
    if (!data?.configured || !data.ok) return null;
    const revenue  = data.revenue ?? 0;
    const breakdown = (data.expenseBreakdown ?? []).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
    if (revenue <= 0 || breakdown.length === 0) return null;

    // Bucket: top N categories, the rest rolled into "Other expenses".
    const top = breakdown.slice(0, TOP_BUCKETS);
    const restTotal = breakdown.slice(TOP_BUCKETS).reduce((s, c) => s + c.amount, 0);
    const buckets = top.map(c => ({ name: c.category, amount: c.amount }));
    if (restTotal > 0) buckets.push({ name: "Other expenses", amount: restTotal });

    const totalExpenses = buckets.reduce((s, b) => s + b.amount, 0);
    const profit = revenue - totalExpenses;

    const nodes: { name: string; color: string }[] = [{ name: "Revenue", color: REVENUE_COLOR }];
    const links: { source: number; target: number; value: number }[] = [];
    buckets.forEach((b, i) => {
      const idx = nodes.push({ name: b.name, color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }) - 1;
      links.push({ source: 0, target: idx, value: b.amount });
    });
    if (profit > 0) {
      const pIdx = nodes.push({ name: "Profit (retained)", color: PROFIT_COLOR }) - 1;
      links.push({ source: 0, target: pIdx, value: profit });
    }
    return { nodes, links, revenue, totalExpenses, profit };
  }, [data]);

  if (!model) return null;

  const Node = ({ x, y, width, height, payload, containerWidth }: SankeyNodeProps) => {
    const leftHalf = x < containerWidth / 2;
    return (
      <Layer>
        <Rectangle x={x} y={y} width={width} height={height} fill={payload.color ?? "#6366f1"} fillOpacity={0.92} radius={[2, 2, 2, 2]} />
        <text
          x={leftHalf ? x - 8 : x + width + 8}
          y={y + height / 2}
          textAnchor={leftHalf ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill="hsl(220,15%,30%)"
        >
          {payload.name}
          <tspan fontWeight={400} fill="hsl(220,10%,55%)"> · {fmt(payload.value)}</tspan>
        </text>
      </Layer>
    );
  };

  return (
    <Card className="shadow-md border-border/60 mb-5">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-[14px] font-semibold text-foreground">Where the Money Goes</CardTitle>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · actuals
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          {fmt(model.revenue)} revenue for the period flows out into each expense bucket;
          {model.profit > 0
            ? <> what's left — <span className="text-emerald-700 font-medium">{fmt(model.profit)} profit</span> — is retained.</>
            : <> expenses ran to {fmt(model.totalExpenses)}, a <span className="text-rose-600 font-medium">net loss of {fmt(Math.abs(model.profit))}</span>.</>}
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={Math.max(420, model.nodes.length * 30)}>
          <Sankey
            data={{ nodes: model.nodes, links: model.links }}
            nodePadding={22}
            nodeWidth={14}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            node={(props: any) => <Node {...props} />}
            link={{ stroke: "#cbd5e1", strokeOpacity: 0.4 }}
            margin={{ top: 10, right: 190, bottom: 10, left: 90 }}
          >
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number) => [fmt(v), "amount"]}
            />
          </Sankey>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

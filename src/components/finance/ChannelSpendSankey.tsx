/**
 * ChannelSpendSankey — a money Sankey of marketing spend: the total budget
 * flows out to each channel, and each channel's spend then splits into the
 * portion returned as revenue vs. the portion not recovered. Channel bars are
 * sized by SPEND. Fed by the per-channel spend + revenue from the ROI table.
 *
 * (It's spend-conserving, so a channel that earns back more than it costs shows
 *  fully "returned" — the surplus/return multiple lives in the ROI table.)
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useCurrency } from "@/lib/CurrencyProvider";

export interface SpendSankeyRow { channel: string; totalSpend: number; totalRev: number; }

const CHANNEL_COLOR: Record<string, string> = {
  "Meta": "#3b5bdb",
  "Website / SEO": "#0ea5e9",
  "LinkedIn": "#2563eb",
  "Go Hire": "#14b8a6",
  "Google Ads": "#f59e0b",
};
const TOTAL_COLOR     = "#6366f1";
const RETURNED_COLOR  = "#10b981";
const UNRECOVERED_COLOR = "#f43f5e";

interface SankeyNodeProps {
  x: number; y: number; width: number; height: number;
  payload: { name: string; color?: string; value: number };
  containerWidth: number;
}

export function ChannelSpendSankey({ rows }: { rows: SpendSankeyRow[] }) {
  const { fmt } = useCurrency();
  const spendRows = rows.filter(r => r.totalSpend > 0);
  if (spendRows.length === 0) return null;

  // Build nodes + links (spend-conserving).
  const nodes: { name: string; color: string }[] = [];
  const links: { source: number; target: number; value: number }[] = [];
  const totalIdx = nodes.push({ name: "Marketing spend", color: TOTAL_COLOR }) - 1;
  const chIdx: Record<string, number> = {};
  spendRows.forEach(r => { chIdx[r.channel] = nodes.push({ name: r.channel, color: CHANNEL_COLOR[r.channel] ?? "#6366f1" }) - 1; });
  const returnedIdx    = nodes.push({ name: "Returned as revenue", color: RETURNED_COLOR }) - 1;
  const unrecoveredIdx = nodes.push({ name: "Unrecovered", color: UNRECOVERED_COLOR }) - 1;

  spendRows.forEach(r => {
    const returned    = Math.min(r.totalSpend, Math.max(0, r.totalRev));
    const unrecovered = Math.max(0, r.totalSpend - r.totalRev);
    links.push({ source: totalIdx, target: chIdx[r.channel], value: r.totalSpend });
    if (returned > 0)    links.push({ source: chIdx[r.channel], target: returnedIdx,    value: returned });
    if (unrecovered > 0) links.push({ source: chIdx[r.channel], target: unrecoveredIdx, value: unrecovered });
  });

  // Custom node: coloured bar + label with the (money) throughput.
  const FunnelNode = ({ x, y, width, height, payload, containerWidth }: SankeyNodeProps) => {
    const leftHalf = x < containerWidth / 2;
    return (
      <Layer>
        <Rectangle x={x} y={y} width={width} height={height} fill={payload.color ?? "#6366f1"} fillOpacity={0.92} radius={[2, 2, 2, 2]} />
        <text
          x={leftHalf ? x + width + 8 : x - 8}
          y={y + height / 2}
          textAnchor={leftHalf ? "start" : "end"}
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
        <CardTitle className="text-[14px] font-semibold text-foreground">Marketing Spend Flow by Channel</CardTitle>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Where the budget goes and what comes back: total spend splits across channels, then each channel's spend into the
          {" "}<span className="text-emerald-700 font-medium">portion returned as revenue</span> vs.
          {" "}<span className="text-rose-600 font-medium">unrecovered</span>. Bars are sized by spend; the return multiple is in the ROI table above.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={380}>
          <Sankey
            data={{ nodes, links }}
            nodePadding={26}
            nodeWidth={12}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            node={(props: any) => <FunnelNode {...props} />}
            link={{ stroke: "#cbd5e1", strokeOpacity: 0.35 }}
            margin={{ top: 10, right: 170, bottom: 10, left: 12 }}
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

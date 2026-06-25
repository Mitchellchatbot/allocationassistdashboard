/**
 * ChannelFunnelSankey — a Sankey flow of the marketing funnel: each channel's
 * leads flowing into Qualified (or dropping off), and qualified leads flowing
 * into Converted (or not). Built from useChannelEconomics for the active date
 * range. Gives an at-a-glance picture of where volume comes from and where it
 * leaks out of the funnel.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useChannelEconomics } from "@/hooks/use-channel-economics";

// Channel colours (fall back to indigo for anything unmapped).
const CHANNEL_COLOR: Record<string, string> = {
  "Meta": "#3b5bdb",
  "Website / SEO": "#0ea5e9",
  "LinkedIn": "#2563eb",
  "Go Hire": "#14b8a6",
  "Google Ads": "#f59e0b",
  "Referrals": "#a855f7",
};
const STAGE_COLOR = {
  qualified:    "#6366f1",
  notQualified: "#cbd5e1",
  converted:    "#10b981",
  notConverted: "#94a3b8",
};

interface SankeyNodeProps {
  x: number; y: number; width: number; height: number;
  index: number; payload: { name: string; color?: string; value: number };
  containerWidth: number;
}

/** Custom node: a coloured bar with a label + count just outside it. */
function FunnelNode({ x, y, width, height, payload, containerWidth }: SankeyNodeProps) {
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
        <tspan fontWeight={400} fill="hsl(220,10%,55%)"> · {payload.value.toLocaleString()}</tspan>
      </text>
    </Layer>
  );
}

export function ChannelFunnelSankey() {
  const rows = useChannelEconomics();

  const data = useMemo(() => {
    // Real channels with lead volume in the window (skip legacy/phased-out).
    const chRows = rows
      .filter(r => r.leads > 0 && !r.isLegacy)
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 6);
    if (chRows.length === 0) return null;

    const nodes: { name: string; color: string }[] = [];
    const index: Record<string, number> = {};
    const add = (name: string, color: string) => { index[name] = nodes.length; nodes.push({ name, color }); return index[name]; };

    chRows.forEach(r => add(r.channel, CHANNEL_COLOR[r.channel] ?? "#6366f1"));
    const qi = add("Qualified", STAGE_COLOR.qualified);
    const di = add("Dropped (unqualified)", STAGE_COLOR.notQualified);
    const ci = add("Converted", STAGE_COLOR.converted);
    const li = add("Not converted", STAGE_COLOR.notConverted);

    const links: { source: number; target: number; value: number }[] = [];
    let totalQ = 0, totalCv = 0;
    chRows.forEach(r => {
      const leads = r.leads;
      const q  = Math.min(r.qualified, leads);   // clamp: qualified can't exceed window leads
      const cv = Math.min(r.converted, q);       // clamp: converted can't exceed qualified
      totalQ += q; totalCv += cv;
      if (q > 0)          links.push({ source: index[r.channel], target: qi, value: q });
      if (leads - q > 0)  links.push({ source: index[r.channel], target: di, value: leads - q });
    });
    if (totalCv > 0)          links.push({ source: qi, target: ci, value: totalCv });
    if (totalQ - totalCv > 0) links.push({ source: qi, target: li, value: totalQ - totalCv });

    if (links.length === 0) return null;
    return { nodes, links };
  }, [rows]);

  if (!data) return null;

  return (
    <Card className="shadow-md border-border/60 mb-5">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-[14px] font-semibold text-foreground">Lead Funnel by Channel</CardTitle>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          How leads flow from each channel through <span className="text-indigo-600 font-medium">Qualified</span> to
          {" "}<span className="text-emerald-700 font-medium">Converted</span> — and where they drop off — for the selected period.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={380}>
          <Sankey
            data={data}
            nodePadding={26}
            nodeWidth={12}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            node={(props: any) => <FunnelNode {...props} />}
            link={{ stroke: "#cbd5e1", strokeOpacity: 0.35 }}
            margin={{ top: 10, right: 150, bottom: 10, left: 12 }}
          >
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              formatter={(v: number) => [v.toLocaleString(), "leads"]}
            />
          </Sankey>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

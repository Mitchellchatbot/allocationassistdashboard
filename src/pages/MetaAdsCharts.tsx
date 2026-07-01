// Co-located recharts charts for the Meta Ads page.
//
// Why this file exists: MetaAds.tsx used to statically `import ... from "recharts"`,
// which pulled the (large) vendor-charts chunk into the page's eager bundle even
// before any chart mounted. All recharts-using JSX now lives here so the page can
// `lazy(() => import("./MetaAdsCharts"))` each piece and defer that chunk until a
// chart actually renders.
//
// IMPORTANT: recharts is imported ONCE, whole, in THIS module. Do not split its
// symbols across modules — a partial import triggers a known TDZ init-order crash.
import { memo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { GroupedStat } from "@/hooks/use-meta-leads-stats";
import type { MetaDailyPoint, MetaAgeRow } from "@/hooks/use-meta-ads-api";

// ── Shared styling / formatters (kept identical to MetaAds.tsx) ────────────────
const PIE_COLORS = [
  "hsl(170,55%,45%)", "hsl(210,75%,52%)", "hsl(340,70%,55%)",
  "hsl(38,92%,50%)",  "hsl(270,60%,55%)", "hsl(158,50%,42%)",
  "hsl(0,65%,55%)",   "hsl(200,80%,48%)", "hsl(50,85%,50%)",
  "hsl(290,55%,52%)",
];

const tip = {
  backgroundColor: "#fff", border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px", fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "8px 12px",
};

function fmtC(v: number, currency = "PKR") {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toFixed(0)}`;
}
function fmtN(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

// ── Horizontal bar chart (Leads by Campaign / Country) ─────────────────────────
export const HBarChart = memo(function HBarChart({ data, color, height = 260 }: { data: GroupedStat[]; color: string; height?: number }) {
  if (data.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-12">No data</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
        <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <YAxis dataKey="label" type="category" fontSize={9} tickLine={false} axisLine={false} width={130} stroke="hsl(220,10%,55%)"
          tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + "…" : v} />
        <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), "Leads"]} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Daily Spend & Clicks (area) ────────────────────────────────────────────────
// `toDisplay` + `currency` are passed in so the AED↔USD toggle stays in sync
// with the page (they live in the page's component scope).
export const DailySpendClicksChart = memo(function DailySpendClicksChart({
  dailySeries, toDisplay, currency,
}: {
  dailySeries: MetaDailyPoint[];
  toDisplay: (v: number) => number;
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dailySeries}>
        <defs>
          <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(170,55%,45%)" stopOpacity={0.18} />
            <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="clG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.14} />
            <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
        <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false}
          interval={Math.max(0, Math.floor(dailySeries.length / 10) - 1)} />
        <YAxis yAxisId="s" orientation="left"  fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtC(toDisplay(v), currency)} width={65} />
        <YAxis yAxisId="c" orientation="right" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} width={42} />
        <Tooltip contentStyle={tip} formatter={(v: number, name: string) => name === "Spend" ? [fmtC(toDisplay(v), currency), name] : [fmtN(v), name]} />
        <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
        <Area yAxisId="s" type="monotone" dataKey="spend"  stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#spG)" name="Spend" />
        <Area yAxisId="c" type="monotone" dataKey="clicks" stroke="hsl(210,75%,52%)" strokeWidth={2} fill="url(#clG)" name="Clicks" />
      </AreaChart>
    </ResponsiveContainer>
  );
});

// ── Impressions by Age & Gender (grouped bar) ──────────────────────────────────
export const AgeGenderChart = memo(function AgeGenderChart({ byAge }: { byAge: MetaAgeRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={byAge} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
        <XAxis dataKey="age" fontSize={9} tickLine={false} axisLine={false} />
        <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} width={38} />
        <Tooltip contentStyle={tip} formatter={(v: number) => [fmtN(v), ""]} />
        <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
        <Bar dataKey="male"   fill="hsl(210,75%,52%)" name="Male"   radius={[2, 2, 0, 0]} />
        <Bar dataKey="female" fill="hsl(340,70%,58%)" name="Female" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Platform (utm_source) share (pie) ──────────────────────────────────────────
export const PlatformPieChart = memo(function PlatformPieChart({ byPlatformL }: { byPlatformL: GroupedStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={byPlatformL} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2}>
          {byPlatformL.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), ""]} />
        <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
});

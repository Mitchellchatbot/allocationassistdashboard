import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import {
  Treemap, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import { useCurrency } from "@/lib/CurrencyProvider";
import { ChannelIcon } from "@/components/ChannelIcon";
import { useMemo, useState } from "react";

// Consistent colours per channel rank — distinct hues so the slices read at a
// glance. Beyond 8 channels we cycle through muted tones since the long tail
// rarely matters for budget conversations anyway.
const SPEND_COLORS = [
  "hsl(210, 75%, 52%)",  // blue   — Meta-style primary
  "hsl(170, 65%, 45%)",  // teal   — Website / SEO
  "hsl(245, 65%, 60%)",  // indigo — LinkedIn
  "hsl(35,  90%, 55%)",  // amber  — Go Hire
  "hsl(330, 75%, 60%)",  // pink   — Landing Page
  "hsl(265, 60%, 60%)",  // purple — Referrals
  "hsl(20,  85%, 55%)",  // orange — Ebook
  "hsl(140, 50%, 55%)",  // green  — fallback
  "hsl(0,   0%,  60%)",  // grey   — long tail
];

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

export interface ChannelSpend {
  channel: string;
  spend:   number;
}

type ViewMode = "tree" | "pie" | "bar";

const VIEW_OPTS: { value: ViewMode; label: string }[] = [
  { value: "tree", label: "Tree" },
  { value: "pie",  label: "Pie"  },
  { value: "bar",  label: "Bar"  },
];

/**
 * Spend allocation chart — three view modes:
 * - tree (default): Treemap, area = % of total
 * - pie: Donut chart with total in the centre
 * - bar: Horizontal bar chart sorted by spend desc
 *
 * Caller passes the channel list so this stays in sync with whichever data
 * source the page uses (Marketing passes the table's channelRows so Meta
 * uses Meta API spend, not marketing_expenses).
 */
export function SpendAllocationChart({ channels }: { channels: ChannelSpend[] }) {
  const { fmt: fmtMoney } = useCurrency();
  const [view, setView] = useState<ViewMode>("tree");

  // All channels passed in, sorted by spend desc — used for the legend so
  // the user always sees the same channel list as the table above.
  const allRows = useMemo(() => {
    return [...channels].sort((a, b) => b.spend - a.spend);
  }, [channels]);

  // Channels with spend > 0 — only these can be plotted.
  const data = useMemo(() => allRows.filter(c => c.spend > 0), [allRows]);

  const total = useMemo(() => data.reduce((s, c) => s + c.spend, 0), [data]);

  // Pre-coloured rows for any chart that needs them.
  const dataWithColor = useMemo(() => data.map((d, i) => ({
    ...d,
    fill: SPEND_COLORS[i] ?? SPEND_COLORS[SPEND_COLORS.length - 1],
    pct: total > 0 ? (d.spend / total) * 100 : 0,
  })), [data, total]);

  if (allRows.length === 0) {
    return (
      <Card className="shadow-sm border-border/50 mb-5">
        <CardHeader className="pb-1 pt-4 px-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend Allocation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-6">
          <p className="text-[11px] text-muted-foreground text-center py-12">No spend recorded for any channel in this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-border/50 mb-5">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Spend Allocation
              </CardTitle>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Every line item from <code>marketing_expenses</code> in the selected period
            </p>
          </div>
          {/* View toggle — Tree / Pie / Bar */}
          <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-[10px] font-medium shrink-0">
            {VIEW_OPTS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setView(opt.value)}
                className={`px-3 py-1 transition-colors ${
                  view === opt.value
                    ? "bg-primary text-white"
                    : "bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Header strip — total spend + channel count */}
        <div className="flex items-baseline justify-between mb-3 px-1">
          <div>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Total spend</p>
            <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{fmtMoney(total)}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {allRows.length} categor{allRows.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {data.length > 0 && (
          <>
            {/* Tree (treemap) — area = % of total */}
            {view === "tree" && (
              <ResponsiveContainer width="100%" height={320}>
                <Treemap
                  animationDuration={0}
                  isAnimationActive={false}
                  data={dataWithColor}
                  dataKey="spend"
                  nameKey="channel"
                  aspectRatio={4 / 3}
                  content={<TreemapCell fmtMoney={fmtMoney} />}
                >
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value: number, _: string, p: { payload?: { channel?: string; pct?: number } }) => {
                      const pct = p.payload?.pct ?? 0;
                      return [`${fmtMoney(value)} · ${pct.toFixed(1)}%`, p.payload?.channel ?? ""];
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            )}

            {/* Pie (donut) — total in the centre */}
            {view === "pie" && (
              <div className="relative">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={dataWithColor}
                      dataKey="spend"
                      nameKey="channel"
                      cx="50%" cy="50%"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={1.5}
                      stroke="#fff"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {dataWithColor.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tip}
                      formatter={(value: number, _: string, p: { payload?: { channel?: string; pct?: number } }) => {
                        const pct = p.payload?.pct ?? 0;
                        return [`${fmtMoney(value)} · ${pct.toFixed(1)}%`, p.payload?.channel ?? ""];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Total</p>
                  <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{fmtMoney(total)}</p>
                  <p className="text-[10px] text-muted-foreground">{data.length} channel{data.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            )}

            {/* Bar — horizontal, sorted by spend desc */}
            {view === "bar" && (
              <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30)}>
                <BarChart
                  data={dataWithColor}
                  layout="vertical"
                  margin={{ top: 4, right: 90, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(220,10%,55%)"
                    tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                                      : v >= 1_000     ? `${(v / 1_000).toFixed(0)}K`
                                      : `${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="channel"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    stroke="hsl(220,10%,40%)"
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(value: number, _: string, p: { payload?: { channel?: string; pct?: number } }) => {
                      const pct = p.payload?.pct ?? 0;
                      return [`${fmtMoney(value)} · ${pct.toFixed(1)}%`, p.payload?.channel ?? ""];
                    }}
                  />
                  <Bar dataKey="spend" name="Spend" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {dataWithColor.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                    <LabelList
                      dataKey="spend"
                      position="right"
                      fontSize={10}
                      fill="hsl(220,10%,40%)"
                      formatter={(v: number) => fmtMoney(v)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        )}

        {/* Legend — every channel from the marketing table, including ones
            with no spend (shown with "—"). Same source list keeps the spend
            chart and the channel table in lockstep. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border/40">
          {allRows.map((row, i) => {
            const pct = total > 0 ? (row.spend / total) * 100 : 0;
            const hasSpend = row.spend > 0;
            const color = hasSpend
              ? (SPEND_COLORS[i] ?? SPEND_COLORS[SPEND_COLORS.length - 1])
              : "hsl(220, 14%, 88%)";
            return (
              <div key={row.channel} className={`flex items-center gap-1.5 py-0.5 ${hasSpend ? "" : "opacity-60"}`}>
                <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <ChannelIcon channel={row.channel} size={11} />
                <span className="text-[11px] font-medium text-foreground/90 truncate flex-1">{row.channel}</span>
                {hasSpend
                  ? <span className="text-[10px] text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                  : <span className="text-[10px] text-muted-foreground/60 tabular-nums">—</span>
                }
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Custom Treemap cell — renders the channel name + amount + % inside each
// rectangle when there's enough room. Tiny rectangles fall back to a coloured
// fill only (the bottom legend covers their identity).
function TreemapCell(props: unknown) {
  const p = props as {
    x: number; y: number; width: number; height: number;
    channel?: string; spend?: number; pct?: number; fill?: string;
    fmtMoney: (v: number) => string;
  };
  const { x, y, width, height, channel, spend, pct, fill, fmtMoney } = p;
  const showLabel = width > 70 && height > 36;
  const showAmount = width > 90 && height > 56;
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={fill}
        stroke="#fff" strokeWidth={2}
      />
      {showLabel && channel && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={600}>
          {channel}
        </text>
      )}
      {showAmount && spend !== undefined && (
        <>
          <text x={x + 8} y={y + 36} fill="rgba(255,255,255,0.92)" fontSize={11} fontWeight={500}>
            {fmtMoney(spend)}
          </text>
          {pct !== undefined && (
            <text x={x + 8} y={y + 51} fill="rgba(255,255,255,0.75)" fontSize={10}>
              {pct.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

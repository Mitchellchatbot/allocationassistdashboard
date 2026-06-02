import React from "react";
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface ChartSpec {
  type:   "bar" | "pie" | "line";
  title:  string;
  labels?:  string[];
  values?:  number[];
  series?: Array<{ name: string; values: number[] }>;
}

const COLORS = [
  "hsl(170, 45%, 35%)",
  "hsl(200, 60%, 50%)",
  "hsl(40,  80%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(260, 55%, 60%)",
  "hsl(170, 30%, 60%)",
  "hsl(20,  70%, 55%)",
  "hsl(220, 65%, 55%)",
];

const TICK_STYLE = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

/** Parse all complete <chart ...>...</chart> blocks out of a string.
 *  Tolerates JSON bodies that contain `<` (e.g. inequality labels) and
 *  defensively drops specs with malformed data — recharts crashes hard
 *  on null values / empty arrays / type mismatches, and the AI sometimes
 *  emits any of those. Better to swallow the chart than blow up the
 *  whole assistant panel. */
export function parseCharts(text: string): { text: string; charts: ChartSpec[] } {
  const charts: ChartSpec[] = [];
  const cleaned = text.replace(
    /<chart\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/chart>/g,
    (_, type, title, json) => {
      try {
        const data = JSON.parse(json.trim());
        const spec: ChartSpec = { type, title, ...data };
        if (validateChart(spec)) charts.push(spec);
      } catch {
        // malformed JSON — skip silently
      }
      return "";
    },
  ).trim();

  return { text: cleaned, charts };
}

/** Reject specs that would make recharts throw at render-time. */
function validateChart(spec: ChartSpec): boolean {
  if (!["bar", "pie", "line"].includes(spec.type)) return false;
  if (spec.type === "line") {
    if (!Array.isArray(spec.labels) || spec.labels.length === 0) return false;
    if (!Array.isArray(spec.series) || spec.series.length === 0) return false;
    return spec.series.every(s =>
      s && typeof s.name === "string" &&
      Array.isArray(s.values) && s.values.every(v => Number.isFinite(v))
    );
  }
  if (!Array.isArray(spec.labels) || spec.labels.length === 0) return false;
  if (!Array.isArray(spec.values) || spec.values.length !== spec.labels.length) return false;
  return spec.values.every(v => Number.isFinite(v));
}

function BarChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec.labels || !spec.values) return null;
  const data = spec.labels.map((label, i) => ({ label, value: spec.values![i] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={TICK_STYLE} />
        <Tooltip
          contentStyle={{ fontSize: 11, backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          cursor={{ fill: "hsl(var(--muted))" }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec.labels || !spec.values) return null;
  const data = spec.labels.map((name, i) => ({ name, value: spec.values![i] ?? 0 }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={76}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: number) => [`${val.toLocaleString()} (${total > 0 ? ((val / total) * 100).toFixed(1) : 0}%)`, ""]}
            contentStyle={{ fontSize: 11, backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend rendered outside SVG so labels never clip */}
      <div className="mt-2 flex flex-col gap-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-[11px] text-foreground/80">
            <span className="shrink-0 h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec.labels || !spec.series?.length) return null;
  const data = spec.labels.map((label, i) => {
    const point: Record<string, unknown> = { label };
    for (const s of spec.series!) point[s.name] = s.values[i] ?? 0;
    return point;
  });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={TICK_STYLE} />
        <Tooltip
          contentStyle={{ fontSize: 11, backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        />
        {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {spec.series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-card p-3">
      {spec.title && (
        <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          {spec.title}
        </p>
      )}
      <ChartErrorBoundary>
        {spec.type === "bar"  && <BarChartBlock  spec={spec} />}
        {spec.type === "pie"  && <PieChartBlock  spec={spec} />}
        {spec.type === "line" && <LineChartBlock spec={spec} />}
      </ChartErrorBoundary>
    </div>
  );
}

/** Catches render-time recharts crashes (bad spec, dom-zero-size, …) so
 *  one broken chart can't take down the whole assistant panel or the
 *  page it's mounted on. Renders a tiny fallback row instead. */
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) {
    console.warn("[ChatChart] render failed, falling back:", err.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <p className="text-[11px] text-muted-foreground italic py-3 text-center">
          Chart unavailable for this answer.
        </p>
      );
    }
    return this.props.children;
  }
}

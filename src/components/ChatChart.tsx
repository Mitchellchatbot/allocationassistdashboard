import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
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

/** Parse all complete <chart ...>...</chart> blocks out of a string. */
export function parseCharts(text: string): { text: string; charts: ChartSpec[] } {
  const charts: ChartSpec[] = [];
  const cleaned = text.replace(
    /<chart\s+type="([^"]+)"\s+title="([^"]+)">([^<]*)<\/chart>/g,
    (_, type, title, json) => {
      try {
        const data = JSON.parse(json.trim());
        charts.push({ type, title, ...data });
      } catch {
        // malformed — skip
      }
      return "";
    },
  ).trim();

  return { text: cleaned, charts };
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
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, value }) => `${name} (${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(val: number) => [`${val} (${total > 0 ? ((val / total) * 100).toFixed(1) : 0}%)`, ""]}
          contentStyle={{ fontSize: 11, backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        />
      </PieChart>
    </ResponsiveContainer>
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
      {spec.type === "bar"  && <BarChartBlock  spec={spec} />}
      {spec.type === "pie"  && <PieChartBlock  spec={spec} />}
      {spec.type === "line" && <LineChartBlock spec={spec} />}
    </div>
  );
}

// Co-located recharts rendering for WorkerDashboard.
//
// All recharts JSX for the Worker Dashboard page lives HERE so the vendor-charts
// chunk is only pulled in when a chart actually mounts. The page lazy-imports
// this module; every recharts symbol the charts use is imported once, in this
// single module (splitting recharts symbols across modules triggers a known TDZ
// init-order crash, so they MUST stay whole here).
//
// These components are pure renderers: the page keeps buildActivityData /
// buildStatusData / buildWorkerBarData and its memoization, and passes the
// already-built data (plus any derived arrays/colors) in as props. Output is
// byte-identical to the previous inline charts — only load timing changes.
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";

// ── Activity area chart ────────────────────────────────────────────────────────

export function ActivityChart({ data, keys, totals, colors, title, subtitle }: {
  data: Record<string, string | number>[];
  keys: string[];
  totals: { key: string; total: number; color: string }[];
  colors: string[];
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {totals.map(t => (
            <div key={t.key} className="text-right">
              <p className="text-[18px] font-semibold tabular-nums leading-none" style={{ color: t.color }}>{t.total}</p>
              <p className="text-[9px] text-muted-foreground capitalize">{t.key}</p>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {keys.map((k, i) => (
              <linearGradient key={k} id={`wdGrad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={colors[i % colors.length]} stopOpacity={0.7} />
                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.15} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval={4} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k}
              stroke={colors[i % colors.length]}
              fill={`url(#wdGrad-${k})`}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Status pie chart ───────────────────────────────────────────────────────────

export function StatusPieChart({ data, colorFor }: {
  data: { name: string; value: number }[];
  colorFor: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Status</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
            {data.map(entry => (
              <Cell key={entry.name} fill={colorFor[entry.name] ?? "#9ca3af"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Worker bar chart ───────────────────────────────────────────────────────────

export function WorkerBarChart({ data }: {
  data: { name: string; Entries: number; fill: string }[];
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Worker</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Bar dataKey="Entries" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Performance daily-trends area chart ────────────────────────────────────────

export function PerformanceTrendsChart({ data }: {
  data: { date: string; ts: number; calls: number; good: number; sales: number }[];
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1 flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        Daily Trends
      </p>
      <p className="text-[11px] text-muted-foreground mb-4">Calls and conversions over time</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="perfCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(170, 45%, 35%)" stopOpacity={0.7} />
              <stop offset="95%" stopColor="hsl(170, 45%, 35%)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="perfGood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.7} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="perfSales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.7} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area type="monotone" dataKey="calls" name="Sales Calls" stroke="hsl(170, 45%, 35%)" fill="url(#perfCalls)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="good"  name="Good Calls"  stroke="#0ea5e9" fill="url(#perfGood)"  strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="sales" name="Sales Closed" stroke="#10b981" fill="url(#perfSales)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Performance top-days bar chart ─────────────────────────────────────────────

export function PerformanceTopDaysChart({ data }: {
  data: { date: string; ts: number; calls: number; good: number; sales: number }[];
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1">Top Days by Sales Calls</p>
      <p className="text-[11px] text-muted-foreground mb-4">Your highest-volume days in this period</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.slice().sort((a, b) => b.calls - a.calls).slice(0, 10).reverse()} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="calls" name="Sales Calls" fill="hsl(170, 45%, 35%)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="good"  name="Good Calls"  fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

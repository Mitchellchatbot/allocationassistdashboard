import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, Legend } from "recharts";
import type { useReportingMetrics } from "@/hooks/use-reporting-metrics";

/**
 * Co-located recharts chart for the Reports page, split out so the
 * recharts (vendor-charts) chunk is deferred until the chart actually
 * mounts. Lazy-imported from Reports.tsx behind a Suspense fallback that
 * matches the 260px chart height.
 *
 * recharts MUST stay whole in this one module (every symbol imported
 * here) — splitting recharts symbols across modules triggers a known TDZ
 * init-order crash.
 *
 * Granularity toggle (Week / Month): the hook always hands us WEEKLY
 * buckets; the month view rolls those up client-side, summing each week
 * into the month of its start date. Month labels are built from numeric
 * local parts (never an ISO round-trip) so they don't drift a day in
 * off-UTC timezones the way `new Date("YYYY-MM-01")` would.
 */
type WeeklyBucket = ReturnType<typeof useReportingMetrics>["trend"][number];
type Granularity = "week" | "month";

function rollupMonthly(weekly: WeeklyBucket[]) {
  const map = new Map<string, { y: number; m: number; shortlisted: number; interviews: number; signed: number }>();
  for (const w of weekly) {
    const d = new Date(w.weekStart);
    const y = d.getFullYear(), m = d.getMonth();
    const key = `${y}-${m}`;
    const cur = map.get(key) ?? { y, m, shortlisted: 0, interviews: 0, signed: 0 };
    cur.shortlisted += w.shortlisted;
    cur.interviews  += w.interviews;
    cur.signed      += w.signed;
    map.set(key, cur);
  }
  return [...map.values()]
    .sort((a, b) => a.y - b.y || a.m - b.m)
    .map(v => ({
      // Label from local numeric parts — safe across timezones.
      label: new Date(v.y, v.m, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      shortlisted: v.shortlisted,
      interviews:  v.interviews,
      signed:      v.signed,
    }));
}

export default function ReportsTrendChart({ trend }: { trend: WeeklyBucket[] }) {
  const [gran, setGran] = useState<Granularity>("week");
  const monthly = useMemo(() => rollupMonthly(trend ?? []), [trend]);

  if (!trend || trend.length === 0) {
    return <div className="text-center text-[12px] text-muted-foreground py-12">No activity in this range.</div>;
  }

  const isMonth = gran === "month";
  const data = isMonth ? monthly : trend;
  const xKey = isMonth ? "label" : "weekStart";

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {(["week", "month"] as const).map(g => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`px-3 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                gran === g ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              By {g}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 10 }}
              tickFormatter={(d: string) => isMonth ? d : new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <ChartTooltip
              labelFormatter={(d: string) => isMonth ? d : `Week of ${new Date(d).toLocaleDateString()}`}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="shortlisted" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="interviews"  stroke="#0284c7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="signed"      stroke="#14a098" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

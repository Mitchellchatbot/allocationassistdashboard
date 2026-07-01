import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, Legend } from "recharts";
import type { useReportingMetrics } from "@/hooks/use-reporting-metrics";

/**
 * Co-located recharts chart for the Reports page, split out so the
 * recharts (vendor-charts) chunk is deferred until the chart actually
 * mounts. Lazy-imported from Reports.tsx behind a Suspense fallback that
 * matches the 260px chart height. Output is byte-identical to the former
 * inline TrendChart — only the load timing changes.
 *
 * recharts MUST stay whole in this one module (every symbol imported
 * here) — splitting recharts symbols across modules triggers a known TDZ
 * init-order crash.
 */
export default function ReportsTrendChart({ trend }: { trend: ReturnType<typeof useReportingMetrics>["trend"] }) {
  if (!trend || trend.length === 0) {
    return <div className="text-center text-[12px] text-muted-foreground py-12">No activity in this range.</div>;
  }
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <ChartTooltip
            labelFormatter={(d: string) => `Week of ${new Date(d).toLocaleDateString()}`}
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="shortlisted" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="interviews"  stroke="#0284c7" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="signed"      stroke="#14a098" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

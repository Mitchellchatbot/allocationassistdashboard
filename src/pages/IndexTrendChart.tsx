import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Line,
} from "recharts";

// Co-located chart module for the Index page. Kept as its own static-import
// module so the page can lazy-import it and defer the recharts (vendor-charts)
// chunk until the chart actually mounts. All recharts symbols live here — do
// NOT split them across modules (that triggers a TDZ init-order crash).

interface IndexTrendChartProps {
  data: Array<Record<string, unknown>>;
  tip: React.CSSProperties;
}

export function IndexTrendChart({ data, tip }: IndexTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      {/* ComposedChart — was AreaChart, which doesn't allow
          <Line> children. Recharts threw at render time with
          a minified invariant. Switched to ComposedChart so
          the Area + two Line series can coexist. */}
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="docFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(170,55%,45%)" stopOpacity={0.12} />
            <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
        <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <Tooltip contentStyle={tip} />
        <Area type="monotone" dataKey="doctors" stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#docFill)" name="Applied" />
        <Line type="monotone" dataKey="qualified" stroke="hsl(210,75%,52%)" strokeWidth={1.5} dot={false} name="Qualified" />
        <Line type="monotone" dataKey="placed" stroke="hsl(158,50%,42%)" strokeWidth={1.5} dot={false} name="Placed" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default IndexTrendChart;

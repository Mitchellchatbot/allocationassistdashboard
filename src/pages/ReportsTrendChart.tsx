import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceDot,
} from "recharts";

/**
 * The Trend card's "Compare" chart: one stage this period (area) against the
 * same buckets a year earlier (dashed line), with the best and quietest
 * buckets pinned and the selected week/month shaded.
 *
 * Co-located recharts module, lazy-imported by TrendCard so the recharts
 * (vendor-charts) chunk is deferred until the chart actually mounts.
 * recharts MUST stay whole in this one module (every symbol imported here) —
 * splitting recharts symbols across modules triggers a known TDZ init-order
 * crash.
 */

export interface TrendChartProps {
  labels:   string[];
  titles:   string[];
  current:  number[];
  lastYear: number[];
  color:    string;
  name:     string;
  /** Index of the selected period's bucket, or null. */
  selected: number | null;
}

// Same tooltip box as the Dashboard's charts (Index.tsx `tip`).
const TIP: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: 8,
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

function niceTop(v: number) {
  const raw = Math.max(4, v * 1.18);
  const step = raw > 40 ? 10 : raw > 20 ? 5 : raw > 8 ? 2 : 1;
  return Math.ceil(raw / step) * step;
}

export default function ReportsTrendChart({ labels, titles, current, lastYear, color, name, selected }: TrendChartProps) {
  const top = niceTop(Math.max(...current, ...lastYear, 0));
  const data = labels.map((_, i) => ({
    i,
    cur: current[i] ?? 0,
    ly:  lastYear[i] ?? 0,
    // The shaded band behind the selected bucket, drawn as a full-height bar.
    sel: i === selected ? top : 0,
  }));
  const max = Math.max(...current), min = Math.min(...current);
  const best = current.lastIndexOf(max), quiet = current.indexOf(min);
  const showPins = max > 0 && max !== min;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 28, right: 12, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="reportsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" vertical={false} />
        <XAxis
          dataKey="i"
          interval={0}
          tickLine={false}
          axisLine={false}
          height={24}
          tick={(p: { x: number; y: number; payload: { value: number } }) => {
            const on = p.payload.value === selected;
            return (
              <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={10} fontWeight={on ? 700 : 400} fill={on ? "#0f766e" : "hsl(220,10%,55%)"}>
                {labels[p.payload.value]}
              </text>
            );
          }}
        />
        <YAxis domain={[0, top]} allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" width={44} />
        <Tooltip
          cursor={{ fill: "hsl(220,14%,96%)", opacity: 0.6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as { i: number; cur: number; ly: number };
            const d = row.cur - row.ly;
            const pct = row.ly ? Math.round((d / row.ly) * 100) : null;
            return (
              <div style={TIP}>
                <p style={{ fontWeight: 600, marginBottom: 3 }}>{titles[row.i]}</p>
                <p style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />{name}: <b>{row.cur}</b>
                </p>
                <p style={{ display: "flex", alignItems: "center", gap: 6, color: "hsl(220,10%,48%)" }}>
                  <span style={{ width: 8, borderTop: "2px dashed hsl(220,10%,72%)" }} />A year earlier: {row.ly}
                </p>
                <p style={{ marginTop: 4, fontWeight: 600, color: d >= 0 ? "#059669" : "#e11d48" }}>
                  {d >= 0 ? "▲ +" : "▼ "}{d}{pct != null && ` (${pct >= 0 ? "+" : ""}${pct}%)`}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="sel" fill="#14b8a6" fillOpacity={0.09} radius={[8, 8, 0, 0]} isAnimationActive={false} legendType="none" />
        <Line type="monotone" dataKey="ly" stroke="hsl(220,10%,72%)" strokeWidth={1.6} strokeDasharray="5 4" dot={false} activeDot={{ r: 3.5, fill: "hsl(220,10%,72%)" }} name="A year earlier" />
        <Area type="monotone" dataKey="cur" stroke={color} strokeWidth={2.4} fill="url(#reportsTrendFill)" dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: color }} name={name} />
        {showPins && <ReferenceDot x={best} y={max} r={4.5} fill="#fbbf24" stroke="#fff" strokeWidth={2} label={<Pin text={`Best · ${max}`} up />} />}
        {showPins && <ReferenceDot x={quiet} y={min} r={4.5} fill="#fbbf24" stroke="#fff" strokeWidth={2} label={<Pin text={`Quietest · ${min}`} />} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Amber pill label pinned to a ReferenceDot. */
function Pin({ viewBox, text, up }: { viewBox?: { x: number; y: number }; text: string; up?: boolean }) {
  if (!viewBox) return null;
  const w = text.length * 5.6 + 16;
  const x = viewBox.x - w / 2, y = up ? viewBox.y - 26 : viewBox.y + 10;
  return (
    <g>
      <rect x={x} y={y} width={w} height={17} rx={8.5} fill="#fffbeb" stroke="#fcd34d" />
      <text x={viewBox.x} y={y + 11.5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#92400e">{text}</text>
    </g>
  );
}

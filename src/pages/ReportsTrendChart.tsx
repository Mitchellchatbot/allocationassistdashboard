import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceDot,
} from "recharts";

/**
 * The Trend card's chart: every stage that is switched on, as its own line on
 * one pair of axes, so they read against each other instead of one at a time.
 *
 * With a single stage showing it draws that stage as a filled area and pins
 * its best and quietest buckets — the shape that answers "how is signing
 * going". With several it drops the fill and the pins, because overlapping
 * washes and a thicket of labels hide the very comparison the lines are there
 * to make. Each stage's year-earlier twin is an opt-in dashed line in the same
 * colour.
 *
 * Co-located recharts module, lazy-imported by TrendCard so the recharts
 * (vendor-charts) chunk is deferred until the chart actually mounts.
 * recharts MUST stay whole in this one module (every symbol imported here) —
 * splitting recharts symbols across modules triggers a known TDZ init-order
 * crash.
 */

export interface TrendSeries {
  key:      string;
  name:     string;
  color:    string;
  current:  number[];
  lastYear: number[];
}

export interface TrendChartProps {
  labels: string[];
  titles: string[];
  /** One entry per stage switched on, in stage order. */
  series: TrendSeries[];
  /** Overlay each stage's year-earlier line, dashed. */
  showLastYear: boolean;
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

export default function ReportsTrendChart({ labels, titles, series, showLastYear, selected }: TrendChartProps) {
  const solo = series.length === 1 ? series[0] : null;

  const heights = series.flatMap(s => (showLastYear ? [...s.current, ...s.lastYear] : s.current));
  const top = niceTop(Math.max(0, ...heights));

  // One row per bucket, carrying every series' value under its own key.
  const data = labels.map((_, i) => {
    const row: Record<string, number> = {
      i,
      // The shaded band behind the selected bucket, drawn as a full-height bar.
      sel: i === selected ? top : 0,
    };
    for (const s of series) {
      row[s.key] = s.current[i] ?? 0;
      row[`${s.key}__ly`] = s.lastYear[i] ?? 0;
    }
    return row;
  });

  const max = solo ? Math.max(...solo.current) : 0;
  const min = solo ? Math.min(...solo.current) : 0;
  const best = solo ? solo.current.lastIndexOf(max) : -1;
  const quiet = solo ? solo.current.indexOf(min) : -1;
  const showPins = !!solo && max > 0 && max !== min;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 28, right: 12, left: -14, bottom: 0 }}>
        <defs>
          {solo && (
            <linearGradient id="reportsTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={solo.color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={solo.color} stopOpacity={0} />
            </linearGradient>
          )}
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
            const row = payload[0].payload as Record<string, number>;
            return (
              <div style={TIP}>
                <p style={{ fontWeight: 600, marginBottom: 3 }}>{titles[row.i]}</p>
                {series.map(s => {
                  const cur = row[s.key] ?? 0, ly = row[`${s.key}__ly`] ?? 0;
                  const d = cur - ly;
                  return (
                    <p key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                      {s.name}: <b>{cur}</b>
                      {showLastYear && (
                        <span style={{ color: d >= 0 ? "#059669" : "#e11d48", fontWeight: 600 }}>
                          {d >= 0 ? "▲ +" : "▼ "}{d}
                        </span>
                      )}
                    </p>
                  );
                })}
                {showLastYear && <p style={{ marginTop: 4, color: "hsl(220,10%,48%)" }}>Dashed lines are a year earlier.</p>}
              </div>
            );
          }}
        />
        <Bar dataKey="sel" fill="#14b8a6" fillOpacity={0.09} radius={[8, 8, 0, 0]} isAnimationActive={false} legendType="none" />

        {showLastYear && series.map(s => (
          <Line
            key={`${s.key}__ly`}
            type="monotone"
            dataKey={`${s.key}__ly`}
            stroke={s.color}
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            name={`${s.name} a year earlier`}
          />
        ))}

        {solo ? (
          <Area
            type="monotone"
            dataKey={solo.key}
            stroke={solo.color}
            strokeWidth={2.4}
            fill="url(#reportsTrendFill)"
            dot={false}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: solo.color }}
            name={solo.name}
          />
        ) : (
          series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4.5, stroke: "#fff", strokeWidth: 2, fill: s.color }}
              name={s.name}
            />
          ))
        )}

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

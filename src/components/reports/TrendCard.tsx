/**
 * Trend — how each stage is moving, against the same time last year.
 *
 * Four stage tabs (shortlisted / interviewed / signed / relocated) each show
 * the 12-bucket total, its change on a year earlier and a sparkline. Pick one
 * and the Compare chart plots it against the dashed year-earlier line, with the
 * best and quietest buckets pinned. The Heatmap view shows every stage in
 * every bucket at once, each row shaded on its own scale so a strong week for
 * signings stands out as clearly as one for shortlists.
 *
 * Buckets follow the page period: weeks in Weekly mode, months otherwise. The
 * selected week/month is shaded in both views, so stepping with the side
 * arrows visibly walks along the chart.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Activity, CalendarCheck, CheckCircle2, ListChecks, Plane, LineChart, Grid3x3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlacementAttempts } from "@/hooks/use-placement-attempts";
import { ChartSkeleton } from "@/components/reports/Skeletons";
import { CardHead, Hint, HintTitle, HintNote, PillToggle } from "@/components/reports/HoverHint";
import { countByBuckets, trendWindow, yearEarlier, type Period, type TrackedKey } from "@/lib/report-period";

// Lazy so the recharts (vendor-charts) chunk is deferred until the chart mounts.
const ReportsTrendChart = lazy(() => import("@/pages/ReportsTrendChart"));

const METRICS: Array<{ key: TrackedKey; label: string; icon: typeof ListChecks; color: string; text: string; bg: string }> = [
  { key: "shortlisted", label: "Shortlisted", icon: ListChecks,    color: "#4f46e5", text: "text-indigo-600",  bg: "bg-indigo-50" },
  { key: "interviewed", label: "Interviewed", icon: CalendarCheck, color: "#0284c7", text: "text-sky-600",     bg: "bg-sky-50" },
  { key: "signed",      label: "Signed",      icon: CheckCircle2,  color: "#059669", text: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "relocated",   label: "Relocated",   icon: Plane,         color: "#047857", text: "text-emerald-700", bg: "bg-emerald-50" },
];

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

export function TrendCard({ period, offset }: { period: Period; offset: number }) {
  const { data: rows = [], isLoading } = usePlacementAttempts();
  const [metric, setMetric] = useState<TrackedKey>("signed");
  const [view, setView] = useState<"chart" | "heat">("chart");

  const win = useMemo(() => trendWindow(period, offset), [period, offset]);
  const cur = useMemo(() => countByBuckets(rows, win.buckets), [rows, win]);
  const ly  = useMemo(() => countByBuckets(rows, yearEarlier(win.buckets, win.unit)), [rows, win]);

  const unit = win.unit;
  const m = METRICS.find(x => x.key === metric)!;

  const takeaway = (() => {
    if (isLoading) return null;
    const c = cur[metric], total = sum(c), lastTotal = sum(ly[metric]);
    const p = pct(total, lastTotal);
    const max = Math.max(...c), min = Math.min(...c);
    if (total === 0) return <>No {m.label.toLowerCase()} doctors in these 12 {unit}s.</>;
    const bi = c.lastIndexOf(max), qi = c.indexOf(min);
    return (
      <>
        <b className="text-foreground">{m.label}</b>{" "}
        {p == null ? <>has <b className="text-foreground">{total}</b> with nothing a year earlier.</>
          : <>is <b className={p >= 0 ? "text-emerald-600" : "text-rose-600"}>{p >= 0 ? "up" : "down"} {Math.abs(p)}%</b> on a year earlier.</>}
        {" "}Best {unit}: <b className="text-foreground">{win.titles[bi]}</b> ({max}){max !== min && <> · quietest: {win.titles[qi]} ({min})</>}.
      </>
    );
  })();

  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow" id="s-trend">
      <CardHead
        icon={<Activity className="h-4 w-4 text-teal-600" />}
        title="Trend"
        info="Pick a stage to chart it against the same weeks/months a year earlier, or switch to the heatmap to see every stage at once. Helps catch drop-offs early."
        source="placement_attempts (distinct doctors per week/month)."
        subtitle={isLoading ? "Loading…" : view === "chart" ? takeaway : <>Every stage by {unit}, each row shaded on its own scale. Hover a cell for the detail.</>}
        right={
          <PillToggle<"chart" | "heat">
            value={view}
            onChange={setView}
            ariaLabel="Trend view"
            options={[
              { key: "chart", label: <><LineChart className="h-3 w-3" />Compare</>, hint: "One stage against a year earlier" },
              { key: "heat",  label: <><Grid3x3 className="h-3 w-3" />Heatmap</>,  hint: `Every stage, every ${unit}` },
            ]}
          />
        }
      />
      <div className="px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map(x => {
            const total = sum(cur[x.key] ?? []), lastTotal = sum(ly[x.key] ?? []);
            const p = pct(total, lastTotal);
            const on = x.key === metric && view === "chart";
            return (
              <Hint key={x.key} content={view === "chart" ? `Chart ${x.label.toLowerCase()} against a year earlier` : `${x.label}: ${total} vs ${lastTotal} a year earlier`}>
                <button
                  type="button"
                  onClick={() => { setMetric(x.key); setView("chart"); }}
                  aria-pressed={on}
                  className={`relative overflow-hidden rounded-xl border text-left transition-all duration-200 ${
                    on ? `${x.bg} border-transparent shadow-sm` : "bg-card border-border/60 hover:shadow-md"
                  }`}
                  style={on ? { boxShadow: `inset 0 0 0 1px ${x.color}55` } : undefined}
                >
                  <div className="h-1" style={{ background: on ? x.color : "transparent" }} />
                  <div className="px-3.5 py-2.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <x.icon className={`h-3 w-3 ${x.text}`} />{x.label}
                      </p>
                      {isLoading ? <Skeleton className="h-6 w-12 mt-1" /> : (
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <p className={`text-[22px] font-bold tabular-nums leading-none ${x.text}`}>{total}</p>
                          {p == null
                            ? <span className="text-[10px] font-semibold text-teal-600">new</span>
                            : <span className={`text-[10px] font-semibold ${p >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{p >= 0 ? "▲" : "▼"}{Math.abs(p)}%</span>}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">vs {lastTotal} a year earlier</p>
                    </div>
                    {!isLoading && <Spark values={cur[x.key]} color={x.color} />}
                  </div>
                </button>
              </Hint>
            );
          })}
        </div>

        {isLoading ? (
          <div className="mt-4"><ChartSkeleton /></div>
        ) : view === "chart" ? (
          <div className="mt-4">
            <Suspense fallback={<div className="h-[260px] bg-muted/30 rounded-lg animate-pulse" />}>
              <ReportsTrendChart
                labels={win.labels}
                titles={win.titles}
                current={cur[metric]}
                lastYear={ly[metric]}
                color={m.color}
                name={m.label}
                selected={win.selected}
              />
            </Suspense>
            <div className="flex gap-4 mt-2 justify-center flex-wrap text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: m.color }} />{m.label}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-slate-300" />A year earlier</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Best / quietest</span>
              {win.selected != null && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-500/20" />Selected {unit}</span>}
            </div>
          </div>
        ) : (
          <Heatmap win={win} cur={cur} ly={ly} />
        )}
      </div>
    </Card>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 64, h = 22;
  const mx = Math.max(...values), mn = Math.min(...values);
  const pts = values.map((v, i) => [
    (i * w) / Math.max(1, values.length - 1),
    h - 2 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (h - 4),
  ]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const e = pts[pts.length - 1];
  return (
    <svg viewBox={`-3 -3 ${w + 6} ${h + 6}`} width={w} height={h} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {e && <circle cx={e[0]} cy={e[1]} r={2.2} fill={color} />}
    </svg>
  );
}

function hexToRgb(hex: string) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",");
}

function Heatmap({ win, cur, ly }: {
  win: ReturnType<typeof trendWindow>;
  cur: Record<string, number[]>;
  ly:  Record<string, number[]>;
}) {
  const n = win.labels.length;
  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <div className="min-w-[640px] grid gap-1.5" style={{ gridTemplateColumns: `104px repeat(${n}, minmax(0,1fr)) 56px` }}>
          <div />
          {win.labels.map((l, i) => (
            <div key={i} className={`text-[10px] text-center ${i === win.selected ? "text-teal-700 font-bold" : "text-muted-foreground"}`}>{l}</div>
          ))}
          <div className="text-[10px] text-muted-foreground text-right">Total</div>

          {METRICS.map(m => {
            const v = cur[m.key], l = ly[m.key];
            const mx = Math.max(...v), mn = Math.min(...v);
            const ranked = [...v].sort((a, b) => b - a);
            const total = sum(v), lastTotal = sum(l);
            const p = pct(total, lastTotal);
            return (
              <div key={m.key} className="contents">
                <div className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />{m.label}
                </div>
                {v.map((x, i) => {
                  const a = mx === mn ? (mx === 0 ? 0.06 : 0.5) : 0.1 + (0.85 * (x - mn)) / (mx - mn);
                  const d = x - l[i];
                  const rank = ranked.indexOf(x) + 1;
                  return (
                    <Hint key={i} content={
                      <>
                        <HintTitle>{m.label} · {win.titles[i]}</HintTitle>
                        <p><b className="text-[13px]">{x}</b> doctor{x === 1 ? "" : "s"}</p>
                        <p className="text-muted-foreground">A year earlier: {l[i]} <b className={d >= 0 ? "text-emerald-600" : "text-rose-600"}>({d >= 0 ? "+" : ""}{d})</b></p>
                        <HintNote>{x === mx && mx > 0 ? `Best ${win.unit} for this stage` : `#${rank} of ${n} ${win.unit}s`}</HintNote>
                      </>
                    }>
                      <div
                        tabIndex={0}
                        className="h-9 rounded-md flex items-center justify-center text-[11px] font-semibold tabular-nums cursor-default transition-transform hover:scale-[1.08] hover:shadow-md hover:relative hover:z-[2] outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        style={{
                          background: `rgba(${hexToRgb(m.color)},${a.toFixed(2)})`,
                          color: a < 0.5 ? "hsl(170 20% 15%)" : "#fff",
                          outline: i === win.selected ? "2px solid #14b8a6" : undefined,
                          outlineOffset: i === win.selected ? 1 : undefined,
                        }}
                      >
                        {x}
                      </div>
                    </Hint>
                  );
                })}
                <Hint content={<><HintTitle>{m.label} total</HintTitle>{total} in these {n} {win.unit}s · {lastTotal} a year earlier</>}>
                  <div tabIndex={0} className="text-right cursor-default">
                    <div className="text-[13px] font-bold tabular-nums">{total}</div>
                    {p == null
                      ? <div className="text-[9.5px] font-semibold text-teal-600">new</div>
                      : <div className={`text-[9.5px] font-semibold ${p >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{p >= 0 ? "▲" : "▼"}{Math.abs(p)}%</div>}
                  </div>
                </Hint>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap mt-3 text-[10px] text-muted-foreground">
        <span>Each row is shaded on its own scale{win.selected != null && <> · the outlined column is the selected {win.unit}</>}.</span>
        <span className="flex items-center gap-1">
          Quieter
          {[0.1, 0.3, 0.5, 0.7, 0.95].map(a => <span key={a} className="h-3 w-4 rounded-sm" style={{ background: `rgba(5,150,105,${a})` }} />)}
          Busier
        </span>
      </div>
    </div>
  );
}

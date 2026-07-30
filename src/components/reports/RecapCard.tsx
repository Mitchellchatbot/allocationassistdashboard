/**
 * Recap — weekly / monthly view of each placement milestone.
 *
 * Two tabs (Weekly · Monthly): pick a granularity and see, for each milestone
 * (shortlisted → interviewed → offered → signed → relocated), the count this
 * period and the change vs the prior period. Reads placement_attempts directly
 * (the imported reports + live markings), per-attempt — one doctor shortlisted
 * at 4 hospitals = 4.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, ListChecks, CalendarCheck, FileSignature, CheckCircle2, Plane, CalendarRange } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";

type Period = "this_week" | "last_week" | "this_month" | "last_month";

function periodRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayIdx = (today.getDay() + 6) % 7;            // Monday = 0
  const mondayThis = new Date(today); mondayThis.setDate(today.getDate() - dayIdx);
  const sundayThis = new Date(mondayThis); sundayThis.setDate(mondayThis.getDate() + 7);
  const mondayLast = new Date(mondayThis); mondayLast.setDate(mondayThis.getDate() - 7);
  const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  if (p === "this_week")  return { start: mondayThis, end: sundayThis };
  if (p === "last_week")  return { start: mondayLast, end: mondayThis };
  if (p === "this_month") return { start: firstThis,  end: firstNext };
  return { start: firstLast, end: firstThis };
}

/** Count rows whose FIRST non-null milestone date (across `cols`) is in period. */
function countInPeriod(rows: PlacementAttempt[], cols: (keyof PlacementAttempt)[], p: Period): number {
  const { start, end } = periodRange(p);
  let n = 0;
  for (const r of rows) {
    let v: string | null = null;
    for (const c of cols) { const x = r[c] as string | null; if (x) { v = x; break; } }
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!isNaN(t) && t >= start.getTime() && t < end.getTime()) n++;
  }
  return n;
}

const METRICS: { label: string; icon: ReactNode; cols: (keyof PlacementAttempt)[] }[] = [
  { label: "Shortlisted", icon: <ListChecks    className="h-3.5 w-3.5 text-sky-600" />,     cols: ["shortlisted_at"] },
  { label: "Interviewed", icon: <CalendarCheck className="h-3.5 w-3.5 text-indigo-600" />,  cols: ["interviewed_at"] },
  { label: "Offered",     icon: <FileSignature className="h-3.5 w-3.5 text-amber-600" />,   cols: ["offered_at"] },
  { label: "Signed",      icon: <CheckCircle2  className="h-3.5 w-3.5 text-emerald-600" />, cols: ["signed_at"] },
  { label: "Relocated",   icon: <Plane         className="h-3.5 w-3.5 text-teal-600" />,    cols: ["relocated_at", "joined_at"] },
];

export interface RecapCardProps {
  hospital?:  string | null;
  specialty?: string | null;
}

export function RecapCard({ hospital, specialty }: RecapCardProps = {}) {
  const { data: allAttempts = [], isLoading } = usePlacementAttempts();
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");

  const attempts = useMemo(() => {
    if (!hospital && !specialty) return allAttempts;
    return allAttempts.filter(a => {
      if (hospital && !(a.hospital_name ?? "").toLowerCase().includes(hospital.toLowerCase())) return false;
      if (specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) return false;
      return true;
    });
  }, [allAttempts, hospital, specialty]);

  const cur   = tab === "weekly" ? "this_week"  : "this_month";
  const prior = tab === "weekly" ? "last_week"  : "last_month";
  const rows = useMemo(() => METRICS.map(m => ({
    label: m.label, icon: m.icon,
    count: countInPeriod(attempts, m.cols, cur),
    prior: countInPeriod(attempts, m.cols, prior),
  })), [attempts, cur, prior]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-teal-600" /> Recap
            <span className="text-[11px] font-normal text-muted-foreground">
              · {tab === "weekly" ? "this week vs last week" : "this month vs last month"}
            </span>
          </CardTitle>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {(["weekly", "monthly"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded text-[12px] font-medium capitalize transition-colors ${
                  tab === t ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >{t}</button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground py-3">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {rows.map(r => <MetricCard key={r.label} {...r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, icon, count, prior }: { label: string; icon: ReactNode; count: number; prior: number }) {
  const delta = count - prior;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const cls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400";
  return (
    <div className="rounded-lg border bg-slate-50/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">{icon}{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-[26px] font-bold leading-none text-slate-900 tabular-nums">{count}</div>
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${cls}`}>
          <TrendIcon className="h-3 w-3" />{delta > 0 ? "+" : ""}{delta}
        </span>
      </div>
      <div className="text-[9.5px] text-muted-foreground mt-1 tabular-nums">was {prior} · prior period</div>
    </div>
  );
}

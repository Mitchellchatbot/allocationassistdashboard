/**
 * Weekly + Monthly recap — Mitchell's explicit ask (2026-06-03 call):
 * "we're gonna have a week recap, right? With how many were shortlisted
 * placed and... so we could see the KPIs trending here week to week
 * and month to month."
 *
 * Reads doctor_lifecycle directly (every milestone has its own date
 * column) and bucket-counts each one into:
 *   - this week / last week    (Mon-Sun bucket centered on today)
 *   - this month / last month  (calendar month)
 *
 * Surfaces a per-metric delta vs the prior period so the team can see
 * at a glance whether last week was up, down, or flat.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, TrendingUp, TrendingDown, Minus, ListChecks, Calendar, CheckCircle2, Plane } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";

type Period = "this_week" | "last_week" | "this_month" | "last_month";

/** Date math helpers — keep these inline so the periods are auditable
 *  ("week" = ISO Mon-Sun, "month" = calendar month). */
function periodRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // JS Sunday=0; rotate so Monday=0.
  const dayIdx = (today.getDay() + 6) % 7;
  const mondayThis = new Date(today); mondayThis.setDate(today.getDate() - dayIdx);
  const sundayThis = new Date(mondayThis); sundayThis.setDate(mondayThis.getDate() + 7);
  const mondayLast = new Date(mondayThis); mondayLast.setDate(mondayThis.getDate() - 7);
  const sundayLast = new Date(mondayThis);

  const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const firstLastEnd = firstThis;

  if (p === "this_week")   return { start: mondayThis, end: sundayThis };
  if (p === "last_week")   return { start: mondayLast, end: sundayLast };
  if (p === "this_month")  return { start: firstThis,  end: firstNext };
  return { start: firstLast, end: firstLastEnd };
}

function countInPeriod(rows: DoctorLifecycle[], col: keyof DoctorLifecycle, p: Period): number {
  const { start, end } = periodRange(p);
  let n = 0;
  for (const r of rows) {
    const v = r[col] as string | null;
    if (!v) continue;
    const t = new Date(v).getTime();
    if (isNaN(t)) continue;
    if (t >= start.getTime() && t < end.getTime()) n++;
  }
  return n;
}

interface Metric {
  label:   string;
  icon:    React.ReactNode;
  col:     keyof DoctorLifecycle;
}

const METRICS: Metric[] = [
  { label: "Shortlisted", icon: <ListChecks   className="h-3.5 w-3.5 text-sky-600" />,     col: "shortlisted_at" },
  { label: "Interviewed", icon: <Calendar     className="h-3.5 w-3.5 text-violet-600" />,  col: "interviewed_at" },
  { label: "Offered",     icon: <Calendar     className="h-3.5 w-3.5 text-amber-600" />,   col: "offered_at" },
  { label: "Signed",      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />, col: "signed_at" },
  { label: "Joined",      icon: <Plane        className="h-3.5 w-3.5 text-teal-600" />,    col: "joined_at" },
];

export function RecapCard() {
  const { data: lifecycles = [], isLoading } = useQuery<DoctorLifecycle[]>({
    queryKey: ["recap-lifecycles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctor_lifecycle").select("*").limit(5000);
      if (error) throw error;
      return (data ?? []) as DoctorLifecycle[];
    },
    staleTime: 60_000,
  });

  const counts = useMemo(() => METRICS.map(m => ({
    label:    m.label,
    icon:     m.icon,
    thisWeek:  countInPeriod(lifecycles, m.col, "this_week"),
    lastWeek:  countInPeriod(lifecycles, m.col, "last_week"),
    thisMonth: countInPeriod(lifecycles, m.col, "this_month"),
    lastMonth: countInPeriod(lifecycles, m.col, "last_month"),
  })), [lifecycles]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-teal-600" />
          Weekly + Monthly recap
        </CardTitle>
        <CardDescription className="text-[11px]">
          Counts each placement milestone in this week vs last week, and this month vs last month. Joined → fires the 45-day AA-payment clock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground py-3">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {counts.map(c => (
              <div key={c.label} className="rounded-lg border bg-slate-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                  {c.icon}{c.label}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <PeriodTile label="This week"  count={c.thisWeek}  prior={c.lastWeek} />
                  <PeriodTile label="This month" count={c.thisMonth} prior={c.lastMonth} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodTile({ label, count, prior }: { label: string; count: number; prior: number }) {
  const delta = count - prior;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendCls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-[18px] font-semibold text-slate-900 leading-none">{count}</div>
        <Badge variant="outline" className={`h-4 px-1 text-[9px] inline-flex items-center gap-0.5 ${trendCls} bg-white border-current/30`}>
          <TrendIcon className="h-2.5 w-2.5" />
          {delta > 0 ? "+" : ""}{delta}
        </Badge>
      </div>
      <div className="text-[9px] text-muted-foreground/80 mt-0.5">vs {prior} prior</div>
    </div>
  );
}

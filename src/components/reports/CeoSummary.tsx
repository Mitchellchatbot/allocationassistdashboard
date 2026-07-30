/**
 * CEO summary — the answer-first hero at the top of Reports.
 *
 * Executive dashboards should answer "how are we doing?" in ~3 seconds, on one
 * screen, in plain language. This is that layer: a Weekly / Monthly toggle, a
 * one-sentence written headline ("This month, 8 doctors signed and 5 relocated
 * — up 25% vs last month"), and a tight scoreboard of the four milestones the
 * stakeholder actually asked for (shortlisted / interviewed / signed /
 * relocated), each with the change vs the prior period.
 *
 * Counts DISTINCT DOCTORS (not per-hospital placements) — the stakeholder asked
 * "how many DOCTORS are getting signed", and counting doctors keeps this number
 * from disagreeing with a per-placement count elsewhere on the page. Reads the
 * same placement_attempts source as the "where the wins are" bars below, so the
 * whole exec surface tells one consistent story.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, ListChecks, CalendarCheck, CheckCircle2, Plane } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";

type Period = "weekly" | "monthly";

function periodBounds(p: Period, which: "current" | "prior"): { start: number; end: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "weekly") {
    const dayIdx = (today.getDay() + 6) % 7;                    // Monday = 0
    const monThis = new Date(today); monThis.setDate(today.getDate() - dayIdx);
    const monNext = new Date(monThis); monNext.setDate(monThis.getDate() + 7);
    const monLast = new Date(monThis); monLast.setDate(monThis.getDate() - 7);
    return which === "current"
      ? { start: monThis.getTime(), end: monNext.getTime() }
      : { start: monLast.getTime(), end: monThis.getTime() };
  }
  const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstNext = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return which === "current"
    ? { start: firstThis.getTime(), end: firstNext.getTime() }
    : { start: firstLast.getTime(), end: firstThis.getTime() };
}

const relocatedAt = (p: PlacementAttempt) => p.relocated_at ?? p.joined_at;

/** Distinct doctors whose first non-null milestone (across `cols`) lands in [start,end). */
function distinctDoctors(rows: PlacementAttempt[], cols: (keyof PlacementAttempt)[], start: number, end: number): number {
  const set = new Set<string>();
  for (const r of rows) {
    let v: string | null = null;
    for (const c of cols) { const x = r[c] as string | null; if (x) { v = x; break; } }
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!isNaN(t) && t >= start && t < end) set.add(r.doctor_id);
  }
  return set.size;
}

interface Milestone { key: string; label: string; icon: typeof CheckCircle2; cols: (keyof PlacementAttempt)[]; result?: boolean }
const MILESTONES: Milestone[] = [
  { key: "shortlisted", label: "Shortlisted", icon: ListChecks,   cols: ["shortlisted_at"] },
  { key: "interviewed", label: "Interviewed", icon: CalendarCheck, cols: ["interviewed_at"] },
  { key: "signed",      label: "Signed",      icon: CheckCircle2,  cols: ["signed_at"], result: true },
  { key: "relocated",   label: "Relocated",   icon: Plane,         cols: ["relocated_at", "joined_at"], result: true },
];

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function CeoSummary({ hospital, specialty }: { hospital?: string | null; specialty?: string | null }) {
  const { data: all = [], isLoading } = usePlacementAttempts();
  const [period, setPeriod] = useState<Period>("monthly");

  const rows = useMemo(() => {
    if (!hospital && !specialty) return all;
    return all.filter(a => {
      if (hospital && !(a.hospital_name ?? "").toLowerCase().includes(hospital.toLowerCase())) return false;
      if (specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) return false;
      return true;
    });
  }, [all, hospital, specialty]);

  const stats = useMemo(() => {
    const cur = periodBounds(period, "current");
    const pri = periodBounds(period, "prior");
    return MILESTONES.map(m => ({
      ...m,
      count: distinctDoctors(rows, m.cols, cur.start, cur.end),
      prior: distinctDoctors(rows, m.cols, pri.start, pri.end),
    }));
  }, [rows, period]);

  const byKey = Object.fromEntries(stats.map(s => [s.key, s])) as Record<string, (typeof stats)[number]>;
  const signed = byKey.signed, relocated = byKey.relocated, interviewed = byKey.interviewed, shortlisted = byKey.shortlisted;
  const periodWord = period === "weekly" ? "week" : "month";
  const totalNow = stats.reduce((n, s) => n + s.count, 0);
  const wonNow = signed.count + relocated.count;
  const wonPrior = signed.prior + relocated.prior;

  // Status: green when results held or grew, amber when they slipped, neutral
  // when the period is still quiet. Colour is a signal here, not decoration.
  const status: "good" | "watch" | "quiet" =
    totalNow === 0 ? "quiet" : wonNow >= wonPrior ? "good" : "watch";
  const dot = status === "good" ? "bg-emerald-500" : status === "watch" ? "bg-amber-500" : "bg-slate-300";

  const headline = (() => {
    if (isLoading) return "Loading this " + periodWord + "'s results…";
    if (totalNow === 0) {
      const lastWon = signed.prior + relocated.prior;
      return lastWon > 0
        ? `Quiet ${periodWord} so far — nothing new marked yet. Last ${periodWord}: ${plural(signed.prior, "signing")}, ${relocated.prior} relocated.`
        : `Quiet ${periodWord} so far — nothing new marked yet.`;
    }
    const lead = `This ${periodWord}, the team signed ${plural(signed.count, "doctor")} and relocated ${relocated.count}`;
    const pipe = ` — with ${interviewed.count} interviewed and ${shortlisted.count} shortlisted.`;
    return lead + pipe;
  })();

  // vs-prior clause for the headline's lead metric (signings).
  const wonDelta = wonNow - wonPrior;
  const trendClause = (() => {
    if (isLoading || totalNow === 0) return null;
    if (wonPrior === 0) return { text: `${wonNow} signed + relocated · first this ${periodWord}`, tone: "neutral" as const };
    const pct = Math.round((wonDelta / wonPrior) * 100);
    if (pct === 0) return { text: `level with last ${periodWord}`, tone: "neutral" as const };
    return { text: `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% vs last ${periodWord} (results)`, tone: pct > 0 ? "up" as const : "down" as const };
  })();

  return (
    <Card className="overflow-hidden border-teal-100">
      <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dot} shrink-0`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {period === "weekly" ? "This week vs last week" : "This month vs last month"}
                {(hospital || specialty) && <span className="ml-1 normal-case font-normal">· filtered</span>}
              </span>
            </div>
            <p className="mt-1.5 text-[17px] sm:text-[18px] font-semibold leading-snug text-slate-900 max-w-[52ch]">
              {headline}
            </p>
            {trendClause && (
              <p className={`mt-1 text-[12px] font-medium ${
                trendClause.tone === "up" ? "text-emerald-600" : trendClause.tone === "down" ? "text-rose-600" : "text-slate-500"
              }`}>
                {trendClause.tone === "up" ? "▲ " : trendClause.tone === "down" ? "▼ " : ""}{trendClause.text}
              </p>
            )}
          </div>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shrink-0">
            {(["weekly", "monthly"] as const).map(t => (
              <button
                key={t}
                onClick={() => setPeriod(t)}
                className={`px-3.5 py-1.5 rounded text-[12px] font-medium capitalize transition-colors ${
                  period === t ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >{t}</button>
            ))}
          </div>
        </div>

        {/* Scoreboard — four milestones, results (signed/relocated) accented. */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => <ScoreTile key={s.key} stat={s} periodWord={periodWord} loading={isLoading} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreTile({ stat, periodWord, loading }: {
  stat: { label: string; icon: typeof CheckCircle2; count: number; prior: number; result?: boolean };
  periodWord: string;
  loading: boolean;
}) {
  const { label, icon: Icon, count, prior, result } = stat;
  const delta = count - prior;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaCls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400";
  return (
    <div className={`rounded-lg border p-3 ${result ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50"}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
        <Icon className={`h-3.5 w-3.5 ${result ? "text-emerald-600" : "text-slate-500"}`} />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-[30px] font-bold leading-none tabular-nums ${result ? "text-emerald-700" : "text-slate-900"}`}>
          {loading ? "—" : count}
        </div>
        {!loading && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${deltaCls}`}>
            <TrendIcon className="h-3 w-3" />{delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
      <div className="text-[9.5px] text-muted-foreground mt-1 tabular-nums">
        {loading ? " " : `was ${prior} last ${periodWord}`}
      </div>
    </div>
  );
}

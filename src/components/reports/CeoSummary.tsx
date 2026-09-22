/**
 * CEO summary — the answer-first hero at the top of Reports.
 *
 * Executive dashboards should answer "how are we doing?" in ~3 seconds, on one
 * screen, in plain language. This is that layer: a one-sentence written
 * headline ("This month, the team signed 8 doctors and relocated 5 …") and a
 * tight scoreboard of the four milestones the stakeholder actually asked for
 * (shortlisted / interviewed / signed / relocated), each with the change vs
 * the period before.
 *
 * The period comes from the page's Weekly / Monthly / Yearly pill and the side
 * arrows — this card no longer carries its own toggle, so every panel on the
 * page always describes the same window.
 *
 * Counts DISTINCT DOCTORS (not per-hospital placements) — the stakeholder asked
 * "how many DOCTORS are getting signed", and counting doctors keeps this number
 * from disagreeing with a per-placement count elsewhere on the page.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, ListChecks, CalendarCheck, CheckCircle2, Plane } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { Skeleton } from "@/components/ui/skeleton";
import { TilesSkeleton } from "@/components/reports/Skeletons";
import { Hint, HintTitle, HintNote, HoverInfo } from "@/components/reports/HoverHint";
import { STAGES, stageAt, inRange, type DateRange } from "@/lib/placement-reporting";
import { countInRange, type TrackedKey } from "@/lib/report-period";

interface Milestone { key: TrackedKey; label: string; icon: typeof CheckCircle2; result?: boolean }
const MILESTONES: Milestone[] = [
  { key: "shortlisted", label: "Shortlisted", icon: ListChecks },
  { key: "interviewed", label: "Interviewed", icon: CalendarCheck },
  { key: "signed",      label: "Signed",      icon: CheckCircle2, result: true },
  { key: "relocated",   label: "Relocated",   icon: Plane,        result: true },
];

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

interface Recent { name: string; hospital: string; at: number }

export interface CeoSummaryProps {
  range:     DateRange;
  prior:     DateRange;
  /** "week" | "month" | "year" */
  word:      string;
  /** "This month" / "In August" / "Over the last 12 months" … */
  lead:      string;
  /** "September 2026", "14 Sep – 20 Sep 2026" … */
  label:     string;
  isCurrent: boolean;
}

export function CeoSummary({ range, prior, word, lead, label, isCurrent }: CeoSummaryProps) {
  const { data: rows = [], isLoading } = usePlacementAttempts();

  const stats = useMemo(() => {
    const now = countInRange(rows, range), before = countInRange(rows, prior);
    return MILESTONES.map(m => ({ ...m, count: now[m.key], prior: before[m.key] }));
  }, [rows, range, prior]);

  // The three most recent doctors behind each tile, for its hover card.
  const recent = useMemo(() => {
    const out = {} as Record<TrackedKey, Recent[]>;
    for (const m of MILESTONES) {
      const stage = STAGES.find(s => s.key === m.key)!;
      const seen = new Set<string>();
      const hits: Recent[] = [];
      for (const a of rows as PlacementAttempt[]) {
        const t = stageAt(a, stage);
        if (!inRange(t, range) || seen.has(a.doctor_id)) continue;
        seen.add(a.doctor_id);
        hits.push({ name: a.doctor_name, hospital: a.hospital_name, at: t! });
      }
      out[m.key] = hits.sort((x, y) => y.at - x.at).slice(0, 3);
    }
    return out;
  }, [rows, range]);

  const byKey = Object.fromEntries(stats.map(s => [s.key, s])) as Record<TrackedKey, (typeof stats)[number]>;
  const { signed, relocated, interviewed, shortlisted } = byKey;
  const totalNow = stats.reduce((n, s) => n + s.count, 0);
  const wonNow = signed.count + relocated.count;
  const wonPrior = signed.prior + relocated.prior;

  // Green when results held or grew, amber when they slipped, neutral when the
  // period is quiet. Colour is a signal here, not decoration.
  const status: "good" | "watch" | "quiet" =
    totalNow === 0 ? "quiet" : wonNow >= wonPrior ? "good" : "watch";
  const dot = status === "good" ? "bg-emerald-500" : status === "watch" ? "bg-amber-500" : "bg-slate-300";

  const headline = (() => {
    if (isLoading) return "";
    if (totalNow === 0) {
      return wonPrior > 0
        ? `${isCurrent ? `Quiet ${word} so far` : `A quiet ${word}`} — nothing marked. The ${word} before: ${plural(signed.prior, "signing")}, ${relocated.prior} relocated.`
        : `${isCurrent ? `Quiet ${word} so far` : `A quiet ${word}`} — nothing marked.`;
    }
    return `${lead}, the team ${isCurrent ? "has signed" : "signed"} ${plural(signed.count, "doctor")} and relocated ${relocated.count} — with ${interviewed.count} interviewed and ${shortlisted.count} shortlisted.`;
  })();

  const trendClause = (() => {
    if (isLoading || totalNow === 0) return null;
    if (wonPrior === 0) return { text: `${wonNow} signed + relocated · none the ${word} before`, tone: "neutral" as const };
    const pct = Math.round(((wonNow - wonPrior) / wonPrior) * 100);
    if (pct === 0) return { text: `level with the ${word} before`, tone: "neutral" as const };
    return { text: `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% vs the ${word} before (results)`, tone: pct > 0 ? "up" as const : "down" as const };
  })();

  return (
    <Card className="overflow-hidden border-teal-100">
      <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />
      <CardContent className="pt-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot} shrink-0`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label} vs the {word} before
          </span>
          <HoverInfo
            meaning="Green when signings + relocations held or grew vs the period before, amber when they slipped, grey when nothing has been marked yet. Counts distinct doctors."
            source="placement_attempts (the imported sheet + the Processing page)."
          />
        </div>
        {isLoading ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-4 w-[380px] max-w-full" />
            <Skeleton className="h-4 w-[240px] max-w-full" />
          </div>
        ) : (
          <p className="mt-1.5 text-[17px] sm:text-[18px] font-semibold leading-snug text-slate-900 max-w-[60ch]">
            {headline}
          </p>
        )}
        {trendClause && (
          <p className={`mt-1 text-[12px] font-medium ${
            trendClause.tone === "up" ? "text-emerald-600" : trendClause.tone === "down" ? "text-rose-600" : "text-slate-500"
          }`}>
            {trendClause.tone === "up" ? "▲ " : trendClause.tone === "down" ? "▼ " : ""}{trendClause.text}
          </p>
        )}

        {/* While the placement rows are in flight this is a skeleton rather
            than four zeroes: a zero reads as "a dead month", which is a very
            different claim from "not loaded yet". */}
        <div className="mt-4">
          {isLoading ? (
            <TilesSkeleton count={4} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {stats.map(s => <ScoreTile key={s.key} stat={s} word={word} label={label} recent={recent[s.key]} />)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreTile({ stat, word, label, recent }: {
  stat: Milestone & { count: number; prior: number };
  word: string;
  label: string;
  recent: Recent[];
}) {
  const { label: name, icon: Icon, count, prior, result } = stat;
  const delta = count - prior;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaCls = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400";
  return (
    <Hint content={
      <>
        <HintTitle>{name} · {label}: {count}</HintTitle>
        <p className="text-muted-foreground">Was {prior} the {word} before ({delta > 0 ? "+" : ""}{delta})</p>
        {recent.length > 0 && (
          <>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Most recent</p>
            {recent.map((r, i) => (
              <p key={i} className="truncate">• {r.name} · {r.hospital} · {new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
            ))}
          </>
        )}
        <HintNote>Distinct doctors, counted once however many hospitals they're at.</HintNote>
      </>
    }>
      <div
        tabIndex={0}
        className={`rounded-lg border p-3 transition-shadow hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          result ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50"
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
          <Icon className={`h-3.5 w-3.5 ${result ? "text-emerald-600" : "text-slate-500"}`} />
          {name}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className={`text-[30px] font-bold leading-none tabular-nums ${result ? "text-emerald-700" : "text-slate-900"}`}>
            {count}
          </div>
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${deltaCls}`}>
            <TrendIcon className="h-3 w-3" />{delta > 0 ? "+" : ""}{delta}
          </span>
        </div>
        <div className="text-[9.5px] text-muted-foreground mt-1 tabular-nums">was {prior} the {word} before</div>
      </div>
    </Hint>
  );
}

/**
 * By hospital — the account view, glance-first.
 *
 * Same source as the CEO scoreboard and Team performance (placement_attempts),
 * so the numbers reconcile across the page. One row per hospital: a status
 * dot, its representative, open roles, the stage counts in the selected
 * period, and how long since anything moved. Above the table, three account-
 * health cards count how many accounts are Moving, Slowing, or Idle while
 * still hiring.
 *
 * "Last move" is measured up to the END of the selected period (or today, for
 * the current one), so stepping back to March shows how the accounts looked
 * in March rather than how they look now.
 *   Moving  — last movement within 14 days
 *   Slowing — 15–30 days
 *   Idle    — over 30 days (the health card counts only idle accounts that
 *             still have open roles: those are the ones to chase)
 *
 * This IS the account view now. The older relationship-health table
 * (warming/cooling badges, a 0-100 health score) has been removed rather than
 * moved: it scored accounts on how recently the sends machinery had touched
 * them, so a hospital could look "warming" on the strength of outbound email
 * alone. "How long since anything moved", below, answers the same question
 * from the placement record.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowsSkeleton } from "@/components/reports/Skeletons";
import { useSort, SortHead } from "@/components/reports/sortable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useHospitals } from "@/hooks/use-hospitals";
import { buildRepLookup } from "@/lib/hospital-rep";
import { Hint, HintTitle, HintNote, HoverInfo } from "@/components/reports/HoverHint";

interface Props {
  range:      { from: Date; to: Date };
  hospital?:  string | null;
  specialty?: string | null;
  /** hospital name → open vacancies, from the reporting bundle. Optional. */
  vacancies?: Map<string, number>;
  /** "week" | "month" | "year" — for copy only. */
  word?:      string;
}

const STAGES = [
  { key: "shortlisted", label: "Shortlisted", cols: ["shortlisted_at"] },
  { key: "interviewed", label: "Interviewed", cols: ["interviewed_at"] },
  { key: "offered",     label: "Offered",     cols: ["offered_at"] },
  { key: "signed",      label: "Signed",      cols: ["signed_at"] },
  { key: "relocated",   label: "Relocated",   cols: ["relocated_at", "joined_at"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; cols: ReadonlyArray<keyof PlacementAttempt> }>;

type StageKey = (typeof STAGES)[number]["key"];

type SortKey = StageKey | "hospital" | "rep" | "vacancies" | "last" | "status";

interface Row {
  hospital: string;
  rep:      string | null;
  counts:   Record<StageKey, Set<string>>;
  /** Most recent milestone up to the reference point (any time, not only in range). */
  lastEver: number | null;
  /** What that movement was, for the status hover card. */
  lastWhat: string | null;
}

type Status = "moving" | "slowing" | "idle";
const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  moving:  { label: "Moving",  dot: "bg-emerald-500", text: "text-emerald-700" },
  slowing: { label: "Slowing", dot: "bg-amber-500",   text: "text-amber-700" },
  idle:    { label: "Idle",    dot: "bg-rose-500",    text: "text-rose-700" },
};
const DAY = 86_400_000;

const PAGE = 12;

export function HospitalPerformance({ range, hospital, specialty, vacancies, word = "period" }: Props) {
  const { data: attempts = [], isLoading } = usePlacementAttempts();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const repFor = useMemo(() => buildRepLookup(hospitals), [hospitals]);
  const [showAll, setShowAll] = useState(false);
  // Signings first — the default answer to "which accounts are working".
  const sort = useSort<SortKey>("signed");
  // Gate on BOTH queries: the rep column comes from hospitals, so rendering
  // rows before that lands would flash a table full of em-dashes.
  const loading = isLoading || hospitalsLoading;

  // "Now" for a past period is its last day; for the current one, today.
  const ref = useMemo(() => Math.min(Date.now(), range.to.getTime() + DAY), [range]);
  const statusOf = (t: number | null): Status => {
    const d = t == null ? null : Math.max(0, Math.floor((ref - t) / DAY));
    return d == null || d > 30 ? "idle" : d > 14 ? "slowing" : "moving";
  };

  const { rows, all } = useMemo(() => {
    const from = range.from.getTime();
    const to   = range.to.getTime() + DAY;
    const ts = (iso: string | null | undefined) => {
      if (!iso) return null;
      const t = new Date(iso).getTime();
      return isNaN(t) ? null : t;
    };
    const inR = (t: number | null) => t != null && t >= from && t < to;

    const by = new Map<string, Row>();
    for (const a of attempts) {
      const name = a.hospital_name?.trim();
      if (!name) continue;
      if (hospital  && !name.toLowerCase().includes(hospital.toLowerCase())) continue;
      if (specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) continue;

      let row = by.get(name);
      if (!row) {
        row = {
          hospital: name,
          rep: repFor(name)?.name ?? null,
          counts: Object.fromEntries(STAGES.map(s => [s.key, new Set<string>()])) as Record<StageKey, Set<string>>,
          lastEver: null,
          lastWhat: null,
        };
        by.set(name, row);
      }
      for (const s of STAGES) {
        const times = s.cols.map(c => ts(a[c] as string | null)).filter((t): t is number => t != null);
        if (times.some(inR)) row.counts[s.key].add(a.doctor_id);
        for (const t of times) {
          if (t <= ref && (row.lastEver == null || t > row.lastEver)) {
            row.lastEver = t;
            row.lastWhat = `${a.doctor_name} ${s.label.toLowerCase()}`;
          }
        }
      }
    }

    const total = (r: Row) => STAGES.reduce((n, s) => n + r.counts[s.key].size, 0);
    const all = [...by.values()].filter(r => r.lastEver != null);
    return { rows: all.filter(r => total(r) > 0), all };
  }, [attempts, repFor, range, hospital, specialty, ref]);

  // Account health across every hospital we've worked with up to this point.
  const health = useMemo(() => {
    const out: Record<Status, Row[]> = { moving: [], slowing: [], idle: [] };
    for (const r of all) out[statusOf(r.lastEver)].push(r);
    for (const k of Object.keys(out) as Status[]) out[k].sort((a, b) => (b.lastEver ?? 0) - (a.lastEver ?? 0));
    const idleHiring = out.idle.filter(r => (vacancies?.get(r.hospital) ?? 0) > 0)
      .sort((a, b) => (a.lastEver ?? 0) - (b.lastEver ?? 0));
    return { ...out, idleHiring, idleQuiet: out.idle.length - idleHiring.length };
    // statusOf only reads `ref`, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, vacancies, ref]);

  // Sorting is applied after the roll-up, so switching columns never re-counts
  // anything — it only reorders what's already been tallied.
  const sorted = useMemo(() => sort.sort(rows, (r, key) => {
    switch (key) {
      case "hospital":  return r.hospital;
      case "rep":       return r.rep;
      case "vacancies": return vacancies?.get(r.hospital) ?? null;
      case "last":
      case "status":    return r.lastEver;
      default:          return r.counts[key as StageKey].size;
    }
  }), [rows, sort, vacancies]);

  const visible = showAll ? sorted : sorted.slice(0, PAGE);
  const names = (rs: Row[]) => rs.slice(0, 5).map(r => `${r.hospital} (${sinceLabel(r.lastEver, ref)})`).join(", ") + (rs.length > 5 ? `, +${rs.length - 5} more` : "");

  const cards = [
    { key: "moving",  value: health.moving.length,     label: "Moving",  sub: "Last move within 14 days",          icon: CheckCircle2,  color: "text-emerald-600", bar: "bg-emerald-600", bg: "bg-emerald-50", list: health.moving },
    { key: "slowing", value: health.slowing.length,    label: "Slowing", sub: "Last move 15–30 days ago",          icon: Clock,         color: "text-amber-600",   bar: "bg-amber-600",   bg: "bg-amber-50",   list: health.slowing },
    { key: "idle",    value: health.idleHiring.length, label: "Idle",    sub: "Nothing in 30+ days, still hiring", icon: AlertTriangle, color: "text-rose-600",    bar: "bg-rose-600",    bg: "bg-rose-50",    list: health.idleHiring },
  ];

  return (
    <div className="space-y-6">
      {/* Account health — same card as the Dashboard KPI tiles. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="s-health">
        {loading ? [0, 1, 2].map(i => <Skeleton key={i} className="h-[88px] rounded-xl" />) : cards.map((c, i) => (
          <Hint key={c.key} content={
            <>
              <HintTitle>{c.value} {c.label.toLowerCase()} account{c.value === 1 ? "" : "s"}</HintTitle>
              {c.list.length ? <p>{names(c.list)}</p> : <p className="text-muted-foreground">None.</p>}
              {c.key === "idle" && health.idleQuiet > 0 && <HintNote>Plus {health.idleQuiet} idle account{health.idleQuiet === 1 ? "" : "s"} with no open roles (not counted).</HintNote>}
            </>
          }>
            <div
              tabIndex={0}
              className={`relative h-[88px] rounded-xl border border-kpi/60 ${c.bg} shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01] overflow-hidden flex flex-col cursor-default aa-fade-up outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className={`h-1 shrink-0 ${c.bar}`} />
              <div className="px-4 py-3 flex items-start justify-between flex-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">{c.label}</p>
                  <p className={`text-[24px] font-bold tabular-nums leading-none ${c.color}`}>{c.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.sub}</p>
                </div>
                <div className="h-7 w-7 rounded-lg bg-card/70 flex items-center justify-center shrink-0 ml-2">
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                </div>
              </div>
            </div>
          </Hint>
        ))}
      </div>

      <Card id="s-hospitals">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-sky-600" /> By hospital
                <HoverInfo
                  meaning="Activity per account in the selected period, with its representative. Status comes from 'Last move': within 14 days Moving, 15–30 Slowing, over 30 Idle — measured up to the end of the period."
                  source="placement_attempts × hospitals × vacancies."
                />
              </CardTitle>
              <CardDescription className="text-[11px]">
                Each account's activity this {word}, open roles and representative. Click any column to re-sort.
              </CardDescription>
            </div>
            {loading ? (
              <Skeleton className="h-5 w-20 shrink-0" />
            ) : (
              <Badge variant="outline" className="text-[10px] bg-slate-50 tabular-nums shrink-0">
                {rows.length.toLocaleString()} active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableRowsSkeleton rows={8} cols={vacancies ? 9 : 8} />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">
              No hospital activity this {word}. Step back with the arrows, or switch to Monthly / Yearly.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead sort={sort} sortKey="status"   numeric={false}>Status</SortHead>
                    <SortHead sort={sort} sortKey="hospital" numeric={false}>Hospital</SortHead>
                    <SortHead sort={sort} sortKey="rep"      numeric={false}>Rep</SortHead>
                    {vacancies && <SortHead sort={sort} sortKey="vacancies">Open roles</SortHead>}
                    {STAGES.map(s => (
                      <SortHead key={s.key} sort={sort} sortKey={s.key}>{s.label}</SortHead>
                    ))}
                    <SortHead sort={sort} sortKey="last">Last move</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(r => {
                    const st = STATUS[statusOf(r.lastEver)];
                    const open = vacancies?.get(r.hospital) ?? 0;
                    return (
                      <TableRow key={r.hospital}>
                        <TableCell>
                          <Hint content={<><HintTitle>{st.label}</HintTitle>Last move {sinceLabel(r.lastEver, ref)}{r.lastWhat && <>: {r.lastWhat}</>}</>}>
                            <span tabIndex={0} className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${st.text} cursor-default`}>
                              <span className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}
                            </span>
                          </Hint>
                        </TableCell>
                        <TableCell className="text-[12px] font-medium max-w-[260px] truncate" title={r.hospital}>{r.hospital}</TableCell>
                        <TableCell className="text-[12px]">
                          {r.rep
                            ? <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200">{r.rep}</Badge>
                            : <span className="text-slate-300">—</span>}
                        </TableCell>
                        {vacancies && (
                          <TableCell className="text-[12px] text-right tabular-nums">
                            {open ? (
                              <Hint content={`${open} open role${open === 1 ? "" : "s"} on the vacancy list`}>
                                <span tabIndex={0} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold cursor-default ${open >= 5 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50"}`}>{open}</span>
                              </Hint>
                            ) : <span className="text-slate-300">—</span>}
                          </TableCell>
                        )}
                        {STAGES.map(s => {
                          const n = r.counts[s.key].size;
                          const result = s.key === "signed" || s.key === "relocated";
                          return (
                            <TableCell
                              key={s.key}
                              className={`text-[12px] text-right tabular-nums ${
                                n === 0 ? "text-slate-300" : result ? "text-emerald-700 font-medium" : ""
                              }`}
                            >
                              {n === 0 ? "—" : n}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-[12px] text-right tabular-nums text-muted-foreground">
                          {sinceLabel(r.lastEver, ref)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {sorted.length > PAGE && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="w-full py-2 text-[11px] text-teal-700 hover:bg-teal-50/60 border-t transition-colors"
                >
                  {showAll ? "Show top 12" : `Show all ${sorted.length} hospitals`}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** "today" / "yesterday" / "12d ago" / "3 Mar", measured from `ref`. */
function sinceLabel(t: number | null, ref: number): string {
  if (t == null) return "—";
  const days = Math.floor((ref - t) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  try { return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "—"; }
}

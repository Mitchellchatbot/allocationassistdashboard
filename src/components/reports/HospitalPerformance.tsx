/**
 * By hospital — the account view, glance-first.
 *
 * Same source as the CEO scoreboard and Team performance (placement_attempts),
 * so the numbers reconcile across the page. One row per hospital: its
 * representative, the stage counts in the selected range, and how long since
 * anything moved. Open-vacancy counts are folded in from the reporting bundle
 * when available, so an account that's hiring but idle stands out.
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
import { Building2 } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useHospitals } from "@/hooks/use-hospitals";
import { buildRepLookup } from "@/lib/hospital-rep";

interface Props {
  range:      { from: Date; to: Date };
  hospital?:  string | null;
  specialty?: string | null;
  /** hospital name → open vacancies, from the reporting bundle. Optional. */
  vacancies?: Map<string, number>;
}

const STAGES = [
  { key: "shortlisted", label: "Shortlisted", cols: ["shortlisted_at"] },
  { key: "interviewed", label: "Interviewed", cols: ["interviewed_at"] },
  { key: "offered",     label: "Offered",     cols: ["offered_at"] },
  { key: "signed",      label: "Signed",      cols: ["signed_at"] },
  { key: "relocated",   label: "Relocated",   cols: ["relocated_at", "joined_at"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; cols: ReadonlyArray<keyof PlacementAttempt> }>;

type StageKey = (typeof STAGES)[number]["key"];

type SortKey = StageKey | "hospital" | "rep" | "vacancies" | "last";

interface Row {
  hospital: string;
  rep:      string | null;
  counts:   Record<StageKey, Set<string>>;
  lastAt:   number | null;
}

const PAGE = 12;

export function HospitalPerformance({ range, hospital, specialty, vacancies }: Props) {
  const { data: attempts = [], isLoading } = usePlacementAttempts();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const repFor = useMemo(() => buildRepLookup(hospitals), [hospitals]);
  const [showAll, setShowAll] = useState(false);
  // Signings first — the default answer to "which accounts are working".
  const sort = useSort<SortKey>("signed");
  // Gate on BOTH queries: the rep column comes from hospitals, so rendering
  // rows before that lands would flash a table full of em-dashes.
  const loading = isLoading || hospitalsLoading;

  const rows = useMemo(() => {
    const from = range.from.getTime();
    const to   = range.to.getTime() + 86_400_000;
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
          lastAt: null,
        };
        by.set(name, row);
      }
      for (const s of STAGES) {
        const hit = s.cols.map(c => ts(a[c] as string | null)).find(inR);
        if (hit != null) {
          row.counts[s.key].add(a.doctor_id);
          if (row.lastAt == null || hit > row.lastAt) row.lastAt = hit;
        }
      }
    }

    const total = (r: Row) => STAGES.reduce((n, s) => n + r.counts[s.key].size, 0);
    return [...by.values()].filter(r => total(r) > 0);
  }, [attempts, repFor, range, hospital, specialty]);

  // Sorting is applied after the roll-up, so switching columns never re-counts
  // anything — it only reorders what's already been tallied.
  const sorted = useMemo(() => sort.sort(rows, (r, key) => {
    switch (key) {
      case "hospital":  return r.hospital;
      case "rep":       return r.rep;
      case "vacancies": return vacancies?.get(r.hospital) ?? null;
      case "last":      return r.lastAt;
      default:          return r.counts[key as StageKey].size;
    }
  }), [rows, sort, vacancies]);

  const visible = showAll ? sorted : sorted.slice(0, PAGE);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-600" /> By hospital
            </CardTitle>
            <CardDescription className="text-[11px]">
              Activity per account over the selected range, with its representative. Click any column to re-sort.
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
          <TableRowsSkeleton rows={8} cols={vacancies ? 8 : 7} />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">
            No hospital activity in this window. Try widening the date range.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
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
                {visible.map(r => (
                  <TableRow key={r.hospital}>
                    <TableCell className="text-[12px] font-medium max-w-[260px] truncate" title={r.hospital}>{r.hospital}</TableCell>
                    <TableCell className="text-[12px]">
                      {r.rep
                        ? <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200">{r.rep}</Badge>
                        : <span className="text-slate-300">—</span>}
                    </TableCell>
                    {vacancies && (
                      <TableCell className="text-[12px] text-right tabular-nums">
                        {vacancies.get(r.hospital) || <span className="text-slate-300">—</span>}
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
                      {sinceLabel(r.lastAt)}
                    </TableCell>
                  </TableRow>
                ))}
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
  );
}

function sinceLabel(t: number | null): string {
  if (t == null) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  try { return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "—"; }
}

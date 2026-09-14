/**
 * Team performance — built from the hospital allocation.
 *
 * The org model (Ammar/Saif, 2026-09): every hospital has ONE representative
 * (hospitals.owner_email), and that person owns everything that happens there.
 * So a member's book is their allocated hospitals, and their numbers are simply
 * the sum of those hospitals' stages. Expanding a member lists the accounts
 * they hold, including the quiet ones — a rep sitting on twelve hospitals with
 * nothing moving is the thing you want this page to show.
 *
 * The roster comes from the hospitals table, NOT from activity: a hospital with
 * no placements this range still counts toward its owner's book and shows as a
 * zero row rather than disappearing.
 *
 * Reads placement_attempts (not doctor_lifecycle) so the totals reconcile with
 * the Overview scoreboard and the Hospitals tab. Counts DISTINCT DOCTORS per
 * stage, matching the hero.
 */
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useHospitals } from "@/hooks/use-hospitals";
import { buildHospitalMatcher } from "@/lib/hospital-rep";
import { HI_TEAM_MEMBERS, findHiMemberByEmail } from "@/lib/hi-team";
import { RepRowsSkeleton, STAGE_COL } from "@/components/reports/Skeletons";
import { useSort, SortLabel } from "@/components/reports/sortable";

interface Props {
  range:      { from: Date; to: Date };
  hospital?:  string | null;
  specialty?: string | null;
}

const STAGES = [
  { key: "shortlisted", label: "Shortlisted", cols: ["shortlisted_at"] },
  { key: "interviewed", label: "Interviewed", cols: ["interviewed_at"] },
  { key: "offered",     label: "Offered",     cols: ["offered_at"] },
  { key: "signed",      label: "Signed",      cols: ["signed_at"] },
  { key: "relocated",   label: "Relocated",   cols: ["relocated_at", "joined_at"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; cols: ReadonlyArray<keyof PlacementAttempt> }>;

type StageKey = (typeof STAGES)[number]["key"];
type Counts = Record<StageKey, Set<string>>;

const emptyCounts = (): Counts =>
  Object.fromEntries(STAGES.map(s => [s.key, new Set<string>()])) as Counts;

const totalOf = (c: Counts) => STAGES.reduce((n, s) => n + c[s.key].size, 0);

/** "name" doubles as the hospital name inside an expanded book. */
type SortKey = StageKey | "name" | "hospitals";

interface HospitalRow { name: string; counts: Counts }
interface RepRow {
  email:     string;
  name:      string;
  counts:    Counts;
  hospitals: HospitalRow[];
}

/** Bucket for hospitals with no owner set — shown last, never ranked. */
const UNASSIGNED = "__unassigned";

export function TeamPerformance({ range, hospital, specialty }: Props) {
  const { data: attempts = [], isLoading } = usePlacementAttempts();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const matchHospital = useMemo(() => buildHospitalMatcher(hospitals), [hospitals]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sort = useSort<SortKey>("signed");

  const { rows, unassigned, maxTotal } = useMemo(() => {
    const from = range.from.getTime();
    const to   = range.to.getTime() + 86_400_000;     // inclusive end-of-day
    const inR = (iso: string | null | undefined) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= from && t < to;
    };
    const nameMatches = (n: string) => !hospital || n.toLowerCase().includes(hospital.toLowerCase());

    // 1. The books. Seeded from the hospitals table so allocation — not
    //    activity — decides who appears and how many accounts they hold.
    const by = new Map<string, RepRow>();
    const bucket = new Map<string, Map<string, Counts>>();   // repKey → hospital → counts
    const ensure = (key: string, email: string, name: string) => {
      let row = by.get(key);
      if (!row) { row = { email, name, counts: emptyCounts(), hospitals: [] }; by.set(key, row); bucket.set(key, new Map()); }
      return row;
    };
    for (const m of HI_TEAM_MEMBERS) ensure(m.email.toLowerCase(), m.email, m.name);
    ensure(UNASSIGNED, UNASSIGNED, "No representative");

    for (const h of hospitals) {
      if (!h.name || !nameMatches(h.name)) continue;
      const rep = findHiMemberByEmail(h.owner_email);
      const key = rep ? rep.email.toLowerCase() : UNASSIGNED;
      ensure(key, rep?.email ?? UNASSIGNED, rep?.name ?? "No representative");
      const book = bucket.get(key)!;
      if (!book.has(h.name)) book.set(h.name, emptyCounts());
    }

    // 2. The activity, attributed through the hospital it happened at.
    for (const a of attempts) {
      const raw = a.hospital_name?.trim();
      if (!raw || !nameMatches(raw)) continue;
      if (specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) continue;

      const hit = matchHospital(raw);
      const key = hit ? hit.rep.email.toLowerCase() : UNASSIGNED;
      const row = ensure(key, hit?.rep.email ?? UNASSIGNED, hit?.rep.name ?? "No representative");
      // Prefer the canonical record name so "NMC (Sharjah)" and "NMC Sharjah"
      // land on one line; fall back to the sheet's own spelling when the
      // match was to the owner rather than to a single branch.
      const label = hit?.hospital ?? raw;
      const book = bucket.get(key)!;
      let counts = book.get(label);
      if (!counts) { counts = emptyCounts(); book.set(label, counts); }

      for (const s of STAGES) {
        if (s.cols.some(c => inR(a[c] as string | null))) {
          counts[s.key].add(a.doctor_id);
          row.counts[s.key].add(a.doctor_id);
        }
      }
    }

    for (const [key, row] of by) {
      row.hospitals = [...bucket.get(key)!].map(([name, counts]) => ({ name, counts }));
    }

    const all = [...by.values()];
    const un  = all.find(r => r.email === UNASSIGNED)!;
    return {
      rows: all.filter(r => r.email !== UNASSIGNED),
      unassigned: totalOf(un.counts) > 0 || un.hospitals.length > 0 ? un : null,
      maxTotal: Math.max(1, ...all.map(r => totalOf(r.counts))),
    };
  }, [attempts, hospitals, matchHospital, range, hospital, specialty]);

  // Ordering is applied after the roll-up and reuses one comparator for both
  // levels: sorting by "Signed" ranks the members AND the hospitals inside
  // each expanded book, so a drill-down keeps the question you just asked.
  const value = useCallback((r: RepRow, key: SortKey): string | number => {
    if (key === "name")      return r.name;
    if (key === "hospitals") return r.hospitals.length;
    return r.counts[key].size;
  }, []);
  const sortedRows = useMemo(() => sort.sort(rows, value), [rows, sort, value]);
  const sortBook = useCallback(
    (book: HospitalRow[]) => sort.sort(book, (h, key) => (key === "name" || key === "hospitals" ? h.name : h.counts[key].size)),
    [sort],
  );

  const loading = isLoading || hospitalsLoading;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-600" /> Team performance
        </CardTitle>
        <CardDescription className="text-[11px]">
          Each member's allocated hospitals and everything those accounts delivered in the range. Expand a row to see the book. Distinct doctors, same source as the Overview scoreboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <RepRowsSkeleton rows={4} />
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-3 px-2 pb-1.5 border-b border-slate-100">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <SortLabel sort={sort} sortKey="name" numeric={false}>Representative</SortLabel>
                <SortLabel sort={sort} sortKey="hospitals">Hospitals</SortLabel>
              </div>
              {STAGES.map(s => (
                <div key={s.key} className={`${STAGE_COL} shrink-0 flex justify-end`}>
                  <SortLabel sort={sort} sortKey={s.key}>{s.label}</SortLabel>
                </div>
              ))}
            </div>

            {sortedRows.map(r => (
              <RepBlock
                key={r.email}
                row={r}
                maxTotal={maxTotal}
                book={sortBook(r.hospitals)}
                open={!!expanded[r.email]}
                onToggle={() => setExpanded(s => ({ ...s, [r.email]: !s[r.email] }))}
              />
            ))}

            {unassigned && (
              <div className="pt-1 mt-1 border-t border-dashed border-slate-200">
                <RepBlock
                  row={unassigned}
                  maxTotal={maxTotal}
                  book={sortBook(unassigned.hospitals)}
                  muted
                  open={!!expanded[UNASSIGNED]}
                  onToggle={() => setExpanded(s => ({ ...s, [UNASSIGNED]: !s[UNASSIGNED] }))}
                />
                <p className="text-[10px] text-muted-foreground pt-1.5 px-2">
                  These hospitals have no owner set, so nothing that happens there is credited to anyone. Set a representative on the hospital record to fold them into a book.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RepBlock({ row, book, maxTotal, muted, open, onToggle }: {
  row: RepRow; book: HospitalRow[]; maxTotal: number; muted?: boolean; open: boolean; onToggle: () => void;
}) {
  const total = totalOf(row.counts);
  const initials = row.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const active = row.hospitals.filter(h => totalOf(h.counts) > 0).length;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-50/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {open
            ? <ChevronDown  className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
          <span className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-[10px] font-semibold ${
            muted ? "bg-slate-100 text-slate-400" : "bg-violet-100 text-violet-700"
          }`}>
            {muted ? "—" : initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-[12px] font-medium truncate ${muted ? "text-slate-500 italic" : "text-slate-900"}`}>{row.name}</span>
              <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-600 tabular-nums shrink-0">
                <Building2 className="h-2.5 w-2.5 mr-1" />
                {row.hospitals.length} {row.hospitals.length === 1 ? "hospital" : "hospitals"}
                {active > 0 && <span className="ml-1 text-emerald-600">· {active} active</span>}
              </Badge>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-[180px]">
              <div
                className={`h-full rounded-full ${muted ? "bg-slate-300" : "bg-violet-500"}`}
                style={{ width: `${Math.max(2, (total / maxTotal) * 100)}%` }}
              />
            </div>
          </div>
        </div>
        {STAGES.map(s => <StageCell key={s.key} n={row.counts[s.key].size} stage={s.key} size="lg" />)}
      </button>

      {open && (
        <div className="pl-9 pr-2 pb-2">
          {book.length === 0 ? (
            <div className="py-3 text-[11px] text-muted-foreground italic">
              No hospitals allocated yet.
            </div>
          ) : (
            <div className="rounded-md border border-slate-100 divide-y divide-slate-50">
              {book.map(h => {
                const idle = totalOf(h.counts) === 0;
                return (
                  <div key={h.name} className="flex items-center gap-3 px-2.5 py-1.5">
                    <span
                      className={`flex-1 min-w-0 truncate text-[11px] ${idle ? "text-slate-400" : "text-slate-700"}`}
                      title={h.name}
                    >
                      {h.name}
                      {idle && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-slate-300">quiet</span>}
                    </span>
                    {STAGES.map(s => <StageCell key={s.key} n={h.counts[s.key].size} stage={s.key} size="sm" />)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageCell({ n, stage, size }: { n: number; stage: StageKey; size: "lg" | "sm" }) {
  const result = stage === "signed" || stage === "relocated";
  const text = size === "lg" ? "text-[15px]" : "text-[11px]";
  return (
    <div className={`${STAGE_COL} text-right tabular-nums shrink-0 ${text} ${
      n === 0 ? "text-slate-300" : result ? "text-emerald-700 font-semibold" : "text-slate-700"
    }`}>
      {n === 0 ? "—" : n}
    </div>
  );
}

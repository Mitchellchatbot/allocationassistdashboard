/**
 * Team performance — built from the rep written on each line.
 *
 * The sheet names the representative on every line from September 2026 ("H & I
 * Representative", column B), so credit follows the person who logged the work.
 * Before that it named nobody and the rep had to be voted for by the hospitals
 * in each weekly block, which cannot settle an account two reps share — SGH,
 * SKMC, NMC, Mediclinic, KCH and FUH all sit on two books. The column settles
 * them, and a line the sheet left blank falls back to the block vote at import
 * time, not here.
 *
 * The roster comes from the DATA, not from a hard-coded list: only reps who
 * appear in the period are shown. Someone who has left stops appearing instead
 * of sitting at the top of the table on a row of zeroes forever.
 *
 * Reads placement_events, so a member's book is the accounts they actually
 * logged lines at, and counts LOGGED LINES per stage — the same measure as the
 * Overview scoreboard, and the one the team's own report publishes.
 */
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { usePlacementAttempts } from "@/hooks/use-placement-attempts";
import { usePlacementEvents } from "@/hooks/use-placement-events";
import { findHiMemberByEmail } from "@/lib/hi-team";
import { EVENT_TO_STAGE, type EventBackedStage } from "@/lib/placement-reporting";
import { RepRowsSkeleton, STAGE_COL } from "@/components/reports/Skeletons";
import { useSort, SortLabel } from "@/components/reports/sortable";
import { Hint, HintTitle, HintNote, HoverInfo } from "@/components/reports/HoverHint";

interface Props {
  range:      { from: Date; to: Date };
  hospital?:  string | null;
  specialty?: string | null;
}

const STAGES = [
  { key: "shortlisted", label: "Shortlisted" },
  { key: "interviewed", label: "Interviewed" },
  { key: "offered",     label: "Offered" },
  { key: "signed",      label: "Signed" },
  { key: "relocated",   label: "Relocated" },
] as const satisfies ReadonlyArray<{ key: EventBackedStage; label: string }>;

type StageKey = (typeof STAGES)[number]["key"];

/** Event ids, so a set's size is a count of LINES. Two lines for one doctor at
 *  one hospital are two, which is how the team counts — see placement_events. */
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

/** Bucket for lines the sheet never attributed — shown last, never ranked. */
const UNASSIGNED = "__unassigned";

/** rep values that mean "nobody in particular": the column's own default, and
 *  the marker the Processing page stamps on a stage someone set by hand. */
const NO_REP = new Set(["", "unknown", "manual"]);

/** A Date as the calendar day it is locally. An event holds a day, so reading
 *  it as an instant puts the last day of the period after the range's end
 *  everywhere east of UTC. */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function TeamPerformance({ range, hospital, specialty }: Props) {
  const { data: attempts = [], isLoading } = usePlacementAttempts();
  const { data: events = [], isLoading: eventsLoading } = usePlacementEvents();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sort = useSort<SortKey>("signed");

  // Which hospital and specialty a line belongs to: the event keeps neither,
  // because the journey it hangs off already does.
  const byAttempt = useMemo(() => {
    const m = new Map<string, { hospital: string; specialty: string | null }>();
    for (const a of attempts) m.set(a.id, { hospital: a.hospital_name, specialty: a.doctor_specialty });
    return m;
  }, [attempts]);

  const { rows, unassigned, maxTotal } = useMemo(() => {
    const from = localDay(range.from);
    const to   = localDay(range.to);

    const by = new Map<string, RepRow>();
    const bucket = new Map<string, Map<string, Counts>>();   // repKey -> hospital -> counts
    const ensure = (key: string, email: string, name: string) => {
      let row = by.get(key);
      if (!row) { row = { email, name, counts: emptyCounts(), hospitals: [] }; by.set(key, row); bucket.set(key, new Map()); }
      return row;
    };

    for (const ev of events) {
      const day = ev.occurred_at?.slice(0, 10);
      if (!day || day < from || day > to) continue;
      const stage = EVENT_TO_STAGE[ev.stage];
      if (!stage) continue;

      const journey = byAttempt.get(ev.attempt_id);
      const name = journey?.hospital?.trim();
      if (!name) continue;
      if (hospital && !name.toLowerCase().includes(hospital.toLowerCase())) continue;
      if (specialty && !(journey?.specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) continue;

      const typed = (ev.rep ?? "").trim();
      const member = findHiMemberByEmail(typed);
      // An unrecognised rep keeps its own row under the name as recorded —
      // that is how a misspelling in the sheet becomes visible instead of
      // quietly merging into someone else's book.
      const key = member ? member.email.toLowerCase()
                : NO_REP.has(typed.toLowerCase()) ? UNASSIGNED
                : typed.toLowerCase();
      const row = ensure(
        key,
        member?.email ?? (key === UNASSIGNED ? UNASSIGNED : typed),
        member?.name  ?? (key === UNASSIGNED ? "No representative" : typed),
      );

      const book = bucket.get(key)!;
      let counts = book.get(name);
      if (!counts) { counts = emptyCounts(); book.set(name, counts); }
      counts[stage].add(ev.id);
      row.counts[stage].add(ev.id);
    }

    for (const [key, row] of by) {
      row.hospitals = [...bucket.get(key)!].map(([name, counts]) => ({ name, counts }));
    }

    const all = [...by.values()];
    const un  = all.find(r => r.email === UNASSIGNED) ?? null;
    return {
      rows: all.filter(r => r.email !== UNASSIGNED),
      unassigned: un && totalOf(un.counts) > 0 ? un : null,
      maxTotal: Math.max(1, ...all.map(r => totalOf(r.counts))),
    };
  }, [events, byAttempt, range, hospital, specialty]);

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

  const loading = isLoading || eventsLoading;

  // Leaderboard cards: ranked by signings, then relocations, then shortlists.
  const ranked = useMemo(
    () => [...rows].sort((a, b) =>
      b.counts.signed.size - a.counts.signed.size ||
      b.counts.relocated.size - a.counts.relocated.size ||
      b.counts.shortlisted.size - a.counts.shortlisted.size),
    [rows],
  );
  const openBook = (email: string) => {
    setExpanded(s => ({ ...s, [email]: true }));
    requestAnimationFrame(() => document.getElementById("s-team")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="s-reps">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[108px] rounded-xl bg-muted/40 animate-pulse" />)
        : ranked.map((r, i) => <RepCard key={r.email} row={r} rank={i + 1} tone={REP_TONES[i % REP_TONES.length]} delay={i * 50} onOpen={() => openBook(r.email)} />)}
    </div>
    <Card id="s-team">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-600" /> Team performance
          <HoverInfo
            meaning="Every line a member logged in the period, counted the way the team counts — lines, not distinct doctors, the same measure as the Overview scoreboard. Open a member to see which accounts the lines were at. Only members who appear in the period are listed."
            source="placement_events.rep, from the sheet's H & I Representative column."
          />
        </CardTitle>
        <CardDescription className="text-[11px]">
          Credit follows the representative named on the line. Click a row (or a card above) to open that member's book.
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
                  These lines name no representative — an older sheet that had no such column, a line that left it blank, or a stage marked by hand in Processing. Fill the Representative column in the sheet and re-import to fold them into a book.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

// Literal class strings (Tailwind only keeps classes it can see written out).
const REP_TONES = [
  { bg: "bg-violet-50",  bar: "bg-violet-600",  text: "text-violet-600",  chip: "text-violet-700" },
  { bg: "bg-sky-50",     bar: "bg-sky-600",     text: "text-sky-600",     chip: "text-sky-700" },
  { bg: "bg-amber-50",   bar: "bg-amber-600",   text: "text-amber-600",   chip: "text-amber-700" },
  { bg: "bg-rose-50",    bar: "bg-rose-600",    text: "text-rose-600",    chip: "text-rose-700" },
  { bg: "bg-emerald-50", bar: "bg-emerald-600", text: "text-emerald-600", chip: "text-emerald-700" },
] as const;

const STAGE_HEX: Record<StageKey, string> = {
  // Relocated is purple, matching the Trend card — see the note there on why
  // it stopped being a second green.
  shortlisted: "#4f46e5", interviewed: "#0284c7", offered: "#d97706", signed: "#059669", relocated: "#9333ea",
};

/** One rep, in the Dashboard's KPI-card style: signings up front, the stage mix underneath. */
function RepCard({ row, rank, tone, delay, onOpen }: {
  row: RepRow; rank: number; tone: (typeof REP_TONES)[number]; delay: number; onOpen: () => void;
}) {
  const initials = row.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const busiest = [...row.hospitals].sort((a, b) => totalOf(b.counts) - totalOf(a.counts))[0];
  const total = totalOf(row.counts);
  return (
    <Hint content={
      <>
        <HintTitle>{row.name} · #{rank} by signings</HintTitle>
        <p>{totalOf(row.counts)} line{totalOf(row.counts) === 1 ? "" : "s"} across {row.hospitals.length} hospital{row.hospitals.length === 1 ? "" : "s"}</p>
        {busiest && <p>Busiest: {busiest.name}</p>}
        <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3.5">
          {STAGES.map(s => (
            <div key={s.key} className="contents">
              <span className="text-muted-foreground">{s.label}</span>
              <b className="tabular-nums">{row.counts[s.key].size}</b>
            </div>
          ))}
        </div>
        <HintNote>Click to open the book in the table below.</HintNote>
      </>
    }>
      <button
        type="button"
        onClick={onOpen}
        className={`relative h-[108px] w-full text-left rounded-xl border border-kpi/60 ${tone.bg} shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01] overflow-hidden flex flex-col aa-fade-up`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className={`h-1 shrink-0 w-full ${tone.bar}`} />
        <div className="px-4 py-3 flex-1 w-full flex flex-col justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-7 w-7 rounded-full bg-card/80 ${tone.chip} text-[10px] font-bold flex items-center justify-center shrink-0`}>{initials}</span>
            <p className="text-[11px] font-medium text-muted-foreground truncate flex-1">{row.name}</p>
            <span className={`text-[10px] font-semibold ${tone.chip}`}>#{rank}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className={`text-[24px] font-bold tabular-nums leading-none ${tone.text}`}>{row.counts.signed.size}</p>
            <span className="text-[10px] text-muted-foreground">signed · {row.hospitals.length} hospital{row.hospitals.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-card/60">
            {total > 0 && STAGES.map(s => (
              <span key={s.key} style={{ flex: row.counts[s.key].size, background: STAGE_HEX[s.key] }} />
            ))}
          </div>
        </div>
      </button>
    </Hint>
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

/**
 * ProcessingPanel — the /processing body.
 *
 * A MARKING-ONLY milestone tracker. Five stages (Shortlisted → Interview →
 * Offered → Signed → Join) per doctor-and-hospital pair, each recording the
 * DATE the event happened. Nothing here sends an email: it is a record of
 * what already happened in the real world, not an execution layer. The email
 * flows still live on the Email Chain tab of /sends.
 *
 * Rows are `placement_attempts` (unique on doctor_id + hospital_name), the
 * same table Reports → Placements reads, so marking here feeds the placement
 * reporting and the doctor_lifecycle rollup via the existing DB trigger.
 *
 * Doctors on Board with no attempt row yet are listed too, with no hospital
 * and nothing to mark — otherwise a placed doctor would be invisible here
 * until someone remembered to add them, which is exactly the gap this page is
 * meant to close.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";
import { DocLink } from "@/components/DocLink";
import { AnimatedMultiToggle, type MultiToggleItem } from "@/components/AnimatedMultiToggle";
import { ListChecks, Plus, Check, X as XIcon, MailX, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  usePlacementAttempts, useMarkPlacementMilestone,
  type PlacementAttempt, type MilestoneColumn,
} from "@/hooks/use-placement-attempts";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useHospitals } from "@/hooks/use-hospitals";
import { type HiTeamMember } from "@/lib/hi-team";
import { buildRepLookup } from "@/lib/hospital-rep";
import { NewPlacementDialog } from "@/components/reports/PlacementsCard";
import { PlacementImportDialog } from "@/components/processing/PlacementImportDialog";

interface Stage {
  key:    string;
  column: MilestoneColumn;
  label:  string;
  /** Tailwind classes for the marked-state chip. */
  tone:   string;
}

// Order matters: a row's "current stage" is the FURTHEST one with a date.
const STAGES: Stage[] = [
  { key: "shortlisted", column: "shortlisted_at", label: "Shortlisted", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  { key: "interview",   column: "interviewed_at", label: "Interview",   tone: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "offered",     column: "offered_at",     label: "Offered",     tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "signed",      column: "signed_at",      label: "Signed",      tone: "bg-teal-50 text-teal-700 border-teal-200" },
  { key: "joined",      column: "joined_at",      label: "Join",        tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

// ~3k pairs is normal here, and every row renders five Popover-backed cells —
// rendering the lot locks the tab up for seconds.
const PAGE_SIZE = 30;

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
};

/** `<input type="date">` wants yyyy-MM-dd in LOCAL time — toISOString() would
 *  shift the day backwards for anyone east of UTC. */
const toDateInput = (iso: string | null): string => {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * A table row. `attempt` is null for a Doctor on Board who has not been put
 * against a hospital yet — there is no DB row to mark against, so those render
 * as an empty line waiting for a hospital.
 */
interface Row {
  id:           string;
  doctorId:     string;
  doctorName:   string;
  specialty:    string | null;
  hospitalName: string | null;
  /** Team member who owns the hospital — every stage on this row is theirs. */
  rep:          HiTeamMember | null;
  attempt:      PlacementAttempt | null;
}

/** Index of the furthest stage reached, or -1 for an untouched row. */
function currentStageIndex(attempt: PlacementAttempt | null): number {
  if (!attempt) return -1;
  let idx = -1;
  STAGES.forEach((s, i) => { if (attempt[s.column]) idx = i; });
  return idx;
}

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Which filter bucket a row belongs to. Doctors with no hospital get their
 *  own bucket rather than falling into "Not started", which would bury the
 *  handful of genuinely untouched attempts under thousands of them. */
function bucketOf(row: Row): string {
  if (!row.attempt) return "no-hospital";
  const idx = currentStageIndex(row.attempt);
  return idx < 0 ? "not-started" : STAGES[idx].key;
}

export function ProcessingPanel({ query = "" }: { query?: string } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: attempts = [], isLoading } = usePlacementAttempts();
  const { data: zoho } = useZohoData();
  const { data: hospitals = [] } = useHospitals();
  /** Doctor id to pre-select in the assign dialog; null = dialog closed. */
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const repFor = useMemo(() => buildRepLookup(hospitals), [hospitals]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = attempts.map(a => ({
      id:           a.id,
      doctorId:     a.doctor_id,
      doctorName:   a.doctor_name,
      specialty:    a.doctor_specialty,
      hospitalName: a.hospital_name,
      rep:          repFor(a.hospital_name),
      attempt:      a,
    }));

    // Match on name as well as id: CSV imports land as `csv:<slug>` and older
    // rows as `lead:<id>`, so an id-only check would re-list doctors who are
    // already tracked under a different key.
    const tracked = new Set(attempts.map(a => a.doctor_id));
    const trackedNames = new Set(attempts.map(a => normName(a.doctor_name)));

    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
      if (!name) continue;
      if (tracked.has(`dob:${d.id}`) || trackedNames.has(normName(name))) continue;
      out.push({
        id:           `dob:${d.id}`,
        doctorId:     `dob:${d.id}`,
        doctorName:   name,
        specialty:    d.Specialty_New ?? d.Speciality ?? null,
        hospitalName: null,
        rep:          null,
        attempt:      null,
      });
    }
    return out;
  }, [attempts, zoho?.rawDoctorsOnBoard, repFor]);

  // `?stage=` holds a comma-separated set. No selection means no filter, so
  // the unchecked state and "show everything" are the same thing.
  const validKeys = useMemo(() => new Set([...STAGES.map(s => s.key), "not-started", "no-hospital"]), []);
  const activeStages = useMemo(
    () => (searchParams.get("stage") ?? "").split(",").filter(k => validKeys.has(k)),
    [searchParams, validKeys]);

  const toggleStage = (key: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const cur = (prev.get("stage") ?? "").split(",").filter(k => validKeys.has(k));
      const after = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
      if (after.length) next.set("stage", after.join(",")); else next.delete("stage");
      return next;
    }, { replace: true });
  };

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => {
    if (!q) return rows;
    return rows.filter(r =>
      r.doctorName.toLowerCase().includes(q) ||
      (r.hospitalName ?? "").toLowerCase().includes(q) ||
      (r.specialty ?? "").toLowerCase().includes(q) ||
      (r.rep?.name ?? "").toLowerCase().includes(q));
  }, [rows, q]);

  // One bucket per stage, keyed by the FURTHEST milestone reached, so a row
  // appears exactly once and the tab counts sum to the total.
  const byStage = useMemo(() => {
    const m: Record<string, Row[]> = { "not-started": [], "no-hospital": [] };
    for (const s of STAGES) m[s.key] = [];
    for (const r of searched) m[bucketOf(r)].push(r);
    return m;
  }, [searched]);

  const stageKey = activeStages.join(",");
  const visible = useMemo(() => {
    if (!activeStages.length) return searched;
    const wanted = new Set(activeStages);
    // Filter `searched` rather than concatenating buckets so rows keep their
    // original order no matter which order the boxes were checked in.
    return searched.filter(r => wanted.has(bucketOf(r)));
  }, [activeStages, searched]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, stageKey]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = useMemo(
    () => visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visible, safePage]);

  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (safePage > 3) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) out.push(i);
    if (safePage < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

  const toggleItems: MultiToggleItem[] = useMemo(() => [
    ...STAGES.map(s => ({ value: s.key, label: s.label, count: byStage[s.key]?.length ?? 0 })),
    { value: "not-started", label: "Not started", count: byStage["not-started"]?.length ?? 0 },
    { value: "no-hospital", label: "No hospital", count: byStage["no-hospital"]?.length ?? 0 },
  ], [byStage]);

  const onlyUnassigned = visible.length > 0 && visible.every(r => !r.attempt);
  const noun = onlyUnassigned
    ? (visible.length === 1 ? "doctor" : "doctors")
    : `doctor-and-hospital ${visible.length === 1 ? "pair" : "pairs"}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-teal-600" />
            Processing
            <DocLink slug="hospital-introduction/automations" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Where each doctor stands at each hospital. Mark a stage when it actually happens and the date is recorded.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1.5 inline-flex items-center gap-1.5">
            <MailX className="h-3.5 w-3.5" />
            Marking only — nothing on this page sends an email. Email flows live on Sends → Email Chain.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import sheet
        </Button>
      </div>

      <div data-tour="automations-flows" className="flex justify-center">
        <AnimatedMultiToggle items={toggleItems} values={activeStages} onToggle={toggleStage} />
      </div>

      {/* No exit/enter animation here: checkboxes change the set often, and
          re-fading a 30-row table on every click reads as lag. */}
      <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px]">
              {activeStages.length === 0
                ? "All doctors in processing"
                : toggleItems.filter(t => activeStages.includes(t.value)).map(t => t.label).join(" · ")}
            </CardTitle>
            <CardDescription className="text-[11px]">
              {visible.length > PAGE_SIZE
                ? `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, visible.length)} of ${visible.length} ${noun}.`
                : `${visible.length} ${noun}.`}
              {" "}{onlyUnassigned
                ? "Use the + beside a name to put them against a hospital — repeat it to add more."
                : "Click a stage cell to set its date; click a marked one to change or clear it."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-12 text-center text-[12px] text-muted-foreground">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-muted-foreground">
                No doctors match this filter.
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Doctor</TableHead>
                    <TableHead className="text-[11px]">Hospital</TableHead>
                    <TableHead className="text-[11px]">Rep</TableHead>
                    {STAGES.map(s => (
                      <TableHead key={s.key} className="text-[11px] text-center">{s.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium">{row.doctorName}</span>
                          <button
                            type="button"
                            onClick={() => setAssignFor(row.doctorId)}
                            title={`Assign ${row.doctorName} to a hospital`}
                            aria-label={`Assign ${row.doctorName} to a hospital`}
                            className="rounded-full border border-dashed border-border p-0.5 text-muted-foreground hover:border-teal-400 hover:text-teal-700 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        {row.specialty && (
                          <div className="text-[10px] text-muted-foreground">{row.specialty}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-[12px]">
                        {row.hospitalName ?? (
                          <button
                            type="button"
                            onClick={() => setAssignFor(row.doctorId)}
                            className="text-[11px] text-muted-foreground italic hover:text-teal-700 transition-colors"
                          >
                            No hospital yet — assign one
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {row.rep ? (
                          <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200">
                            {row.rep.name}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {STAGES.map(stage => (
                        <TableCell key={stage.key} className="py-2 text-center">
                          {row.attempt
                            ? <StageCell row={row.attempt} stage={stage} />
                            : <span className="text-[10px] text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={e => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
                        aria-disabled={safePage === 1}
                        className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {pageNumbers.map((n, i) =>
                      n === "..." ? (
                        <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
                      ) : (
                        <PaginationItem key={n}>
                          <PaginationLink
                            href="#"
                            isActive={safePage === n}
                            onClick={e => { e.preventDefault(); setPage(n as number); }}
                          >{n}</PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={e => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                        aria-disabled={safePage === totalPages}
                        className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
              </>
            )}
          </CardContent>
      </Card>

      <PlacementImportDialog
        open={importOpen}
        existing={attempts}
        onClose={() => setImportOpen(false)}
      />

      <NewPlacementDialog
        open={assignFor !== null}
        existingAttempts={attempts}
        preselectDoctorId={assignFor}
        onClose={() => setAssignFor(null)}
        onCreated={() => setAssignFor(null)}
      />
    </div>
  );
}

/**
 * One markable stage. Unmarked renders a dashed "Mark" target; marked renders
 * the recorded date. Either way clicking opens a date field so the team can
 * backdate an event that happened days ago, which is the common case.
 */
function StageCell({ row, stage }: { row: PlacementAttempt; stage: Stage }) {
  const mark = useMarkPlacementMilestone();
  const [open, setOpen] = useState(false);
  const current = row[stage.column];
  const [draft, setDraft] = useState(() => toDateInput(current));

  // Reopening after someone else's edit (or a refetch) should show the
  // stored date, not a stale draft from the last time this cell was opened.
  useEffect(() => { if (open) setDraft(toDateInput(current)); }, [open, current]);

  const save = async (date: string | null) => {
    try {
      await mark.mutateAsync({ id: row.id, column: stage.column, date });
      setOpen(false);
      toast.success(date
        ? `${row.doctor_name} — ${stage.label} marked ${fmtDate(date)}.`
        : `${row.doctor_name} — ${stage.label} cleared.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that date");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {current ? (
          <button type="button" className="mx-auto block">
            <Badge variant="outline" className={`${stage.tone} text-[10px] font-medium`}>
              <Check className="h-3 w-3 mr-1" />
              {fmtDate(current)}
            </Badge>
          </button>
        ) : (
          <button
            type="button"
            className="mx-auto block rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10px] text-muted-foreground hover:border-teal-400 hover:text-teal-700 transition-colors"
          >
            Mark
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3 space-y-2" align="center">
        <div className="text-[11px] font-medium">{stage.label} date</div>
        <Input type="date" value={draft} onChange={e => setDraft(e.target.value)} className="h-8 text-[11px]" />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-[11px] flex-1"
            disabled={!draft || mark.isPending}
            // Midday local time so the stored instant can't roll into the
            // previous day once it's rendered back in another timezone.
            onClick={() => save(new Date(`${draft}T12:00:00`).toISOString())}
          >
            {current ? "Update" : "Mark"}
          </Button>
          {current && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground"
              disabled={mark.isPending}
              onClick={() => save(null)}
            >
              <XIcon className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

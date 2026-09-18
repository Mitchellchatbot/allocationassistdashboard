/**
 * Per-doctor breakdown — parallels the Hospital relationships table but
 * aggregates by doctor across their pipeline (Ammar 2026-06-03: "we can just
 * add another table over here for the individual doctors themselves").
 *
 * Every number here comes from placement_attempts — the imported sheet plus
 * the Processing page's stage marking. It used to be assembled from
 * automation_flow_runs (a "Profiles sent" column, counting emails) and
 * doctor_lifecycle, which meant this table could disagree with the scoreboard
 * directly above it. The send-count column is gone rather than reproduced:
 * there's no placement record of it, and it measured outbound effort rather
 * than progress.
 *
 * Counting rule: one row per doctor, and each stage counts the number of
 * HOSPITALS that doctor reached it at. A doctor shortlisted at four accounts
 * shows 4 — four separate conversations, which is exactly what this table
 * exists to show. (The KPI tiles deliberately count the same doctor once.)
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { User2, ChevronDown, ChevronRight } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useDoctorProfiles } from "@/hooks/use-doctor-profiles";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useSort, SortHead } from "@/components/reports/sortable";
import { defaultRange, inRange, stageAt, STAGES, type DateRange } from "@/lib/placement-reporting";

interface DoctorReportRow {
  doctor_id:    string;
  doctor_name:  string;
  specialty:    string | null;
  shortlists:   number;
  interviews:   number;
  offers:       number;
  signed:       boolean;
  joined:       boolean;
  paid:         boolean;
  hospitals:    string[];          // distinct hospitals this doctor was put to
  lastActivity: string | null;     // ISO of the most recent milestone in range
}

type DocSortKey =
  | "doctor_name" | "specialty" | "shortlists" | "interviews"
  | "offers"      | "signed"    | "joined"     | "hospitals" | "last";

/** Resolve a doctor's specialty by trying the most reliable sources in order:
 *  the placement row → CV-extracted doctor profile → Zoho lead/DoB record. */
function resolveSpecialty(
  doctorId: string,
  attemptSpec: string | null | undefined,
  profileMap: Map<string, { title?: string | null; area_of_interest?: string | null }>,
  zohoSpecMap: Map<string, string>,
): string | null {
  if (attemptSpec && attemptSpec.trim()) return attemptSpec.trim();
  const profile = profileMap.get(doctorId);
  if (profile?.title?.trim()) return profile.title.trim();
  if (profile?.area_of_interest?.trim()) return profile.area_of_interest.trim();
  const zohoSpec = zohoSpecMap.get(doctorId);
  if (zohoSpec) return zohoSpec;
  return null;
}

const [SHORTLISTED, INTERVIEWED, OFFERED, SIGNED, RELOCATED, PAID] = STAGES;

/**
 * Fold placement rows into one row per doctor.
 *
 * `range` gates the COUNTS, not the doctor: a doctor whose only in-window
 * event is an interview still shows their signed/joined badges, because those
 * are statements about the person rather than about the window. Rows with no
 * in-window milestone at all are dropped by the caller.
 */
function aggregateDoctorRows(
  attempts: PlacementAttempt[],
  range: DateRange,
  profileMap: Map<string, { title?: string | null; area_of_interest?: string | null }>,
  zohoSpecMap: Map<string, string>,
): DoctorReportRow[] {
  const byDoctor = new Map<string, DoctorReportRow>();

  for (const a of attempts) {
    if (!a.doctor_id) continue;
    let row = byDoctor.get(a.doctor_id);
    if (!row) {
      row = {
        doctor_id:    a.doctor_id,
        doctor_name:  a.doctor_name ?? a.doctor_id,
        specialty:    resolveSpecialty(a.doctor_id, a.doctor_specialty, profileMap, zohoSpecMap),
        shortlists:   0, interviews: 0, offers: 0,
        signed:       false, joined: false, paid: false,
        hospitals:    [],
        lastActivity: null,
      };
      byDoctor.set(a.doctor_id, row);
    }
    // Specialty can be blank on one attempt and filled on another — take the
    // first row that actually knows.
    if (!row.specialty) row.specialty = resolveSpecialty(a.doctor_id, a.doctor_specialty, profileMap, zohoSpecMap);

    const hospital = a.hospital_name?.trim();
    if (hospital && !row.hospitals.includes(hospital)) row.hospitals.push(hospital);

    if (inRange(stageAt(a, SHORTLISTED), range)) row.shortlists++;
    if (inRange(stageAt(a, INTERVIEWED), range)) row.interviews++;
    if (inRange(stageAt(a, OFFERED),     range)) row.offers++;

    // Status badges are unconditional: "signed" doesn't stop being true
    // because you narrowed the date filter.
    if (stageAt(a, SIGNED)    != null) row.signed = true;
    if (stageAt(a, RELOCATED) != null) row.joined = true;
    if (stageAt(a, PAID)      != null) row.paid   = true;

    for (const s of STAGES) {
      const t = stageAt(a, s);
      if (!inRange(t, range)) continue;
      if (!row.lastActivity || t! > new Date(row.lastActivity).getTime()) {
        row.lastActivity = new Date(t!).toISOString();
      }
    }
  }

  return Array.from(byDoctor.values()).sort((a, b) => {
    // Default order: paid doctors at the bottom (nothing left to chase), then
    // most recent activity, then name.
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.lastActivity && b.lastActivity) return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    if (a.lastActivity) return -1;
    if (b.lastActivity) return 1;
    return a.doctor_name.localeCompare(b.doctor_name);
  });
}

function relativeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export interface DoctorTableProps {
  /** Count only milestones inside this window (the Reports page's selected
   *  week / month / year). Takes precedence over `rangeDays`. */
  range?: { from: Date; to: Date } | null;
  /** Show only doctors with at least one milestone within the last N days.
   *  When null, no time filter (all doctors). */
  rangeDays?: number | null;
  hospital?:  string | null;
  specialty?: string | null;
  /** Collapsible control (summary-first restructure). When provided, the
   *  header doubles as a Collapsible trigger so the table can stay closed
   *  on first paint. Omit to render always-expanded. */
  open?:         boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DoctorTable({ range: rangeProp, rangeDays, hospital, specialty, open, onOpenChange }: DoctorTableProps = {}) {
  const collapsible = onOpenChange !== undefined;
  const isOpen = collapsible ? !!open : true;

  // One source, shared with the rest of Reports through React Query's cache —
  // so this table can't disagree with the tiles above it.
  const { data: attempts = [], isLoading: al } = usePlacementAttempts();

  // Pull specialty from the most reliable sources: CV-extracted
  // doctor_profiles.title first (most accurate), Zoho leads + DoB
  // second. placement_attempts.doctor_specialty is often blank on the
  // imported rows.
  const { data: profiles = [] } = useDoctorProfiles();
  const { data: zoho }          = useZohoData();

  const profileMap = useMemo(() => {
    const m = new Map<string, { title?: string | null; area_of_interest?: string | null }>();
    for (const p of profiles) m.set(p.doctor_id, { title: p.title, area_of_interest: p.area_of_interest });
    return m;
  }, [profiles]);

  const zohoSpecMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of zoho?.rawLeads ?? []) {
      const spec = (l.Specialty_New ?? l.Specialty ?? "").toString().trim();
      if (spec) m.set(`lead:${l.id}`, spec);
    }
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const spec = (d.Specialty_New ?? d.Speciality ?? "").toString().trim();
      if (spec) m.set(`dob:${d.id}`, spec);
    }
    return m;
  }, [zoho?.rawLeads, zoho?.rawDoctorsOnBoard]);

  // A very large rangeDays ("All") still produces a real window — one that
  // starts long before the earliest imported row — so the counting path is
  // identical either way.
  const range = useMemo(() => rangeProp ?? defaultRange(rangeDays ?? 36_500), [rangeProp, rangeDays]);

  const allRows = useMemo(
    () => aggregateDoctorRows(attempts, range, profileMap, zohoSpecMap),
    [attempts, range, profileMap, zohoSpecMap],
  );

  // The Reports top-bar hospital/specialty pickers. The date range is already
  // applied inside the aggregate, so here it only decides whether a doctor
  // with zero in-window milestones is shown at all.
  const rows = useMemo(() => allRows.filter(r => {
    if (!r.lastActivity) return false;
    if (hospital  && !r.hospitals.some(h => h.toLowerCase().includes(hospital.toLowerCase()))) return false;
    if (specialty && !(r.specialty ?? "").toLowerCase().includes(specialty.toLowerCase()))     return false;
    return true;
  }), [allRows, hospital, specialty]);
  const loading = al;

  // Sorting sits on top of the filtered set, so it reorders rows without
  // changing which doctors qualify. Default is most-recently-active first —
  // the aggregate's paid-at-the-bottom rule survives as the tiebreak, since
  // Array.prototype.sort is stable.
  const sort = useSort<DocSortKey>("last");
  const sorted = useMemo(() => sort.sort(rows, (r, key) => {
    switch (key) {
      case "doctor_name": return r.doctor_name;
      case "specialty":   return r.specialty;
      case "signed":      return r.signed ? 1 : 0;
      // One column, three states: paid outranks joined outranks neither.
      case "joined":      return r.paid ? 2 : r.joined ? 1 : 0;
      case "hospitals":   return r.hospitals.length;
      case "last":        return r.lastActivity ? new Date(r.lastActivity).getTime() : null;
      default:            return r[key];
    }
  }), [rows, sort]);

  // Show 10 doctors by default, +10 per click (mirrors PlacementsCard).
  // Reset back to the first page whenever the filters change the set.
  const PAGE_FIRST = 10;
  const PAGE_STEP  = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_FIRST);
  useEffect(() => { setVisibleCount(PAGE_FIRST); }, [range, hospital, specialty]);
  const visibleRows = sorted.slice(0, visibleCount);
  const remaining   = rows.length - visibleRows.length;

  const titleBlock = (
    <div className="min-w-0">
      <CardTitle className="text-base flex items-center gap-2">
        {collapsible && (
          isOpen
            ? <ChevronDown  className="h-4 w-4 text-slate-400 shrink-0" />
            : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <User2 className="h-4 w-4 text-indigo-600" />
        Per-doctor breakdown
        {!loading && (
          <Badge variant="outline" className="text-[10px] bg-slate-50 tabular-nums">{rows.length} doctors</Badge>
        )}
      </CardTitle>
      <CardDescription className="text-[11px]">
        Each row is one doctor across their pipeline, from the imported sheet and the Processing page. Stage counts are per hospital, so a doctor shortlisted at three accounts shows 3.
      </CardDescription>
    </div>
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={onOpenChange ?? (() => {})}>
      <CardHeader className="pb-2">
        {collapsible ? (
          <CollapsibleTrigger asChild>
            <button type="button" className="text-left w-full cursor-pointer">
              {titleBlock}
            </button>
          </CollapsibleTrigger>
        ) : titleBlock}
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-4 py-6 text-[11px] text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
            No placement activity in this range. Mark a stage on the Processing page, or import an updated sheet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead sort={sort} sortKey="doctor_name" numeric={false}>Doctor</SortHead>
                  <SortHead sort={sort} sortKey="specialty"   numeric={false}>Specialty</SortHead>
                  <SortHead sort={sort} sortKey="shortlists">Shortlists</SortHead>
                  <SortHead sort={sort} sortKey="interviews">Interviews</SortHead>
                  <SortHead sort={sort} sortKey="offers">Offers</SortHead>
                  <SortHead sort={sort} sortKey="signed">Signed</SortHead>
                  <SortHead sort={sort} sortKey="joined">Joined</SortHead>
                  <SortHead sort={sort} sortKey="hospitals">Hospitals</SortHead>
                  <SortHead sort={sort} sortKey="last">Last activity</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(r => (
                  <TableRow key={r.doctor_id}>
                    <TableCell className="text-[12px] font-medium">{r.doctor_name}</TableCell>
                    <TableCell className="text-[12px]">{r.specialty ?? "—"}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.shortlists}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.interviews}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.offers}</TableCell>
                    <TableCell className="text-right">
                      {r.signed
                        ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Signed</Badge>
                        : <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.paid
                        ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Paid</Badge>
                        : r.joined
                        ? <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[9px]">Joined</Badge>
                        : <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-[11px] text-right">
                      {r.hospitals.length === 0
                        ? <span className="text-muted-foreground">—</span>
                        : r.hospitals.length === 1
                        ? r.hospitals[0]
                        : <span title={r.hospitals.join(", ")}>{r.hospitals[0]} <span className="text-muted-foreground">+{r.hospitals.length - 1}</span></span>
                      }
                    </TableCell>
                    <TableCell className="text-[11px] text-right text-muted-foreground tabular-nums">{relativeShort(r.lastActivity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Show-more footer. Bumps +10 per click, or 'Show all' to
                expand the rest in one go. Hidden once we're showing
                everything, replaced with a small 'Collapse' note. */}
            {rows.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50/50 text-[11px]">
                <span className="text-muted-foreground tabular-nums">
                  Showing {visibleRows.length} of {rows.length}
                </span>
                {remaining > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => setVisibleCount(c => c + PAGE_STEP)}
                    >
                      Show {Math.min(remaining, PAGE_STEP)} more
                    </Button>
                    {remaining > PAGE_STEP && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-muted-foreground"
                        onClick={() => setVisibleCount(rows.length)}
                      >
                        Show all {rows.length}
                      </Button>
                    )}
                  </div>
                ) : (
                  rows.length > PAGE_FIRST && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] text-muted-foreground"
                      onClick={() => setVisibleCount(PAGE_FIRST)}
                    >
                      Collapse to {PAGE_FIRST}
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
      </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Per-doctor breakdown — parallels the Hospital relationships table
 * but aggregates by doctor across their pipeline (Ammar 2026-06-03:
 * "we can just add another table over here for the individual
 * doctors themselves").
 *
 * Each row is one doctor. Counts come from flow runs (profile_sent,
 * shortlist, interview, contract_signing) + the lifecycle row for
 * signed / joined.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { User2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import { useDoctorProfiles } from "@/hooks/use-doctor-profiles";
import { useZohoData } from "@/hooks/use-zoho-data";

interface DoctorReportRow {
  doctor_id:    string;
  doctor_name:  string;
  specialty:    string | null;
  profilesSent: number;
  shortlists:   number;
  interviews:   number;
  signed:       boolean;
  joined:       boolean;
  paid:         boolean;
  hospitals:    string[];          // distinct hospitals the doctor was sent to
  lastActivity: string | null;     // ISO of most recent run's last_event_at
}

/** Resolve a doctor's specialty by trying the most reliable sources
 *  in order: explicit run metadata → CV-extracted doctor profile →
 *  Zoho lead/DoB record. Returns the first non-empty hit. */
function resolveSpecialty(
  doctorId: string,
  runMetadataSpec: string | null | undefined,
  profileMap: Map<string, { title?: string | null; area_of_interest?: string | null }>,
  zohoSpecMap: Map<string, string>,
): string | null {
  if (runMetadataSpec && runMetadataSpec.trim()) return runMetadataSpec.trim();
  const profile = profileMap.get(doctorId);
  if (profile?.title?.trim()) return profile.title.trim();
  if (profile?.area_of_interest?.trim()) return profile.area_of_interest.trim();
  const zohoSpec = zohoSpecMap.get(doctorId);
  if (zohoSpec) return zohoSpec;
  return null;
}

function aggregateDoctorRows(
  runs: FlowRun[],
  lifecycles: DoctorLifecycle[],
  profileMap: Map<string, { title?: string | null; area_of_interest?: string | null }>,
  zohoSpecMap: Map<string, string>,
): DoctorReportRow[] {
  const byDoctor = new Map<string, DoctorReportRow>();
  const lifeMap = new Map<string, DoctorLifecycle>();
  for (const l of lifecycles) lifeMap.set(l.doctor_id, l);

  for (const r of runs) {
    if (!r.doctor_id) continue;
    let row = byDoctor.get(r.doctor_id);
    if (!row) {
      const runSpec = (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined;
      const life = lifeMap.get(r.doctor_id);
      row = {
        doctor_id:    r.doctor_id,
        doctor_name:  r.doctor_name ?? life?.doctor_name ?? r.doctor_id,
        specialty:    resolveSpecialty(r.doctor_id, runSpec, profileMap, zohoSpecMap),
        profilesSent: 0,
        shortlists:   0,
        interviews:   0,
        signed:       !!life?.signed_at,
        joined:       !!life?.joined_at,
        paid:         !!life?.paid_at,
        hospitals:    [],
        lastActivity: null,
      };
      byDoctor.set(r.doctor_id, row);
    }
    if (r.flow_key === "profile_sent") row.profilesSent++;
    if (r.flow_key === "shortlist")    row.shortlists++;
    if (r.flow_key === "interview")    row.interviews++;
    if (r.hospital && !row.hospitals.includes(r.hospital)) row.hospitals.push(r.hospital);

    const lastEvt = r.last_event_at ?? r.started_at;
    if (lastEvt && (!row.lastActivity || new Date(lastEvt) > new Date(row.lastActivity))) {
      row.lastActivity = lastEvt;
    }
  }

  // Include lifecycles for doctors with no runs but with a milestone
  // logged (e.g. team backfilled placements before any flow ran).
  for (const l of lifecycles) {
    if (byDoctor.has(l.doctor_id)) continue;
    if (!l.shortlisted_at && !l.interviewed_at && !l.signed_at && !l.joined_at) continue;
    byDoctor.set(l.doctor_id, {
      doctor_id:    l.doctor_id,
      doctor_name:  l.doctor_name ?? l.doctor_id,
      specialty:    resolveSpecialty(l.doctor_id, null, profileMap, zohoSpecMap),
      profilesSent: 0,
      shortlists:   l.shortlisted_at ? 1 : 0,
      interviews:   l.interviewed_at ? 1 : 0,
      signed:       !!l.signed_at,
      joined:       !!l.joined_at,
      paid:         !!l.paid_at,
      hospitals:    l.placement_hospital_name ? [l.placement_hospital_name] : [],
      lastActivity: l.updated_at,
    });
  }

  return Array.from(byDoctor.values()).sort((a, b) => {
    // Sort: paid doctors at the bottom, then those with the most recent
    // activity, then name.
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
  /** Show only doctors with at least one run-event or milestone date
   *  within the last N days. When null, no time filter (all doctors). */
  rangeDays?: number | null;
  hospital?:  string | null;
  specialty?: string | null;
  /** Collapsible control (summary-first restructure). When provided, the
   *  header doubles as a Collapsible trigger so the table can stay closed
   *  on first paint. Omit to render always-expanded. */
  open?:         boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DoctorTable({ rangeDays, hospital, specialty, open, onOpenChange }: DoctorTableProps = {}) {
  const collapsible = onOpenChange !== undefined;
  const isOpen = collapsible ? !!open : true;
  // Paginate both queries — Supabase API gateway caps at 1000 server-
  // side regardless of .limit().
  const { data: runs = [], isLoading: rl } = useQuery<FlowRun[]>({
    queryKey: ["doctor-table-runs"],
    queryFn: async () => {
      const PAGE = 1000;
      const all: FlowRun[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("automation_flow_runs").select("*")
          .order("started_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as FlowRun[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
  const { data: lifecycles = [], isLoading: ll } = useQuery<DoctorLifecycle[]>({
    queryKey: ["doctor-table-lifecycles"],
    queryFn: async () => {
      const PAGE = 1000;
      const all: DoctorLifecycle[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase.from("doctor_lifecycle").select("*")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as DoctorLifecycle[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
    staleTime: 60_000,
  });

  // Pull specialty from the most reliable sources: CV-extracted
  // doctor_profiles.title first (most accurate), Zoho leads + DoB
  // second. Without this, the column was '—' for every row because
  // run.metadata.doctor_speciality is rarely populated.
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

  const allRows = useMemo(
    () => aggregateDoctorRows(runs, lifecycles, profileMap, zohoSpecMap),
    [runs, lifecycles, profileMap, zohoSpecMap],
  );

  // Apply the Reports top-bar filters here so the table follows the
  // 7/30/90-day selector + hospital/specialty pickers consistently
  // with the rest of the page.
  const rows = useMemo(() => {
    if (!rangeDays && !hospital && !specialty) return allRows;
    const cutoffMs = rangeDays ? Date.now() - rangeDays * 86_400_000 : 0;
    return allRows.filter(r => {
      if (rangeDays) {
        if (!r.lastActivity) return false;
        if (new Date(r.lastActivity).getTime() < cutoffMs) return false;
      }
      if (hospital  && !r.hospitals.some(h => h.toLowerCase().includes(hospital.toLowerCase()))) return false;
      if (specialty && !(r.specialty ?? "").toLowerCase().includes(specialty.toLowerCase()))   return false;
      return true;
    });
  }, [allRows, rangeDays, hospital, specialty]);
  const loading = rl || ll;

  // Show 10 doctors by default, +10 per click (mirrors PlacementsCard).
  // Reset back to the first page whenever the filters change the set.
  const PAGE_FIRST = 10;
  const PAGE_STEP  = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_FIRST);
  useEffect(() => { setVisibleCount(PAGE_FIRST); }, [rangeDays, hospital, specialty]);
  const visibleRows = rows.slice(0, visibleCount);
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
        Each row is one doctor across their pipeline. Mirrors the hospital table; useful for tracking individual journeys.
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
            No doctor activity yet. Send a profile from Automations or log a milestone in Doctor Profiles to populate this table.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Doctor</TableHead>
                  <TableHead className="text-[11px]">Specialty</TableHead>
                  <TableHead className="text-[11px] text-right">Profiles sent</TableHead>
                  <TableHead className="text-[11px] text-right">Shortlists</TableHead>
                  <TableHead className="text-[11px] text-right">Interviews</TableHead>
                  <TableHead className="text-[11px] text-right">Signed</TableHead>
                  <TableHead className="text-[11px] text-right">Joined</TableHead>
                  <TableHead className="text-[11px] text-right">Hospitals</TableHead>
                  <TableHead className="text-[11px] text-right">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(r => (
                  <TableRow key={r.doctor_id}>
                    <TableCell className="text-[12px] font-medium">{r.doctor_name}</TableCell>
                    <TableCell className="text-[12px]">{r.specialty ?? "—"}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.profilesSent}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.shortlists}</TableCell>
                    <TableCell className="text-[12px] text-right tabular-nums">{r.interviews}</TableCell>
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

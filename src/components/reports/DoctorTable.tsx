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
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { User2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";

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

function aggregateDoctorRows(runs: FlowRun[], lifecycles: DoctorLifecycle[]): DoctorReportRow[] {
  const byDoctor = new Map<string, DoctorReportRow>();
  const lifeMap = new Map<string, DoctorLifecycle>();
  for (const l of lifecycles) lifeMap.set(l.doctor_id, l);

  for (const r of runs) {
    if (!r.doctor_id) continue;
    let row = byDoctor.get(r.doctor_id);
    if (!row) {
      const spec = (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined;
      const life = lifeMap.get(r.doctor_id);
      row = {
        doctor_id:    r.doctor_id,
        doctor_name:  r.doctor_name ?? life?.doctor_name ?? r.doctor_id,
        specialty:    spec ?? null,
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
      specialty:    null,
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

export function DoctorTable() {
  const { data: runs = [], isLoading: rl } = useQuery<FlowRun[]>({
    queryKey: ["doctor-table-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_flow_runs").select("*")
        .order("started_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 60_000,
  });
  const { data: lifecycles = [], isLoading: ll } = useQuery<DoctorLifecycle[]>({
    queryKey: ["doctor-table-lifecycles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctor_lifecycle").select("*").limit(5000);
      if (error) throw error;
      return (data ?? []) as DoctorLifecycle[];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => aggregateDoctorRows(runs, lifecycles), [runs, lifecycles]);
  const loading = rl || ll;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <User2 className="h-4 w-4 text-indigo-600" />
          Per-doctor breakdown
        </CardTitle>
        <CardDescription className="text-[11px]">
          Each row is one doctor across their pipeline. Mirrors the hospital table; useful for tracking individual journeys.
        </CardDescription>
      </CardHeader>
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
                {rows.map(r => (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

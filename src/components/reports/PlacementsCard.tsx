/**
 * Placements — replaces Ammar's external Hammad sheet.
 *
 * Mirror of the spreadsheet the team has been tracking by hand:
 *   doctor → hospital → milestone dates (shortlisted, interviewed,
 *   offered, signed, start_date, joined, paid).
 *
 * Driven entirely off doctor_lifecycle rows (extended in
 * 20260603000005_placements.sql with shortlisted_at / interviewed_at /
 * offered_at / start_date / placement_hospital_id). Click any row to
 * edit milestones via the existing useMarkLifecycle mutation.
 *
 * 45-day clock:
 *   - starts on joined_at
 *   - "due soon" once joined_at < now − 30d AND paid_at IS NULL
 *   - "overdue" once joined_at < now − 45d AND paid_at IS NULL
 * Surfaces as the right-most status pill so the team can spot rows
 * that need a payment chase.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, ListChecks, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useMarkLifecycle, type DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import { useHospitals } from "@/hooks/use-hospitals";
import { toast } from "sonner";

interface PlacementRow extends DoctorLifecycle {
  // No extra fields — the lifecycle row IS the placement row. Just
  // alias the type so consumers reading "PlacementRow" know what's up.
}

/** Fetch every lifecycle row that has at least one placement milestone
 *  recorded. Filters in JS (~thousand rows max) so we avoid a complex
 *  OR-NOT-NULL Postgres query. */
function usePlacements() {
  return useQuery<PlacementRow[]>({
    queryKey: ["placements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as PlacementRow[];
      return rows.filter(r =>
        r.shortlisted_at || r.interviewed_at || r.offered_at ||
        r.signed_at || r.start_date || r.joined_at || r.paid_at
      );
    },
    staleTime: 30_000,
  });
}

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
};

const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
};

function PaymentStatus({ row }: { row: PlacementRow }) {
  if (row.paid_at) {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Paid</Badge>;
  }
  const days = daysSince(row.joined_at);
  if (days == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const remaining = 45 - days;
  if (remaining < 0) {
    return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[9px]">Overdue · {Math.abs(remaining)}d</Badge>;
  }
  if (remaining <= 15) {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">Due in {remaining}d</Badge>;
  }
  return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[9px]">{remaining}d left</Badge>;
}

export function PlacementsCard() {
  const { data: rows = [], isLoading } = usePlacements();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /reports?placement=<doctor_id> opens the milestone
  // editor for that doctor (used from the Run Detail Sheet's
  // "Track placement" button). If the doctor has no lifecycle row yet
  // (no milestones logged), the editor still opens via a synthetic
  // empty placement row so the team can log the FIRST milestone.
  useEffect(() => {
    const queryId = searchParams.get("placement");
    if (queryId && queryId !== editingId) {
      setEditingId(queryId);
      // Strip the query so reload-after-close doesn't reopen.
      const next = new URLSearchParams(searchParams);
      next.delete("placement");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, editingId, setSearchParams]);

  const editing = useMemo<PlacementRow | null>(() => {
    if (!editingId) return null;
    const existing = rows.find(r => r.doctor_id === editingId);
    if (existing) return existing;
    // Synthetic empty row for first-time milestone logging from a
    // deep-link.
    return {
      doctor_id:               editingId,
      doctor_name:             null,
      shortlisted_at:          null,
      interviewed_at:          null,
      offered_at:              null,
      signed_at:               null,
      start_date:              null,
      joined_at:               null,
      approved_at:             null,
      paid_at:                 null,
      placement_hospital_id:   null,
      placement_hospital_name: null,
      eligible_for_sending:    true,
      unavailable:             false,
      unavailable_reason:      null,
      available_check_in_at:   null,
      last_availability_ping_at: null,
      notes:                   null,
      updated_by:              null,
      created_at:              new Date().toISOString(),
      updated_at:              new Date().toISOString(),
    };
  }, [rows, editingId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-emerald-600" />
          Placements
        </CardTitle>
        <CardDescription className="text-[11px]">
          Every doctor with at least one milestone logged. Replaces the Hammad sheet — click any row to update dates. The right-most pill counts down the 45-day window from joining to AA invoice payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-[11px] text-muted-foreground">Loading placements…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            <ListChecks className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
            No placements logged yet. Click any doctor in <strong>Doctor Profiles</strong> to start tracking their milestones.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase">
                  <TableHead className="text-[10px]">Doctor</TableHead>
                  <TableHead className="text-[10px]">Hospital</TableHead>
                  <TableHead className="text-[10px]">Shortlisted</TableHead>
                  <TableHead className="text-[10px]">Interviewed</TableHead>
                  <TableHead className="text-[10px]">Offered</TableHead>
                  <TableHead className="text-[10px]">Signed</TableHead>
                  <TableHead className="text-[10px]">Start date</TableHead>
                  <TableHead className="text-[10px]">Joined</TableHead>
                  <TableHead className="text-[10px]">45-day clock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow
                    key={r.doctor_id}
                    onClick={() => setEditingId(r.doctor_id)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <TableCell className="text-[11px] font-medium">{r.doctor_name ?? r.doctor_id}</TableCell>
                    <TableCell className="text-[11px]">{r.placement_hospital_name ?? "—"}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.shortlisted_at)}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.interviewed_at)}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.offered_at)}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.signed_at)}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.start_date)}</TableCell>
                    <TableCell className="text-[11px]">{fmtDate(r.joined_at)}</TableCell>
                    <TableCell><PaymentStatus row={r} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <PlacementEditDialog
          row={editing}
          open={!!editing}
          onClose={() => setEditingId(null)}
        />
      )}
    </Card>
  );
}

/** Inline date pickers for every milestone + a hospital text input.
 *  Each date persists via useMarkLifecycle so the existing side-effect
 *  matrix runs (e.g. mark_joined fires the Second Payment trigger). */
function PlacementEditDialog({ row, open, onClose }: { row: PlacementRow; open: boolean; onClose: () => void }) {
  const mark = useMarkLifecycle();
  const { data: hospitals = [] } = useHospitals();

  // Local state — only commits on Save so the team can sequentially
  // populate fields without firing a write per keystroke.
  const [shortlisted, setShortlisted] = useState<string>(row.shortlisted_at?.slice(0, 10) ?? "");
  const [interviewed, setInterviewed] = useState<string>(row.interviewed_at?.slice(0, 10) ?? "");
  const [offered,     setOffered]     = useState<string>(row.offered_at?.slice(0, 10) ?? "");
  const [signed,      setSigned]      = useState<string>(row.signed_at?.slice(0, 10) ?? "");
  const [startDate,   setStartDate]   = useState<string>(row.start_date?.slice(0, 10) ?? "");
  const [joined,      setJoined]      = useState<string>(row.joined_at?.slice(0, 10) ?? "");
  const [paid,        setPaid]        = useState<string>(row.paid_at?.slice(0, 10) ?? "");
  const [hospitalName, setHospitalName] = useState<string>(row.placement_hospital_name ?? "");
  const [working, setWorking] = useState(false);

  const handleSave = async () => {
    setWorking(true);
    try {
      const doctorName = row.doctor_name ?? row.doctor_id;
      const toIso = (d: string): string | null => d ? new Date(d + "T00:00:00.000Z").toISOString() : null;
      const updates: { action: Parameters<typeof mark.mutateAsync>[0]["action"]; was: string | null; now: string }[] = [
        { action: { kind: "mark_shortlisted", date: toIso(shortlisted) ?? "" }, was: row.shortlisted_at, now: shortlisted },
        { action: { kind: "mark_interviewed", date: toIso(interviewed) ?? "" }, was: row.interviewed_at, now: interviewed },
        { action: { kind: "mark_offered",     date: toIso(offered)     ?? "" }, was: row.offered_at,     now: offered },
        { action: { kind: "mark_signed",      date: toIso(signed) ?? undefined }, was: row.signed_at,   now: signed },
        { action: { kind: "mark_start_date",  date: toIso(startDate)   ?? "" }, was: row.start_date,    now: startDate },
        { action: { kind: "mark_joined",      joiningDate: toIso(joined) ?? "" }, was: row.joined_at,    now: joined },
        { action: { kind: "mark_paid",        date: toIso(paid) ?? undefined }, was: row.paid_at,       now: paid },
      ];

      // Only POST changed fields to keep the audit log clean.
      for (const u of updates) {
        const wasYmd = u.was ? u.was.slice(0, 10) : "";
        if (u.now === wasYmd) continue;
        if (!u.now) continue;   // clearing a date isn't supported via this dialog yet
        await mark.mutateAsync({ doctorId: row.doctor_id, doctorName, action: u.action });
      }

      if ((row.placement_hospital_name ?? "") !== hospitalName.trim()) {
        const match = hospitals.find(h => h.name.toLowerCase() === hospitalName.trim().toLowerCase());
        await mark.mutateAsync({
          doctorId: row.doctor_id, doctorName,
          action: { kind: "set_placement_hospital", hospitalId: match?.id ?? null, hospitalName: hospitalName.trim() || null },
        });
      }

      toast.success("Placement updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Briefcase className="h-4 w-4 text-emerald-600" />
            {row.doctor_name ?? row.doctor_id}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Set or correct any milestone date. Joined date starts the 45-day clock for AA payment.
          </p>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <Field label="Placement hospital" hint="Free-text — matches an entry in Hospitals if the name lines up.">
            <Input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="e.g. NMC Royal Hospital, Abu Dhabi" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <DateField label="Shortlisted" value={shortlisted} onChange={setShortlisted} icon={<ListChecks className="h-3 w-3 text-sky-600" />} />
            <DateField label="Interviewed" value={interviewed} onChange={setInterviewed} icon={<Calendar className="h-3 w-3 text-violet-600" />} />
            <DateField label="Offered"     value={offered}     onChange={setOffered}     icon={<Calendar className="h-3 w-3 text-amber-600" />} />
            <DateField label="Signed"      value={signed}      onChange={setSigned}      icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />} />
            <DateField label="Start date (agreed)" value={startDate} onChange={setStartDate} icon={<Calendar className="h-3 w-3 text-slate-600" />} />
            <DateField label="Joined (actual)"     value={joined}    onChange={setJoined}    icon={<CheckCircle2 className="h-3 w-3 text-teal-600" />} />
            <DateField label="Paid"        value={paid}        onChange={setPaid}        icon={<CheckCircle2 className="h-3 w-3 text-emerald-700" />} />
          </div>

          {joined && !paid && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-700 mt-[2px] shrink-0" />
              <div className="text-[11px] text-amber-900">
                45-day countdown active. Target invoice-paid by{" "}
                <strong>{fmtDate(new Date(new Date(joined).getTime() + 45 * 86_400_000).toISOString())}</strong>.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
          <Button onClick={handleSave} disabled={working}>{working ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function DateField({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </label>
      <Input type="date" value={value} onChange={e => onChange(e.target.value)} className="h-8 text-[11px]" />
    </div>
  );
}

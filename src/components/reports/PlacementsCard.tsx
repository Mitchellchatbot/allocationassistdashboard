/**
 * Placements — per-(doctor, hospital) journey tracker.
 *
 * Replaces Ammar's external Hammad Google sheet. The same doctor can
 * appear at multiple hospitals (each row is one ATTEMPT). Each row
 * tracks the milestone dates (shortlisted → interviewed → offered →
 * signed → start_date → joined → paid).
 *
 * Stored in our portal in `placement_attempts` — NOT connected to
 * Zoho. The doctor roster picker pulls from Zoho leads + DoB for
 * convenience, but the journey dates live here.
 *
 * Data source notes (per Ammar 2026-06-03 call):
 *   - Placement dates do NOT live in Zoho — Zoho has no fields for them.
 *   - This replaces the "Hammad" Google sheet. No bidirectional sync.
 *   - 45-day clock starts on joined_at; closed by paid_at.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, ListChecks, Calendar, AlertCircle, CheckCircle2, Plus, Search, UserSquare, Trash2, Upload, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/lib/supabase";
import {
  usePlacementAttempts, useUpsertPlacementAttempt, useDeletePlacementAttempt,
  type PlacementAttempt,
} from "@/hooks/use-placement-attempts";
import { useHospitals, type Hospital } from "@/hooks/use-hospitals";
import { useZohoData } from "@/hooks/use-zoho-data";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/reports/CsvImportDialog";

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

function PaymentStatus({ row }: { row: PlacementAttempt }) {
  if (row.paid_at) {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Paid</Badge>;
  }
  const days = daysSince(row.joined_at);
  if (days == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const remaining = 45 - days;
  if (remaining < 0)        return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[9px]">Overdue · {Math.abs(remaining)}d</Badge>;
  if (remaining <= 15)      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">Due in {remaining}d</Badge>;
  return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[9px]">{remaining}d left</Badge>;
}

export interface PlacementsCardProps {
  /** Show only attempts whose MOST RECENT milestone date falls within
   *  the last N days. When null, no time filter applied (all rows). */
  rangeDays?: number | null;
  /** Hospital filter (case-insensitive substring on hospital_name). */
  hospital?:  string | null;
  /** Specialty filter (case-insensitive substring on doctor_specialty). */
  specialty?: string | null;
  /** Collapsible control (summary-first restructure). When provided, the
   *  card header doubles as a Collapsible trigger so the heavy table can
   *  stay closed on first paint. Omit to render always-expanded. */
  open?:         boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Most recent milestone date on a placement_attempt — used to decide
 *  whether the row "happened" in a given date window. */
function latestMilestone(r: PlacementAttempt): string | null {
  return r.paid_at || r.joined_at || r.start_date || r.signed_at || r.offered_at || r.interviewed_at || r.shortlisted_at;
}

export function PlacementsCard({ rangeDays, hospital, specialty, open, onOpenChange }: PlacementsCardProps = {}) {
  // When the caller drives a Collapsible, header is the trigger + body is
  // gated. When not, the section is permanently open (legacy behaviour).
  const collapsible = onOpenChange !== undefined;
  const isOpen = collapsible ? !!open : true;
  const { data: rawRows = [], isLoading } = usePlacementAttempts();
  // Apply rangeDays + hospital + specialty filters from the Reports
  // top-bar before anything else. Search-bar filtering happens on the
  // result of this so 'find Anas in last 30d' works.
  const rows = useMemo(() => {
    const cutoffMs = rangeDays ? Date.now() - rangeDays * 86_400_000 : 0;
    return rawRows.filter(r => {
      if (rangeDays) {
        const latest = latestMilestone(r);
        if (!latest) return false;
        if (new Date(latest).getTime() < cutoffMs) return false;
      }
      if (hospital && !(r.hospital_name ?? "").toLowerCase().includes(hospital.toLowerCase())) return false;
      if (specialty && !(r.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) return false;
      return true;
    });
  }, [rawRows, rangeDays, hospital, specialty]);
  const { data: zoho }                 = useZohoData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // Number of placement_attempts that still have a csv:<slug> doctor_id
  // (imported from CSV but never linked to a Zoho lead/DoB). Computed
  // from the FULL list (not the filtered subset) so the 'Re-link to
  // Zoho' button doesn't hide when the user narrows the time filter.
  const unlinkedCount = useMemo(() => rawRows.filter(r => r.doctor_id.startsWith("csv:")).length, [rawRows]);

  const handleRelinkToZoho = async () => {
    if (relinking) return;
    setRelinking(true);
    try {
      // Build name → Zoho id map. DoB wins over Lead (further down pipeline).
      const norm = (s: string) => s.replace(/^\s*dr\.?\s+/i, "").toLowerCase().replace(/\s+/g, " ").trim();
      const map = new Map<string, string>();
      for (const l of zoho?.rawLeads ?? []) {
        const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
        if (name) map.set(norm(name), `lead:${l.id}`);
      }
      for (const d of zoho?.rawDoctorsOnBoard ?? []) {
        const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
        if (name) map.set(norm(name), `dob:${d.id}`);
      }
      const unlinked = rawRows.filter(r => r.doctor_id.startsWith("csv:"));
      let updated = 0;
      for (const r of unlinked) {
        const zohoId = map.get(norm(r.doctor_name));
        if (!zohoId) continue;
        const { error } = await supabase
          .from("placement_attempts")
          .update({ doctor_id: zohoId, updated_at: new Date().toISOString() })
          .eq("id", r.id);
        if (!error) updated++;
      }
      toast.success(`Re-linked ${updated} placement${updated === 1 ? "" : "s"} to Zoho.${updated < unlinked.length ? ` ${unlinked.length - updated} couldn't be matched by name.` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-link failed");
    } finally {
      setRelinking(false);
    }
  };

  // Deep-link: /reports?placement=<doctor_id> opens a NEW attempt
  // editor for the doctor (pre-loaded). Used by the Run Detail Sheet's
  // "Track placement" button.
  const [pendingNewDoctor, setPendingNewDoctor] = useState<{ doctorId: string; doctorName?: string } | null>(null);
  useEffect(() => {
    const queryId = searchParams.get("placement");
    if (queryId) {
      setPendingNewDoctor({ doctorId: queryId });
      setPickerOpen(true);    // open picker; it surfaces the doctor's existing attempts
      const next = new URLSearchParams(searchParams);
      next.delete("placement");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const editing = useMemo<PlacementAttempt | null>(
    () => rows.find(r => r.id === editingId) ?? null,
    [rows, editingId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.doctor_name.toLowerCase().includes(q) ||
      r.hospital_name.toLowerCase().includes(q) ||
      (r.doctor_specialty ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Pagination — show 5 rows by default, bump +10 each click. Reset
  // whenever the filter changes so the user always starts at the top
  // of the new result set. Pure UI state; no fetching involved since
  // the placement set is small enough to load in one shot.
  const PAGE_FIRST = 5;
  const PAGE_STEP  = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_FIRST);
  useEffect(() => { setVisibleCount(PAGE_FIRST); }, [search, hospital, specialty, rangeDays]);
  const visibleRows = filtered.slice(0, visibleCount);
  const remaining   = filtered.length - visibleRows.length;

  // The header title + chevron is the collapse trigger; the action
  // buttons sit OUTSIDE it so clicking Import / New placement doesn't
  // toggle the section. When not collapsible, the trigger is a plain div.
  const titleBlock = (
    <div className="min-w-0">
      <CardTitle className="text-base flex items-center gap-2">
        {collapsible && (
          isOpen
            ? <ChevronDown  className="h-4 w-4 text-slate-400 shrink-0" />
            : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <Briefcase className="h-4 w-4 text-emerald-600" />
        Placements
        <Badge variant="outline" className="text-[10px] bg-slate-50">
          {rows.length === rawRows.length ? rows.length : `${rows.length} of ${rawRows.length}`}
        </Badge>
      </CardTitle>
      <CardDescription className="text-[11px]">
        One row per (doctor, hospital) pair — the same doctor can appear multiple times (e.g. shortlisted at 4 hospitals). Replaces Ammar's Hammad Google sheet. Stored in our portal, <strong>not Zoho</strong>. 45-day clock starts on Joined.
      </CardDescription>
    </div>
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={onOpenChange ?? (() => {})}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {collapsible ? (
            <CollapsibleTrigger asChild>
              <button type="button" className="text-left min-w-0 cursor-pointer">
                {titleBlock}
              </button>
            </CollapsibleTrigger>
          ) : titleBlock}
          <div className="flex items-center gap-2 flex-wrap">
            {unlinkedCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleRelinkToZoho} disabled={relinking}
                title={`${unlinkedCount} CSV-imported placement${unlinkedCount === 1 ? "" : "s"} aren't linked to Zoho yet. Click to match by doctor name.`}>
                <Link2 className="h-3.5 w-3.5 mr-1 text-indigo-600" />
                {relinking ? "Linking…" : `Re-link to Zoho (${unlinkedCount})`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => { setPendingNewDoctor(null); setPickerOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New placement
            </Button>
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="px-0 pt-0">
        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by doctor, hospital, specialty…"
              className="pl-7 h-8 text-[11px]"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="px-4 py-6 text-[11px] text-muted-foreground">Loading placements…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            <ListChecks className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
            <p>No placements logged yet.</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Import the Hammad CSV
              </Button>
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add one manually
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase">
                  <TableHead className="text-[10px]">Doctor</TableHead>
                  <TableHead className="text-[10px]">Hospital</TableHead>
                  <TableHead className="text-[10px]">Specialty</TableHead>
                  <TableHead className="text-[10px]">Shortlist</TableHead>
                  <TableHead className="text-[10px]">Interview</TableHead>
                  <TableHead className="text-[10px]">Offered</TableHead>
                  <TableHead className="text-[10px]">Signed</TableHead>
                  <TableHead className="text-[10px]">Start</TableHead>
                  <TableHead className="text-[10px]">Joined</TableHead>
                  <TableHead className="text-[10px]">45-day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(r => (
                  <TableRow
                    key={r.id}
                    onClick={() => setEditingId(r.id)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <TableCell className="text-[11px] font-medium">{r.doctor_name}</TableCell>
                    <TableCell className="text-[11px]">{r.hospital_name}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground truncate max-w-[160px]">{r.doctor_specialty ?? "—"}</TableCell>
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
            {/* Show-more footer. Bumps +10 per click, or 'Show all' to
                expand the rest in one go. Hidden once we're showing
                everything, replaced with a small 'All N shown' note. */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50/50 text-[11px]">
                <span className="text-muted-foreground tabular-nums">
                  Showing {visibleRows.length} of {filtered.length}
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
                        onClick={() => setVisibleCount(filtered.length)}
                      >
                        Show all {filtered.length}
                      </Button>
                    )}
                  </div>
                ) : (
                  filtered.length > PAGE_FIRST && (
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

      {editing && (
        <AttemptEditDialog
          row={editing}
          open={!!editing}
          onClose={() => setEditingId(null)}
        />
      )}

      <NewPlacementDialog
        open={pickerOpen}
        existingAttempts={rawRows}
        preselectDoctorId={pendingNewDoctor?.doctorId ?? null}
        onClose={() => { setPickerOpen(false); setPendingNewDoctor(null); }}
        onCreated={(id) => {
          setPickerOpen(false);
          setPendingNewDoctor(null);
          setEditingId(id);
        }}
      />

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * AttemptEditDialog — date pickers for each milestone on one
 * placement attempt. Saves via useUpsertPlacementAttempt; the DB
 * trigger forward-syncs to doctor_lifecycle so downstream things
 * (status badge, Second Payment trigger) keep working.
 * ──────────────────────────────────────────────────────────────────── */
function AttemptEditDialog({ row, open, onClose }: { row: PlacementAttempt; open: boolean; onClose: () => void }) {
  const upsert = useUpsertPlacementAttempt();
  const del    = useDeletePlacementAttempt();
  const { data: hospitals = [] } = useHospitals();

  const [shortlisted, setShortlisted] = useState(row.shortlisted_at?.slice(0, 10) ?? "");
  const [interviewed, setInterviewed] = useState(row.interviewed_at?.slice(0, 10) ?? "");
  const [offered,     setOffered]     = useState(row.offered_at?.slice(0, 10) ?? "");
  const [signed,      setSigned]      = useState(row.signed_at?.slice(0, 10) ?? "");
  const [startDate,   setStartDate]   = useState(row.start_date?.slice(0, 10) ?? "");
  const [joined,      setJoined]      = useState(row.joined_at?.slice(0, 10) ?? "");
  const [paid,        setPaid]        = useState(row.paid_at?.slice(0, 10) ?? "");
  const [notes,       setNotes]       = useState(row.notes ?? "");
  const [hospitalName, setHospitalName] = useState(row.hospital_name);
  const [working, setWorking] = useState(false);

  const handleSave = async () => {
    setWorking(true);
    try {
      const toIso = (d: string): string | null => d ? new Date(d + "T00:00:00.000Z").toISOString() : null;
      const matched = hospitals.find(h => h.name.toLowerCase() === hospitalName.trim().toLowerCase());
      await upsert.mutateAsync({
        id:               row.id,
        doctor_id:        row.doctor_id,
        doctor_name:      row.doctor_name,
        doctor_specialty: row.doctor_specialty,
        hospital_id:      matched?.id ?? row.hospital_id,
        hospital_name:    hospitalName.trim() || row.hospital_name,
        shortlisted_at:   toIso(shortlisted),
        interviewed_at:   toIso(interviewed),
        offered_at:       toIso(offered),
        signed_at:        toIso(signed),
        start_date:       toIso(startDate),
        joined_at:        toIso(joined),
        paid_at:          toIso(paid),
        notes:            notes.trim() || null,
        source:           row.source,
      });
      toast.success("Placement updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${row.doctor_name} @ ${row.hospital_name}? Milestone dates will be lost.`)) return;
    setWorking(true);
    try {
      await del.mutateAsync(row.id);
      toast.success("Placement deleted.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Briefcase className="h-4 w-4 text-emerald-600" />
            {row.doctor_name} @ {row.hospital_name}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {row.doctor_specialty ?? "—"} · Set or correct any milestone date. Joined fires the 45-day AA-invoice clock.
          </p>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Hospital name</label>
            <Input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="e.g. NMC Royal — Sharjah" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DateField label="Shortlisted"     value={shortlisted} onChange={setShortlisted} />
            <DateField label="Interviewed"     value={interviewed} onChange={setInterviewed} />
            <DateField label="Offered"         value={offered}     onChange={setOffered} />
            <DateField label="Signed"          value={signed}      onChange={setSigned} />
            <DateField label="Start date"      value={startDate}   onChange={setStartDate} />
            <DateField label="Joined"          value={joined}      onChange={setJoined} />
            <DateField label="Paid"            value={paid}        onChange={setPaid} />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. 'Added', 'Sent', or any free-text remark" />
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

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={working} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
            <Button onClick={handleSave} disabled={working}>{working ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Input type="date" value={value} onChange={e => onChange(e.target.value)} className="h-8 text-[11px]" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * NewPlacementDialog — pick a doctor (Zoho leads + DoB) + a hospital,
 * then create the placement_attempt row. Same doctor can be added at
 * multiple hospitals (one per pair).
 * ──────────────────────────────────────────────────────────────────── */
function NewPlacementDialog({ open, existingAttempts, preselectDoctorId, onClose, onCreated }: {
  open:              boolean;
  existingAttempts:  PlacementAttempt[];
  preselectDoctorId: string | null;
  onClose:           () => void;
  onCreated:         (id: string) => void;
}) {
  const { data: zoho }      = useZohoData();
  const { data: hospitals = [] } = useHospitals();
  const upsert              = useUpsertPlacementAttempt();
  const [doctorSearch, setDoctorSearch]     = useState("");
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [pickedDoctor, setPickedDoctor]     = useState<{ id: string; name: string; specialty: string } | null>(null);
  const [pickedHospital, setPickedHospital] = useState<Hospital | null>(null);
  const [hospitalFreeText, setHospitalFreeText] = useState("");   // for CSV-style names not in hospitals table
  const [creating, setCreating]             = useState(false);

  // Reset when reopening.
  useEffect(() => {
    if (open) {
      setPickedDoctor(null);
      setPickedHospital(null);
      setHospitalFreeText("");
      setDoctorSearch("");
      setHospitalSearch("");
    }
  }, [open]);

  // Auto-resolve a pre-selected doctor (deep-link from Run Detail Sheet).
  useEffect(() => {
    if (!open || !preselectDoctorId || pickedDoctor) return;
    const fromLeads = (zoho?.rawLeads ?? []).find(l => `lead:${l.id}` === preselectDoctorId);
    if (fromLeads) {
      const name = (fromLeads.Full_Name || `${fromLeads.First_Name ?? ""} ${fromLeads.Last_Name ?? ""}`).trim();
      setPickedDoctor({ id: preselectDoctorId, name, specialty: (fromLeads.Specialty_New ?? fromLeads.Specialty ?? "").toString() });
      return;
    }
    const fromDob = (zoho?.rawDoctorsOnBoard ?? []).find(d => `dob:${d.id}` === preselectDoctorId);
    if (fromDob) {
      const name = (fromDob.Full_Name || `${fromDob.First_Name ?? ""} ${fromDob.Last_Name ?? ""}`).trim();
      setPickedDoctor({ id: preselectDoctorId, name, specialty: (fromDob.Specialty_New ?? fromDob.Speciality ?? "").toString() });
    }
  }, [open, preselectDoctorId, pickedDoctor, zoho?.rawLeads, zoho?.rawDoctorsOnBoard]);

  const doctorCandidates = useMemo(() => {
    const out: Array<{ id: string; name: string; specialty: string; subtitle: string; source: "lead" | "dob" }> = [];
    for (const l of zoho?.rawLeads ?? []) {
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
      if (!name) continue;
      out.push({
        id:        `lead:${l.id}`,
        name,
        specialty: (l.Specialty_New ?? l.Specialty ?? "").toString(),
        subtitle:  [l.Email, l.Phone ?? l.Mobile].filter(Boolean).join(" · ") || "",
        source:    "lead",
      });
    }
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
      if (!name) continue;
      out.push({
        id:        `dob:${d.id}`,
        name,
        specialty: (d.Specialty_New ?? d.Speciality ?? "").toString(),
        subtitle:  [d.Email, d.Phone ?? d.Mobile, d.Account_Name?.name && `→ ${d.Account_Name.name}`].filter(Boolean).join(" · ") || "Doctor on Board",
        source:    "dob",
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [zoho?.rawLeads, zoho?.rawDoctorsOnBoard]);

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    if (!q) return doctorCandidates.slice(0, 30);
    return doctorCandidates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.specialty.toLowerCase().includes(q) ||
      c.subtitle.toLowerCase().includes(q),
    ).slice(0, 30);
  }, [doctorCandidates, doctorSearch]);

  const filteredHospitals = useMemo(() => {
    const q = hospitalSearch.trim().toLowerCase();
    if (!q) return hospitals.slice(0, 30);
    return hospitals.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.city ?? "").toLowerCase().includes(q) ||
      (h.country ?? "").toLowerCase().includes(q),
    ).slice(0, 30);
  }, [hospitals, hospitalSearch]);

  const doctorAlreadyAtHospital = useMemo(() => {
    if (!pickedDoctor) return null;
    const hospName = pickedHospital?.name ?? hospitalFreeText.trim();
    if (!hospName) return null;
    return existingAttempts.find(a =>
      a.doctor_id === pickedDoctor.id &&
      a.hospital_name.toLowerCase() === hospName.toLowerCase(),
    ) ?? null;
  }, [pickedDoctor, pickedHospital, hospitalFreeText, existingAttempts]);

  const canCreate = !!pickedDoctor && !!(pickedHospital || hospitalFreeText.trim()) && !doctorAlreadyAtHospital;

  const handleCreate = async () => {
    if (!pickedDoctor) return;
    setCreating(true);
    try {
      const hospitalName = pickedHospital?.name ?? hospitalFreeText.trim();
      const created = await upsert.mutateAsync({
        doctor_id:        pickedDoctor.id,
        doctor_name:      pickedDoctor.name,
        doctor_specialty: pickedDoctor.specialty || null,
        hospital_id:      pickedHospital?.id ?? null,
        hospital_name:    hospitalName,
        source:           "manual",
      });
      toast.success(`Started tracking ${pickedDoctor.name} @ ${hospitalName}.`);
      onCreated(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Briefcase className="h-4 w-4 text-emerald-600" />
            Start tracking a placement
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Pick a doctor (from Zoho leads + Doctors on Board) and the hospital they were sent to. Then log milestone dates as the placement progresses.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {/* Doctor picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Doctor</label>
            {pickedDoctor ? (
              <button
                type="button"
                onClick={() => setPickedDoctor(null)}
                className="w-full text-left rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2"
              >
                <div className="text-[12px] font-medium text-slate-900">{pickedDoctor.name}</div>
                <div className="text-[10px] text-muted-foreground">{pickedDoctor.specialty || "—"} · click to change</div>
              </button>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={doctorSearch} onChange={e => setDoctorSearch(e.target.value)} placeholder="Search Zoho roster…" className="pl-8 h-8 text-[12px]" autoFocus />
                </div>
                <div className="mt-1 max-h-[230px] overflow-y-auto rounded-md border bg-slate-50/40">
                  {filteredDoctors.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No matches.</div>
                  ) : filteredDoctors.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPickedDoctor({ id: c.id, name: c.name, specialty: c.specialty })}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-white border-b border-slate-200/60 last:border-b-0 flex items-center gap-2"
                    >
                      <UserSquare className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-slate-800 truncate">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.specialty || c.subtitle || (c.source === "lead" ? "Lead" : "DoB")}</div>
                      </div>
                      <Badge variant="outline" className={`text-[9px] uppercase shrink-0 ${c.source === "lead" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        {c.source === "lead" ? "Lead" : "DoB"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Hospital picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Hospital</label>
            {pickedHospital ? (
              <button
                type="button"
                onClick={() => setPickedHospital(null)}
                className="w-full text-left rounded-md border border-sky-200 bg-sky-50/40 px-3 py-2"
              >
                <div className="text-[12px] font-medium text-slate-900">{pickedHospital.name}</div>
                <div className="text-[10px] text-muted-foreground">{[pickedHospital.city, pickedHospital.country].filter(Boolean).join(" · ") || "—"} · click to change</div>
              </button>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={hospitalSearch} onChange={e => setHospitalSearch(e.target.value)} placeholder="Search hospitals…" className="pl-8 h-8 text-[12px]" />
                </div>
                <div className="mt-1 max-h-[180px] overflow-y-auto rounded-md border bg-slate-50/40">
                  {filteredHospitals.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No matches.</div>
                  ) : filteredHospitals.map(h => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setPickedHospital(h)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-white border-b border-slate-200/60 last:border-b-0"
                    >
                      <div className="text-[11px] font-medium text-slate-800 truncate">{h.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{[h.city, h.country].filter(Boolean).join(" · ") || "—"}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/80">Or type a free-text name (e.g. CSV-style abbreviations):</p>
                <Input value={hospitalFreeText} onChange={e => setHospitalFreeText(e.target.value)} placeholder='e.g. "STMC", "AH", "MNGHA Riyadh"' className="h-8 text-[11px]" />
              </>
            )}
          </div>
        </div>

        {/* Existing attempts for the picked doctor — context so the
            team doesn't accidentally double-track or duplicate. */}
        {pickedDoctor && (() => {
          const existing = existingAttempts.filter(a => a.doctor_id === pickedDoctor.id);
          if (existing.length === 0) return null;
          return (
            <div className="rounded-md border border-sky-200 bg-sky-50/40 px-3 py-2 mt-1">
              <div className="text-[11px] font-medium text-sky-900 mb-1">
                {pickedDoctor.name} already has {existing.length} attempt{existing.length === 1 ? "" : "s"}:
              </div>
              <div className="flex flex-wrap gap-1">
                {existing.slice(0, 8).map(a => (
                  <Badge key={a.id} variant="outline" className="text-[9px] bg-white border-sky-200 text-sky-800">
                    {a.hospital_name}
                  </Badge>
                ))}
                {existing.length > 8 && (
                  <Badge variant="outline" className="text-[9px] bg-white border-sky-200 text-sky-800">+{existing.length - 8} more</Badge>
                )}
              </div>
            </div>
          );
        })()}

        {doctorAlreadyAtHospital && (
          <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-[11px] text-amber-900 mt-1">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            {pickedDoctor?.name} already has a placement attempt at <strong>{doctorAlreadyAtHospital.hospital_name}</strong>. Cancel and click the existing row to edit it.
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!canCreate || creating}>
            {creating ? "Creating…" : "Start tracking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

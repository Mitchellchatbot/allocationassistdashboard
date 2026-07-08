import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocLink } from "@/components/DocLink";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ClipboardList, Plus, Building2, CheckCircle2, X, AlertTriangle, Search, ChevronDown, ChevronUp, Sparkles, Check, Filter, Pencil } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/data-skeleton";
import { useDoctorSpecialties } from "@/hooks/use-doctor-specialties";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useHospitals, useCreateHospital } from "@/hooks/use-hospitals";
import {
  useVacancies, useCreateVacancy, useUpdateVacancy, useDeleteVacancy,
  type Vacancy, type VacancyPriority, type VacancyStatus,
} from "@/hooks/use-vacancies";
import { VacancyDetailSheet } from "@/components/VacancyDetailSheet";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";

const PAGE_SIZE = 30;

/**
 * Phase 3 — Vacancy Management. Source: Saif Ullah, May 20 2026.
 *
 * Hospital Introduction Team logs open vacancies here. Sales sees them when
 * talking to incoming doctors (cross-team visibility), and the auto-matcher
 * pings the team when a newly onboarded doctor's specialty hits an open row.
 */
export default function Vacancies() {
  const { user } = useAuth();
  const { data: vacancies = [], isLoading } = useVacancies();
  const { data: hospitals = [] } = useHospitals();
  const create = useCreateVacancy();
  const update = useUpdateVacancy();
  const remove = useDeleteVacancy();

  const [createOpen, setCreateOpen] = useState(false);
  const [editVacancy, setEditVacancy] = useState<Vacancy | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search,  setSearch]  = useState("");
  const [filterStatus, setFilterStatus] = useState<VacancyStatus | "all">("open");
  const [filterPriority, setFilterPriority] = useState<VacancyPriority | "all">("all");
  const [filterHospital, setFilterHospital] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"opened_at" | "priority" | "days_open">("opened_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Hospitals that actually have vacancies — so the filter only lists relevant ones.
  const hospitalNames = useMemo(
    () => Array.from(new Set(vacancies.map(v => v.hospital_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [vacancies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = vacancies.slice();
    if (filterStatus !== "all")    list = list.filter(v => v.status   === filterStatus);
    if (filterPriority !== "all")  list = list.filter(v => v.priority === filterPriority);
    if (filterHospital !== "all")  list = list.filter(v => v.hospital_name === filterHospital);
    if (q) {
      list = list.filter(v =>
        v.hospital_name.toLowerCase().includes(q) ||
        v.specialty.toLowerCase().includes(q) ||
        v.notes?.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "opened_at") {
        cmp = new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      } else if (sortBy === "priority") {
        const rank: Record<VacancyPriority, number> = { high: 3, medium: 2, low: 1 };
        cmp = rank[a.priority] - rank[b.priority];
      } else if (sortBy === "days_open") {
        cmp = daysOpen(a) - daysOpen(b);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [vacancies, search, filterStatus, filterPriority, filterHospital, sortBy, sortDir]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterPriority, filterHospital, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (safePage > 3) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) out.push(i);
    if (safePage < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

  const stats = useMemo(() => {
    const open = vacancies.filter(v => v.status === "open");
    return {
      open:    open.length,
      high:    open.filter(v => v.priority === "high").length,
      stale:   open.filter(v => daysOpen(v) > 14).length,
      filled30: vacancies.filter(v => v.status === "filled" && v.filled_at && Date.now() - new Date(v.filled_at).getTime() < 30 * 86_400_000).length,
    };
  }, [vacancies]);

  const handleStatusChange = async (v: Vacancy, status: VacancyStatus) => {
    try {
      await update.mutateAsync({ id: v.id, patch: { status } });
      toast.success(`Vacancy marked ${status}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const toggleSort = (col: "opened_at" | "priority" | "days_open") => {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-teal-600" />
              Vacancies
              <DocLink slug="hospital-introduction/vacancies" />
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Open hospital roles the team is actively filling. Sales sees these when matching incoming doctors to vacancies.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <KpiPill label="Open"        value={stats.open}     tone="teal"    hint="Vacancies currently in 'open' status — actively being filled." />
            <KpiPill label="High pri"    value={stats.high}     tone="rose"    hint="High-priority vacancies — flagged urgent by the hospital or close to start date." />
            <KpiPill label="Stale > 14d" value={stats.stale}    tone="amber"   hint="Open vacancies with no progress in over 14 days. Triage candidates: nudge the hospital, surface alternatives, or close." />
            <KpiPill label="Filled (30d)" value={stats.filled30} tone="emerald" hint="Vacancies marked 'filled' in the last 30 days. Healthy throughput indicator." />
            <Button size="sm" onClick={() => { setEditVacancy(null); setCreateOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New vacancy
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search hospital, specialty, notes..."
                  className="pl-8 h-9 text-[12px]"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as VacancyStatus | "all")}>
                <SelectTrigger className="h-9 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as VacancyPriority | "all")}>
                <SelectTrigger className="h-9 w-[130px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterHospital} onValueChange={setFilterHospital}>
                <SelectTrigger className="h-9 w-[190px] text-[12px]"><SelectValue placeholder="All hospitals" /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">All hospitals</SelectItem>
                  {hospitalNames.map(n => <SelectItem key={n} value={n} className="text-[12px]">{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <TableSkeleton rows={5} cols={6} />}
            {!isLoading && filtered.length === 0 && (
              vacancies.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No vacancies yet"
                  body="Log the first hospital request so the team can start matching doctors against it."
                  size="md"
                />
              ) : (
                <EmptyState
                  icon={Filter}
                  title="No vacancies match your filters"
                  body="Try widening the date range or clearing the priority filter."
                  size="md"
                />
              )
            )}
            {!isLoading && filtered.length > 0 && (
              <Table data-tour="vacancies-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Hospital</TableHead>
                    <TableHead className="text-[11px]">Specialty</TableHead>
                    <TableHead className="text-[11px] cursor-pointer" onClick={() => toggleSort("priority")}>
                      <span className="inline-flex items-center gap-1">
                        Priority {sortBy === "priority" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] cursor-pointer" onClick={() => toggleSort("days_open")}>
                      <span className="inline-flex items-center gap-1">
                        Days open {sortBy === "days_open" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                    <TableHead className="text-[11px]">Opened by</TableHead>
                    <TableHead className="text-[11px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(v => (
                    <VacancyRow
                      key={v.id}
                      v={v}
                      onOpen={() => setDetailId(v.id)}
                      onStatusChange={(s) => handleStatusChange(v, s)}
                      onEdit={() => { setEditVacancy(v); setCreateOpen(true); }}
                      onDelete={async () => {
                        if (!confirm(`Delete vacancy at ${v.hospital_name} for ${v.specialty}? This is permanent.`)) return;
                        try {
                          await remove.mutateAsync(v.id);
                          toast.success("Vacancy deleted.");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Delete failed");
                        }
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            {!isLoading && totalPages > 1 && (
              <Pagination className="mt-2 mb-2">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
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
                          onClick={(e) => { e.preventDefault(); setPage(n as number); }}
                        >
                          {n}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                      aria-disabled={safePage === totalPages}
                      className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateVacancyDialog
        open={createOpen}
        initial={editVacancy}
        onClose={() => { setCreateOpen(false); setEditVacancy(null); }}
        hospitals={hospitals.map(h => ({ id: h.id, name: h.name }))}
        onSubmit={async (input) => {
          try {
            if (editVacancy) {
              await update.mutateAsync({ id: editVacancy.id, patch: input });
              toast.success("Vacancy updated.");
            } else {
              await create.mutateAsync({ ...input, opened_by: user?.email ?? null });
              toast.success("Vacancy logged.");
            }
            setCreateOpen(false);
            setEditVacancy(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />

      <VacancyDetailSheet
        open={!!detailId}
        vacancy={vacancies.find(v => v.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </DashboardLayout>
  );
}

function KpiPill({ label, value, tone = "teal", hint }: { label: string; value: number; tone?: "teal" | "emerald" | "amber" | "rose"; hint?: string }) {
  const colors = {
    teal:    "bg-teal-50 text-teal-700 border-teal-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <div className={`rounded-md border px-3 py-1.5 ${colors[tone]}`} title={hint}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-semibold leading-tight">{value.toLocaleString()}</div>
    </div>
  );
}

function VacancyRow({ v, onOpen, onStatusChange, onEdit, onDelete }: {
  v: Vacancy;
  onOpen: () => void;
  onStatusChange: (s: VacancyStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const days = daysOpen(v);
  const stale = v.status === "open" && days > 14;
  const overdue = v.status === "open" && v.target_fill_days != null && days > v.target_fill_days;
  return (
    <TableRow className={stale ? "bg-amber-50/30" : undefined}>
      <TableCell className="text-[12px] font-medium">
        <button onClick={onOpen} className="text-left hover:text-teal-700 transition-colors">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            {v.hospital_name}
          </div>
          {v.notes && <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{v.notes}</div>}
        </button>
      </TableCell>
      <TableCell className="text-[12px]">{v.specialty}</TableCell>
      <TableCell><PriorityBadge p={v.priority} /></TableCell>
      <TableCell>
        <div className="text-[12px]">{days}d</div>
        {v.target_fill_days && (
          <div className={`text-[10px] ${overdue ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
            target {v.target_fill_days}d{overdue && " — overdue"}
          </div>
        )}
      </TableCell>
      <TableCell><StatusBadge s={v.status} /></TableCell>
      <TableCell className="text-[11px] text-muted-foreground">{v.opened_by ?? "—"}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {v.status === "open" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onOpen} title="Open this vacancy and see the top doctor matches scored by specialty, license, location and notice period.">
                <Sparkles className="h-3 w-3 mr-1 text-emerald-600" /> Matches
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStatusChange("filled")} title="Mark this vacancy as filled. Counts toward the 'Filled (30d)' KPI.">
                <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Filled
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStatusChange("closed")} title="Close this vacancy without a placement (hospital cancelled, role pulled, etc.).">
                <X className="h-3 w-3 mr-1" /> Close
              </Button>
            </>
          )}
          {v.status !== "open" && (
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStatusChange("open")} title="Move this vacancy back to 'open' so it appears in active matching again.">
              Reopen
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onEdit} title="Edit this vacancy's hospital, specialty, priority, target and notes.">
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[10px] text-rose-600 hover:bg-rose-50" onClick={onDelete} title="Permanently delete this vacancy and its links.">
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PriorityBadge({ p }: { p: VacancyPriority }) {
  const cls = {
    high:   "bg-rose-100 text-rose-800 border-rose-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    low:    "bg-slate-100 text-slate-700 border-slate-200",
  }[p];
  return <Badge variant="outline" className={`${cls} text-[10px] uppercase tracking-wider`}>{p}</Badge>;
}

function StatusBadge({ s }: { s: VacancyStatus }) {
  const cls = {
    open:   "bg-teal-100 text-teal-800 border-teal-200",
    filled: "bg-emerald-100 text-emerald-800 border-emerald-200",
    closed: "bg-slate-100 text-slate-700 border-slate-200",
  }[s];
  return <Badge variant="outline" className={`${cls} text-[10px] uppercase tracking-wider`}>{s}</Badge>;
}

function daysOpen(v: Vacancy): number {
  const end = v.status === "open" ? Date.now() : new Date(v.filled_at ?? v.closed_at ?? v.opened_at).getTime();
  return Math.floor((end - new Date(v.opened_at).getTime()) / 86_400_000);
}

function CreateVacancyDialog({ open, onClose, onSubmit, hospitals, initial }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { hospital_id: string | null; hospital_name: string; specialty: string; priority: VacancyPriority; target_fill_days: number | null; notes: string | null }) => Promise<void>;
  hospitals: { id: string; name: string }[];
  /** When set, the dialog edits this vacancy instead of creating a new one. */
  initial?: Vacancy | null;
}) {
  const [hospitalId, setHospitalId] = useState<string>("");
  const [hospitalName, setHospitalName] = useState<string>("");
  const [specialty, setSpecialty] = useState<string>("");
  const [priority, setPriority] = useState<VacancyPriority>("medium");
  const [targetDays, setTargetDays] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // New-hospital details — captured when the typed hospital isn't on file yet,
  // so we create a real hospital record (city/country drive the license-region
  // match; recruiter email lets us actually send to them).
  const [hCity, setHCity] = useState<string>("");
  const [hCountry, setHCountry] = useState<string>("");
  const [hRecruiterEmail, setHRecruiterEmail] = useState<string>("");
  const [hContactName, setHContactName] = useState<string>("");
  const createHospital = useCreateHospital();
  const editing = !!initial;

  // Auto-map: a typed hospital name that matches one on file (case-insensitive)
  // links to that record — so the matcher gets its city/country even when the
  // team types instead of picking. Only when nothing was picked from the list.
  const trimmedName = hospitalName.trim();
  const mappedHospital = (!hospitalId && trimmedName)
    ? hospitals.find(h => h.name.trim().toLowerCase() === trimmedName.toLowerCase())
    : undefined;
  // Genuinely new hospital → show the detail fields + create a record on save.
  const isNewHospital = !!trimmedName && !hospitalId && !mappedHospital;

  // Seed the form when the dialog opens — from the vacancy being edited, or
  // blank for a new one.
  useEffect(() => {
    if (!open) return;
    setHospitalId(initial?.hospital_id ?? "");
    setHospitalName(initial?.hospital_name ?? "");
    setSpecialty(initial?.specialty ?? "");
    setPriority(initial?.priority ?? "medium");
    setTargetDays(initial?.target_fill_days != null ? String(initial.target_fill_days) : "");
    setNotes(initial?.notes ?? "");
    setHCity(""); setHCountry(""); setHRecruiterEmail(""); setHContactName("");
  }, [open, initial]);

  const resetAndClose = () => {
    setHospitalId(""); setHospitalName(""); setSpecialty(""); setPriority("medium");
    setTargetDays(""); setNotes("");
    setHCity(""); setHCountry(""); setHRecruiterEmail(""); setHContactName("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!hospitalName.trim() || !specialty.trim()) {
      toast.error("Hospital and specialty are required.");
      return;
    }
    setSubmitting(true);
    try {
      // Resolve the hospital, in order: picked from the list → auto-mapped by
      // name → create a brand-new record from the entered details. Either way
      // the vacancy ends up with a real hospital_id so the matcher can rank
      // doctors by license/region and the team can email the hospital.
      let resolvedId: string | null = hospitalId || mappedHospital?.id || null;
      const resolvedName = mappedHospital?.name ?? hospitalName.trim();
      if (!resolvedId && isNewHospital) {
        resolvedId = await createHospital.mutateAsync({
          name:                    hospitalName.trim(),
          city:                    hCity.trim() || null,
          country:                 hCountry.trim() || null,
          primary_recruiter_email: hRecruiterEmail.trim() || null,
          primary_contact_name:    hContactName.trim() || null,
        });
        toast.success(`Added ${hospitalName.trim()} to Hospitals.`);
      }
      await onSubmit({
        hospital_id:      resolvedId,
        hospital_name:    resolvedName,
        specialty:        specialty.trim(),
        priority,
        target_fill_days: targetDays.trim() ? Number(targetDays) : null,
        notes:            notes.trim() || null,
      });
      resetAndClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the vacancy.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-600" />
            {editing ? "Edit vacancy" : "Log a new vacancy"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Hospital Introduction Team uses this to track open roles. Sales sees these when matching incoming doctors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Hospital</Label>
            <Select
              value={hospitalId}
              onValueChange={(v) => {
                setHospitalId(v);
                const h = hospitals.find(x => x.id === v);
                if (h) setHospitalName(h.name);
              }}
            >
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue placeholder="— pick a hospital —" />
              </SelectTrigger>
              <SelectContent>
                {hospitals.map(h => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={hospitalName}
              onChange={(e) => { setHospitalName(e.target.value); setHospitalId(""); }}
              placeholder="…or type a hospital name (if not in the list yet)"
              className="h-9 text-[12px] mt-1"
            />
            {mappedHospital && (
              <p className="text-[10.5px] text-emerald-700 inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Auto-mapped to <strong>{mappedHospital.name}</strong> on file — the matcher will use its city / license region.
              </p>
            )}
            {isNewHospital && (
              <div className="mt-1.5 rounded-md border border-teal-200 bg-teal-50/40 p-2.5 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-teal-700 font-semibold">
                  New hospital — add its details
                </div>
                <p className="text-[10px] text-muted-foreground">
                  "{trimmedName}" isn't on file yet. These get saved as a new hospital so the matcher can rank doctors by license / region, and so you can email them.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">City</Label>
                    <Input value={hCity} onChange={(e) => setHCity(e.target.value)} placeholder="e.g. Dubai" className="h-8 text-[12px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Country</Label>
                    <Input value={hCountry} onChange={(e) => setHCountry(e.target.value)} placeholder="e.g. UAE" className="h-8 text-[12px]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Recruiter email</Label>
                  <Input value={hRecruiterEmail} onChange={(e) => setHRecruiterEmail(e.target.value)} placeholder="recruiter@hospital.com" className="h-8 text-[12px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Contact name</Label>
                  <Input value={hContactName} onChange={(e) => setHContactName(e.target.value)} placeholder="e.g. Dr. Sarah / HR Manager" className="h-8 text-[12px]" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Specialty</Label>
            <SpecialtyCombobox value={specialty} onChange={setSpecialty} />
            <p className="text-[10px] text-muted-foreground">
              Pick from existing Zoho specialties so the auto-matcher finds the right doctors. Free-text also works.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as VacancyPriority)}>
                <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Target fill (days)</Label>
              <Input
                type="number"
                value={targetDays}
                onChange={(e) => setTargetDays(e.target.value)}
                placeholder="e.g. 3"
                className="h-9 text-[12px]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the team should know (preferred experience, license, etc.)"
              rows={3}
              className="text-[12px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (editing ? "Saving..." : "Logging...") : (editing ? "Save changes" : "Log vacancy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused warning for the local error icon import — kept for future
// "stale > 14d" callout banner row.
void AlertTriangle;

function SpecialtyCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = useDoctorSpecialties();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Allow the team to enter a value that isn't in Zoho yet (e.g. a niche
  // specialty) — show "Use \"X\"" as a fallback item.
  const trimmedQuery = query.trim();
  const queryExistsInOptions = options.some(o => o.value.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between text-[12px] font-normal"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value || "— pick a specialty —"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Search specialty..."
            value={query}
            onValueChange={setQuery}
            className="text-[12px]"
          />
          <CommandList>
            <CommandEmpty>
              {trimmedQuery
                ? <button
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-accent"
                    onClick={() => { onChange(trimmedQuery); setOpen(false); }}
                  >
                    Use "<strong>{trimmedQuery}</strong>" (not in Zoho yet)
                  </button>
                : <span className="px-3 py-2 text-[11px] text-muted-foreground block">No specialties found.</span>}
            </CommandEmpty>
            {trimmedQuery && !queryExistsInOptions && (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`__custom_${trimmedQuery}`}
                  onSelect={() => { onChange(trimmedQuery); setOpen(false); }}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Use "<strong className="ml-0.5">{trimmedQuery}</strong>"
                </CommandItem>
              </CommandGroup>
            )}
            {options.length > 0 && (
              <CommandGroup heading={`In Zoho · ${options.length}`}>
                {options.slice(0, 100).map(opt => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => { onChange(opt.value); setOpen(false); }}
                  >
                    <Check className={`h-3 w-3 mr-2 ${value === opt.value ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 text-[12px]">{opt.value}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{opt.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Search, ExternalLink, Download, ArrowUpDown, UserSquare, Mail, Filter } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/data-skeleton";
import { useAutomationFlowRuns, type RunStatus } from "@/hooks/use-automation-flows";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";

const PAGE_SIZE = 30;
type DateRange = "all" | "7" | "30" | "90";

/**
 * Offer history — the record of doctors we've offered vacancies to.
 *
 * Every time the team hits "Send" on a matched doctor (from a vacancy's Matches
 * sheet, or a WordPress search there), the Send-Profile flow fires: it emails
 * the doctor a working-opportunity intro to that hospital and logs an
 * `automation_flow_runs` row (flow_key = profile_sent). This tab is a flat,
 * searchable view of exactly those runs — who was offered which hospital, when,
 * by whom, and the email/flow status. 100% derived from cached DB data
 * (useAutomationFlowRuns) — no extra table, no edge function.
 */
interface OfferRecord {
  id:          string;
  doctorName:  string;
  doctorEmail: string | null;
  specialty:   string | null;
  hospital:    string | null;
  offeredAt:   string | null;
  by:          string | null;
  status:      RunStatus;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:    { label: "Emailed",   cls: "bg-teal-50 text-teal-700 border-teal-200" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused:    { label: "Paused",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  failed:    { label: "Failed",    cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

// Real rows can carry a status outside the four typed ones (legacy / other
// flows), so never index STATUS_META blindly — fall back to a neutral chip
// that echoes whatever the raw status string is.
function statusMeta(status: string | null | undefined): { label: string; cls: string } {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { label: status || "—", cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

export function VacancyOfferHistory() {
  const { data: runs = [], isLoading } = useAutomationFlowRuns();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterHospital, setFilterHospital] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<RunStatus | "all">("all");
  const [range, setRange] = useState<DateRange>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Only the Send-Profile offers (a doctor emailed about a hospital opportunity).
  const offers: OfferRecord[] = useMemo(
    () => runs
      .filter(r => r.flow_key === "profile_sent")
      .map(r => ({
        id:          r.id,
        doctorName:  r.doctor_name || "—",
        doctorEmail: r.doctor_email,
        specialty:   (r.metadata?.doctor_speciality as string | undefined) ?? null,
        hospital:    r.hospital,
        offeredAt:   r.started_at ?? r.last_event_at ?? null,
        by:          r.created_by,
        status:      r.status,
      })),
    [runs],
  );

  const hospitalNames = useMemo(
    () => Array.from(new Set(offers.map(o => o.hospital).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [offers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const rangeMs = range === "all" ? Infinity : Number(range) * 86_400_000;
    const list = offers.filter(o => {
      if (filterHospital !== "all" && o.hospital !== filterHospital) return false;
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (o.offeredAt && range !== "all" && now - new Date(o.offeredAt).getTime() > rangeMs) return false;
      if (q) {
        const hay = `${o.doctorName} ${o.specialty ?? ""} ${o.hospital ?? ""} ${o.doctorEmail ?? ""} ${o.by ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const cmp = (a.offeredAt ?? "").localeCompare(b.offeredAt ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [offers, search, filterHospital, filterStatus, range, sortDir]);

  useEffect(() => { setPage(1); }, [search, filterHospital, filterStatus, range, sortDir]);

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

  // How many distinct doctors have been offered something — a nicer headline
  // than raw send count (a doctor offered twice still counts once).
  const distinctDoctors = useMemo(
    () => new Set(filtered.map(o => (o.doctorEmail || o.doctorName).toLowerCase())).size,
    [filtered],
  );

  const exportCsv = () => {
    const header = ["Doctor", "Email", "Specialty", "Hospital", "Offered at", "By", "Status"];
    const rows = filtered.map(o => [
      o.doctorName, o.doctorEmail ?? "", o.specialty ?? "", o.hospital ?? "",
      o.offeredAt ?? "", o.by ?? "", statusMeta(o.status).label,
    ]);
    const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vacancy-offers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-teal-600" />
              Offer history
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Doctors emailed a working-opportunity intro to a hospital — logged automatically when you hit "Send" on a match.
              {offers.length > 0 && (
                <> <strong>{distinctDoctors}</strong> doctor{distinctDoctors === 1 ? "" : "s"} across <strong>{filtered.length}</strong> offer{filtered.length === 1 ? "" : "s"}.</>
              )}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor, specialty, hospital, sender..."
              className="pl-8 h-9 text-[12px]"
            />
          </div>
          <Select value={filterHospital} onValueChange={setFilterHospital}>
            <SelectTrigger className="h-9 w-[190px] text-[12px]"><SelectValue placeholder="All hospitals" /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="all">All hospitals</SelectItem>
              {hospitalNames.map(n => <SelectItem key={n} value={n} className="text-[12px]">{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as RunStatus | "all")}>
            <SelectTrigger className="h-9 w-[130px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Emailed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
            <SelectTrigger className="h-9 w-[130px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <TableSkeleton rows={5} cols={6} />}
        {!isLoading && filtered.length === 0 && (
          offers.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No offers sent yet"
              body="Open a vacancy, find a matching doctor, and hit Send — every working-opportunity email you send shows up here."
              size="md"
            />
          ) : (
            <EmptyState
              icon={Filter}
              title="No offers match your filters"
              body="Try clearing the hospital or status filter, or widening the date range."
              size="md"
            />
          )
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="py-2 px-4 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Doctor</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Specialty</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Hospital offered</th>
                  <th
                    className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide cursor-pointer select-none"
                    onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
                  >
                    <span className="inline-flex items-center gap-1 text-teal-700">Offered<ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">By</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(o => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <UserSquare className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {o.doctorName}
                      </div>
                      {o.doctorEmail && (
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5 pl-5">
                          <Mail className="h-2.5 w-2.5" /> {o.doctorEmail}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{o.specialty ?? "—"}</td>
                    <td className="py-2 px-3">{o.hospital ?? "—"}</td>
                    <td className="py-2 px-3 tabular-nums text-muted-foreground">{fmtDate(o.offeredAt)}</td>
                    <td className="py-2 px-3 text-[11px] text-muted-foreground">{o.by ?? "—"}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${statusMeta(o.status).cls}`}>
                        {statusMeta(o.status).label}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => navigate("/automations?flow=profile_sent")}
                        className="inline-flex items-center gap-1 text-teal-600 hover:underline text-[11px]"
                        title="Open this send in Automations"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

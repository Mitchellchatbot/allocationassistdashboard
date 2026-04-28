import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useZohoLeads, useDebounce, type LeadsFilters } from "@/hooks/use-zoho-leads";
import { useZohoData } from "@/hooks/use-zoho-data";
import { ArrowRight, AlertTriangle, CheckCircle, Clock, Search, Loader2, Check, X, ChevronDown, Phone, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InfoIcon } from "@/components/InfoIcon";
import { useState, useRef, useEffect, useMemo, Fragment } from "react";

// Short stage explanations.
const STAGE_HINTS: Record<string, string> = {
  "Not Contacted":                "Lead in Zoho with no recruiter outreach yet.",
  "Attempted to Contact":         "Recruiter tried at least once but hasn't connected.",
  "Initial Sales Call Completed": "Lead reached a real sales call. First qualified milestone.",
  "Follow-up Scheduled":          'Deferred conversation ("Contact in Future"). NOT qualified.',
  "Contact in Future":            "Deferred conversation. NOT counted as qualified.",
  "High Priority Follow up":      "Hot lead owes the team a callback. Qualified + converted.",
  "Closed Won":                   "Lead became a placement.",
  "Closed Lost":                  "Lead is dead — closed without a placement.",
  "Unqualified":                  "Lead doesn't meet our criteria.",
  "Unqualified Leads":            "Lead doesn't meet our criteria.",
  "Not Interested":               "Lead actively declined.",
};
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoPut } from "@/lib/zoho";
import { supabase } from "@/lib/supabase";


// ── Call log types ────────────────────────────────────────────────────────────

interface CallLog {
  id: string;
  call_date: string;
  status: string;
  notes: string;
  specialty: string;
  country_training: string;
  years_experience: number | null;
  created_at: string;
  // extras from doctor_sessions
  qualifications?: string;
  call_state?: string;
  meeting_type?: string;
  source?: "call_log" | "doctor_sessions";
}

const LOG_STATUS_STYLE: Record<string, string> = {
  "high potential":          "bg-success/10 text-success border-success/20",
  "converted":               "bg-success/20 text-success border-success/30",
  "follow up in the future": "bg-info/10 text-info border-info/20",
  "minimal follow up":       "bg-warning/10 text-warning border-warning/20",
  "declined":                "bg-destructive/10 text-destructive border-destructive/20",
  "unsure":                  "bg-muted text-muted-foreground border-border/50",
};

function logStatusStyle(status: string) {
  return LOG_STATUS_STYLE[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border/50";
}

// Strip "Dr.", "Prof.", leading/trailing spaces so name matching is robust
function normalizeName(name: string) {
  return name.replace(/^(dr\.|dr\s+|prof\.|prof\s+)/i, "").trim();
}

// ── Expandable call-log panel ─────────────────────────────────────────────────

function CallLogPanel({ doctorName }: { doctorName: string }) {
  const [logs, setLogs]       = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const name = normalizeName(doctorName);
    Promise.all([
      supabase
        .from("call_log")
        .select("id, call_date, status, notes, specialty, country_training, years_experience, created_at")
        .ilike("doctor_name", `%${name}%`)
        .order("created_at", { ascending: true }),
      supabase
        .from("doctor_sessions")
        .select("id, session_date, status, notes, specialty, country_training, qualifications, call_state, meeting_type, created_at")
        .ilike("doctor_name", `%${name}%`)
        .order("created_at", { ascending: true }),
    ]).then(([callRes, sessRes]) => {
      const callLogs: CallLog[] = (callRes.data ?? []).map(r => ({ ...r, source: "call_log" as const }));
      const sessLogs: CallLog[] = (sessRes.data ?? []).map(r => ({
        id:               r.id,
        call_date:        r.session_date ?? "",
        status:           r.status ?? "",
        notes:            r.notes ?? "",
        specialty:        r.specialty ?? "",
        country_training: r.country_training ?? "",
        years_experience: null,
        created_at:       r.created_at ?? "",
        qualifications:   r.qualifications ?? "",
        call_state:       r.call_state ?? "",
        meeting_type:     r.meeting_type ?? "",
        source:           "doctor_sessions" as const,
      }));
      // Merge and sort chronologically
      const merged = [...callLogs, ...sessLogs].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
      );
      setLogs(merged);
      setLoading(false);
    });
  }, [doctorName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-4 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading call history…
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-4 text-[11px] text-muted-foreground">
        <Phone className="h-3 w-3" /> No call log entries found for this doctor.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
        <Phone className="h-3 w-3" /> Call history · {logs.length} {logs.length === 1 ? "entry" : "entries"}
        {logs.some(l => l.source === "doctor_sessions") && (
          <span className="ml-1 text-[9px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5">+ session notes</span>
        )}
      </p>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50" />
        <div className="space-y-3 pl-5">
          {logs.map((log) => (
            <div key={log.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[18px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary/30 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>

              <div className="rounded-lg border border-border/40 bg-card px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />
                    {log.call_date || "—"}
                  </div>
                  <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${logStatusStyle(log.status)}`}>
                    {log.status}
                  </span>
                  {log.call_state && (
                    <span className="text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 capitalize">{log.call_state}</span>
                  )}
                  {log.meeting_type && (
                    <span className="text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">{log.meeting_type}</span>
                  )}
                  {log.years_experience != null && (
                    <span className="text-[10px] text-muted-foreground">{log.years_experience} yrs exp</span>
                  )}
                </div>
                {log.qualifications && (
                  <p className="text-[10px] text-muted-foreground mb-1">{log.qualifications}</p>
                )}
                {log.notes && (
                  <p className="text-[11px] text-foreground leading-relaxed">{log.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const statusConfig = {
  "on-track": { label: "On Track", className: "bg-success/10 text-success border-success/20", icon: CheckCircle },
  "at-risk": { label: "Needs Attention", className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  "delayed": { label: "Delayed", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  "closed":  { label: "Closed", className: "bg-muted text-muted-foreground border-border/50", icon: X },
};

const LeadsPipeline = () => {
  const { workflow } = useFilteredData();
  const { data: zoho } = useZohoData();
  // Read deep-link params (e.g. /leads-pipeline?stage=Not%20Contacted) so other
  // pages can link straight to a filtered view of the leads list.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(search, 300);
  const [filters, setFilters] = useState<LeadsFilters>({
    stage:     searchParams.get("stage")     ?? undefined,
    recruiter: searchParams.get("recruiter") ?? undefined,
    source:    searchParams.get("source")    ?? undefined,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [pendingId,  setPendingId]  = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setFilter = <K extends keyof LeadsFilters>(key: K, value: LeadsFilters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value || undefined }));

  const clearFilters = () => { setFilters({}); setSearch(""); };
  const hasActiveFilters = search || filters.stage || filters.recruiter || filters.badge || filters.source;

  // Build option lists from actual Zoho data — no hardcoding
  const leadStatuses = useMemo(() => {
    const seen = new Set<string>();
    for (const l of zoho?.rawLeads ?? []) {
      if (l.Lead_Status) seen.add(l.Lead_Status);
    }
    return Array.from(seen).sort();
  }, [zoho?.rawLeads]);

  const recruiters = useMemo(() => {
    const seen = new Set<string>();
    for (const l of zoho?.rawLeads ?? []) {
      if (l.Owner?.name) seen.add(l.Owner.name);
    }
    return Array.from(seen).sort();
  }, [zoho?.rawLeads]);

  const {
    doctors,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    totalCount,
  } = useZohoLeads(debouncedSearch, filters);

  const updateStatus = useMutation({
    mutationFn: ({ zohoId, newStatus }: { zohoId: string; newStatus: string }) =>
      zohoPut(`Leads/${zohoId}`, { data: [{ Lead_Status: newStatus }] }),
    onMutate: ({ zohoId }) => {
      setPendingId(zohoId);
      setErrorMsg(null);
    },
    onSuccess: (_data, { zohoId, newStatus }) => {
      setPendingId(null);

      // Show ✓ checkmark briefly
      setUpdatedIds(prev => new Set(prev).add(zohoId));
      setTimeout(() => {
        setUpdatedIds(prev => { const s = new Set(prev); s.delete(zohoId); return s; });
      }, 2000);

      // 1. Patch TanStack Query cache immediately so the UI updates without refetch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(['zoho-data'], (old: any) => {
        if (!old?.rawLeads) return old;
        return {
          ...old,
          rawLeads: old.rawLeads.map((l: { id: string }) =>
            l.id === zohoId ? { ...l, Lead_Status: newStatus } : l
          ),
        };
      });

      // 2. Patch Supabase cache in the background so the change survives a page reload
      void (async () => {
        const { data: cached } = await supabase
          .from('zoho_cache')
          .select('data')
          .eq('id', 1)
          .single();
        if (!cached?.data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cacheData = cached.data as any;
        const updatedLeads = (cacheData.leads ?? []).map((l: { id: string }) =>
          l.id === zohoId ? { ...l, Lead_Status: newStatus } : l
        );
        await supabase
          .from('zoho_cache')
          .update({ data: { ...cacheData, leads: updatedLeads } })
          .eq('id', 1);
      })();
    },
    onError: (_err, { zohoId }) => {
      setPendingId(null);
      setErrorMsg(`Failed to update lead ${zohoId.slice(-5).toUpperCase()} — check Zoho permissions or try again.`);
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  // Infinite scroll: fetch next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <DashboardLayout title="Doctor Progress" subtitle="Track each doctor's journey from application to placement">
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Where Doctors Are Right Now</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {workflow.map((stage, i) => {
              const hint = STAGE_HINTS[stage.name];
              return (
                <div key={stage.name} className="flex items-center gap-1.5">
                  <div className="relative rounded-lg border border-kpi/60 bg-kpi px-3 py-2.5 text-center min-w-[100px] hover:shadow-md hover:scale-[1.02] transition-all duration-200">
                    <p className="text-lg font-semibold text-foreground tabular-nums">{stage.count}</p>
                    <p className="text-[9px] text-muted-foreground leading-tight">{stage.name}</p>
                    {hint && (
                      <span className="absolute top-1 right-1">
                        <InfoIcon meaning={hint} source="Zoho CRM (Lead_Status)." size={11} side="bottom" />
                      </span>
                    )}
                  </div>
                  {i < workflow.length - 1 && <ArrowRight className="h-3 w-3 text-primary/30 shrink-0" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-col gap-2">
            {/* Row 1: title + search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                All Doctors
                {totalCount > 0 && (
                  <span className="ml-1 normal-case font-normal">
                    ({doctors.length.toLocaleString()} of {totalCount.toLocaleString()})
                  </span>
                )}
              </CardTitle>
              <div className="relative w-full sm:w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search name, specialty, recruiter, country, license, destination…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-7 text-[11px] bg-secondary/50 border-0"
                />
              </div>
            </div>

            {/* Row 2: filter dropdowns */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Stage filter */}
              <Select
                value={filters.stage ?? "__all__"}
                onValueChange={v => setFilter("stage", v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-secondary/50 border-0 gap-1">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-[11px]">All stages</SelectItem>
                  {leadStatuses.map(s => (
                    <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Recruiter filter */}
              <Select
                value={filters.recruiter ?? "__all__"}
                onValueChange={v => setFilter("recruiter", v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-secondary/50 border-0 gap-1">
                  <SelectValue placeholder="All recruiters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-[11px]">All recruiters</SelectItem>
                  {recruiters.map(r => (
                    <SelectItem key={r} value={r} className="text-[11px]">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Badge filter — pill buttons */}
              {(["on-track", "at-risk", "delayed"] as const).map(b => {
                const cfg = statusConfig[b];
                const BadgeIcon = cfg.icon;
                const active = filters.badge === b;
                return (
                  <button
                    key={b}
                    onClick={() => setFilter("badge", active ? "" : b)}
                    className={`h-7 inline-flex items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                      active ? cfg.className : "border-border/50 text-muted-foreground bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                );
              })}

              {/* Stage shortcut pills */}
              {([
                { status: "High Priority Follow up", label: "High Priority", className: "border-destructive/30 text-destructive bg-destructive/10", icon: AlertTriangle },
                { status: "Contact in Future",       label: "Contact in Future", className: "border-info/30 text-info bg-info/10",               icon: Clock },
              ] as const).map(({ status, label, className, icon: Icon }) => {
                const active = filters.stage === status;
                return (
                  <button
                    key={status}
                    onClick={() => setFilter("stage", active ? "" : status)}
                    className={`h-7 inline-flex items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                      active ? className : "border-border/50 text-muted-foreground bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                );
              })}

              {/* Active source pill (shown only when set, e.g. from a Marketing deep-link) */}
              {filters.source && (
                <button
                  onClick={() => setFilter("source", "")}
                  className="h-7 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 px-2 text-[10px] font-medium hover:bg-emerald-100 transition-colors"
                  title="Clear source filter"
                >
                  Source: {filters.source}
                  <X className="h-3 w-3" />
                </button>
              )}

              {/* Clear all */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="h-7 inline-flex items-center gap-1 rounded-md px-2 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {errorMsg && (
            <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
              {errorMsg}
            </div>
          )}
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground py-8 text-center">Loading leads…</p>
          ) : doctors.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-8 text-center">
              {hasActiveFilters ? "No doctors match your filters" : "No leads found"}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">ID</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Doctor</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Specialty</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Current Step (click to change)</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden md:table-cell">From → To</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">License Type</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">Sales Consultant</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Days in Step</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctors.map(doc => {
                      const st = statusConfig[doc.status];
                      const StIcon = st.icon;
                      return (
                        <Fragment key={doc.zohoId ?? doc.id}>
                          <TableRow className="hover:bg-muted/30">
                            <TableCell className="text-[10px] font-mono text-muted-foreground py-2.5">{doc.id}</TableCell>
                            <TableCell className="text-[12px] font-medium py-2.5">
                              <div
                                className="flex items-center gap-1 cursor-pointer select-none"
                                onClick={() => {
                                  const key = doc.zohoId ?? doc.id;
                                  setExpandedId(prev => prev === key ? null : key);
                                }}
                              >
                                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${expandedId === (doc.zohoId ?? doc.id) ? "rotate-180" : ""}`} />
                                {doc.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden sm:table-cell">{doc.specialty}</TableCell>
                            <TableCell className="py-2.5">
                              {doc.zohoId ? (
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={doc.leadStatus ?? ""}
                                    onValueChange={(newStatus) =>
                                      updateStatus.mutate({ zohoId: doc.zohoId!, newStatus })
                                    }
                                    disabled={pendingId === doc.zohoId}
                                  >
                                    <SelectTrigger className="h-6 w-[150px] text-[10px] border-border/50 bg-secondary/40 px-2 py-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {leadStatuses.map(s => (
                                        <SelectItem key={s} value={s} className="text-[11px]">
                                          {s}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {pendingId === doc.zohoId && (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                                  )}
                                  {doc.zohoId && updatedIds.has(doc.zohoId) && (
                                    <Check className="h-3 w-3 text-success shrink-0" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">{doc.stage}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground py-2.5 hidden md:table-cell">{doc.origin} → {doc.destination}</TableCell>
                            <TableCell className="text-[10px] font-medium py-2.5 hidden lg:table-cell">{doc.license}</TableCell>
                            <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden lg:table-cell">{doc.assignedTo}</TableCell>
                            <TableCell className="text-[12px] text-right font-medium py-2.5 tabular-nums">{doc.daysInStage}</TableCell>
                            <TableCell className="py-2.5">
                              <div className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${st.className}`}>
                                <StIcon className="h-2.5 w-2.5" />{st.label}
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedId === (doc.zohoId ?? doc.id) && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={9} className="p-0 border-b border-border/30">
                                <CallLogPanel doctorName={doc.name} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Sentinel for IntersectionObserver */}
              <div ref={sentinelRef} className="h-1" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading more…
                </div>
              )}

              {!hasNextPage && doctors.length > 0 && (
                <p className="text-center text-[11px] text-muted-foreground py-3">
                  All {doctors.length.toLocaleString()} doctors loaded
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default LeadsPipeline;

import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoPut } from "@/lib/zoho";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle, Clock, CheckCircle, Search,
  Phone, Calendar, ChevronDown, ChevronUp,
  Loader2, Check,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallLog {
  id: string;
  call_date: string;
  status: string;
  notes: string;
  specialty: string;
  country_training: string;
  years_experience: number | null;
  created_at: string;
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
const logStatusStyle = (s: string) =>
  LOG_STATUS_STYLE[s.toLowerCase()] ?? "bg-muted text-muted-foreground border-border/50";

function normalizeName(name: string) {
  return name.replace(/^(dr\.|dr\s+|prof\.|prof\s+)/i, "").trim();
}

// ── Call log panel (same logic as LeadsPipeline, self-contained) ──────────────

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
        id: r.id, call_date: r.session_date ?? "", status: r.status ?? "",
        notes: r.notes ?? "", specialty: r.specialty ?? "",
        country_training: r.country_training ?? "", years_experience: null,
        created_at: r.created_at ?? "", qualifications: r.qualifications ?? "",
        call_state: r.call_state ?? "", meeting_type: r.meeting_type ?? "",
        source: "doctor_sessions" as const,
      }));
      const merged = [...callLogs, ...sessLogs].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
      );
      setLogs(merged);
      setLoading(false);
    });
  }, [doctorName]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 px-4 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Loading call history…
    </div>
  );
  if (logs.length === 0) return (
    <div className="flex items-center gap-2 py-4 px-4 text-[11px] text-muted-foreground">
      <Phone className="h-3 w-3" /> No call log entries found.
    </div>
  );

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/30">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
        <Phone className="h-3 w-3" /> Call history · {logs.length} {logs.length === 1 ? "entry" : "entries"}
        {logs.some(l => l.source === "doctor_sessions") && (
          <span className="ml-1 text-[9px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5">+ session notes</span>
        )}
      </p>
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50" />
        <div className="space-y-3 pl-5">
          {logs.map((log) => (
            <div key={log.id} className="relative">
              <div className="absolute -left-[18px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary/30 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
              <div className="rounded-lg border border-border/40 bg-card px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />{log.call_date || "—"}
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

// ── Status change options ─────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  "High Priority Follow up",
  "Contact in Future",
  "Initial Sales Call Completed",
  "Not Contacted",
  "Attempted to Contact",
  "Unqualified",
  "Not Interested",
];

const TAB_STATUSES = {
  high:   "High Priority Follow up",
  future: "Contact in Future",
} as const;

type Tab = keyof typeof TAB_STATUSES;

// ── Main page ─────────────────────────────────────────────────────────────────

const FollowUps = () => {
  const { data: zoho }       = useZohoData();
  const queryClient          = useQueryClient();
  const [tab, setTab]        = useState<Tab>("high");
  const [search, setSearch]  = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [pendingId,  setPendingId]  = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [recruiterFilter, setRecruiterFilter] = useState("");

  const rawLeads = zoho?.rawLeads ?? [];

  // Counts for tab badges
  const highCount   = rawLeads.filter(l => l.Lead_Status === TAB_STATUSES.high).length;
  const futureCount = rawLeads.filter(l => l.Lead_Status === TAB_STATUSES.future).length;

  // Recruiter options
  const recruiters = useMemo(() => {
    const seen = new Set<string>();
    for (const l of rawLeads) if (l.Owner?.name) seen.add(l.Owner.name);
    return Array.from(seen).sort();
  }, [rawLeads]);

  // Filtered leads for current tab
  const leads = useMemo(() => {
    const targetStatus = TAB_STATUSES[tab];
    return rawLeads.filter(l => {
      if (l.Lead_Status !== targetStatus) return false;
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (recruiterFilter && l.Owner?.name !== recruiterFilter) return false;
      return true;
    });
  }, [rawLeads, tab, search, recruiterFilter]);

  // Sort: SLA-breached first for high priority tab
  const sorted = useMemo(() => {
    if (tab !== "high") return leads;
    return [...leads].sort((a, b) => {
      const daysA = (() => { const d = Math.max(1, Math.floor((Date.now() - new Date(a.Created_Time).getTime()) / 86_400_000)); return d <= 44 ? d : (d % 44) + 1; })();
      const daysB = (() => { const d = Math.max(1, Math.floor((Date.now() - new Date(b.Created_Time).getTime()) / 86_400_000)); return d <= 44 ? d : (d % 44) + 1; })();
      return daysB - daysA;
    });
  }, [leads, tab]);

  // Status update mutation (same pattern as LeadsPipeline — updates Zoho + cache)
  const updateStatus = useMutation({
    mutationFn: ({ zohoId, newStatus }: { zohoId: string; newStatus: string }) =>
      zohoPut(`Leads/${zohoId}`, { data: [{ Lead_Status: newStatus }] }),
    onMutate: ({ zohoId }) => { setPendingId(zohoId); setErrorMsg(null); },
    onSuccess: (_data, { zohoId, newStatus }) => {
      setPendingId(null);
      setUpdatedIds(prev => new Set(prev).add(zohoId));
      setTimeout(() => setUpdatedIds(prev => { const s = new Set(prev); s.delete(zohoId); return s; }), 2000);

      // Patch TanStack cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(["zoho-data"], (old: any) => {
        if (!old?.rawLeads) return old;
        return { ...old, rawLeads: old.rawLeads.map((l: { id: string }) => l.id === zohoId ? { ...l, Lead_Status: newStatus } : l) };
      });

      // Patch Supabase cache
      void (async () => {
        const { data: cached } = await supabase.from("zoho_cache").select("data").eq("id", 1).single();
        if (!cached?.data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cacheData = cached.data as any;
        const updatedLeads = (cacheData.leads ?? []).map((l: { id: string }) =>
          l.id === zohoId ? { ...l, Lead_Status: newStatus } : l
        );
        await supabase.from("zoho_cache").update({ data: { ...cacheData, leads: updatedLeads } }).eq("id", 1);
      })();
    },
    onError: (_err, { zohoId }) => {
      setPendingId(null);
      setErrorMsg(`Failed to update — try again.`);
      setTimeout(() => setErrorMsg(null), 4000);
      console.error("Status update error for", zohoId);
    },
  });

  return (
    <DashboardLayout title="Follow-ups" subtitle="All leads needing action — High Priority and Contact in Future in one place">

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-2 mb-4">
        {(["high", "future"] as Tab[]).map(t => {
          const count   = t === "high" ? highCount : futureCount;
          const active  = tab === t;
          const isHigh  = t === "high";
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                active
                  ? isHigh
                    ? "bg-destructive/10 border-destructive/40 text-destructive"
                    : "bg-info/10 border-info/40 text-info"
                  : "bg-card border-border/50 text-muted-foreground hover:border-border"
              }`}
            >
              {isHigh ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {isHigh ? "High Priority" : "Contact in Future"}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                active
                  ? isHigh ? "bg-destructive/20 text-destructive" : "bg-info/20 text-info"
                  : "bg-muted text-muted-foreground"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search doctors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-[12px] w-48"
          />
        </div>
        <Select
          value={recruiterFilter || "__all__"}
          onValueChange={v => setRecruiterFilter(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-[12px] w-44">
            <SelectValue placeholder="All consultants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All consultants</SelectItem>
            {recruiters.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || recruiterFilter) && (
          <button
            onClick={() => { setSearch(""); setRecruiterFilter(""); }}
            className="h-8 px-3 text-[12px] text-muted-foreground hover:text-foreground border border-border/50 rounded-md"
          >
            Clear
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-[12px] text-destructive">{errorMsg}</div>
      )}

      {/* ── SLA notice for high priority ── */}
      {tab === "high" && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          High Priority leads must be actioned within <strong className="mx-1">2 days</strong> — leads past SLA are shown first.
        </div>
      )}

      {/* ── Lead cards ── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            {sorted.length} {tab === "high" ? "High Priority" : "Contact in Future"} leads
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <CheckCircle className="h-8 w-8 text-success/40" />
              <p className="text-[13px]">All clear — no leads here right now.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {sorted.map(lead => {
                const name    = (lead.Full_Name || `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`).trim() || "—";
                const daysOld = Math.max(1, Math.floor((Date.now() - new Date(lead.Created_Time).getTime()) / 86_400_000));
                const daysInStage = daysOld <= 44 ? daysOld : (daysOld % 44) + 1;
                const slaBreached = tab === "high" && daysInStage > 2;
                const expanded    = expandedId === lead.id;
                const isPending   = pendingId === lead.id;
                const isUpdated   = updatedIds.has(lead.id);

                return (
                  <div key={lead.id}>
                    <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${slaBreached ? "bg-destructive/3" : ""}`}>

                      {/* Left: name + badges */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <button
                            onClick={() => setExpandedId(expanded ? null : lead.id)}
                            className="text-[13px] font-medium text-foreground hover:text-primary transition-colors text-left flex items-center gap-1"
                          >
                            {name}
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {slaBreached && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 border border-destructive/30 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                              <AlertTriangle className="h-2.5 w-2.5" /> SLA Breached
                            </span>
                          )}
                          {isUpdated && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 border border-success/30 px-1.5 py-0.5 text-[9px] font-semibold text-success">
                              <Check className="h-2.5 w-2.5" /> Updated
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {lead.Owner?.name && <span>👤 {lead.Owner.name}</span>}
                          {(lead.Specialty || lead.Specialty_New) && <span>🏥 {lead.Specialty || lead.Specialty_New}</span>}
                          {lead.Country_of_Specialty_training && <span>🌍 {lead.Country_of_Specialty_training}</span>}
                          <span className={`font-medium ${slaBreached ? "text-destructive" : "text-muted-foreground"}`}>
                            {daysInStage}d in stage
                          </span>
                        </div>
                      </div>

                      {/* Right: status dropdown */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        <Select
                          value={lead.Lead_Status}
                          disabled={isPending}
                          onValueChange={newStatus => {
                            if (newStatus !== lead.Lead_Status) {
                              updateStatus.mutate({ zohoId: lead.id, newStatus });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-52 border-border/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(s => (
                              <SelectItem key={s} value={s} className="text-[12px]">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Expandable call log */}
                    {expanded && <CallLogPanel doctorName={name} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default FollowUps;

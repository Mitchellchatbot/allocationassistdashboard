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
  Loader2, Check, Flame, StickyNote, PhoneCall,
} from "lucide-react";
import { useVacancies } from "@/hooks/use-vacancies";
import { rollupSpecialty } from "@/lib/specialty-groups";
import { detectLicenses } from "@/lib/license-info";
import { scoreFollowUp, FOLLOWUP_STALE_CAP_DAYS } from "@/lib/followup-rank";
import { noteIndicatesContact } from "@/lib/lead-contact";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";

const PAGE_SIZE = 30;

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

/** Whole days since the lead was last touched in Zoho (Modified_Time, falling
 *  back to Created_Time until the next sync populates Modified_Time). null if
 *  unparseable. Honest — no modulo tricks. */
function daysSinceTouched(lead: { Modified_Time?: string | null; Created_Time?: string | null }): number | null {
  const iso = lead.Modified_Time || lead.Created_Time;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
function recencyLabel(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "today";
  return d === 1 ? "1d ago" : `${d}d ago`;
}
/** Colour grade: stale (>14d) red, ageing (>4d) amber, fresh slate. Replaces the
 *  old "SLA Breached on every row" flood with a graded, scannable signal. */
function recencyTone(d: number | null): string {
  if (d === null) return "text-slate-500 bg-slate-50 border-slate-200";
  if (d > 14) return "text-rose-700 bg-rose-50 border-rose-200";
  if (d > 4)  return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-600 bg-slate-100 border-slate-200";
}
function initialsOf(name: string): string {
  const parts = normalizeName(name).split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
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

// ── Expanded lead panel — Zoho note first (instant), call history on demand ──

function LeadExpandPanel({ lead, name }: {
  lead: { latest_note?: string | null; latest_note_at?: string | null };
  name: string;
}) {
  const [showCalls, setShowCalls] = useState(false);
  const note = lead.latest_note?.trim();
  const noteDate = lead.latest_note_at ? new Date(lead.latest_note_at) : null;
  return (
    <div className="border-t border-border/30 bg-muted/20">
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <StickyNote className="h-3 w-3" /> Latest Zoho note
          {noteDate && !Number.isNaN(noteDate.getTime()) && (
            <span className="font-normal normal-case text-muted-foreground/70">· {noteDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          )}
        </p>
        {note
          ? <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap rounded-lg border border-border/40 bg-card px-3 py-2">{note}</p>
          : <p className="text-[11px] text-muted-foreground italic">No Zoho note synced for this lead yet. (Notes appear after the next Zoho sync.)</p>}
        {!showCalls && (
          <button onClick={() => setShowCalls(true)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
            <Phone className="h-3 w-3" /> Show full call history
          </button>
        )}
      </div>
      {showCalls && <CallLogPanel doctorName={name} />}
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
  calls:  "Initial Sales Call Completed",
} as const;

type Tab = keyof typeof TAB_STATUSES;

const TAB_META: Record<Tab, { label: string; Icon: typeof AlertTriangle; activeCls: string; badgeActiveCls: string }> = {
  high:   { label: "High Priority",     Icon: AlertTriangle, activeCls: "bg-destructive/10 border-destructive/40 text-destructive", badgeActiveCls: "bg-destructive/20 text-destructive" },
  future: { label: "Contact in Future", Icon: Clock,         activeCls: "bg-info/10 border-info/40 text-info",                       badgeActiveCls: "bg-info/20 text-info" },
  calls:  { label: "Initial Sales Call", Icon: PhoneCall,    activeCls: "bg-primary/10 border-primary/40 text-primary",              badgeActiveCls: "bg-primary/20 text-primary" },
};

// ── Main page ─────────────────────────────────────────────────────────────────

const FollowUps = () => {
  const { data: zoho }       = useZohoData();
  const { data: vacancies = [] } = useVacancies();
  const queryClient          = useQueryClient();
  const [tab, setTab]        = useState<Tab>("high");
  const [search, setSearch]  = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [pendingId,  setPendingId]  = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [recruiterFilter, setRecruiterFilter] = useState("");
  const [noteFilter, setNoteFilter] = useState<"contacted" | "uncontacted">("contacted");
  const [page, setPage] = useState(1);

  const rawLeads = zoho?.rawLeads ?? [];

  // Counts for tab badges
  const tabCounts: Record<Tab, number> = {
    high:   rawLeads.filter(l => l.Lead_Status === TAB_STATUSES.high).length,
    future: rawLeads.filter(l => l.Lead_Status === TAB_STATUSES.future).length,
    calls:  rawLeads.filter(l => l.Lead_Status === TAB_STATUSES.calls).length,
  };

  // Recruiter options
  const recruiters = useMemo(() => {
    const seen = new Set<string>();
    for (const l of rawLeads) if (l.Owner?.name) seen.add(l.Owner.name);
    return Array.from(seen).sort();
  }, [rawLeads]);

  // Filtered leads (status + search + recruiter — NOT the contact-note split,
  // so its counts reflect the whole section). Search is GLOBAL: with a query we
  // look across all three sections (and across name/specialty/owner/country);
  // with no query we stay within the active tab.
  const searching = search.trim().length > 0;
  const tabLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const targetStatus = TAB_STATUSES[tab];
    const sectionStatuses = new Set<string>(Object.values(TAB_STATUSES));
    return rawLeads.filter(l => {
      if (q ? !sectionStatuses.has(l.Lead_Status) : l.Lead_Status !== targetStatus) return false;
      if (q) {
        const hay = [
          l.Full_Name, l.First_Name, l.Last_Name, l.Specialty, l.Specialty_New,
          l.Owner?.name, l.Country_of_Specialty_training,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (recruiterFilter && l.Owner?.name !== recruiterFilter) return false;
      return true;
    });
  }, [rawLeads, tab, search, recruiterFilter]);

  // Hard age cap — drop cold leads with no activity in FOLLOWUP_STALE_CAP_DAYS
  // (so years-old leads stop surfacing).
  const ageCapped = useMemo(
    () => tabLeads.filter(l => (daysSinceTouched(l) ?? 0) <= FOLLOWUP_STALE_CAP_DAYS),
    [tabLeads],
  );
  const coldHidden = tabLeads.length - ageCapped.length;

  // Split each section by whether the lead's LATEST Zoho note reads like a
  // contact attempt ("no answer", "spoke", "voicemail"…). Every lead in these
  // tabs has a status past "Not Contacted", so status can't tell them apart —
  // the note text can. Lets a rep work the already-reached doctors separately.
  const contactedCount = useMemo(
    () => ageCapped.filter(l => noteIndicatesContact(l.latest_note)).length,
    [ageCapped],
  );
  const noNoteCount = ageCapped.length - contactedCount;

  const leads = useMemo(
    () => noteFilter === "contacted"
      ? ageCapped.filter(l =>  noteIndicatesContact(l.latest_note))
      : ageCapped.filter(l => !noteIndicatesContact(l.latest_note)),
    [ageCapped, noteFilter],
  );

  // Open vacancies per specialty group → graded demand signal for ranking.
  const demandCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vacancies) {
      if (v.status !== "open") continue;
      const g = rollupSpecialty(v.specialty);
      if (g) m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  }, [vacancies]);

  // Rank by smart priority score (urgency + open-vacancy demand + freshness +
  // source), tie-broken by least-recently-touched.
  const ranked = useMemo(() => {
    const truthy = (v: string | null) => !!v && !/^(no|false|0|n)$/i.test(v.trim());
    const items = leads.map(lead => ({
      lead,
      rank: scoreFollowUp({
        daysSinceTouched: daysSinceTouched(lead),
        specialty:        lead.Specialty || lead.Specialty_New,
        demandCounts,
        licenseCount: detectLicenses({
          has_dha:      truthy(lead.Has_DHA),
          has_doh:      truthy(lead.Has_DOH),
          has_moh:      truthy(lead.Has_MOH),
          license_text: lead.License,
        }).length,
      }),
    }));
    items.sort((a, b) => b.rank.score - a.rank.score
      || (daysSinceTouched(b.lead) ?? -1) - (daysSinceTouched(a.lead) ?? -1));
    return items;
  }, [leads, demandCounts]);

  useEffect(() => { setPage(1); }, [tab, noteFilter, search, recruiterFilter]);
  useEffect(() => { setExpandedId(null); }, [page]);

  const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = ranked.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (safePage > 3) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) out.push(i);
    if (safePage < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

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
    <DashboardLayout title="Follow-ups" subtitle="All leads needing action — High Priority and Contact in Future in one place" docSlug="sales/follow-ups">

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" data-tour="followups-tabs">
        {(["high", "future", "calls"] as Tab[]).map(t => {
          const meta   = TAB_META[t];
          const active = tab === t;
          const Icon   = meta.Icon;
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium transition-all ${
                active ? meta.activeCls : "bg-card border-border/50 text-muted-foreground hover:border-border"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                active ? meta.badgeActiveCls : "bg-muted text-muted-foreground"
              }`}>{tabCounts[t]}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search all sections…"
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

        {/* Contact-note split — works inside whichever section (tab) is active */}
        <div className="inline-flex h-8 rounded-md border border-border/60 overflow-hidden text-[11px] font-medium ml-auto self-center">
          {([
            { v: "contacted",   label: "Contacted", count: contactedCount },
            { v: "uncontacted", label: "No note",   count: noNoteCount },
          ] as const).map(opt => {
            const active = noteFilter === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => { setNoteFilter(opt.v); setExpandedId(null); }}
                title={opt.v === "contacted"
                  ? "Doctors whose latest Zoho note reads like a contact attempt (no answer, spoke, voicemail…)"
                  : "Doctors with no contact-style Zoho note yet"}
                className={`flex items-center gap-1.5 px-2.5 transition-colors ${active ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
              >
                {opt.v === "contacted" && <PhoneCall className="h-3 w-3" />}
                {opt.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>{opt.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-[12px] text-destructive">{errorMsg}</div>
      )}

      {/* ── Ranking note ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 border border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <Flame className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="truncate">Ranked by priority — timing (peaks at ~2 months), plus open-vacancy demand &amp; Gulf licenses held.</span>
          {coldHidden > 0 && (
            <span className="ml-1 shrink-0 text-muted-foreground/70">· {coldHidden} cold hidden (no activity in {Math.round(FOLLOWUP_STALE_CAP_DAYS / 30)} months)</span>
          )}
        </div>
        {searching && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-primary font-medium">
            <Search className="h-3 w-3" /> Searching all sections
          </span>
        )}
      </div>

      {/* ── Lead cards ── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            {ranked.length}{" "}{searching ? "matches · all sections" : `${TAB_META[tab].label} leads`}
            {noteFilter === "contacted"   && <span className="text-emerald-600"> · with a contact note</span>}
            {noteFilter === "uncontacted" && <span className="normal-case"> · no contact note yet</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ranked.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <CheckCircle className="h-8 w-8 text-success/40" />
              <p className="text-[13px]">
                {noteFilter === "contacted"
                  ? "No doctors in this section have a contact-style Zoho note yet."
                  : noteFilter === "uncontacted"
                  ? "Every doctor in this section already has a contact note."
                  : "All clear — no leads here right now."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginated.map(({ lead, rank }) => {
                const name    = (lead.Full_Name || `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`).trim() || "—";
                const recency = daysSinceTouched(lead);
                const specialty = lead.Specialty || lead.Specialty_New;
                const expanded    = expandedId === lead.id;
                const isPending   = pendingId === lead.id;
                const isUpdated   = updatedIds.has(lead.id);

                return (
                  <div key={lead.id}>
                    <div className="px-4 py-3 flex items-center gap-3 transition-colors hover:bg-muted/30">

                      {/* Avatar */}
                      <div className="h-9 w-9 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-[12px] font-semibold shrink-0">
                        {initialsOf(name)}
                      </div>

                      {/* Name + metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => setExpandedId(expanded ? null : lead.id)}
                            className="text-[13px] font-medium text-foreground hover:text-primary transition-colors text-left flex items-center gap-1"
                          >
                            {name}
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {isUpdated && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 border border-success/30 px-1.5 py-0.5 text-[9px] font-semibold text-success">
                              <Check className="h-2.5 w-2.5" /> Updated
                            </span>
                          )}
                          {noteIndicatesContact(lead.latest_note) && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"
                              title="Latest Zoho note reads like a contact attempt"
                            >
                              <PhoneCall className="h-2.5 w-2.5" /> Contacted
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          {lead.Owner?.name && <span className="truncate max-w-[140px]">{lead.Owner.name}</span>}
                          {specialty && <><span className="text-border">·</span><span className="truncate max-w-[160px]">{specialty}</span></>}
                          {lead.Country_of_Specialty_training && <><span className="text-border">·</span><span className="truncate max-w-[120px]">{lead.Country_of_Specialty_training}</span></>}
                        </div>
                      </div>

                      {/* Priority badge + recency chip + status dropdown */}
                      <div className="shrink-0 flex items-center gap-2.5">
                        {rank.tier !== "normal" && (
                          <span
                            className={`hidden md:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              rank.tier === "high"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-sky-50 text-sky-700 border border-sky-100"
                            }`}
                            title={`${rank.factors.map(f => `${f.label} +${f.points}`).join(" · ")}  →  priority ${rank.score}`}
                          >
                            {rank.headline}
                            {rank.factors.length > 1 && <span className="opacity-60">· {rank.score}</span>}
                          </span>
                        )}
                        {recency !== null && (
                          <span
                            className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${recencyTone(recency)}`}
                            title="Time since this lead was last updated in Zoho"
                          >
                            {recencyLabel(recency)}
                          </span>
                        )}
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

                    {/* Expandable: Zoho note first (instant), call history on demand */}
                    {expanded && <LeadExpandPanel lead={lead} name={name} />}
                  </div>
                );
              })}
            </div>
          )}
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
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default FollowUps;

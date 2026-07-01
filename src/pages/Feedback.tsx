import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Bug, Lightbulb, Search, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, X, Loader2, Image as ImageIcon, Monitor, Globe, User, Clock,
} from "lucide-react";
import {
  useFeedbackList, useUpdateFeedbackStatus,
  type FeedbackRow, type FeedbackStatus, type FeedbackType,
} from "@/hooks/use-feedback";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New", triaged: "Triaged", in_progress: "In progress", done: "Done", wont_fix: "Won't fix",
};
const STATUS_ORDER: FeedbackStatus[] = ["new", "triaged", "in_progress", "done", "wont_fix"];
const STATUS_STYLE: Record<FeedbackStatus, string> = {
  new:         "bg-sky-50 text-sky-700 border-sky-200",
  triaged:     "bg-violet-50 text-violet-700 border-violet-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  done:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  wont_fix:    "bg-slate-100 text-slate-500 border-slate-200",
};

interface CapturedError { kind?: string; message?: string; source?: string; stack?: string; route?: string; time?: number }

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const rel = s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return `${rel} · ${d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

export default function Feedback() {
  const { data: rows = [], isLoading } = useFeedbackList(true);
  const [typeFilter, setTypeFilter]   = useState<"all" | FeedbackType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus | "open">("open");
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const counts = useMemo(() => {
    const openBugs = rows.filter(r => r.type === "bug" && r.status !== "done" && r.status !== "wont_fix").length;
    const ideas    = rows.filter(r => r.type === "idea").length;
    const done     = rows.filter(r => r.status === "done").length;
    return { total: rows.length, openBugs, ideas, done };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter === "open" ? (r.status === "done" || r.status === "wont_fix")
        : statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q) {
        const hay = `${r.message} ${r.page_label ?? ""} ${r.reporter_email ?? ""} ${r.route ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, statusFilter, search]);

  return (
    <DashboardLayout title="Feedback & Bug Reports" subtitle="Everything reported from the app — bugs, ideas, screenshots, and the exact context each one happened in">

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi label="Open bugs" value={counts.openBugs} tone="rose" Icon={Bug} />
        <Kpi label="Ideas"     value={counts.ideas}    tone="amber" Icon={Lightbulb} />
        <Kpi label="Resolved"  value={counts.done}     tone="emerald" Icon={ChevronRight} />
        <Kpi label="Total"     value={counts.total}    tone="slate" Icon={ImageIcon} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search reports…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-[12px] w-52" />
        </div>
        <Seg value={typeFilter} onChange={setTypeFilter} options={[["all", "All"], ["bug", "Bugs"], ["idea", "Ideas"]]} />
        <Seg value={statusFilter} onChange={setStatusFilter} options={[["open", "Open"], ["all", "All"], ...STATUS_ORDER.map(s => [s, STATUS_LABEL[s]] as [string, string])]} />
        <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} shown</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading reports…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-[13px] text-muted-foreground">No reports match these filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => <ReportCard key={r.id} r={r} onLightbox={setLightbox} />)}
        </div>
      )}

      {/* Screenshot lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}><X className="h-6 w-6" /></button>
          <img src={lightbox} alt="screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </DashboardLayout>
  );
}

function ReportCard({ r, onLightbox }: { r: FeedbackRow; onLightbox: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useUpdateFeedbackStatus();
  const ctx = (r.context ?? {}) as Record<string, unknown>;
  const errors = Array.isArray(ctx.errors) ? (ctx.errors as CapturedError[]) : [];

  return (
    <Card className="shadow-sm border-border/50 overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${r.type === "bug" ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-500"}`}>
              {r.type === "bug" ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-foreground leading-snug whitespace-pre-wrap break-words">{r.message}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {r.page_label && <span className="inline-flex items-center gap-1">📍 <span className="font-medium text-foreground/80">{r.page_label}</span>{r.route && <code className="text-[10px] text-muted-foreground/70">{r.route}</code>}</span>}
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtWhen(r.created_at)}</span>
                {r.reporter_email && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{r.reporter_email}</span>}
                {errors.length > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{errors.length} error{errors.length === 1 ? "" : "s"}</span>}
              </div>
            </div>
            <select
              value={r.status}
              onChange={e => updateStatus.mutate({ id: r.id, status: e.target.value as FeedbackStatus })}
              className={`shrink-0 text-[11px] font-medium rounded-full border px-2 py-1 ${STATUS_STYLE[r.status]}`}
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          {/* Screenshots */}
          {r.screenshots?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.screenshots.map((url, i) => (
                <button key={i} type="button" onClick={() => onLightbox(url)} className="group relative">
                  <img src={url} alt={`screenshot ${i + 1}`} className="h-24 w-32 object-cover rounded-lg border border-border/60 group-hover:border-teal-300 transition-colors" />
                  <span className="absolute inset-0 rounded-lg bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* Technical details toggle */}
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Technical details
          </button>
        </div>

        {expanded && (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/40 bg-muted/20">
            {/* Environment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-3">
              {typeof ctx.url === "string" && (
                <Detail Icon={Globe} label="URL">
                  <a href={ctx.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline inline-flex items-center gap-0.5 break-all">{ctx.url} <ExternalLink className="h-2.5 w-2.5 shrink-0" /></a>
                </Detail>
              )}
              {typeof ctx.viewport === "string" && <Detail Icon={Monitor} label="Viewport">{ctx.viewport}</Detail>}
              {typeof ctx.userAgent === "string" && <Detail Icon={Monitor} label="Browser"><span className="break-all">{ctx.userAgent}</span></Detail>}
              {r.section && <Detail Icon={Globe} label="Section">{r.section}</Detail>}
            </div>

            {/* Captured errors */}
            {errors.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Captured errors</p>
                <div className="space-y-1.5">
                  {errors.map((er, i) => (
                    <div key={i} className="rounded-md border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5">
                      <p className="text-[11px] font-mono text-amber-900 break-words">{er.message}</p>
                      {er.source && <p className="text-[10px] font-mono text-amber-700/80 mt-0.5">{er.source}</p>}
                      {er.stack && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-amber-700/70 cursor-pointer">stack</summary>
                          <pre className="mt-1 text-[9.5px] font-mono text-amber-800/80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{er.stack}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Page-context snapshot (what the page registered about itself) */}
            {ctx.pageData != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Page context</p>
                <pre className="text-[10px] font-mono text-slate-600 bg-card border border-border/50 rounded-md p-2 whitespace-pre-wrap break-words max-h-52 overflow-y-auto">{JSON.stringify(ctx.pageData, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ Icon, label, children }: { Icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="text-muted-foreground/60 shrink-0 inline-flex items-center gap-1 w-16"><Icon className="h-3 w-3" />{label}</span>
      <span className="text-foreground/80 min-w-0">{children}</span>
    </div>
  );
}

function Kpi({ label, value, tone, Icon }: { label: string; value: number; tone: "rose" | "amber" | "emerald" | "slate"; Icon: typeof Bug }) {
  const styles: Record<string, string> = {
    rose: "text-rose-500 bg-rose-50", amber: "text-amber-500 bg-amber-50",
    emerald: "text-emerald-500 bg-emerald-50", slate: "text-slate-500 bg-slate-100",
  };
  return (
    <Card className="shadow-sm border-border/50">
      <CardContent className="p-3.5 flex items-center gap-3">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${styles[tone]}`}><Icon className="h-4 w-4" /></span>
        <div>
          <p className="text-[20px] font-bold text-foreground leading-none tabular-nums">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-[11px] font-medium">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v as T)}
          className={`px-2.5 py-1.5 transition-colors ${value === v ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

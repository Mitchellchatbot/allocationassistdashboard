import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, memo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useFathomCalls, useFathomCall, useFathomCallStats, useFathomHosts, useFathomAutoSync, useFathomSync, useSummarizeCall, useCallInsights,
  type FathomCall,
} from "@/hooks/use-fathom-calls";
import { isSalesRepHost } from "@/lib/sales-team";
import { Button } from "@/components/ui/button";
import {
  PhoneCall, Loader2, Search, ExternalLink, Sparkles,
  X, Mic, FileText, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";
// react-markdown + remark-gfm are only needed inside the call detail drawer's
// summary tab, which mounts on demand. Lazy-load them so they don't land in the
// Calls route's initial chunk. The wrapper bakes in the same remarkGfm plugin so
// the usage site passes identical props (remarkPlugins + custom components).
const SummaryMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);
  return {
    default: (props: React.ComponentProps<typeof ReactMarkdown>) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} {...props} />
    ),
  };
});

// ─── Candy palette ───────────────────────────────────────────────────────────
// Mirrors the dashboard's ExpandableKPICard look:
//   bg = soft pastel card fill (e.g. bg-blue-50)
//   fg = saturated text colour (e.g. text-blue-600)
//   stripe = top color accent bar (e.g. bg-blue-600)
// Tailwind ships every {color}-50/600 stop so all classes work out of the box.

const CANDY = {
  pink:    { bg: "bg-pink-50",    fg: "text-pink-600",    stripe: "bg-pink-600",    chip: "bg-pink-100" },
  mint:    { bg: "bg-emerald-50", fg: "text-emerald-600", stripe: "bg-emerald-600", chip: "bg-emerald-100" },
  sky:     { bg: "bg-sky-50",     fg: "text-sky-600",     stripe: "bg-sky-600",     chip: "bg-sky-100" },
  peach:   { bg: "bg-amber-50",   fg: "text-amber-600",   stripe: "bg-amber-600",   chip: "bg-amber-100" },
  lilac:   { bg: "bg-violet-50",  fg: "text-violet-600",  stripe: "bg-violet-600",  chip: "bg-violet-100" },
  rose:    { bg: "bg-rose-50",    fg: "text-rose-600",    stripe: "bg-rose-600",    chip: "bg-rose-100" },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(ms: number | null, nowTick: number): string {
  if (!ms) return "syncing…";
  const diff = nowTick - ms;
  if (diff < 5_000)    return "just now";
  if (diff < 60_000)   return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function hostInitials(c: FathomCall): string {
  const src = c.host_name || c.host_email || "";
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

// Fathom action items vary in shape: the text may live under
// text/description/title/action and the assignee is often a user OBJECT
// ({name,team,email}). Coerce both to strings so we never render a raw object
// (which crashes React) and so the recap panel + drawer share one parser.
interface NormAction { text: string; assignee: string | null; }
function normActions(items: unknown): NormAction[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((a): NormAction => {
      const item = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;
      const rawText = typeof a === "string" ? a : (item.text ?? item.description ?? item.title ?? item.action ?? "");
      const text = typeof rawText === "string" ? rawText : JSON.stringify(rawText);
      const asg = item.assignee;
      const assignee = typeof asg === "string" ? asg
        : (asg && typeof asg === "object"
            ? ((asg as { name?: string; display_name?: string }).name ?? (asg as { display_name?: string }).display_name ?? null)
            : null);
      return { text: text.trim(), assignee };
    })
    .filter(a => a.text.length > 0);
}

// Strip the markdown Fathom emits (links, bold, headings, bullets) to plain
// text — used for the one-line TL;DR peek.
function stripMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")  // [text](url) -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1")         // **bold** -> bold
    .replace(/[*_`>#]/g, "")                    // stray markdown
    .replace(/^\s*[-•]\s*/, "")                 // leading bullet
    .trim();
}

// First substantial line of a summary — the "Meeting Purpose" sentence in
// Fathom's format — so we can peek the gist without opening the call.
function summaryTldr(summary: string | null): string | null {
  if (!summary) return null;
  const lines = summary.split("\n");
  for (const raw of lines) {
    const line = stripMd(raw);
    if (line.length >= 20 && !/^(meeting purpose|key takeaways?|topics?|next steps?)$/i.test(line)) return line;
  }
  for (const raw of lines) {
    const line = stripMd(raw);
    if (line) return line;
  }
  return null;
}

// Tick every second so the "synced 4s ago" pill stays live.
function useNowTick(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Calls() {
  const [search,     setSearch]     = useState("");
  const [hostFilter, setHostFilter] = useState<string>("");
  const [activeId,   setActiveId]   = useState<string | null>(null);

  // Host roster across the WHOLE table. The Calls page is scoped to the SALES
  // TEAM — Abraham, Asser, Asim (Ammar 2026-06-10: "just show calls for these
  // people"). Match Fathom hosts to the reps by name/email, then restrict
  // every query below to their host_emails.
  const { data: hostList = [], isLoading: hostsLoading } = useFathomHosts();
  const salesHosts  = useMemo(() => hostList.filter(h => isSalesRepHost(h.name, h.email)), [hostList]);
  const salesEmails = useMemo(() => salesHosts.map(h => h.email), [salesHosts]);

  // A single rep chosen from the dropdown narrows to them; otherwise show all
  // of the sales team's calls. Empty array (roster still loading / no rep
  // hosts) → matches nothing, which is correct.
  const scopedHosts = useMemo(
    () => (hostFilter ? [hostFilter] : salesEmails),
    [hostFilter, salesEmails],
  );

  const filters = useMemo(() => ({
    search: search || null,
    hosts:  scopedHosts,
  }), [search, scopedHosts]);

  const { data: calls, isLoading, error, isFetching } = useFathomCalls(filters);
  // Real totals over the scoped set (the list itself caps at 500 rows).
  const { data: callStats } = useFathomCallStats(useMemo(() => ({ hosts: scopedHosts }), [scopedHosts]));
  const { lastSyncAt, syncing, lastError, enriching } = useFathomAutoSync();
  const manualSync = useFathomSync();

  // Stable open handler so memoized rows don't re-render when their props are
  // unchanged (setActiveId is stable, so this closure never changes identity).
  const openCall = useCallback((fathomId: string) => setActiveId(fathomId), []);

  // Pre-decorate every table row once per data change — the page re-renders
  // every second (live sync pill), so we keep the per-row regex/parse work out
  // of the render path. This is the SINGLE parse pass for normActions/summaryTldr:
  // the recap memos below derive from these rows instead of re-parsing `calls`.
  const decoratedRows = useMemo(
    () => (calls ?? []).map(c => {
      const actions = normActions(c.action_items);
      const tldr    = summaryTldr(c.summary);
      return {
        call:          c,
        actions,
        tldr,
        hasSummary:    !!c.summary,
        hasTranscript: !!(c.transcript_plaintext || c.transcript_segments?.length),
        actionCount:   actions.length,
      };
    }),
    [calls],
  );

  // Recap panels built from the loaded list (newest first) — an at-a-glance
  // "what to follow up on + what just happened" without opening each call.
  // Both draw from the most recent calls that actually carry the data, so the
  // panels never pad themselves with empty rows. Derived from decoratedRows
  // (same order) so normActions/summaryTldr are only parsed once, above.
  const recentActionGroups = useMemo(() => {
    const groups: Array<{ call: FathomCall; items: NormAction[] }> = [];
    for (const r of decoratedRows) {
      if (r.actions.length) groups.push({ call: r.call, items: r.actions });
      if (groups.length >= 3) break;
    }
    return groups;
  }, [decoratedRows]);

  const latestSummaries = useMemo(() => {
    const out: Array<{ call: FathomCall; tldr: string }> = [];
    for (const r of decoratedRows) {
      if (r.tldr) out.push({ call: r.call, tldr: r.tldr });
      if (out.length >= 3) break;
    }
    return out;
  }, [decoratedRows]);

  return (
    <DashboardLayout
      title="Calls"
      subtitle="Sales team recorded calls (Abraham, Asser, Asim) — transcripts from Fathom, AI summaries auto-generated"
      docSlug="sales/calls"
    >
      {/* ── Top bar: search, host filter, live auto-sync indicator ───────── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4" data-tour="calls-toolbar">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search title, summary, transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-[12px]"
            />
          </div>
          <Select value={hostFilter || "all"} onValueChange={(v) => setHostFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 text-[12px] w-[180px]">
              <SelectValue placeholder="All hosts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">All hosts</SelectItem>
              {salesHosts.map(h => (
                <SelectItem key={h.email} value={h.email} className="text-[12px]">{h.name} ({h.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => manualSync.mutate(undefined)}
            disabled={manualSync.isPending}
            className="h-8 text-[12px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${manualSync.isPending ? "animate-spin" : ""}`} />
            {manualSync.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <AutoSyncPill syncing={syncing || manualSync.isPending} lastSyncAt={lastSyncAt} />
        </div>
      </div>

      {/* Auto-sync background error — surface so we don't silently fail */}
      {lastError && !manualSync.isError && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 text-rose-700 text-[11px] border border-rose-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono break-all">Auto-sync error: {lastError}</span>
        </div>
      )}

      {/* Manual sync feedback so we can see what Fathom returned */}
      {manualSync.isError && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 text-rose-700 text-[11px] border border-rose-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono break-all">{(manualSync.error as Error)?.message ?? "Sync failed"}</span>
        </div>
      )}
      {manualSync.isSuccess && manualSync.data && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Synced {manualSync.data.synced} call{manualSync.data.synced === 1 ? "" : "s"} across {manualSync.data.pages} page{manualSync.data.pages === 1 ? "" : "s"}
          {typeof (manualSync.data as unknown as { raw?: number }).raw === "number" && (
            <span className="text-emerald-600"> · {(manualSync.data as unknown as { raw: number }).raw} returned by Fathom</span>
          )}
        </div>
      )}

      {/* ── AI insights: cross-call synthesis (on demand) ─────────────────── */}
      {!search.trim() && <CallInsightsPanel hostEmails={scopedHosts} onOpenCall={setActiveId} />}

      {/* ── Recap: action items + summary peeks from the most recent calls ─── */}
      {(recentActionGroups.length > 0 || latestSummaries.length > 0) && !search.trim() && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Action items from the latest calls */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.peach.chip} ${CANDY.peach.fg}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                Action items · recent calls
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {recentActionGroups.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-4 py-4">No action items on recent calls yet.</p>
              ) : recentActionGroups.map(({ call, items }) => (
                <button
                  key={call.fathom_id}
                  onClick={() => setActiveId(call.fathom_id)}
                  className="block w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[12px] font-medium text-foreground truncate">
                      {call.title || call.matched_doctor_name || "Untitled call"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(call.recording_start)}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.slice(0, 4).map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11.5px] text-foreground/90">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="leading-snug">
                          {a.text}
                          {a.assignee && <span className="ml-1.5 text-muted-foreground">— {a.assignee}</span>}
                        </span>
                      </li>
                    ))}
                    {items.length > 4 && (
                      <li className="text-[11px] text-muted-foreground pl-3.5">+{items.length - 4} more</li>
                    )}
                  </ul>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* One-line summary peeks from the latest calls */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg}`}>
                  <FileText className="h-3.5 w-3.5" />
                </span>
                Latest summaries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {latestSummaries.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-4 py-4">No summaries yet — they fill in as calls sync.</p>
              ) : latestSummaries.map(({ call, tldr }) => (
                <button
                  key={call.fathom_id}
                  onClick={() => setActiveId(call.fathom_id)}
                  className="block w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-medium text-foreground truncate">
                      {call.title || call.matched_doctor_name || "Untitled call"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(call.recording_start)}</span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground leading-snug line-clamp-2">{tldr}</p>
                  {call.host_name && <p className="text-[10px] text-muted-foreground/80 mt-1">{call.host_name}</p>}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Calls table (matches LeadsPipeline / Marketing styling) ──────── */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="py-3 px-4 border-b border-border/40">
          <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg}`}>
              <PhoneCall className="h-3.5 w-3.5" />
            </span>
            All calls
            {calls && (
              <Badge variant="secondary" className={`ml-1 text-[10px] ${CANDY.lilac.chip} ${CANDY.lilac.fg} border-0`}>
                {search.trim() ? calls.length : (callStats?.count ?? calls.length)}
              </Badge>
            )}
            {!search.trim() && callStats && calls && calls.length < callStats.count && (
              <span className="text-[10px] font-normal text-muted-foreground">
                showing latest {calls.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || hostsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-[12px]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading calls…
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-[12px] text-destructive">
              Failed to load calls: {(error as Error).message}
            </div>
          ) : !calls || calls.length === 0 ? (
            <EmptyState syncing={syncing} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Date</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Call</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Host</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Insights</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Duration</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decoratedRows.map(({ call: c, tldr, hasSummary, hasTranscript, actionCount }) => (
                    <CallRow
                      key={c.id}
                      call={c}
                      tldr={tldr}
                      hasSummary={hasSummary}
                      hasTranscript={hasTranscript}
                      actionCount={actionCount}
                      enriching={enriching}
                      onOpen={openCall}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {activeId && <CallDetailDrawer key={activeId} fathomId={activeId} onClose={() => setActiveId(null)} />}
    </DashboardLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface CandyPalette {
  bg: string;     // card fill
  fg: string;     // value + icon
  stripe: string; // top accent
  chip: string;   // misc accent (used elsewhere)
}

// Turns the AI's [[Name|N]] citation tokens into clickable links that open the
// referenced call. Plain text otherwise.
function renderCitations(
  text: string,
  calls: Record<string, { fathom_id: string; label: string }>,
  onOpenCall: (fathomId: string) => void,
): React.ReactNode[] {
  const re = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  const out: React.ReactNode[] = [];
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const label = m[1].trim();
    const entry = calls[m[2].trim()];
    if (entry?.fathom_id) {
      out.push(
        <button
          key={`c${key++}`}
          onClick={() => onOpenCall(entry.fathom_id)}
          className="font-medium text-sky-700 decoration-dotted underline-offset-2 hover:underline"
        >
          {label || entry.label}
        </button>,
      );
    } else {
      out.push(label);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Cross-call AI synthesis — patterns across the team's recent calls that no
// single call shows. Generated on demand (one AI call per click) and cached
// for the session.
function CallInsightsPanel({ hostEmails, onOpenCall }: { hostEmails: string[]; onOpenCall: (fathomId: string) => void }) {
  const { data, isFetching, error, refetch } = useCallInsights(hostEmails);
  const callMap = data?.calls ?? {};
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const PREVIEW = 2;   // bullets shown per section before "+N more"

  const SECTIONS: Array<{
    key: "themes" | "objections" | "winning" | "risks" | "coaching" | "followups";
    title: string; palette: CandyPalette; icon: React.ReactNode;
  }> = [
    { key: "themes",     title: "Common themes",         palette: CANDY.sky,   icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "objections", title: "Objections & concerns", palette: CANDY.rose,  icon: <AlertCircle className="h-3.5 w-3.5" /> },
    { key: "winning",    title: "What's landing",        palette: CANDY.mint,  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { key: "risks",      title: "Deal risks",            palette: CANDY.peach, icon: <AlertCircle className="h-3.5 w-3.5" /> },
    { key: "coaching",   title: "Coaching tips",         palette: CANDY.lilac, icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "followups",  title: "Suggested follow-ups",  palette: CANDY.pink,  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ];

  return (
    <Card className="shadow-sm border-border/60 mb-6 overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/40 bg-gradient-to-r from-violet-50 via-sky-50 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg}`}>
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            AI insights
            {data && <span className="text-[10px] font-normal text-muted-foreground">across {data.count} recent calls</span>}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-[12px] shrink-0"
          >
            {isFetching
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {isFetching ? "Analyzing…" : data ? "Refresh" : "Generate"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {error ? (
          <div className="flex items-start gap-2 text-[12px] text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{(error as Error).message}</span>
          </div>
        ) : isFetching && !data ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading your recent calls and pulling out the patterns…
          </div>
        ) : !data ? (
          <p className="text-[12px] text-muted-foreground">
            Synthesize patterns across the team's recent sales calls — recurring objections, what's landing,
            deals at risk, and coaching. Click <span className="font-medium text-foreground">Generate</span>.
          </p>
        ) : (
          <div className="space-y-4">
            {data.overview && (
              <p className="text-[12.5px] text-foreground leading-relaxed">
                {renderCitations(data.overview, callMap, onOpenCall)}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SECTIONS.map(s => {
                const items = (data[s.key] as string[]) ?? [];
                if (!items.length) return null;
                const isOpen = !!expanded[s.key];
                const shown  = isOpen ? items : items.slice(0, PREVIEW);
                return (
                  <div key={s.key} className={`rounded-lg border border-border/50 ${s.palette.bg} p-3`}>
                    <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide ${s.palette.fg}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded ${s.palette.chip}`}>{s.icon}</span>
                      {s.title}
                    </div>
                    <ul className="space-y-1">
                      {shown.map((it, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/90 leading-snug">
                          <span className={`mt-1.5 h-1 w-1 rounded-full ${s.palette.stripe} shrink-0`} />
                          <span>{renderCitations(it, callMap, onOpenCall)}</span>
                        </li>
                      ))}
                    </ul>
                    {items.length > PREVIEW && (
                      <button
                        onClick={() => setExpanded(e => ({ ...e, [s.key]: !isOpen }))}
                        className={`mt-1.5 text-[10.5px] font-medium ${s.palette.fg} hover:underline`}
                      >
                        {isOpen ? "Show less" : `+${items.length - PREVIEW} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Small status chip for the Insights column — solid + colored when the call
// has the data, faded outline when it doesn't. Gives an at-a-glance read on
// which calls have a transcript / AI summary ready.
function InsightChip({
  on, icon, label, palette, pending,
}: {
  on: boolean; icon: React.ReactNode; label: string;
  palette: { chip: string; fg: string }; pending?: boolean;
}) {
  return (
    <span
      title={on ? `${label} ready` : pending ? `${label} generating…` : `No ${label.toLowerCase()} yet`}
      className={`inline-flex items-center gap-1 rounded-full pl-1 pr-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        on
          ? `${palette.chip} ${palette.fg}`
          : "bg-transparent text-muted-foreground/40 ring-1 ring-inset ring-border/60"
      }`}
    >
      {pending && !on ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
    </span>
  );
}

// One table row. Memoized so an unchanged row (stable decorated-row object from
// decoratedRows, stable onOpen) skips re-render when the page re-renders for
// reasons that don't touch this row's data.
const CallRow = memo(function CallRow({
  call: c, tldr, hasSummary, hasTranscript, actionCount, enriching, onOpen,
}: {
  call: FathomCall;
  tldr: string | null;
  hasSummary: boolean;
  hasTranscript: boolean;
  actionCount: number;
  enriching: boolean;
  onOpen: (fathomId: string) => void;
}) {
  return (
    <TableRow
      className="hover:bg-muted/30 cursor-pointer"
      onClick={() => onOpen(c.fathom_id)}
    >
      <TableCell className="text-[11px] text-muted-foreground py-3 align-top whitespace-nowrap tabular-nums">
        {fmtDate(c.recording_start)}
      </TableCell>
      <TableCell className="py-3 align-top max-w-[420px]">
        <p className="text-[12px] font-medium text-foreground truncate">
          {c.title || "Untitled call"}
        </p>
        {tldr ? (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{tldr}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">
            {hasTranscript ? "Summary generating…" : "No summary yet"}
          </p>
        )}
      </TableCell>
      <TableCell className="py-3 align-top">
        <div className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full ${CANDY.pink.chip} ${CANDY.pink.fg} flex items-center justify-center text-[10px] font-semibold shrink-0`}>
            {hostInitials(c)}
          </div>
          <span className="text-[11px] text-foreground truncate max-w-[140px]">
            {c.host_name ?? c.host_email ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <InsightChip on={hasSummary} pending={hasTranscript} icon={<Sparkles className="h-3 w-3" />} label="Summary" palette={CANDY.lilac} />
          <InsightChip on={hasTranscript} icon={<Mic className="h-3 w-3" />} label="Transcript" palette={CANDY.mint} />
          {actionCount > 0 && (
            <span
              title={`${actionCount} action item${actionCount === 1 ? "" : "s"}`}
              className={`inline-flex items-center gap-1 rounded-full pl-1 pr-1.5 py-0.5 text-[10px] font-medium ${CANDY.peach.chip} ${CANDY.peach.fg}`}
            >
              <CheckCircle2 className="h-3 w-3" />{actionCount}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-[12px] text-foreground py-3 align-top whitespace-nowrap text-right tabular-nums">
        {c.duration_seconds === null && enriching ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[10px]">fetching</span>
          </span>
        ) : (
          fmtDuration(c.duration_seconds)
        )}
      </TableCell>
      <TableCell className="py-3 align-top text-right">
        {c.share_url && (
          <a
            href={c.share_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center text-[10px] font-medium ${CANDY.sky.fg} hover:underline`}
          >
            Open <ExternalLink className="h-3 w-3 ml-0.5" />
          </a>
        )}
      </TableCell>
    </TableRow>
  );
});

function AutoSyncPill({
  syncing, lastSyncAt,
}: { syncing: boolean; lastSyncAt: number | null }) {
  const now = useNowTick(1000);
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shrink-0 ${
      syncing
        ? "bg-purple-100 text-purple-600 border-purple-200"
        : "bg-emerald-100 text-emerald-600 border-emerald-200"
    }`}>
      <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
      {syncing
        ? "Auto-syncing…"
        : `Auto-sync · ${timeAgo(lastSyncAt, now)}`}
    </div>
  );
}

function EmptyState({ syncing }: { syncing: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
      <div className="h-12 w-12 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center">
        <PhoneCall className="h-5 w-5" />
      </div>
      <h3 className="text-[14px] font-semibold text-foreground">No calls yet</h3>
      <p className="text-[12px] text-muted-foreground max-w-sm">
        {syncing
          ? "Pulling your meetings from Fathom for the first time… this can take up to a minute."
          : "Once Fathom records a call it'll appear here automatically. The page auto-syncs every 10 minutes (and checks for new rows every 30s)."}
      </p>
      {syncing && (
        <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
      )}
    </div>
  );
}

function CallDetailDrawer({ fathomId, onClose }: { fathomId: string; onClose: () => void }) {
  const { data: call, isLoading } = useFathomCall(fathomId);
  const [searchInTranscript, setSearchInTranscript] = useState("");
  const [tab, setTab] = useState<"summary" | "transcript" | "actions">("summary");

  // Slide-in/out: mount off-screen, flip to on-screen after first paint; on
  // close, slide out first, then unmount once the transition finishes.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 300);
  };
  const summarize = useSummarizeCall();
  const hasTranscript = !!(call?.transcript_plaintext || call?.transcript_segments?.length);
  const drawerActions = normActions(call?.action_items);

  // Auto-generate an AI summary the first time a call without one is opened
  // (only when there's a transcript to work from). Persisted server-side, so
  // it runs once per call; `triedRef` stops it re-firing within this session.
  const triedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!call || call.summary || !hasTranscript) return;
    if (triedRef.current.has(call.fathom_id)) return;
    triedRef.current.add(call.fathom_id);
    summarize.mutate(call.fathom_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.fathom_id, call?.summary, hasTranscript]);

  // Precompute the lowercased text per segment ONCE per call so the per-keystroke
  // filter compares against the cache instead of calling seg.text.toLowerCase()
  // for every segment on every keystroke. `undefined` mirrors the original
  // `seg.text?.toLowerCase()` short-circuit (nullish text → excluded from matches).
  const segmentsLower = useMemo(
    () => call?.transcript_segments?.map(seg =>
      seg.text != null ? seg.text.toLowerCase() : undefined,
    ) ?? null,
    [call],
  );

  const filteredSegments = useMemo(() => {
    if (!call?.transcript_segments) return null;
    const s = searchInTranscript.trim().toLowerCase();
    if (!s) return call.transcript_segments;
    return call.transcript_segments.filter((seg, i) => segmentsLower?.[i]?.includes(s));
  }, [call, searchInTranscript, segmentsLower]);

  const TABS = [
    { key: "summary"    as const, label: "Summary",      icon: <Sparkles    className="h-3.5 w-3.5" />, dot: !!call?.summary, dotColor: "bg-violet-500" },
    { key: "transcript" as const, label: "Transcript",   icon: <Mic         className="h-3.5 w-3.5" />, dot: hasTranscript,   dotColor: "bg-emerald-500" },
    { key: "actions"    as const, label: "Action items", icon: <CheckCircle2 className="h-3.5 w-3.5" />, count: drawerActions.length },
  ];

  return (
    <div className="fixed inset-0 z-50">
      {/* Full-screen dim — fades with the panel; covers the gap around it too */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />
      {/* Floating, rounded panel — slides in/out from the right (matches the
          sidebar's inset card look). pointer-events-none on the wrapper lets
          clicks in the inset gap fall through to the backdrop (so clicking just
          outside the panel still closes it). */}
      <div className="absolute inset-y-0 right-0 w-full max-w-[640px] p-2 sm:p-3 pointer-events-none">
        <div className={`h-full bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto transition-transform duration-300 ease-out ${show ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-gradient-to-r from-pink-50 via-purple-50 to-sky-50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg} shrink-0`}>
                <PhoneCall className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-[14px] font-semibold truncate">
                {call?.title || (isLoading ? "Loading…" : "Call")}
              </h3>
            </div>
            <button onClick={handleClose} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/60">
              <X className="h-4 w-4" />
            </button>
          </div>

          {isLoading || !call ? (
            <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <>
              {/* Meta + Fathom link + tab selector (pinned) */}
              <div className="px-5 pt-4 pb-3 border-b border-border/50 shrink-0 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <Meta label="Date"     value={fmtDate(call.recording_start)} palette={CANDY.sky}   />
                  <Meta label="Duration" value={fmtDuration(call.duration_seconds)} palette={CANDY.peach} />
                  <Meta label="Host"     value={call.host_name ?? call.host_email ?? "—"} palette={CANDY.pink} />
                  <Meta label="Invitees" value={String(call.invitees?.length ?? 0)} palette={CANDY.mint} />
                </div>

                {call.share_url && (
                  <a
                    href={call.share_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${CANDY.sky.fg} hover:underline`}
                  >
                    Open in Fathom <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                {/* Highlighted-pill tab selector */}
                <div className="flex items-center gap-1 rounded-full bg-muted/70 p-1">
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                        tab === t.key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                      {typeof t.count === "number" && t.count > 0 && (
                        <span className={`ml-0.5 rounded-full px-1.5 text-[10px] leading-4 ${
                          tab === t.key ? `${CANDY.peach.chip} ${CANDY.peach.fg}` : "bg-foreground/10 text-muted-foreground"
                        }`}>{t.count}</span>
                      )}
                      {t.dot && tab !== t.key && <span className={`h-1.5 w-1.5 rounded-full ${t.dotColor}`} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active tab content (scrolls) */}
              <div className="flex-1 overflow-y-auto p-5">
                {/* ── Summary ── */}
                {tab === "summary" && (
                  call.summary ? (
                    <div
                      className="prose prose-sm max-w-none text-foreground
                        prose-headings:font-semibold prose-headings:text-foreground
                        prose-h1:text-[13px] prose-h1:mt-3 prose-h1:mb-1
                        prose-h2:text-[13px] prose-h2:mt-3 prose-h2:mb-1
                        prose-h3:text-[12px] prose-h3:mt-2 prose-h3:mb-0.5 prose-h3:text-muted-foreground
                        prose-p:text-[12px] prose-p:my-1 prose-p:leading-relaxed
                        prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-[12px] prose-li:marker:text-muted-foreground
                        prose-strong:text-foreground prose-strong:font-semibold"
                    >
                      <Suspense fallback={
                        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading summary…
                        </div>
                      }>
                        <SummaryMarkdown
                          components={{
                            // Fathom wraps each bullet's text in a link to its own
                            // timestamp. Render those as normal text (not a wall of
                            // teal) but keep them clickable — opens the moment in Fathom.
                            a: ({ href, children, ...rest }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="text-inherit no-underline decoration-dotted underline-offset-2 hover:underline"
                                {...rest}
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {call.summary}
                        </SummaryMarkdown>
                      </Suspense>
                    </div>
                  ) : hasTranscript ? (
                    summarize.isError ? (
                      <div className="text-[12px] text-muted-foreground">
                        Couldn't generate a summary right now.
                        <button
                          onClick={() => summarize.mutate(call.fathom_id)}
                          className={`ml-1 font-medium ${CANDY.lilac.fg} hover:underline`}
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating an AI summary from the transcript…
                      </div>
                    )
                  ) : (
                    <p className="text-[12px] text-muted-foreground italic">
                      No summary yet — there's no transcript to generate one from.
                    </p>
                  )
                )}

                {/* ── Transcript ── */}
                {tab === "transcript" && (
                  !call.transcript_plaintext && !call.transcript_segments ? (
                    <p className="text-[12px] text-muted-foreground italic">No transcript available.</p>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 mb-3 bg-background pb-1">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search within this call…"
                            value={searchInTranscript}
                            onChange={(e) => setSearchInTranscript(e.target.value)}
                            className="pl-8 h-8 text-[12px]"
                          />
                        </div>
                      </div>

                      {filteredSegments && filteredSegments.length > 0 ? (
                        <div className="space-y-2.5 text-[12px] leading-relaxed">
                          {filteredSegments.map((seg, i) => (
                            <div key={i} className="border-l-2 border-emerald-300 pl-3 py-0.5">
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
                                <span className={`font-semibold ${CANDY.mint.fg}`}>{seg.speaker ?? "Speaker"}</span>
                                {seg.ts !== undefined && <span>{String(seg.ts)}</span>}
                              </div>
                              <p className="text-foreground">{seg.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <pre className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed font-sans">
                          {call.transcript_plaintext}
                        </pre>
                      )}
                    </>
                  )
                )}

                {/* ── Action items ── */}
                {tab === "actions" && (
                  drawerActions.length > 0 ? (
                    <ul className="space-y-2">
                      {drawerActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span>
                            {a.text}
                            {a.assignee && <span className="ml-2 text-muted-foreground">— {a.assignee}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-muted-foreground italic">No action items for this call.</p>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({
  label, value, palette,
}: { label: string; value: string; palette: CandyPalette }) {
  return (
    <div className={`rounded-lg ${palette.bg} px-3 py-2`}>
      <div className={`text-[10px] uppercase tracking-wide ${palette.fg} font-semibold`}>{label}</div>
      <div className="text-[12px] text-foreground mt-0.5">{value}</div>
    </div>
  );
}


import { useEffect, useMemo, useState } from "react";
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
  useFathomCalls, useFathomCall, useFathomAutoSync, useFathomSync,
  type FathomCall,
} from "@/hooks/use-fathom-calls";
import { Button } from "@/components/ui/button";
import {
  PhoneCall, Loader2, Search, ExternalLink, Clock,
  Users as UsersIcon, X, Mic, FileText, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";

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

function totalSecondsIn(rows: FathomCall[]): number {
  return rows.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
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

  const filters = useMemo(() => ({
    search: search || null,
    host:   hostFilter || null,
  }), [search, hostFilter]);

  const { data: calls, isLoading, error, isFetching } = useFathomCalls(filters);
  const { lastSyncAt, syncing, lastError } = useFathomAutoSync();
  const manualSync = useFathomSync();
  const now = useNowTick(1000);

  const hosts = useMemo(() => {
    const set = new Map<string, string>();
    (calls ?? []).forEach(c => {
      if (c.host_email) set.set(c.host_email, c.host_name || c.host_email);
    });
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [calls]);

  const stats = useMemo(() => {
    const list = calls ?? [];
    const externals = list.filter(c => (c.external_domains?.length ?? 0) > 0).length;
    const totalSecs = totalSecondsIn(list);
    return {
      count:    list.length,
      totalHrs: fmtDuration(totalSecs),
      avgMins:  list.length ? fmtDuration(Math.round(totalSecs / list.length)) : "—",
      externals,
    };
  }, [calls]);

  return (
    <DashboardLayout
      title="Calls"
      subtitle="Recorded meetings, transcripts, and AI summaries from Fathom"
    >
      {/* ── Top bar: search, host filter, live auto-sync indicator ───────── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
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
              {hosts.map(([email, name]) => (
                <SelectItem key={email} value={email} className="text-[12px]">{name}</SelectItem>
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
          <AutoSyncPill syncing={syncing || isFetching} lastSyncAt={lastSyncAt} now={now} />
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

      {/* ── KPI tiles (match dashboard ExpandableKPICard) ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <CandyKpi palette={CANDY.sky}    icon={<PhoneCall className="h-3.5 w-3.5" />}  label="Total calls"          value={String(stats.count)}    />
        <CandyKpi palette={CANDY.mint}   icon={<Clock     className="h-3.5 w-3.5" />}  label="Total talk time"      value={stats.totalHrs}         />
        <CandyKpi palette={CANDY.peach}  icon={<Mic       className="h-3.5 w-3.5" />}  label="Avg call length"      value={stats.avgMins}          />
        <CandyKpi palette={CANDY.rose}   icon={<UsersIcon className="h-3.5 w-3.5" />}  label="With external guests" value={String(stats.externals)} />
      </div>

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
                {calls.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
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
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Title</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Host</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden md:table-cell text-right">Participants</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Duration</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">Transcript</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((c) => (
                    <TableRow
                      key={c.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setActiveId(c.fathom_id)}
                    >
                      <TableCell className="text-[11px] text-muted-foreground py-2.5 whitespace-nowrap tabular-nums">
                        {fmtDate(c.recording_start)}
                      </TableCell>
                      <TableCell className="text-[12px] font-medium text-foreground py-2.5 max-w-[280px] truncate">
                        {c.title || "Untitled call"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full ${CANDY.pink.chip} ${CANDY.pink.fg} flex items-center justify-center text-[10px] font-semibold shrink-0`}>
                            {hostInitials(c)}
                          </div>
                          <span className="text-[11px] text-foreground truncate max-w-[140px]">
                            {c.host_name ?? c.host_email ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden md:table-cell text-right tabular-nums">
                        {c.invitees?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-[12px] text-foreground py-2.5 whitespace-nowrap text-right tabular-nums">
                        {fmtDuration(c.duration_seconds)}
                      </TableCell>
                      <TableCell className="py-2.5 hidden lg:table-cell">
                        {c.transcript_plaintext ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${CANDY.mint.chip} ${CANDY.mint.fg}`}>
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Available
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {activeId && <CallDetailDrawer fathomId={activeId} onClose={() => setActiveId(null)} />}
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

function CandyKpi({
  palette, icon, label, value,
}: { palette: CandyPalette; icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className={`rounded-xl border border-kpi/60 ${palette.bg} shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01] overflow-hidden flex flex-col`}>
      <div className={`h-1 shrink-0 ${palette.stripe}`} />
      <div className="px-4 py-3 flex items-start justify-between flex-1 min-h-[64px]">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground truncate mb-1">{label}</p>
          <p className={`text-[24px] font-bold tabular-nums leading-none ${palette.fg}`}>{value}</p>
        </div>
        <div className="h-7 w-7 rounded-lg bg-card/70 flex items-center justify-center shrink-0 ml-2">
          <span className={palette.fg}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

function AutoSyncPill({
  syncing, lastSyncAt, now,
}: { syncing: boolean; lastSyncAt: number | null; now: number }) {
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
          : "Once Fathom records a call it'll appear here automatically. The page auto-syncs every 2 minutes."}
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

  const filteredSegments = useMemo(() => {
    if (!call?.transcript_segments) return null;
    const s = searchInTranscript.trim().toLowerCase();
    if (!s) return call.transcript_segments;
    return call.transcript_segments.filter(seg => seg.text?.toLowerCase().includes(s));
  }, [call, searchInTranscript]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-[640px] bg-background border-l border-border flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-gradient-to-r from-pink-50 via-purple-50 to-sky-50">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg} shrink-0`}>
              <PhoneCall className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[14px] font-semibold truncate">
              {call?.title || (isLoading ? "Loading…" : "Call")}
            </h3>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading || !call ? (
            <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="p-5 space-y-5">
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

              {call.summary && (
                <Section icon={<FileText className="h-3.5 w-3.5" />} title="AI summary" palette={CANDY.lilac}>
                  <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap">{call.summary}</p>
                </Section>
              )}

              {call.action_items && call.action_items.length > 0 && (
                <Section icon={<UsersIcon className="h-3.5 w-3.5" />} title={`Action items (${call.action_items.length})`} palette={CANDY.peach}>
                  <ul className="space-y-1.5">
                    {call.action_items.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span>
                          {a.text ?? JSON.stringify(a)}
                          {a.assignee && <span className="ml-2 text-muted-foreground">— {a.assignee}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section icon={<Mic className="h-3.5 w-3.5" />} title="Transcript" palette={CANDY.mint}>
                {!call.transcript_plaintext && !call.transcript_segments ? (
                  <p className="text-[12px] text-muted-foreground italic">No transcript available.</p>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search within this call…"
                        value={searchInTranscript}
                        onChange={(e) => setSearchInTranscript(e.target.value)}
                        className="pl-8 h-8 text-[12px]"
                      />
                    </div>

                    {filteredSegments && filteredSegments.length > 0 ? (
                      <div className="space-y-2.5 text-[12px] leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
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
                      <pre className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto font-sans">
                        {call.transcript_plaintext}
                      </pre>
                    )}
                  </>
                )}
              </Section>
            </div>
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

function Section({
  icon, title, children, palette,
}: { icon: React.ReactNode; title: string; children: React.ReactNode; palette: CandyPalette }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide ${palette.fg}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded ${palette.chip}`}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * WorkerAnalyticsPanel
 * Admin-facing component showing worker call-log KPIs, charts, and filterable table.
 * Used on the Team Performance page in the main admin dashboard.
 */
import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Loader2, TrendingUp, Trash2, ClipboardList } from "lucide-react";
import { useWorkerEntries, useDeleteEntry, type WorkerEntry } from "@/hooks/use-worker-entries";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = [
  "High Priority", "Contact in Future", "Declined",
  "Not Interested", "Minimal Follow Up", "Initial Sales",
] as const;

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "High Priority":     { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  "Contact in Future": { bg: "#fdf2f8", text: "#be185d", border: "#f9a8d4" },
  "Declined":          { bg: "#7f1d1d", text: "#ffffff", border: "#991b1b" },
  "Not Interested":    { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  "Minimal Follow Up": { bg: "#1f2937", text: "#ffffff", border: "#374151" },
  "Initial Sales":     { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
};

const STATUS_CHART_COLOR: Record<string, string> = {
  "High Priority":     "#86efac",
  "Contact in Future": "#f9a8d4",
  "Declined":          "#fca5a5",
  "Not Interested":    "#fdba74",
  "Minimal Follow Up": "#cbd5e1",
  "Initial Sales":     "#93c5fd",
};

const WORKER_COLORS = ["#93c5fd", "#6ee7b7", "#fcd34d", "#c4b5fd", "#fda4af", "#f0abfc", "#67e8f9"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split("T")[0]; }
function weekStartISO() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}
function getChartDays() {
  const start = new Date("2026-04-06");
  const end   = new Date();
  const days: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}
function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function buildActivityData(entries: WorkerEntry[], workerEmails: string[]) {
  return getChartDays().map(date => {
    const point: Record<string, string | number> = { date: fmtDay(date) };
    workerEmails.forEach(email => {
      point[email.split("@")[0]] = entries.filter(e => e.call_date === date && e.worker_email === email).length;
    });
    return point;
  });
}
function buildStatusData(entries: WorkerEntry[]) {
  const counts: Record<string, number> = {};
  entries.forEach(e => { if (e.status) counts[e.status] = (counts[e.status] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
}
function buildWorkerBarData(entries: WorkerEntry[], workerEmails: string[]) {
  return workerEmails.map((email, i) => ({
    name: email.split("@")[0],
    Entries: entries.filter(e => e.worker_email === email).length,
    fill: WORKER_COLORS[i % WORKER_COLORS.length],
  }));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>
      {status}
    </span>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-card px-4 py-3 hover:shadow-sm transition-shadow min-w-0">
      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-[22px] font-semibold tabular-nums leading-none ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function WorkerAnalyticsPanel() {
  const { data: allEntries = [], isLoading } = useWorkerEntries("all");
  const { mutate: del } = useDeleteEntry();

  const [selectedWorker, setSelectedWorker] = useState("all");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [workerFilter,   setWorkerFilter]   = useState("all");

  const workerEmails = useMemo(
    () => [...new Set(allEntries.map(e => e.worker_email).filter(Boolean))] as string[],
    [allEntries]
  );

  const displayEntries = useMemo(
    () => selectedWorker === "all" ? allEntries : allEntries.filter(e => e.worker_email === selectedWorker),
    [allEntries, selectedWorker]
  );

  const tableEntries = useMemo(() => {
    let r = allEntries;
    if (statusFilter) r = r.filter(e => e.status === statusFilter);
    if (workerFilter !== "all") r = r.filter(e => e.worker_email === workerFilter);
    return r;
  }, [allEntries, statusFilter, workerFilter]);

  const t = todayISO();
  const w = weekStartISO();
  const todayCount = displayEntries.filter(e => e.call_date === t).length;
  const highPri    = displayEntries.filter(e => e.status === "High Priority").length;

  const chartWorkers = selectedWorker === "all" ? workerEmails : [selectedWorker];
  const activityData = useMemo(() => buildActivityData(displayEntries, chartWorkers), [displayEntries, chartWorkers]);
  const statusData   = useMemo(() => buildStatusData(displayEntries),                [displayEntries]);
  const workerBar    = useMemo(() => buildWorkerBarData(allEntries, workerEmails),   [allEntries, workerEmails]);

  const chartTotals = chartWorkers.map((w, i) => ({
    key:   w.split("@")[0],
    total: allEntries.filter(e => e.worker_email === w).length,
    color: WORKER_COLORS[i % WORKER_COLORS.length],
  }));

  if (isLoading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading worker data…
    </div>
  );

  return (
    <div className="space-y-5 mt-6">
      {/* Section header + worker filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Worker Activity</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Call log entries submitted by your team</p>
        </div>
        {workerEmails.length > 0 && (
          <select
            value={selectedWorker}
            onChange={e => setSelectedWorker(e.target.value)}
            className="h-8 rounded-lg border border-border bg-secondary/40 px-3 text-[11px] text-foreground outline-none focus:border-primary transition-all"
          >
            <option value="all">All workers</option>
            {workerEmails.map(email => (
              <option key={email} value={email}>{email.split("@")[0]}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPIs */}
      <div className="flex gap-3">
        <KpiTile label="Total Entries" value={displayEntries.length}   sub="all time" />
        <KpiTile label="Workers Active" value={workerEmails.length}    sub="logged entries"    accent="text-sky-600" />
        <KpiTile label="Today"          value={todayCount}             sub="entries today"     accent="text-emerald-600" />
        <KpiTile label="High Priority"  value={highPri}                sub="flagged entries"   accent="text-rose-600" />
      </div>

      {/* Line chart */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Worker Activity — Last 30 Days
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Daily call-log entries per worker</p>
          </div>
          <div className="flex items-center gap-4 shrink-0 ml-4">
            {chartTotals.map(t => (
              <div key={t.key} className="text-right">
                <p className="text-[18px] font-semibold tabular-nums" style={{ color: t.color }}>{t.total}</p>
                <p className="text-[9px] text-muted-foreground capitalize">{t.key}</p>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={activityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              {chartWorkers.map((email, i) => (
                <linearGradient key={email} id={`apGrad-${email.split("@")[0]}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={WORKER_COLORS[i % WORKER_COLORS.length]} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={WORKER_COLORS[i % WORKER_COLORS.length]} stopOpacity={0.15} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
            {chartWorkers.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {chartWorkers.map((email, i) => (
              <Area key={email} type="monotone" dataKey={email.split("@")[0]}
                stroke={WORKER_COLORS[i % WORKER_COLORS.length]}
                fill={`url(#apGrad-${email.split("@")[0]})`}
                strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Status pie + worker bar */}
      <div className="grid grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Status</p>
          {statusData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-[12px] text-muted-foreground">No data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
                  {statusData.map(entry => (
                    <Cell key={entry.name} fill={STATUS_CHART_COLOR[entry.name] ?? "#9ca3af"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Entries by worker */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Worker</p>
          {workerBar.length === 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-[12px] text-muted-foreground">No data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workerBar} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="Entries" radius={[4, 4, 0, 0]}>
                  {workerBar.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Entries table */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[13px] font-semibold text-foreground">All Entries</p>
          <div className="flex items-center gap-2">
            {workerEmails.length > 0 && (
              <select value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-secondary/40 px-3 text-[11px] text-foreground outline-none focus:border-primary transition-all">
                <option value="all">All workers</option>
                {workerEmails.map(email => (
                  <option key={email} value={email}>{email.split("@")[0]}</option>
                ))}
              </select>
            )}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-secondary/40 px-3 text-[11px] text-foreground outline-none focus:border-primary transition-all">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {tableEntries.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">No entries found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
                    {["Worker","Date","Status","Name","Specialty","State","Meeting","Country","Notes",""].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide border-r border-white/10 last:border-r-0 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableEntries.map((e, i) => {
                    const wIdx  = workerEmails.indexOf(e.worker_email ?? "");
                    const wColor = WORKER_COLORS[wIdx >= 0 ? wIdx % WORKER_COLORS.length : 0];
                    return (
                      <tr key={e.id}
                        className={`border-t border-border/40 hover:bg-primary/[0.03] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
                        <td className="px-3 py-2 border-r border-border/30">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap text-white"
                            style={{ backgroundColor: wColor }}>
                            {e.worker_email ? e.worker_email.split("@")[0] : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30 whitespace-nowrap">
                          {e.call_date ? new Date(e.call_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                        </td>
                        <td className="px-3 py-2 border-r border-border/30">
                          {e.status ? <StatusBadge status={e.status} /> : <span className="text-[10px] text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-medium text-foreground border-r border-border/30">{e.name || "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.specialty || "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.state || "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.meeting_type || "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.country_of_training || "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground border-r border-border/30 max-w-[180px]">
                          <span title={e.notes} className="line-clamp-2">{e.notes || "—"}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.id && (
                            <button onClick={() => window.confirm("Delete this entry?") && del(e.id!)}
                              className="text-muted-foreground/40 hover:text-destructive transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

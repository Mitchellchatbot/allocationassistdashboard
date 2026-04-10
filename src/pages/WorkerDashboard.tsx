import { useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/use-auth";
import { useWorkerEntries, useSaveEntries, useDeleteEntry, type WorkerEntry } from "@/hooks/use-worker-entries";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ClipboardList, PlusCircle, LogOut, Loader2, Save, Trash2,
  CalendarDays, Clock, BarChart2, ChevronDown, Check, X,
  Users, TrendingUp, LayoutDashboard,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = [
  "High Priority",
  "Contact in Future",
  "Declined",
  "Not Interested",
  "Minimal Follow Up",
  "Initial Sales",
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
const MEETING_TYPES = ["Phone Call", "Video Call", "In Person", "Email", "WhatsApp", "Other"];

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split("T")[0]; }
function weekStartISO() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}
function getChartDays(): string[] {
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

// ── Chart data builders ────────────────────────────────────────────────────────

function buildActivityData(entries: WorkerEntry[], workerEmails: string[]) {
  const days = getChartDays();
  return days.map(date => {
    const point: Record<string, string | number> = { date: fmtDay(date) };
    if (workerEmails.length === 0) {
      point["Entries"] = entries.filter(e => e.call_date === date).length;
    } else {
      workerEmails.forEach(email => {
        point[email.split("@")[0]] = entries.filter(e => e.call_date === date && e.worker_email === email).length;
      });
    }
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
    name:    email.split("@")[0],
    Entries: entries.filter(e => e.worker_email === email).length,
    fill:    WORKER_COLORS[i % WORKER_COLORS.length],
  }));
}

// ── StatusBadge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>
      {status}
    </span>
  );
}

// ── StatusSelect (portal-based to avoid z-index / overflow-hidden issues) ──────

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen]   = useState(false);
  const [rect, setRect]   = useState<DOMRect | null>(null);
  const btnRef            = useRef<HTMLButtonElement>(null);
  const s                 = STATUS_STYLE[value];

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  return (
    <div>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold min-w-[120px] justify-between"
        style={s
          ? { backgroundColor: s.bg, color: s.text, borderColor: s.border }
          : { backgroundColor: "#f9fafb", color: "#6b7280", borderColor: "#d1d5db" }}>
        <span>{value || "Select status…"}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div className="fixed z-[201] bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-48"
            style={{ top: rect.bottom + 4, left: rect.left }}>
            {STATUSES.map(st => {
              const style = STATUS_STYLE[st];
              return (
                <button key={st} type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(st); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50 transition-colors">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                    style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
                    {st}
                  </span>
                  {value === st && <Check className="h-3 w-3 text-primary ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── emptyRow ───────────────────────────────────────────────────────────────────

function emptyRow(): WorkerEntry & { _key: string } {
  return {
    _key: String(Math.random()),
    call_date: new Date().toISOString().split("T")[0],
    status: "", name: "", specialty: "", qualifications: "",
    state: "", meeting_type: "", country_of_training: "", notes: "",
  };
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-card px-4 py-3 hover:shadow-sm transition-shadow min-w-0">
      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-[22px] font-semibold tabular-nums leading-none ${accent ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Activity line chart ────────────────────────────────────────────────────────

function ActivityChart({ entries, workerEmails, title, subtitle }: {
  entries: WorkerEntry[];
  workerEmails: string[];
  title: string;
  subtitle: string;
}) {
  const data = useMemo(() => buildActivityData(entries, workerEmails), [entries, workerEmails]);
  const keys = workerEmails.length > 0 ? workerEmails.map(e => e.split("@")[0]) : ["Entries"];

  const totals = workerEmails.length > 0
    ? workerEmails.map((w, i) => ({ key: w.split("@")[0], total: entries.filter(e => e.worker_email === w).length, color: WORKER_COLORS[i % WORKER_COLORS.length] }))
    : [{ key: "Entries", total: entries.length, color: "hsl(170,45%,28%)" }];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {totals.map(t => (
            <div key={t.key} className="text-right">
              <p className="text-[18px] font-semibold tabular-nums leading-none" style={{ color: t.color }}>{t.total}</p>
              <p className="text-[9px] text-muted-foreground capitalize">{t.key}</p>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {keys.map((k, i) => (
              <linearGradient key={k} id={`wdGrad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={WORKER_COLORS[i % WORKER_COLORS.length]} stopOpacity={0.7} />
                <stop offset="95%" stopColor={WORKER_COLORS[i % WORKER_COLORS.length]} stopOpacity={0.15} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval={4} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k}
              stroke={WORKER_COLORS[i % WORKER_COLORS.length]}
              fill={`url(#wdGrad-${k})`}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Status pie chart ───────────────────────────────────────────────────────────

function StatusPieChart({ entries }: { entries: WorkerEntry[] }) {
  const data = useMemo(() => buildStatusData(entries), [entries]);

  if (data.length === 0) return (
    <div className="rounded-xl border border-border/60 bg-card p-5 flex items-center justify-center" style={{ minHeight: 280 }}>
      <p className="text-[12px] text-muted-foreground">No data yet</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Status</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
            {data.map(entry => (
              <Cell key={entry.name} fill={STATUS_CHART_COLOR[entry.name] ?? "#9ca3af"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Worker bar chart ───────────────────────────────────────────────────────────

function WorkerBarChart({ entries, workerEmails }: { entries: WorkerEntry[]; workerEmails: string[] }) {
  const data = useMemo(() => buildWorkerBarData(entries, workerEmails), [entries, workerEmails]);
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[13px] font-semibold text-foreground mb-1">Entries by Worker</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
          <Bar dataKey="Entries" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ isAdmin, userId }: { isAdmin: boolean; userId?: string }) {
  const { data: allEntries = [], isLoading } = useWorkerEntries("all", userId);
  const [selectedWorker, setSelectedWorker] = useState("all");

  const workerEmails = useMemo(
    () => [...new Set(allEntries.map(e => e.worker_email).filter(Boolean))] as string[],
    [allEntries]
  );

  const displayEntries = useMemo(
    () => selectedWorker === "all" ? allEntries : allEntries.filter(e => e.worker_email === selectedWorker),
    [allEntries, selectedWorker]
  );

  const t = todayISO();
  const w = weekStartISO();
  const todayCount = displayEntries.filter(e => e.call_date === t).length;
  const weekCount  = displayEntries.filter(e => e.call_date >= w).length;
  const highPri    = displayEntries.filter(e => e.status === "High Priority").length;

  const chartWorkers = selectedWorker === "all" ? workerEmails : [selectedWorker];

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">
            {isAdmin ? "Worker Activity Overview" : "My Activity"}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {isAdmin ? "Entries logged by all workers" : "Your daily call log performance"}
          </p>
        </div>

        {isAdmin && workerEmails.length > 0 && (
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
        {isAdmin ? (
          <>
            <KpiTile label="Total Entries" value={displayEntries.length} sub="all time" />
            <KpiTile label="Workers Active" value={workerEmails.length} sub="logged at least 1 entry" accent="text-sky-600" />
            <KpiTile label="Today" value={todayCount} sub="entries today" accent="text-emerald-600" />
            <KpiTile label="High Priority" value={highPri} sub="flagged entries" accent="text-rose-600" />
          </>
        ) : (
          <>
            <KpiTile label="All Time" value={displayEntries.length} sub="total entries" />
            <KpiTile label="This Week" value={weekCount} sub="entries this week" accent="text-sky-600" />
            <KpiTile label="Today" value={todayCount} sub="entries today" accent="text-emerald-600" />
            <KpiTile label="High Priority" value={highPri} sub="flagged entries" accent="text-rose-600" />
          </>
        )}
      </div>

      {/* Line chart */}
      <ActivityChart
        entries={displayEntries}
        workerEmails={isAdmin ? chartWorkers : []}
        title={isAdmin ? "Worker Activity — Last 30 Days" : "My Activity — Last 30 Days"}
        subtitle={isAdmin ? "Daily entries logged across all workers" : "Your entries over the past 30 days"}
      />

      {/* Bottom charts */}
      <div className={isAdmin ? "grid grid-cols-2 gap-4" : ""}>
        <StatusPieChart entries={displayEntries} />
        {isAdmin && <WorkerBarChart entries={allEntries} workerEmails={workerEmails} />}
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "daily" | "week" | "all";

function WorkerSidebar({ tab, setTab, isAdmin }: { tab: Tab; setTab: (t: Tab) => void; isAdmin: boolean }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => { await signOut(); navigate("/login", { replace: true }); };

  const workerNav: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: "overview", icon: LayoutDashboard, label: "Overview"    },
    { id: "daily",    icon: PlusCircle,      label: "Daily Log"   },
    { id: "week",     icon: CalendarDays,    label: "This Week"   },
    { id: "all",      icon: BarChart2,       label: "All Records" },
  ];

  const adminNav: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: "overview", icon: LayoutDashboard, label: "Overview"     },
    { id: "all",      icon: Users,           label: "All Entries"  },
  ];

  const navItems = isAdmin ? adminNav : workerNav;

  return (
    <aside className="w-56 shrink-0 flex flex-col min-h-screen" style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        <img src={logo} alt="Allocation Assist" className="h-9 w-9 object-contain shrink-0" />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-white">Allocation Assist</p>
          <p className="text-[9px] text-white/50">{isAdmin ? "Admin — Worker View" : "Worker Portal"}</p>
        </div>
      </div>

      <nav className="flex-1 px-2 pt-4 space-y-0.5">
        <p className="text-[9px] uppercase tracking-widest text-white/30 px-3 mb-2">Menu</p>
        {navItems.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] transition-colors text-left ${
              tab === id ? "bg-white/15 text-white font-medium" : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-2 pb-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <div className="h-6 w-6 rounded-full bg-white/20 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {(user?.email ?? "W").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-white truncate">{user?.email ?? "worker"}</p>
            <p className="text-[8px] text-white/40">{isAdmin ? "Administrator" : "Worker"}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <LogOut className="h-3 w-3" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Add Entry tab ─────────────────────────────────────────────────────────────

function AddEntryTab() {
  type RowType = WorkerEntry & { _key: string };
  const [rows, setRows]       = useState<RowType[]>([emptyRow()]);
  const { mutateAsync: save, isPending } = useSaveEntries();
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState("");

  const update = useCallback((key: string, field: keyof WorkerEntry, value: string) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  }, []);

  const removeRow = (key: string) => {
    setRows(prev => prev.length === 1 ? [emptyRow()] : prev.filter(r => r._key !== key));
  };

  const handleSave = async () => {
    setSaveError("");
    const valid = rows.filter(r => r.name.trim() || r.status);
    if (!valid.length) { setSaveError("Add at least one entry before saving."); return; }
    try {
      await save(valid.map(({ _key, ...rest }) => rest));
      setRows([emptyRow()]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(String(e));
    }
  };

  const COLS = [
    { key: "call_date",           label: "Date",                width: "w-28" },
    { key: "status",              label: "Status",              width: "w-36" },
    { key: "name",                label: "Name",                width: "w-36" },
    { key: "specialty",           label: "Specialty",           width: "w-32" },
    { key: "qualifications",      label: "Qualifications",      width: "w-40" },
    { key: "state",               label: "State",               width: "w-20" },
    { key: "meeting_type",        label: "Meeting",             width: "w-28" },
    { key: "country_of_training", label: "Country of Training", width: "w-36" },
    { key: "notes",               label: "Notes",               width: "w-56" },
  ] as const;

  const inputCls = "w-full h-7 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:bg-primary/5 rounded px-1.5 border border-transparent focus:border-primary/30 transition-all";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">Add Entry</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Log your daily call activity</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
              <Check className="h-3.5 w-3.5" /> Saved!
            </span>
          )}
          <button
            onClick={() => setRows(prev => [...prev, emptyRow()])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <PlusCircle className="h-3.5 w-3.5" /> Add Row
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60 transition-colors"
            style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save All
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-[11px] text-destructive">
          {saveError}
        </div>
      )}

      <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
                {COLS.map(c => (
                  <th key={c.key} className={`${c.width} px-2.5 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide whitespace-nowrap border-r border-white/10 last:border-r-0`}>
                    {c.label}
                  </th>
                ))}
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._key}
                  className={`border-t border-border/40 hover:bg-primary/[0.02] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input type="date" value={row.call_date} onChange={e => update(row._key, "call_date", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <StatusSelect value={row.status} onChange={v => update(row._key, "status", v)} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Full name" value={row.name} onChange={e => update(row._key, "name", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. Cardiology" value={row.specialty} onChange={e => update(row._key, "specialty", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. CCST 2014 UK" value={row.qualifications} onChange={e => update(row._key, "qualifications", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Full / Part" value={row.state} onChange={e => update(row._key, "state", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <select value={row.meeting_type} onChange={e => update(row._key, "meeting_type", e.target.value)} className={inputCls + " cursor-pointer"}>
                      <option value="">— type —</option>
                      {MEETING_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. UK" value={row.country_of_training} onChange={e => update(row._key, "country_of_training", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Add notes…" value={row.notes} onChange={e => update(row._key, "notes", e.target.value)} className={inputCls} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => removeRow(row._key)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={() => setRows(prev => [...prev, emptyRow()])}
        className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
        <PlusCircle className="h-3.5 w-3.5" /> Add another row
      </button>
    </div>
  );
}

// ── Records tab ───────────────────────────────────────────────────────────────

type DateFilter = "today" | "week" | "month" | "all";

function RecordsTab({ filter, isAdmin, userId }: { filter: DateFilter; isAdmin: boolean; userId?: string }) {
  const { data: entries = [], isLoading } = useWorkerEntries(filter, userId);
  const { mutate: del } = useDeleteEntry();
  const [statusFilter, setStatusFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("all");

  const workerEmails = useMemo(
    () => [...new Set(entries.map(e => e.worker_email).filter(Boolean))] as string[],
    [entries]
  );

  const filtered = useMemo(() => {
    let r = entries;
    if (statusFilter) r = r.filter(e => e.status === statusFilter);
    if (isAdmin && workerFilter !== "all") r = r.filter(e => e.worker_email === workerFilter);
    return r;
  }, [entries, statusFilter, isAdmin, workerFilter]);

  const titleMap: Record<DateFilter, string> = {
    today: "Today's Entries", week: "This Week", month: "This Month",
    all: isAdmin ? "All Worker Entries" : "All Records",
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{titleMap[filter]}</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">{filtered.length} entries</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && workerEmails.length > 0 && (
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

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center py-20 gap-3">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">No entries found</p>
          {!isAdmin && <p className="text-[11px] text-muted-foreground/60">Use "Add Entry" to log your calls</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
                  {isAdmin && <th className="px-3 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide border-r border-white/10 whitespace-nowrap">Worker</th>}
                  {["Date","Status","Name","Specialty","Qualifications","State","Meeting","Country","Notes",""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide border-r border-white/10 last:border-r-0 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const wIdx  = workerEmails.indexOf(e.worker_email ?? "");
                  const wColor = WORKER_COLORS[wIdx >= 0 ? wIdx % WORKER_COLORS.length : 0];
                  return (
                    <tr key={e.id}
                      className={`border-t border-border/40 hover:bg-primary/[0.03] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
                      {isAdmin && (
                        <td className="px-3 py-2 border-r border-border/30">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap text-white"
                            style={{ backgroundColor: wColor }}>
                            {e.worker_email ? e.worker_email.split("@")[0] : "—"}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30 whitespace-nowrap">
                        {e.call_date ? new Date(e.call_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                      </td>
                      <td className="px-3 py-2 border-r border-border/30">
                        {e.status ? <StatusBadge status={e.status} /> : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[11px] font-medium text-foreground border-r border-border/30">{e.name || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.specialty || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground border-r border-border/30 max-w-[160px] truncate">{e.qualifications || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.state || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.meeting_type || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.country_of_training || "—"}</td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground border-r border-border/30 max-w-[200px]">
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
  );
}

// ── Daily Log tab (Add Entry + Today's saved entries combined) ────────────────

function DailyTab({ userId }: { userId?: string }) {
  const { data: todayEntries = [], isLoading } = useWorkerEntries("today", userId);
  const { mutate: del } = useDeleteEntry();

  const headers = ["Date", "Status", "Name", "Specialty", "Qualifications", "State", "Meeting", "Country", "Notes", ""];

  return (
    <div className="p-6 space-y-6">
      {/* ── Entry form ── */}
      <AddEntryTab />

      {/* ── Divider ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Today's saved entries
        </span>
        <div className="flex-1 h-px bg-border/60" />
      </div>

      {/* ── Today's records ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : todayEntries.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center py-12 gap-2">
          <ClipboardList className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-[12px] text-muted-foreground">No entries saved yet today</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
                  {headers.map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide border-r border-white/10 last:border-r-0 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((e, i) => (
                  <tr key={e.id}
                    className={`border-t border-border/40 hover:bg-primary/[0.03] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
                    <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30 whitespace-nowrap">
                      {e.call_date ? new Date(e.call_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2 border-r border-border/30">
                      {e.status ? <StatusBadge status={e.status} /> : <span className="text-[10px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-medium text-foreground border-r border-border/30">{e.name || "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-foreground border-r border-border/30">{e.specialty || "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground border-r border-border/30 max-w-[140px] truncate">{e.qualifications || "—"}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

const WorkerDashboard = () => {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const userId  = isAdmin ? undefined : (user?.id ?? undefined);
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex min-h-screen bg-background">
      <WorkerSidebar tab={tab} setTab={setTab} isAdmin={isAdmin} />
      <main className="flex-1 overflow-auto">
        {tab === "overview" &&             <OverviewTab isAdmin={isAdmin} userId={userId} />}
        {tab === "daily"    && !isAdmin && <DailyTab userId={userId} />}
        {tab === "week"     && !isAdmin && <RecordsTab filter="week"  isAdmin={false} userId={userId} />}
        {tab === "all"      &&             <RecordsTab filter="all"   isAdmin={isAdmin} userId={userId} />}
      </main>
    </div>
  );
};

export default WorkerDashboard;

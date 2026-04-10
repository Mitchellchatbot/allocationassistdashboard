import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/use-auth";
import { useWorkerEntries, useSaveEntries, useDeleteEntry, type WorkerEntry } from "@/hooks/use-worker-entries";
import {
  ClipboardList, PlusCircle, LogOut, Loader2, Save, Trash2,
  CalendarDays, Clock, BarChart2, ChevronDown, Check, X,
} from "lucide-react";

// ── Status configuration ──────────────────────────────────────────────────────

const STATUSES = [
  "High Priority",
  "Contact in Future",
  "Declined",
  "Not Interested",
  "Minimal Follow Up",
  "Initial Sales",
] as const;

type Status = typeof STATUSES[number];

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "High Priority":     { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  "Contact in Future": { bg: "#fdf2f8", text: "#be185d", border: "#f9a8d4" },
  "Declined":          { bg: "#7f1d1d", text: "#ffffff", border: "#991b1b" },
  "Not Interested":    { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  "Minimal Follow Up": { bg: "#1f2937", text: "#ffffff", border: "#374151" },
  "Initial Sales":     { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
};

const MEETING_TYPES = ["Phone Call", "Video Call", "In Person", "Email", "WhatsApp", "Other"];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      {status}
    </span>
  );
}

// ── Status select (custom colored dropdown) ───────────────────────────────────

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[value];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold min-w-[120px] justify-between"
        style={s
          ? { backgroundColor: s.bg, color: s.text, borderColor: s.border }
          : { backgroundColor: "#f9fafb", color: "#6b7280", borderColor: "#d1d5db" }
        }
      >
        <span>{value || "Select status…"}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 left-0 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 w-44 overflow-hidden">
            {STATUSES.map((st) => {
              const style = STATUS_STYLE[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => { onChange(st); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                    style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}
                  >
                    {st}
                  </span>
                  {value === st && <Check className="h-3 w-3 text-primary ml-auto" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Empty row factory ─────────────────────────────────────────────────────────

function emptyRow(): WorkerEntry & { _key: string } {
  return {
    _key:                String(Math.random()),
    call_date:           new Date().toISOString().split("T")[0],
    status:              "",
    name:                "",
    specialty:           "",
    qualifications:      "",
    state:               "",
    meeting_type:        "",
    country_of_training: "",
    notes:               "",
  };
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

type Tab = "add" | "today" | "week" | "all";

function WorkerSidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { signOut, user } = useAuth();
  const navigate          = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate("/login", { replace: true }); };

  const navItems: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: "add",   icon: PlusCircle,   label: "Add Entry"    },
    { id: "today", icon: Clock,        label: "Today"        },
    { id: "week",  icon: CalendarDays, label: "This Week"    },
    { id: "all",   icon: BarChart2,    label: "All Records"  },
  ];

  return (
    <aside
      className="w-56 shrink-0 flex flex-col min-h-screen"
      style={{ backgroundColor: "hsl(170, 45%, 28%)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        <img src={logo} alt="Allocation Assist" className="h-9 w-9 object-contain shrink-0" />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-white">Allocation Assist</p>
          <p className="text-[9px] text-white/50">Worker Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pt-4 space-y-0.5">
        <p className="text-[9px] uppercase tracking-widest text-white/30 px-3 mb-2">Menu</p>
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] transition-colors text-left ${
              tab === id
                ? "bg-white/15 text-white font-medium"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="px-2 pb-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <div className="h-6 w-6 rounded-full bg-white/20 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {(user?.email ?? "W").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-white truncate">{user?.email ?? "worker"}</p>
            <p className="text-[8px] text-white/40">Worker</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
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
  const [rows, setRows] = useState<RowType[]>([emptyRow()]);
  const { mutateAsync: save, isPending } = useSaveEntries();
  const [saved, setSaved] = useState(false);
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      await save(valid.map(({ _key, ...rest }) => rest));
      setRows([emptyRow()]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(String(e));
    }
  };

  const COLS = [
    { key: "call_date",           label: "Date",               width: "w-28"  },
    { key: "status",              label: "Status",             width: "w-36"  },
    { key: "name",                label: "Name",               width: "w-36"  },
    { key: "specialty",           label: "Specialty",          width: "w-32"  },
    { key: "qualifications",      label: "Qualifications",     width: "w-40"  },
    { key: "state",               label: "State",              width: "w-20"  },
    { key: "meeting_type",        label: "Meeting",            width: "w-28"  },
    { key: "country_of_training", label: "Country of Training",width: "w-36"  },
    { key: "notes",               label: "Notes",              width: "w-56"  },
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
            <span className="flex items-center gap-1.5 text-[11px] text-success font-medium">
              <Check className="h-3.5 w-3.5" /> Saved!
            </span>
          )}
          <button
            onClick={() => setRows(prev => [...prev, emptyRow()])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" /> Add Row
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60 transition-colors"
            style={{ backgroundColor: "hsl(170, 45%, 28%)" }}
          >
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

      {/* Spreadsheet table */}
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
                <tr
                  key={row._key}
                  className={`border-t border-border/40 hover:bg-primary/[0.02] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                >
                  {/* Date */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input type="date" value={row.call_date} onChange={e => update(row._key, "call_date", e.target.value)} className={inputCls} />
                  </td>
                  {/* Status */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <StatusSelect value={row.status} onChange={v => update(row._key, "status", v)} />
                  </td>
                  {/* Name */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Full name" value={row.name} onChange={e => update(row._key, "name", e.target.value)} className={inputCls} />
                  </td>
                  {/* Specialty */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. Cardiology" value={row.specialty} onChange={e => update(row._key, "specialty", e.target.value)} className={inputCls} />
                  </td>
                  {/* Qualifications */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. CCST 2014 UK" value={row.qualifications} onChange={e => update(row._key, "qualifications", e.target.value)} className={inputCls} />
                  </td>
                  {/* State */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Full / Part" value={row.state} onChange={e => update(row._key, "state", e.target.value)} className={inputCls} />
                  </td>
                  {/* Meeting */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <select value={row.meeting_type} onChange={e => update(row._key, "meeting_type", e.target.value)} className={inputCls + " cursor-pointer"}>
                      <option value="">— type —</option>
                      {MEETING_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  {/* Country */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="e.g. UK" value={row.country_of_training} onChange={e => update(row._key, "country_of_training", e.target.value)} className={inputCls} />
                  </td>
                  {/* Notes */}
                  <td className="px-2 py-1.5 border-r border-border/30">
                    <input placeholder="Add notes…" value={row.notes} onChange={e => update(row._key, "notes", e.target.value)} className={inputCls} />
                  </td>
                  {/* Delete row */}
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
        className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        <PlusCircle className="h-3.5 w-3.5" /> Add another row
      </button>
    </div>
  );
}

// ── Records tab ───────────────────────────────────────────────────────────────

type DateFilter = "today" | "week" | "month" | "all";

function RecordsTab({ filter }: { filter: DateFilter }) {
  const { data: entries = [], isLoading } = useWorkerEntries(filter);
  const { mutate: del } = useDeleteEntry();
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = statusFilter
    ? entries.filter(e => e.status === statusFilter)
    : entries;

  const headers = ["Date", "Status", "Name", "Specialty", "Qualifications", "State", "Meeting", "Country", "Notes", ""];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">
            {filter === "today" ? "Today's Entries" : filter === "week" ? "This Week" : "All Records"}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">{filtered.length} entries</p>
        </div>
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-secondary/40 px-3 text-[11px] text-foreground outline-none focus:border-primary transition-all"
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center py-20 gap-3">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">No entries yet</p>
          <p className="text-[11px] text-muted-foreground/60">Use "Add Entry" to log your calls</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
                  {headers.map(h => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide border-r border-white/10 last:border-r-0 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr
                    key={e.id}
                    className={`border-t border-border/40 hover:bg-primary/[0.03] transition-colors ${i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}
                  >
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
                        <button
                          onClick={() => window.confirm("Delete this entry?") && del(e.id!)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors"
                        >
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

// ── Quick stats strip ─────────────────────────────────────────────────────────

function StatsStrip() {
  const { data: todayEntries  = [] } = useWorkerEntries("today");
  const { data: weekEntries   = [] } = useWorkerEntries("week");
  const { data: allEntries    = [] } = useWorkerEntries("all");

  const tiles = [
    { label: "Today",      value: todayEntries.length,  color: "text-primary"   },
    { label: "This Week",  value: weekEntries.length,   color: "text-info"      },
    { label: "All Time",   value: allEntries.length,    color: "text-foreground" },
  ];

  return (
    <div className="flex gap-3 px-6 pt-6">
      {tiles.map(t => (
        <div key={t.label} className="flex-1 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 hover:shadow-sm transition-shadow">
          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{t.label}</p>
          <p className={`text-[22px] font-semibold tabular-nums leading-none ${t.color}`}>{t.value}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">entries logged</p>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const WorkerDashboard = () => {
  const [tab, setTab] = useState<Tab>("add");

  return (
    <div className="flex min-h-screen bg-background">
      <WorkerSidebar tab={tab} setTab={setTab} />

      <main className="flex-1 overflow-auto">
        <StatsStrip />
        <div className="mt-4">
          {tab === "add"   && <AddEntryTab />}
          {tab === "today" && <RecordsTab filter="today" />}
          {tab === "week"  && <RecordsTab filter="week"  />}
          {tab === "all"   && <RecordsTab filter="all"   />}
        </div>
      </main>
    </div>
  );
};

export default WorkerDashboard;

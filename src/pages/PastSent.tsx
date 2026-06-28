import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Search, Download, ArrowUpDown, ExternalLink } from "lucide-react";
import { useSentHistory, SENT_KIND_LABEL, type SentRecord } from "@/hooks/use-sent-history";
import { SearchFilterChips, chipMatches, type SentChip } from "@/components/search/SearchFilterChips";

/**
 * Past Sent (Amir #6) — a searchable, filterable history of every batch + profile
 * sent. Gmail-like: free text + operators (specialty: / hospital: / doctor: /
 * sent:), chips for the slot (1st/2nd profile, top 15, daily specialty), country
 * + date-range filters, sortable columns, and CSV export. 100% derived from
 * cached DB data (useSentHistory) — no edge function, works in npm run dev.
 */
type SortKey = "sentAt" | "doctorName" | "specialty" | "sentKind" | "hospital";
type DateRange = "all" | "7" | "30" | "90";

export default function PastSent() {
  const { records } = useSentHistory();
  const navigate = useNavigate();
  const [raw, setRaw]       = useState("");
  const [chip, setChip]     = useState<SentChip>("all");
  const [country, setCountry] = useState<string>("all");
  const [range, setRange]   = useState<DateRange>("all");
  const [sortKey, setSortKey] = useState<SortKey>("sentAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of records) if (r.country) s.add(r.country);
    return [...s].sort();
  }, [records]);

  const { filters, text } = useMemo(() => parseQuery(raw), [raw]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = range === "all" ? Infinity : Number(range) * 86_400_000;
    return records.filter(r => {
      if (!chipMatches(chip, r.sentKind, r.slot)) return false;
      if (country !== "all" && r.country !== country) return false;
      if (r.sentAt && range !== "all" && now - new Date(r.sentAt).getTime() > rangeMs) return false;
      if (filters.specialty && !(r.specialty ?? "").toLowerCase().includes(filters.specialty)) return false;
      if (filters.hospital && !(r.hospital ?? "").toLowerCase().includes(filters.hospital)) return false;
      if (filters.doctor && !r.doctorName.toLowerCase().includes(filters.doctor)) return false;
      if (filters.sent && !matchRelativeDate(r.sentAt, filters.sent)) return false;
      if (text) {
        const hay = `${r.doctorName} ${r.specialty ?? ""} ${r.hospital ?? ""} ${r.slot} ${SENT_KIND_LABEL[r.sentKind]} ${r.country ?? ""}`.toLowerCase();
        if (!text.split(/\s+/).every(t => hay.includes(t))) return false;
      }
      return true;
    });
  }, [records, chip, country, range, filters, text]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "sentAt" ? "desc" : "asc"); }
  };

  const exportCsv = () => {
    const header = ["Doctor", "Specialty", "Sent type", "Slot", "Hospital", "Country", "Sent at"];
    const rows = sorted.map(r => [r.doctorName, r.specialty ?? "", SENT_KIND_LABEL[r.sentKind], r.slot, r.hospital ?? "", r.country ?? "", r.sentAt ?? ""]);
    const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `past-sent-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <History className="h-6 w-6 text-teal-600" /> Past Sent
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every doctor that's gone out — by batch slot (1st / 2nd profile, Top 15, daily specialty) or individual send. Search by name, specialty, hospital, or date.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={sorted.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">History · {sorted.length} record{sorted.length === 1 ? "" : "s"}</CardTitle>
            <CardDescription className="text-[11px]">
              Operators: <code>specialty:cardiology</code> · <code>hospital:american</code> · <code>doctor:costeira</code> · <code>sent:this week</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={raw} onChange={e => setRaw(e.target.value)} placeholder="Search name, specialty, hospital, or use operators…" className="pl-9 h-9 text-[13px]" />
              </div>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-9 w-[130px] text-[12px]"><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <SearchFilterChips active={chip} onChange={setChip} />

            {sorted.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-muted-foreground">
                {records.length === 0
                  ? "No sends recorded yet. Once a batch or profile send goes out (status 'sent'), it'll appear here."
                  : "No records match your filters."}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-[12px] border-collapse">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <Th label="Doctor" onClick={() => toggleSort("doctorName")} active={sortKey === "doctorName"} />
                      <Th label="Specialty" onClick={() => toggleSort("specialty")} active={sortKey === "specialty"} />
                      <Th label="Sent type" onClick={() => toggleSort("sentKind")} active={sortKey === "sentKind"} />
                      <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Slot</th>
                      <Th label="Hospital" onClick={() => toggleSort("hospital")} active={sortKey === "hospital"} />
                      <Th label="Sent" onClick={() => toggleSort("sentAt")} active={sortKey === "sentAt"} />
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, 500).map(r => (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="py-2 px-3 font-medium">{r.doctorName}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.specialty ?? "—"}</td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">{SENT_KIND_LABEL[r.sentKind]}</Badge></td>
                        <td className="py-2 px-3">{r.slot}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.hospital ?? (r.country ? `All · ${r.country}` : "All hospitals")}</td>
                        <td className="py-2 px-3 tabular-nums text-muted-foreground">{fmtDate(r.sentAt)}</td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={() => navigate(r.route)} className="inline-flex items-center gap-1 text-teal-600 hover:underline text-[11px]" title="Open">
                            Open <ExternalLink className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length > 500 && <div className="px-3 py-2 text-[10px] text-muted-foreground italic">Showing first 500 of {sorted.length}. Narrow with search/filters or export CSV for the full set.</div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Th({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <th className="py-2 px-3 font-semibold text-muted-foreground uppercase text-[10px] tracking-wide cursor-pointer select-none" onClick={onClick}>
      <span className={`inline-flex items-center gap-1 ${active ? "text-teal-700" : ""}`}>{label}<ArrowUpDown className="h-3 w-3 opacity-50" /></span>
    </th>
  );
}

/** Pull `specialty:`/`hospital:`/`doctor:`/`sent:` operators out of the query. */
function parseQuery(raw: string): { filters: { specialty?: string; hospital?: string; doctor?: string; sent?: string }, text: string } {
  const filters: { specialty?: string; hospital?: string; doctor?: string; sent?: string } = {};
  const tokens = raw.trim().split(/\s+/);
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const m = /^(specialty|hospital|doctor|sent):(.*)$/i.exec(t);
    if (m) {
      const key = m[1].toLowerCase() as keyof typeof filters;
      // sent: accepts a multi-word phrase ("this week"); grab the rest greedily.
      if (key === "sent") { filters.sent = [m[2], ...tokens.slice(i + 1)].join(" ").toLowerCase().trim(); break; }
      filters[key] = m[2].toLowerCase();
    } else rest.push(t);
  }
  return { filters, text: rest.join(" ").toLowerCase().trim() };
}

function matchRelativeDate(iso: string | null, phrase: string): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  const now = Date.now();
  const days = (now - d) / 86_400_000;
  const p = phrase.trim();
  if (/today/.test(p)) return days < 1;
  if (/yesterday/.test(p)) return days >= 1 && days < 2;
  if (/this week|last 7|past week|week/.test(p)) return days <= 7;
  if (/this month|last 30|past month|month/.test(p)) return days <= 31;
  if (/90|quarter/.test(p)) return days <= 90;
  // Absolute year-month e.g. "2026-06"
  const ym = /^(\d{4})-(\d{2})$/.exec(p);
  if (ym) return iso.startsWith(p);
  return true;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

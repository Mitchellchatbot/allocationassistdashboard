import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight } from "lucide-react";
import { useZohoData, type ZohoDoctorOnBoard, type ZohoLead } from "@/hooks/use-zoho-data";

export interface DoctorOption {
  id:         string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  speciality: string | null;
  source:     "dob" | "lead";
}

/** Doctor picker shared between the Send Profile and manual-trigger dialogs.
 *  Sources doctors from both Zoho modules (Doctors on Board + Leads) and lets
 *  the parent decide what happens on pick. */
export function DoctorPicker({ onPick, autoFocus = true, maxResults = 50 }: {
  onPick: (d: DoctorOption) => void;
  autoFocus?: boolean;
  maxResults?: number;
}) {
  const { data: zoho, isLoading } = useZohoData();
  const [q, setQ] = useState("");

  const options: DoctorOption[] = useMemo(() => {
    const opts: DoctorOption[] = [];
    const z = zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[]; rawLeads?: ZohoLead[] } | undefined;
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      if (!name) continue;
      opts.push({ id: `dob:${d.id}`, name, email: d.Email, phone: d.Phone ?? d.Mobile, speciality: d.Specialty, source: "dob" });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      if (!name) continue;
      opts.push({ id: `lead:${l.id}`, name, email: l.Email, phone: l.Phone ?? l.Mobile, speciality: l.Specialty ?? l.Specialty_New, source: "lead" });
    }
    return opts;
  }, [zoho]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options.slice(0, maxResults);
    return options.filter(o =>
      o.name.toLowerCase().includes(term) ||
      o.email?.toLowerCase().includes(term) ||
      o.speciality?.toLowerCase().includes(term),
    ).slice(0, Math.max(maxResults, 100));
  }, [options, q, maxResults]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={isLoading ? "Loading doctors..." : "Search by name, email, or speciality..."}
          className="pl-7 text-[12px]"
        />
      </div>
      <div className="rounded-md border max-h-[360px] overflow-y-auto divide-y">
        {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No doctors match.</div>
        )}
        {filtered.map(d => (
          <button
            key={d.id}
            onClick={() => onPick(d)}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium truncate">{d.name}</span>
                <Badge variant="outline" className="text-[9px] uppercase">{d.source === "dob" ? "DoB" : "Lead"}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {d.speciality ?? "—"} · {d.email ?? d.phone ?? "no contact"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">
        Showing {filtered.length} of {options.length}.
      </div>
    </div>
  );
}

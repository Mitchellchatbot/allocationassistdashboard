import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Search, Check, X, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useZohoData } from "@/hooks/use-zoho-data";
import { buildDoctorMatcher } from "@/lib/doctor-name-matcher";
import {
  useUnmatchedLicensing, useResolveLicensing, useIgnoreLicensing,
  type UnmatchedLicensingGroup,
} from "@/hooks/use-licensing-costs";

const aed = (n: number) => `AED ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Reconciliation queue for imported licensing fees whose "Customer Name" didn't
 * match a doctor. Grouped by name (assign once → applies to every fee for that
 * person). Shows a best-guess suggestion you can accept in one click, a search
 * to pick anyone else, or Ignore for non-doctors. Assigned fees drop into that
 * doctor's ledger on Doctors → Overview.
 */
export function LicensingReview() {
  const { data: groups = [], isLoading } = useUnmatchedLicensing();
  const { rawLeads = [], rawDoctorsOnBoard = [] } = useZohoData() as {
    rawLeads?: Array<{ id: string; Full_Name?: string | null }>;
    rawDoctorsOnBoard?: Array<{ id: string; Full_Name?: string | null }>;
  };
  const resolve = useResolveLicensing();
  const ignore = useIgnoreLicensing();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pickingName, setPickingName] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Candidate doctor list (leads + Doctors-on-Board) → matcher for suggestions +
  // a flat list for search.
  const candidates = useMemo(() => {
    const out: { prefixedId: string; name: string }[] = [];
    for (const l of rawLeads) if (l.Full_Name) out.push({ prefixedId: "lead:" + l.id, name: l.Full_Name });
    for (const d of rawDoctorsOnBoard) if (d.Full_Name) out.push({ prefixedId: "dob:" + d.id, name: d.Full_Name });
    return out;
  }, [rawLeads, rawDoctorsOnBoard]);
  const matcher = useMemo(() => buildDoctorMatcher(candidates), [candidates]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups;
    return list;
  }, [groups, filter]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const parts = q.split(/\s+/);
    return candidates
      .filter(c => { const n = c.name.toLowerCase(); return parts.every(p => n.includes(p)); })
      .slice(0, 8);
  }, [query, candidates]);

  const doResolve = (g: UnmatchedLicensingGroup, prefixedId: string, name: string) => {
    resolve.mutate({ ids: g.ids, doctorId: prefixedId, doctorName: name }, {
      onSuccess: () => { toast.success(`${g.count} fee${g.count === 1 ? "" : "s"} → ${name}`); setPickingName(null); setQuery(""); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't assign"),
    });
  };
  const doIgnore = (g: UnmatchedLicensingGroup) => {
    ignore.mutate({ ids: g.ids }, {
      onSuccess: () => toast.message(`Ignored ${g.name}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't ignore"),
    });
  };

  if (isLoading || groups.length === 0) return null; // nothing to reconcile

  const totalFees = groups.reduce((s, g) => s + g.count, 0);
  const totalAed = groups.reduce((s, g) => s + g.totalAed, 0);

  return (
    <Card className="mb-5 border-amber-300/70 bg-amber-50/40 shadow-sm">
      <CardHeader className="pb-2 pt-3.5 px-5 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-amber-700 shrink-0" /> : <ChevronRight className="h-4 w-4 text-amber-700 shrink-0" />}
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <CardTitle className="text-[13px] font-semibold text-amber-900">
            {groups.length} {groups.length === 1 ? "person" : "people"} · {totalFees} licensing fee{totalFees === 1 ? "" : "s"} need a doctor
          </CardTitle>
          <span className="ml-auto text-[11px] text-amber-700/80 tabular-nums">{aed(totalAed)} unassigned</span>
        </div>
        {!open && <p className="text-[11px] text-amber-700/80 mt-1 ml-6">Imported fees whose name didn't match a doctor. Click to review — accept a suggestion, pick the right person, or ignore.</p>}
      </CardHeader>

      {open && (
        <CardContent className="px-5 pb-4">
          <div className="relative mb-2.5 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter the queue by name…"
              className="h-8 w-full rounded-md border border-border/60 bg-white pl-7 pr-2 text-[12px] outline-none focus:border-amber-400"
            />
          </div>

          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {shown.slice(0, 200).map(g => {
              const sugg = matcher(g.name);
              const isPicking = pickingName === g.name;
              return (
                <div key={g.name} className="rounded-lg border border-border/50 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground truncate">{g.name}</div>
                      <div className="text-[10.5px] text-muted-foreground truncate">
                        {g.count} fee{g.count === 1 ? "" : "s"} · {aed(g.totalAed)}
                        {g.months.length > 0 && <> · {g.months.sort().join(", ")}</>}
                        {g.purposes.length > 0 && <> · {g.purposes.join(", ")}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {sugg.prefixedId && sugg.matchedTo && (
                        <button
                          type="button"
                          onClick={() => doResolve(g, sugg.prefixedId!, sugg.matchedTo!)}
                          disabled={resolve.isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2 py-1 text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                          title={`Suggested match (${sugg.confidence})`}
                        >
                          <Sparkles className="h-3 w-3" /> {sugg.matchedTo.replace(/^Dr\.?\s+/, "")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setPickingName(isPicking ? null : g.name); setQuery(""); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-muted/60"
                      >
                        {isPicking ? "Close" : "Assign…"}
                      </button>
                      <button
                        type="button"
                        onClick={() => doIgnore(g)}
                        disabled={ignore.isPending}
                        className="inline-flex items-center justify-center rounded-md border border-border/50 h-7 w-7 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        title="Not a doctor / can't place — remove from queue"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isPicking && (
                    <div className="mt-2 border-t border-border/40 pt-2">
                      <div className="relative max-w-sm">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          autoFocus
                          value={query}
                          onChange={e => setQuery(e.target.value)}
                          placeholder="Search doctors + leads…"
                          className="h-8 w-full rounded-md border border-border/60 bg-white pl-7 pr-2 text-[12px] outline-none focus:border-teal-400"
                        />
                      </div>
                      <div className="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                        {query.trim().length < 2 ? (
                          <div className="text-[11px] text-muted-foreground px-1 py-1">Type a name to search.</div>
                        ) : searchResults.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground px-1 py-1">No match.</div>
                        ) : searchResults.map(c => (
                          <button
                            key={c.prefixedId}
                            type="button"
                            onClick={() => doResolve(g, c.prefixedId, c.name)}
                            disabled={resolve.isPending}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-teal-50 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3 text-teal-600 shrink-0" />
                            <span className="truncate">{c.name}</span>
                            <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">{c.prefixedId.split(":")[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {shown.length > 200 && <div className="text-[11px] text-muted-foreground py-2 text-center">Showing 200 of {shown.length} · filter to narrow.</div>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

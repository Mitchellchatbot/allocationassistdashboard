import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2 } from "lucide-react";
import type { MetaLeadRow } from "@/hooks/use-meta-lead-attribution";

/**
 * Generic drill-down modal for Meta lead-form submissions.
 *
 * Driven by props rather than its own data fetching — the parent passes the
 * already-resolved `leads` list (from useMetaLeadAttribution.leadsForAd /
 * leadsForAdset / leadsForCampaign) plus the heading metadata. The modal
 * just renders, filters, and lets the user toggle between All / Qualified
 * / Converted views.
 */
export function MetaLeadsModal({
  open, onClose, title, subtitle, leads, initialFilter = "all",
}: {
  open:           boolean;
  onClose:        () => void;
  title:          string;
  subtitle?:      string;
  leads:          MetaLeadRow[];
  initialFilter?: "all" | "qualified" | "converted";
}) {
  const [filter, setFilter] = useState(initialFilter);

  const filtered = useMemo(() => {
    if (filter === "qualified") return leads.filter(l => l.qualified);
    if (filter === "converted") return leads.filter(l => l.converted);
    return leads;
  }, [leads, filter]);

  const counts = useMemo(() => ({
    all:       leads.length,
    qualified: leads.filter(l => l.qualified).length,
    converted: leads.filter(l => l.converted).length,
  }), [leads]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(640px, 95vw)", maxHeight: "85vh", zIndex: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Leads</p>
            <p className="text-[15px] font-semibold leading-tight truncate" title={title}>{title}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-full h-8 w-8 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border/60 shrink-0 px-2">
          {(["all", "qualified", "converted"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2.5 text-[12px] font-medium capitalize transition-colors ${
                filter === f
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? `All (${counts.all})` : f === "qualified" ? `Qualified (${counts.qualified})` : `Converted (${counts.converted})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-12">
              No {filter === "all" ? "leads" : filter} matched.
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(l => (
                <div key={l.id} className="rounded-lg border border-border/50 bg-card px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">{l.fullName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {l.email ?? "no email"}{l.speciality ? ` · ${l.speciality}` : ""}{l.location ? ` · ${l.location}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-1">
                      {l.converted ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Converted
                        </span>
                      ) : l.qualified ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">Qualified</span>
                      ) : l.zohoStatus ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground border border-border/50" title={l.zohoStatus}>
                          {l.zohoStatus.length > 24 ? l.zohoStatus.slice(0, 22) + "…" : l.zohoStatus}
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">Not in Zoho</span>
                      )}
                      {l.submittedAt && (
                        <span className="text-[9px] text-muted-foreground tabular-nums">
                          {new Date(l.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

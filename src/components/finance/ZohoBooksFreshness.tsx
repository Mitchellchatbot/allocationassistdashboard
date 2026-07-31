import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useZohoBooks, forceRefreshZohoBooks } from "@/hooks/use-zoho-books";

/** "Synced Nm ago" relative label (mirrors DashboardLayout's SyncedAtButton). */
function rel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  const hrs  = Math.floor(mins / 60);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Freshness + manual-refresh chip for the Finance page. The Zoho Books figures
 * are served from a SHARED server cache (so everyone sees the same numbers); this
 * shows how fresh that cache is ("Synced 4m ago") and lets anyone force a live
 * pull before a meeting — after which everyone converges on the same value.
 * Reads the already-cached `useZohoBooks` query, so it adds no extra fetch.
 */
export function ZohoBooksFreshness({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const qc = useQueryClient();
  const { data: books, isFetching } = useZohoBooks(dateRange);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  // Own 60s tick so the relative label counts up without re-rendering the page.
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(t); }, []);

  if (!books?.configured) return null; // Books not connected → nothing to show

  const pending  = busy || isFetching;
  const syncedAt = books.synced_at;
  // Categorisation self-check: every top-level Zoho P&L section should be
  // recognised. `unmatched` is money that would be left out of the totals — it
  // should always be empty; if it isn't, flag it loudly.
  const sections  = books.pnlSections;
  const unmatched = sections?.unmatched ?? [];
  const coverageNote = sections
    ? unmatched.length
      ? `⚠ ${unmatched.length} P&L section(s) not categorised: ${unmatched.map(u => u.name).join(", ")} — these are NOT in the totals.`
      : `All ${sections.income.length + sections.expense.length} income/expense sections from Zoho's P&L are categorised into the totals.`
    : null;

  const onRefresh = async () => {
    setBusy(true);
    try {
      await forceRefreshZohoBooks(dateRange);
      await qc.invalidateQueries({ queryKey: ["zoho-books"] });
      toast.success("Finance refreshed from Zoho Books.");
    } catch {
      toast.error("Couldn't refresh from Zoho Books — showing the last-known figures.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => !pending && onRefresh()}
            disabled={pending}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-full border border-border/40 bg-white/70 text-muted-foreground hover:text-foreground hover:bg-white transition-all disabled:opacity-60"
          >
            {books.stale
              ? <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
              : <RefreshCw className={`h-3 w-3 shrink-0 ${pending ? "animate-spin" : ""}`} />}
            {pending
              ? "Refreshing…"
              : syncedAt
                ? <>Synced {rel(syncedAt)}{books.stale ? <span className="text-amber-600"> · offline copy</span> : null}</>
                : "Refresh"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px] max-w-[260px]">
          {books.stale
            ? "Zoho Books was briefly unreachable — showing the last figures that synced. Click to try a live pull."
            : syncedAt
              ? `Zoho Books figures as of ${new Date(syncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Everyone sees this same cached result; click to pull live.`
              : "Click to pull live Zoho Books figures."}
          {coverageNote && <div className="mt-1 pt-1 border-t border-border/40">{coverageNote}</div>}
        </TooltipContent>
      </Tooltip>

      {/* Coverage flag — only appears if Zoho ever emits a P&L section we don't
          recognise, i.e. money that would be left out of the totals. */}
      {unmatched.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 h-7 px-2 text-[11px] font-medium rounded-full border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {unmatched.length} uncategorised
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px] max-w-[260px]">
            {coverageNote}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

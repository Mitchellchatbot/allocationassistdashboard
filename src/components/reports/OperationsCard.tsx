/**
 * Pipeline health / Operations.
 *
 * Coverage the Reports page was missing entirely — the machinery behind
 * the funnel rather than the funnel itself. Four panels, each reusing an
 * existing hook (no new data-fetching):
 *
 *   - Contracts e-sign funnel   — use-contract-activity  (sent → viewed → signed; declined/expired/failed)
 *   - CV backlog                — use-cv-uploads          (pending / extracting / extracted / failed)
 *   - Batch sends               — use-scheduled-batches   (sent vs failed, by recency)
 *   - Candidate pool            — use-wp-candidates       (publish/private/draft + staged + % Zoho-linked)
 *
 * These hooks each cap at a recent window (contract_sends / batches keep
 * the last ~200 rows), so the counts here are "recent operations" not
 * all-time — the section header flags that scope.
 */
import { useMemo } from "react";
import { FileSignature, FileText, Send, Users, AlertTriangle } from "lucide-react";
import { useContractActivity, type ContractStatus } from "@/hooks/use-contract-activity";
import { usePendingCvUploads } from "@/hooks/use-cv-uploads";
import { useScheduledBatches } from "@/hooks/use-scheduled-batches";
import { useWpCandidates, useStagedProfiles } from "@/hooks/use-wp-candidates";

/** Headline counts for the collapsed-trigger summary. Derived from the
 *  same hooks the body renders, so nothing is fetched twice. */
export function useOperationsSummary() {
  const { data: contracts = [] } = useContractActivity();
  const { data: batches = [] }   = useScheduledBatches();
  const { data: cvPending = [] } = usePendingCvUploads();

  return useMemo(() => {
    const signed = contracts.filter(c => c.status === "signed").length;
    const failedBatches = batches.filter(b => b.status === "failed").length;
    return { contractsSigned: signed, cvPending: cvPending.length, failedBatches };
  }, [contracts, batches, cvPending]);
}

const CONTRACT_STAGES: Array<{ key: ContractStatus; label: string; tone: string }> = [
  { key: "sent",     label: "Sent",     tone: "text-slate-700" },
  { key: "viewed",   label: "Viewed",   tone: "text-sky-700" },
  { key: "signed",   label: "Signed",   tone: "text-emerald-700" },
  { key: "declined", label: "Declined", tone: "text-rose-700" },
  { key: "expired",  label: "Expired",  tone: "text-amber-700" },
];

export function OperationsContent() {
  const { data: contracts = [], isLoading: cl } = useContractActivity();
  const { data: cvPending = [],  isLoading: vl } = usePendingCvUploads();
  const { data: batches = [],    isLoading: bl } = useScheduledBatches();
  const { data: candidates = [], isLoading: wl } = useWpCandidates();
  const { data: staged = [],     isLoading: sl } = useStagedProfiles();

  const contractCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of contracts) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [contracts]);

  const cvCounts = useMemo(() => {
    // usePendingCvUploads only returns status='pending_upload' rows, so
    // "pending" IS its length. We don't have an all-status feed without a
    // new query, so we surface the pending backlog (the chase list) — the
    // metric Saif's team actually acts on.
    return { pending: cvPending.length };
  }, [cvPending]);

  const batchCounts = useMemo(() => {
    const sent      = batches.filter(b => b.status === "sent").length;
    const failed    = batches.filter(b => b.status === "failed").length;
    const draft     = batches.filter(b => b.status === "draft").length;
    return { sent, failed, draft };
  }, [batches]);

  const poolCounts = useMemo(() => {
    let publish = 0, priv = 0, draft = 0, linked = 0;
    for (const c of candidates) {
      const s = (c.status ?? "").toLowerCase();
      if (s === "publish") publish++;
      else if (s === "private") priv++;
      else if (s === "draft") draft++;
      if (c.doctor_id) linked++;
    }
    const total = candidates.length;
    const pctLinked = total > 0 ? Math.round((linked / total) * 100) : 0;
    return { publish, priv, draft, total, pctLinked, staged: staged.length };
  }, [candidates, staged]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Contracts e-sign funnel */}
      <Panel
        icon={<FileSignature className="h-3.5 w-3.5 text-amber-600" />}
        title="Contracts (e-sign)"
        subtitle="Recent BoldSign sends"
        loading={cl}
        empty={contracts.length === 0}
        emptyText="No contracts sent yet."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CONTRACT_STAGES.map(s => (
            <Stat key={s.key} label={s.label} value={contractCounts[s.key] ?? 0} tone={s.tone} />
          ))}
          {(contractCounts.failed ?? 0) > 0 && (
            <Stat label="Failed" value={contractCounts.failed} tone="text-rose-700" />
          )}
        </div>
      </Panel>

      {/* CV backlog */}
      <Panel
        icon={<FileText className="h-3.5 w-3.5 text-indigo-600" />}
        title="CV backlog"
        subtitle="Upload links awaiting a doctor"
        loading={vl}
        empty={false}
      >
        <div className="flex items-center gap-2">
          <Stat label="Pending upload" value={cvCounts.pending} tone={cvCounts.pending > 0 ? "text-amber-700" : "text-slate-700"} />
          {cvCounts.pending > 0 && (
            <span className="text-[10px] text-muted-foreground">— chase these to unblock profile sends.</span>
          )}
        </div>
      </Panel>

      {/* Batch sends */}
      <Panel
        icon={<Send className="h-3.5 w-3.5 text-teal-600" />}
        title="Batch sends"
        subtitle="Recent scheduled batches"
        loading={bl}
        empty={batches.length === 0}
        emptyText="No batches scheduled yet."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Stat label="Sent"   value={batchCounts.sent}   tone="text-emerald-700" />
          <Stat label="Draft"  value={batchCounts.draft}  tone="text-slate-700" />
          <Stat label="Failed" value={batchCounts.failed} tone={batchCounts.failed > 0 ? "text-rose-700" : "text-slate-700"} />
          {batchCounts.failed > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-rose-700">
              <AlertTriangle className="h-3 w-3" /> needs a retry
            </span>
          )}
        </div>
      </Panel>

      {/* Candidate pool */}
      <Panel
        icon={<Users className="h-3.5 w-3.5 text-violet-600" />}
        title="Candidate pool"
        subtitle="WordPress profiles + staging"
        loading={wl || sl}
        empty={poolCounts.total === 0 && poolCounts.staged === 0}
        emptyText="No candidates synced yet."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Stat label="Published" value={poolCounts.publish} tone="text-emerald-700" />
          <Stat label="Private"   value={poolCounts.priv}    tone="text-slate-700" />
          <Stat label="Draft"     value={poolCounts.draft}   tone="text-slate-700" />
          <Stat label="Staged"    value={poolCounts.staged}  tone="text-sky-700" />
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold leading-none tabular-nums text-violet-700">{poolCounts.pctLinked}%</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Zoho-linked</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ icon, title, subtitle, loading, empty, emptyText, children }: {
  icon: React.ReactNode; title: string; subtitle: string;
  loading: boolean; empty: boolean; emptyText?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-slate-50/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
        {icon}{title}
      </div>
      <div className="text-[10px] text-muted-foreground mb-2.5">{subtitle}</div>
      {loading ? (
        <div className="text-[11px] text-muted-foreground py-2">Loading…</div>
      ) : empty ? (
        <div className="text-[11px] text-muted-foreground italic py-2">{emptyText ?? "Nothing here yet."}</div>
      ) : (
        children
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-[18px] font-semibold leading-none tabular-nums ${tone}`}>{value.toLocaleString()}</span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{label}</span>
    </div>
  );
}

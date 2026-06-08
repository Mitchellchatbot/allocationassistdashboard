/**
 * "Contracts & placements to advance" — the late-funnel card on My
 * Workspace.
 *
 * Two sub-lists:
 *   - Contract sends stuck in flight: sent/viewed (awaiting signature) or
 *     expired/failed (need a resend). Click → BoldSign tracking page.
 *   - Placement attempts I created that are stuck mid-funnel (shortlisted →
 *     signed, not yet joined). Click → /reports where the Placements
 *     tracker lives.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { statusClasses } from "@/lib/status-colors";
import { FileSignature, MapPin, Handshake, ChevronRight, ExternalLink, ArrowRight } from "lucide-react";
import { type ContractSendRow, boldsignTrackingUrl } from "@/hooks/use-contract-activity";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";
import { relativeAge } from "@/components/workspace/workspace-time";

export function ContractsPlacementsCard({ contracts, placements, isLoading, scoped }: {
  contracts:  ContractSendRow[];
  placements: PlacementAttempt[];
  isLoading:  boolean;
  scoped:     boolean;
}) {
  const navigate = useNavigate();
  const empty = contracts.length === 0 && placements.length === 0;

  return (
    <Card data-tour="workspace-contracts">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="h-4 w-4 text-emerald-600" />
              Contracts &amp; placements to advance
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Contracts awaiting a signature (or needing a resend) + placements stuck before they join.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/reports")}>
            Open reports <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isLoading && <CardListSkeleton rows={3} />}
        {!isLoading && empty && (
          <EmptyState
            icon={Handshake}
            title="Nothing to advance"
            body={scoped
              ? "No contracts hanging and no placements stuck mid-funnel."
              : "No in-flight contracts or stuck placements across the team."}
            size="sm"
          />
        )}

        {!isLoading && contracts.length > 0 && (
          <Section
            label="Contracts in flight"
            count={contracts.length}
            icon={FileSignature}
            cls="bg-violet-50/40 border-violet-200"
            blurb="Awaiting signature or expired"
          >
            {contracts.slice(0, 6).map(c => (
              <a
                key={c.id}
                href={boldsignTrackingUrl(c.boldsign_document_id)}
                target="_blank"
                rel="noreferrer"
                className="w-full text-left px-3 py-2 hover:bg-white/60 transition-colors flex items-center gap-3"
              >
                <FileSignature className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-900 truncate">{c.doctor_name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    <Badge variant="outline" className={`text-[9px] uppercase tracking-wider mr-1.5 ${statusClasses(c.status)}`}>
                      {c.status}
                    </Badge>
                    sent {relativeAge(c.created_at)}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </a>
            ))}
            {contracts.length > 6 && (
              <Overflow n={contracts.length - 6} noun="contract" onClick={() => navigate("/contracts")} />
            )}
          </Section>
        )}

        {!isLoading && placements.length > 0 && (
          <Section
            label="Placements mid-funnel"
            count={placements.length}
            icon={MapPin}
            cls="bg-teal-50/40 border-teal-200"
            blurb="Shortlisted → signed, not yet joined"
          >
            {placements.slice(0, 6).map(p => (
              <button
                key={p.id}
                onClick={() => navigate("/reports")}
                className="w-full text-left px-3 py-2 hover:bg-white/60 transition-colors flex items-center gap-3"
              >
                <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-900 truncate">{p.doctor_name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {placementStage(p)} · {p.hospital_name} · {relativeAge(p.updated_at)}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
            {placements.length > 6 && (
              <Overflow n={placements.length - 6} noun="placement" onClick={() => navigate("/reports")} />
            )}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

/** Furthest milestone reached on a not-yet-joined attempt. */
function placementStage(p: PlacementAttempt): string {
  if (p.signed_at)      return "Signed";
  if (p.offered_at)     return "Offered";
  if (p.interviewed_at) return "Interviewed";
  return "Shortlisted";
}

function Section({ label, count, icon: Icon, cls, blurb, children }: {
  label:    string;
  count:    number;
  icon:     React.ComponentType<{ className?: string }>;
  cls:      string;
  blurb:    string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border ${cls}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-current/10">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">{label}</span>
        <Badge variant="outline" className="text-[10px] ml-1">{count}</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">{blurb}</span>
      </div>
      <div className="divide-y divide-current/10">{children}</div>
    </div>
  );
}

function Overflow({ n, noun, onClick }: { n: number; noun: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-[10px] text-muted-foreground bg-white/30 hover:bg-white/60 text-left transition-colors"
    >
      +{n} more {noun}{n === 1 ? "" : "s"} — open the tracker to see all →
    </button>
  );
}

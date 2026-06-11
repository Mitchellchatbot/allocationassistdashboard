/**
 * "Queued profiles" — the staging side of My Workspace.
 *
 * Lists staged WP profiles I created that are still awaiting publish to
 * WordPress. Click → /doctors?tab=profiles (the Profiles hub where staging
 * lives).
 *
 * (The old "CV uploads to chase" / resend-upload-link section was removed —
 * the team no longer emails doctors a CV-upload link.)
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { Layers, UserPlus, ChevronRight, ArrowRight } from "lucide-react";
import type { StagedProfile } from "@/hooks/use-wp-candidates";
import { relativeAge } from "@/components/workspace/workspace-time";

export function QueuedProfileCvCard({ staged, isLoading, scoped }: {
  staged:    StagedProfile[];
  isLoading: boolean;
  scoped:    boolean;
}) {
  const navigate = useNavigate();
  const empty = staged.length === 0;

  return (
    <Card data-tour="workspace-queued">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              Queued profiles
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Profiles staged for publishing to WordPress.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/doctors?tab=profiles")}>
            Open profiles <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isLoading && <CardListSkeleton rows={3} />}
        {!isLoading && empty && (
          <EmptyState
            icon={Layers}
            title="Nothing queued"
            body={scoped
              ? "No staged profiles to publish right now."
              : "No staged profiles across the team."}
            size="sm"
          />
        )}

        {!isLoading && staged.length > 0 && (
          <Section
            label="Staged profiles to publish"
            count={staged.length}
            icon={UserPlus}
            cls="bg-indigo-50/40 border-indigo-200"
            blurb="Awaiting publish to WordPress"
          >
            {staged.slice(0, 6).map(p => (
              <button
                key={p.id}
                onClick={() => navigate("/doctors?tab=profiles")}
                className="w-full text-left px-3 py-2 hover:bg-white/60 transition-colors flex items-center gap-3"
              >
                <UserPlus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-900 truncate">{p.full_name ?? "(unnamed)"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {[p.specialty, p.current_location].filter(Boolean).join(" · ") || p.source}
                    {" · staged "}{relativeAge(p.created_at)}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
            {staged.length > 6 && (
              <Overflow n={staged.length - 6} noun="staged profile" onClick={() => navigate("/doctors?tab=profiles")} />
            )}
          </Section>
        )}
      </CardContent>
    </Card>
  );
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
      +{n} more {noun}{n === 1 ? "" : "s"} — open Profiles to see all →
    </button>
  );
}

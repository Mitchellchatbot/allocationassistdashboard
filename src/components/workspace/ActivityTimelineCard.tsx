/**
 * Recent-activity timeline for My Workspace — demoted from the old big
 * read-only block. Now collapsed to ~10 rows with a "View all" toggle,
 * drops low-value email_opened noise, and sits at the BOTTOM of the page
 * so the actionable cards stay above the fold.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock, Mail, Sparkles, Bell, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";
import type { WorkspaceEvent } from "@/hooks/use-my-workspace";
import { relativeAge } from "@/components/workspace/workspace-time";

const COLLAPSED_ROWS = 10;

export function ActivityTimelineCard({ events }: { events: WorkspaceEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  // Drop low-value email_opened rows — they're noise next to sends,
  // replies, completions, and errors.
  const meaningful = useMemo(
    () => events.filter(e => e.event_type !== "email_opened"),
    [events],
  );
  const shown = expanded ? meaningful : meaningful.slice(0, COLLAPSED_ROWS);
  const hidden = meaningful.length - shown.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-sky-600" />
          Recent activity (last 7 days)
        </CardTitle>
        <CardDescription className="text-[11px] mt-1">
          Events that touched your runs — emails sent, replies in, notes added.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {meaningful.length === 0 ? (
          <EmptyState icon={Clock} title="Quiet week so far" body="No events in the last 7 days." size="sm" />
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {shown.map(e => <ActivityRow key={e.id} e={e} />)}
            </div>
            {(hidden > 0 || expanded) && meaningful.length > COLLAPSED_ROWS && (
              <div className="px-3 py-2 border-t border-border/40">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => setExpanded(v => !v)}
                >
                  {expanded
                    ? <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
                    : <>View all {meaningful.length} <ChevronDown className="h-3 w-3 ml-1" /></>}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({ e }: { e: WorkspaceEvent }) {
  const flow = e.flow_key ? FLOW_DEFINITIONS[e.flow_key as FlowKey] : null;
  const Icon =
    e.event_type === "email_sent"    ? Mail :
    e.event_type === "completed"     ? Sparkles :
    e.event_type === "reminder_sent" ? Bell :
    e.event_type === "error"         ? AlertCircle :
    Clock;
  return (
    <div className="px-3 py-2.5 flex items-start gap-3">
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-[2px]" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] truncate">
          <span className="font-medium">{e.doctor_name ?? "(doctor)"}</span>
          {flow && <span className="text-muted-foreground"> · {flow.shortName}</span>}
        </div>
        {e.message && <div className="text-[10px] text-muted-foreground line-clamp-2">{e.message}</div>}
        <div className="text-[9px] text-muted-foreground/80 mt-0.5">{relativeAge(e.occurred_at)}</div>
      </div>
    </div>
  );
}

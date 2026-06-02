import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Workflow, CheckCircle2, Circle, AlertCircle, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FLOW_DEFINITIONS, FLOW_ORDER, type FlowKey } from "@/lib/automation-flows";
import type { FlowRun } from "@/hooks/use-automation-flows";

interface Props {
  open:        boolean;
  onClose:     () => void;
  doctorId:    string | null;
  doctorName:  string | null;
}

/**
 * Per-doctor Journey view. Shows the doctor's progress across all 7 flows as
 * a single vertical timeline — each flow is a row, status badge, current
 * stage, last event, and a chevron into the run if one exists.
 *
 * Designed to replace the "switch between 7 tabs to figure out where Dr. X is"
 * workflow. Pulls every run for the doctor in one query, groups by flow_key,
 * and renders the latest run per flow.
 */
export function DoctorJourneyDialog({ open, onClose, doctorId, doctorName }: Props) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["doctor-journey", doctorId, open],
    enabled: !!doctorId && open,
    queryFn: async (): Promise<FlowRun[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 30_000,
  });

  // For each flow, pick the most recent run (already sorted desc by started_at).
  const latestByFlow = useMemo(() => {
    const m = new Map<FlowKey, FlowRun>();
    for (const r of runs) {
      if (!m.has(r.flow_key)) m.set(r.flow_key, r);
    }
    return m;
  }, [runs]);

  const completedCount = useMemo(
    () => FLOW_ORDER.filter(k => latestByFlow.get(k)?.status === "completed").length,
    [latestByFlow],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-teal-600" />
            {doctorName ?? "Doctor Journey"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Progress across every Hospital Introduction flow. {completedCount} of {FLOW_ORDER.length} stages complete.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="py-8 text-center text-[12px] text-muted-foreground">Loading journey...</div>}

        {!isLoading && runs.length === 0 && (
          <div className="rounded-md border border-dashed py-12 text-center text-[12px] text-muted-foreground">
            No flow runs yet for this doctor. They'll appear here as the team triggers each step.
          </div>
        )}

        {!isLoading && runs.length > 0 && (
          <div className="space-y-2">
            {FLOW_ORDER.map((flowKey, idx) => {
              const flow = FLOW_DEFINITIONS[flowKey];
              const run  = latestByFlow.get(flowKey);
              return (
                <JourneyRow
                  key={flowKey}
                  position={idx + 1}
                  total={FLOW_ORDER.length}
                  flowName={flow.name}
                  flowShortName={flow.shortName}
                  run={run}
                />
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function JourneyRow({ position, total: _total, flowName, flowShortName: _flowShortName, run }: {
  position: number;
  total: number;
  flowName: string;
  flowShortName: string;
  run: FlowRun | undefined;
}) {
  const status   = run?.status;
  const stageDef = run ? FLOW_DEFINITIONS[run.flow_key].stages.find(s => s.key === run.current_stage) : null;

  // Visual state per flow:
  //  - Done    (status=completed)        → green check, muted bg
  //  - Active  (status=active)           → teal pulse, prominent
  //  - Stalled (active + no event >7d)   → amber dot
  //  - Failed  (status=failed)           → red x
  //  - Empty   (no run yet)              → grey outline
  const visual = (() => {
    if (!run)                       return { tag: "empty",   cls: "bg-slate-50/40 border-slate-200",        icon: <Circle className="h-4 w-4 text-slate-300" /> };
    if (status === "completed")     return { tag: "done",    cls: "bg-emerald-50/40 border-emerald-200",    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> };
    if (status === "failed")        return { tag: "failed",  cls: "bg-rose-50/40 border-rose-200",          icon: <AlertCircle className="h-4 w-4 text-rose-600" /> };
    // Active — check staleness
    const ageDays = (Date.now() - new Date(run.last_event_at).getTime()) / 86_400_000;
    if (ageDays > 7) return { tag: "stalled", cls: "bg-amber-50/40 border-amber-300", icon: <Clock className="h-4 w-4 text-amber-600" /> };
    return { tag: "active", cls: "bg-teal-50/60 border-teal-300 ring-1 ring-teal-100", icon: <Circle className="h-4 w-4 fill-teal-500 text-teal-500" /> };
  })();

  return (
    <div className={`rounded-md border px-3 py-2.5 flex items-center gap-3 transition-colors ${visual.cls}`}>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-medium text-slate-400 w-3 text-right">{position}</span>
        {visual.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-slate-900 truncate">{flowName}</span>
          {run && status !== "completed" && (
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider shrink-0">
              {status === "failed" ? "Failed" : visual.tag === "stalled" ? "Stalled" : "Active"}
            </Badge>
          )}
        </div>
        {run ? (
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {stageDef?.label ?? run.current_stage}
            {run.hospital && <> · {run.hospital}</>}
            <> · {relativeAge(run.last_event_at)}</>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 mt-0.5">Not yet started</div>
        )}
      </div>
      {run && <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
    </div>
  );
}

function relativeAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

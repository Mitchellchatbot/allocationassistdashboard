import { useMemo } from "react";
import { ChevronRight, Circle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowDefinition, FlowStage } from "@/lib/automation-flows";
import type { FlowEvent } from "@/hooks/use-automation-flows";

interface Props {
  flow:           FlowDefinition;
  currentStage:   string;
  events?:        FlowEvent[];
  selectedStage?: string | null;
  onSelectStage?: (stageKey: string) => void;
}

type StageState = "done" | "current" | "pending";

function stageStateAt(stages: FlowStage[], currentKey: string, idx: number): StageState {
  const currentIdx = stages.findIndex(s => s.key === currentKey);
  if (currentIdx < 0) return "pending";
  if (idx < currentIdx)  return "done";
  if (idx === currentIdx) return "current";
  return "pending";
}

const KIND_COLOR: Record<FlowStage["kind"], string> = {
  trigger:  "border-amber-400/60 bg-amber-50",
  email:    "border-teal-400/60 bg-teal-50",
  wait:     "border-slate-300/80 bg-slate-50",
  reminder: "border-orange-400/60 bg-orange-50",
  terminal: "border-emerald-400/60 bg-emerald-50",
};

const KIND_LABEL: Record<FlowStage["kind"], string> = {
  trigger:  "trigger",
  email:    "email",
  wait:     "wait",
  reminder: "reminder",
  terminal: "complete",
};

/**
 * Horizontal n8n-style flow diagram. Each stage is a card connected by a chevron.
 * State colours: done = saturated, current = ring + glow, pending = muted.
 * Clicking a stage selects it (parent component shows the detail panel).
 */
export function AutomationFlowDiagram({ flow, currentStage, events, selectedStage, onSelectStage }: Props) {
  const eventsByStage = useMemo(() => {
    const m = new Map<string, FlowEvent[]>();
    for (const e of events ?? []) {
      const list = m.get(e.stage_key) ?? [];
      list.push(e);
      m.set(e.stage_key, list);
    }
    return m;
  }, [events]);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-1 py-3 px-1 min-w-max">
        {flow.stages.map((stage, idx) => {
          const state = stageStateAt(flow.stages, currentStage, idx);
          const isSelected = selectedStage === stage.key;
          const stageEvents = eventsByStage.get(stage.key) ?? [];
          const Icon = stage.icon;

          return (
            <div key={stage.key} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelectStage?.(stage.key)}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-lg border-2 px-3 py-2.5 text-left transition-all w-[180px]",
                  KIND_COLOR[stage.kind],
                  state === "pending"  && "opacity-50 hover:opacity-75",
                  state === "current"  && "ring-2 ring-teal-500 ring-offset-1 shadow-md",
                  isSelected          && "ring-2 ring-blue-500 ring-offset-1",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-slate-700" />
                    <span className="text-[9px] uppercase tracking-[0.08em] text-slate-500 font-medium">
                      {KIND_LABEL[stage.kind]}
                    </span>
                  </div>
                  {state === "done"    && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {state === "current" && <Circle className="h-3.5 w-3.5 text-teal-600 fill-teal-500" />}
                </div>
                <div className="text-[12px] font-medium text-slate-900 leading-tight line-clamp-2">
                  {stage.label}
                </div>
                {stage.defaultDelayDays !== undefined && (
                  <div className="text-[10px] text-slate-500">
                    +{stage.defaultDelayDays} day{stage.defaultDelayDays === 1 ? "" : "s"}
                  </div>
                )}
                {stageEvents.length > 0 && (
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {stageEvents.length} event{stageEvents.length === 1 ? "" : "s"}
                  </div>
                )}
              </button>
              {idx < flow.stages.length - 1 && (
                <ChevronRight className={cn(
                  "h-4 w-4 shrink-0 mx-0.5",
                  state === "done" ? "text-emerald-500" : "text-slate-300",
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

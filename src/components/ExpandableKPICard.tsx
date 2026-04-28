import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ExpandableKPICardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;           // e.g. "text-primary"
  bg: string;              // e.g. "bg-primary/10"
  frontExtra?: string;     // optional subtitle shown on front
  hint?: string;           // hover tooltip explaining the metric
  expandedContent: React.ReactNode;
  expandedHeight?: number; // px, default 220
}

export function ExpandableKPICard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  frontExtra,
  hint,
  expandedContent,
  expandedHeight = 220,
}: ExpandableKPICardProps) {
  const [flipped, setFlipped] = useState(false);

  const front = (
    <div
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
      className="absolute inset-0 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 flex items-start justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground mb-1 truncate">{title}</p>
        <p className={`text-[24px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
        {frontExtra && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{frontExtra}</p>
        )}
      </div>
      <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center shrink-0 ml-2`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
    </div>
  );

  return (
    <div
      className="cursor-pointer select-none"
      style={{
        perspective: "1200px",
        height: flipped ? `${expandedHeight}px` : "88px",
        transition: "height 0.45s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={() => setFlipped((f) => !f)}
    >
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
          transform: flipped ? "rotateX(-180deg)" : "rotateX(0deg)",
          position: "relative",
          height: "100%",
        }}
      >
        {/* ── Front ── */}
        {hint && !flipped ? (
          <Tooltip>
            <TooltipTrigger asChild>{front}</TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px] max-w-[260px] leading-snug">
              {hint}
              <div className="text-[10px] text-muted-foreground mt-1">Click for details.</div>
            </TooltipContent>
          </Tooltip>
        ) : front}

        {/* ── Back ── */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-md flex flex-col overflow-hidden"
        >
          <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${bg} shrink-0`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${color}`} />
              <span className="text-[11px] font-semibold text-foreground">{title}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">click to close</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
            {expandedContent}
          </div>
        </div>
      </div>
    </div>
  );
}

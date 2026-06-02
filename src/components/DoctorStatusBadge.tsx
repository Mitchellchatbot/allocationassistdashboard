import { Badge } from "@/components/ui/badge";
import type { DoctorStatusInfo } from "@/lib/doctor-status";

interface Props {
  info:       DoctorStatusInfo;
  size?:      "sm" | "md";
  showDetail?: boolean;
}

/**
 * Phase 4 — Single per-doctor status pill derived from the doctor's flow runs.
 * Replaces the "look at 7 flow tabs to figure out where Dr. X is" loop.
 */
export function DoctorStatusBadge({ info, size = "sm", showDetail = false }: Props) {
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className={`${info.cls} ${padding} uppercase tracking-wider font-medium`} title={info.detail}>
        {info.label}
      </Badge>
      {showDetail && (
        <span className="text-[10px] text-muted-foreground truncate">{info.detail}</span>
      )}
    </span>
  );
}

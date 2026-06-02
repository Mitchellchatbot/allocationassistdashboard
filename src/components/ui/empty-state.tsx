import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One empty-state primitive used everywhere instead of ad-hoc
 * `<div className="text-muted-foreground">No X yet</div>` strings.
 *
 * Three sizes:
 *   - sm  → fits inside a card section ("nothing queued yet" type)
 *   - md  → fills a card body
 *   - lg  → full-page empty (Vacancies with no rows, etc.)
 *
 * Always shows: icon (in a soft circle) · headline · optional body · optional CTA.
 */

interface EmptyStateProps {
  icon:      LucideIcon;
  title:     string;
  body?:     string;
  action?:   ReactNode;
  size?:     "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: {
    wrap:   "py-6 px-4",
    iconBox:"h-8 w-8",
    icon:   "h-4 w-4",
    title:  "text-[13px] font-medium",
    body:   "text-[11px]",
  },
  md: {
    wrap:   "py-10 px-6",
    iconBox:"h-12 w-12",
    icon:   "h-6 w-6",
    title:  "text-[14px] font-semibold",
    body:   "text-[12px]",
  },
  lg: {
    wrap:   "py-16 px-8",
    iconBox:"h-16 w-16",
    icon:   "h-8 w-8",
    title:  "text-[16px] font-semibold",
    body:   "text-[13px]",
  },
} as const;

export function EmptyState({ icon: Icon, title, body, action, size = "md", className }: EmptyStateProps) {
  const s = SIZES[size];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", s.wrap, className)}>
      <div className={cn("rounded-full bg-muted/60 flex items-center justify-center mb-3 ring-1 ring-border/40", s.iconBox)}>
        <Icon className={cn("text-muted-foreground", s.icon)} />
      </div>
      <p className={cn("text-foreground", s.title)}>{title}</p>
      {body && <p className={cn("text-muted-foreground mt-1 max-w-sm", s.body)}>{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

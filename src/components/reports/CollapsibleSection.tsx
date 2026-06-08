/**
 * Reports — collapsible section shell.
 *
 * Summary-first restructure (2026-06-08): the Reports page was one long
 * uncollapsed scroll (~50 metrics on first paint). Every heavy section
 * now lives behind one of these — a Card whose header doubles as a
 * Collapsible trigger, default-collapsed, with a count/summary badge so
 * the headline number is visible WITHOUT expanding.
 *
 * Wraps the shared shadcn Collapsible primitive. Pure UI state: the
 * caller owns `open` (one open-section map on Reports.tsx) — nothing is
 * persisted.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface CollapsibleSectionProps {
  /** Section heading (left of the chevron). */
  title:        React.ReactNode;
  /** Lucide icon element, e.g. <Users className="h-4 w-4 text-violet-600" />. */
  icon:         React.ReactNode;
  /** One-line muted description under the title. */
  description?: React.ReactNode;
  /** Summary text shown in the trigger row even while collapsed — the
   *  whole point of the restructure (headline number visible at a glance). */
  summary?:     React.ReactNode;
  /** Optional scope chip when the section's time window differs from the
   *  page's global range (e.g. Recap is fixed-week, Placements has its
   *  own window). Surfaces the inconsistency instead of burying it. */
  scope?:       React.ReactNode;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the body renders edge-to-edge (tables). Mirrors the
   *  `p-0` CardContent the old uncollapsed tables used. */
  flush?:       boolean;
  children:     React.ReactNode;
}

/** Small pill used for "this week only" / "own window" scope hints. */
export function ScopeChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200">
      {children}
    </Badge>
  );
}

export function CollapsibleSection({
  title, icon, description, summary, scope, open, onOpenChange, flush, children,
}: CollapsibleSectionProps) {
  return (
    <Card>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer select-none hover:bg-slate-50/60 transition-colors rounded-t-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {open
                    ? <ChevronDown  className="h-4 w-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                  {icon}
                  {title}
                  {scope}
                </CardTitle>
                {description && (
                  <CardDescription className="text-[11px] mt-1">{description}</CardDescription>
                )}
              </div>
              {summary && (
                <div className="shrink-0 text-right">{summary}</div>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className={flush ? "p-0" : undefined}>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Small (i) info icon used next to every KPI label and chart title.
 * Click toggles a popover with a short two-line explanation:
 *   1. What the metric means.
 *   2. Where the data is pulled from.
 *
 * Click-based (not hover) so users on touch devices and the Loom-record
 * crowd both see it. `e.stopPropagation()` on the trigger prevents the
 * surrounding card from intercepting (e.g. Finance / MetaAds flip cards
 * react to clicks — we don't want the info icon to flip the card).
 */
export function InfoIcon({
  meaning,
  source,
  size = 12,
  side = "top",
  align = "center",
}: {
  meaning: string;
  source?: string;
  size?: number;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors p-0.5 -my-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Info style={{ width: size, height: size }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-auto max-w-[280px] p-3 text-[11px] leading-snug"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-foreground">{meaning}</p>
        {source && (
          <p className="text-[10px] text-muted-foreground mt-1.5">Source: {source}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

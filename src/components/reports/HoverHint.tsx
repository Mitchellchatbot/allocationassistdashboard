/**
 * Hover cards for the Reports page.
 *
 * The page answers "what's behind this number?" on hover instead of with
 * paragraphs of description text: tiles, stages, specialty tiles, heatmap
 * cells, reps, status dots and payment badges each carry a small card with the
 * detail. Styled like the dashboard's chart tooltip (white, hairline border,
 * 11px) so it reads as part of the same system.
 *
 *   <Hint content={…}>…</Hint>   — rich hover card on any element
 *   <HoverInfo meaning source />  — the ⓘ icon, opening on hover OR click
 *
 * HoverInfo is a Reports-local twin of the app-wide InfoIcon (click-only) so
 * the rest of the dashboard keeps its current behaviour.
 */
import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const CARD = "max-w-[300px] rounded-lg border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground shadow-md";

export function Hint({ content, children, side = "top", align = "center", delay = 120, className }: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  delay?: number;
  className?: string;
}) {
  if (content == null || content === false) return <>{children}</>;
  return (
    <Tooltip delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={cn(CARD, className)}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/** Title line inside a hover card. */
export function HintTitle({ children }: { children: ReactNode }) {
  return <p className="font-semibold text-foreground mb-0.5">{children}</p>;
}

/** Muted footnote line (source, "click to …"). */
export function HintNote({ children }: { children: ReactNode }) {
  return <p className="text-[10px] text-muted-foreground mt-1.5">{children}</p>;
}

/** Two-column label / value grid for hover cards. */
export function HintGrid({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <div className="grid grid-cols-[auto_auto] gap-x-3.5 gap-y-0.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-semibold text-foreground tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The ⓘ next to a card title. Opens on hover (desktop) and on click/tap
 * (touch), and stays open while the pointer is over the popover itself.
 */
export function HoverInfo({ meaning, source, size = 13, side = "bottom" }: {
  meaning: string;
  source?: string;
  size?: number;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  const enter = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120); };
  const leave = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 150); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          className="inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors p-0.5 -my-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Info style={{ width: size, height: size }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        className="w-auto max-w-[280px] p-3 text-[11px] leading-snug"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onOpenAutoFocus={e => e.preventDefault()}
        onClick={e => e.stopPropagation()}
      >
        <p className="text-foreground">{meaning}</p>
        {source && <p className="text-[10px] text-muted-foreground mt-1.5">Source: {source}</p>}
      </PopoverContent>
    </Popover>
  );
}

/** The dashboard's card-title row: 14px semibold, icon, ⓘ, optional subtitle and right-side slot. */
export function CardHead({ icon, title, info, source, subtitle, right }: {
  icon?: ReactNode;
  title: ReactNode;
  info?: string;
  source?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="pb-1 pt-4 px-4 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h3 className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
          {icon && <span className="mr-1 inline-flex">{icon}</span>}
          {title}
          {info && <HoverInfo meaning={info} source={source} />}
        </h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Pill toggle — same treatment as the Dashboard digest's Daily/Weekly/Monthly switch. */
export function PillToggle<K extends string>({ value, options, onChange, ariaLabel }: {
  value: K;
  options: Array<{ key: K; label: ReactNode; hint?: string }>;
  onChange: (k: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => {
        const btn = (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              value === o.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
        return o.hint ? <Hint key={o.key} content={o.hint}>{btn}</Hint> : btn;
      })}
    </div>
  );
}

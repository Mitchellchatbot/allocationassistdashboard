import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MultiToggleItem {
  value: string;
  label: ReactNode;
  count?: number;
}

interface AnimatedMultiToggleProps {
  items:    MultiToggleItem[];
  /** Selected values. Empty = nothing checked. */
  values:   string[];
  /** Fires with the value that was clicked. Emitting the single value rather
   *  than a rebuilt array keeps two fast clicks from racing: the parent
   *  applies each one against its freshest state. */
  onToggle: (value: string) => void;
  className?: string;
}

interface Metric { left: number; width: number }

/** Contiguous stretches of checked indices — each becomes ONE pill, so two
 *  neighbours read as a single selected span rather than two chips. */
function runsOf(items: MultiToggleItem[], selected: Set<string>): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  items.forEach((item, i) => {
    if (selected.has(item.value)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, items.length - 1]);
  return runs;
}

/**
 * Checkbox-style filter row that keeps the sliding-pill look of
 * `AnimatedTabsList`. Unlike tabs, several options can be checked at once and
 * clicking a checked one unchecks it. The pill is measured off the real button
 * positions rather than sitting inside a single button, which is what lets a
 * run of adjacent selections render as one continuous pill.
 */
export function AnimatedMultiToggle({ items, values, onToggle, className }: AnimatedMultiToggleProps) {
  const selected = new Set(values);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  const measure = useCallback(() => {
    setMetrics(btnRefs.current.map(b => ({ left: b?.offsetLeft ?? 0, width: b?.offsetWidth ?? 0 })));
  }, []);

  // Counts change the label widths, so re-measure whenever the items do — and
  // on container resize, since the row reflows on narrow screens.
  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const b of btnRefs.current) if (b) ro.observe(b);
    return () => ro.disconnect();
  }, [measure, items]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center rounded-full bg-white/80 backdrop-blur",
        "border border-slate-200/80 p-1 shadow-sm",
        className,
      )}
    >
      {metrics.length === items.length && runsOf(items, selected).map(([from, to]) => (
        <span
          key={`run-${from}`}
          data-run={`${from}-${to}`}
          className={cn(
            "absolute top-1 bottom-1 rounded-full bg-teal-500",
            "shadow-[0_2px_8px_-2px_rgba(20,184,166,0.45)]",
            "transition-[left,width] duration-300 ease-out",
          )}
          style={{
            left:  metrics[from].left,
            width: metrics[to].left + metrics[to].width - metrics[from].left,
          }}
        />
      ))}

      {items.map((item, i) => {
        const active = selected.has(item.value);
        return (
          <button
            key={item.value}
            ref={el => { btnRefs.current[i] = el; }}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => onToggle(item.value)}
            className={cn(
              "relative z-10 rounded-full px-4 py-1.5 text-[12.5px] transition-colors duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
              active ? "text-white font-medium" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full text-[10px] px-1.5 py-0.5 min-w-[20px] text-center",
                    active ? "bg-white/25 text-white" : "bg-slate-200/70 text-slate-600",
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

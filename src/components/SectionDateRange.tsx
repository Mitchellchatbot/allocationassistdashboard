import { useState, useMemo } from "react";
import { useFilters } from "@/lib/filters";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const lastDayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0);

/**
 * Smart date range picker:
 * - Inline trigger button shows the current selection
 * - Popover holds the month grid: click any month, click another to extend
 *   to a range. Quarter labels (Q1-Q4) select 3 consecutive months in one
 *   click. "Full year" selects all 12. Year arrows (◀/▶) walk back/forward.
 * - "All time" stays as a single quick-toggle for the global view.
 */
export function SectionDateRange() {
  const { dateRange, setCustomRange, setPreset, preset } = useFilters();
  const [open, setOpen]               = useState(false);
  const [pickerYear, setPickerYear]   = useState<number>(() => new Date().getFullYear());
  // Range-pick state — first click stores the anchor month, second click closes
  // the range. null = no anchor, ready for a fresh pick.
  const [anchor, setAnchor]           = useState<{ year: number; month: number } | null>(null);

  // Trigger-button label — derived from the resolved dateRange so it's always
  // honest about what's selected, regardless of how the range was built.
  const triggerLabel = useMemo(() => {
    if (preset === "all") return "All time";
    const f = dateRange.from, t = dateRange.to;
    const sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
    if (sameMonth && f.getDate() === 1 && t.getDate() === lastDayOfMonth(t.getFullYear(), t.getMonth()).getDate()) {
      return `${MONTHS_SHORT[f.getMonth()]} ${f.getFullYear()}`;
    }
    const sameYear = f.getFullYear() === t.getFullYear();
    if (sameYear && f.getDate() === 1 && f.getMonth() === 0
        && t.getMonth() === 11 && t.getDate() === 31) {
      return `${f.getFullYear()}`;
    }
    if (sameYear) {
      return `${MONTHS_SHORT[f.getMonth()]} – ${MONTHS_SHORT[t.getMonth()]} ${f.getFullYear()}`;
    }
    return `${fmt(f)} → ${fmt(t)}`;
  }, [dateRange, preset]);

  function pickRange(year: number, fromMonth: number, toMonth: number) {
    const from = new Date(year, Math.min(fromMonth, toMonth), 1);
    const to   = lastDayOfMonth(year, Math.max(fromMonth, toMonth));
    setCustomRange({ from, to });
  }

  function onMonthClick(month: number) {
    if (!anchor) {
      // First click — select that single month and remember anchor
      pickRange(pickerYear, month, month);
      setAnchor({ year: pickerYear, month });
      return;
    }
    // Second click — extend to a range. If user jumped to a different year,
    // treat it as a fresh single-month pick instead of a multi-year range.
    if (anchor.year !== pickerYear) {
      pickRange(pickerYear, month, month);
      setAnchor({ year: pickerYear, month });
      return;
    }
    pickRange(pickerYear, anchor.month, month);
    setAnchor(null);
    setOpen(false);
  }

  function onQuarterClick(q: 0 | 1 | 2 | 3) {
    pickRange(pickerYear, q * 3, q * 3 + 2);
    setAnchor(null);
    setOpen(false);
  }

  function onFullYearClick() {
    pickRange(pickerYear, 0, 11);
    setAnchor(null);
    setOpen(false);
  }

  // Highlight a month in the grid if it falls inside the active range AND
  // is in the picker's current year.
  function isMonthInRange(month: number): boolean {
    if (preset === "all" || pickerYear !== dateRange.from.getFullYear()) return false;
    if (dateRange.from.getFullYear() !== dateRange.to.getFullYear()) return false;
    return month >= dateRange.from.getMonth() && month <= dateRange.to.getMonth();
  }
  function isAnchorMonth(month: number): boolean {
    return anchor !== null && anchor.year === pickerYear && anchor.month === month;
  }

  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      <Calendar className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
        Date range
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors inline-flex items-center gap-1 ${
              preset !== "all"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-secondary border border-border/60"
            }`}
          >
            {triggerLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-3">
          {/* Year nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setPickerYear(y => y - 1)}
              className="h-6 w-6 rounded hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onFullYearClick}
              className="text-[13px] font-semibold tracking-wide hover:text-primary transition-colors"
              title="Click to select the full year"
            >
              {pickerYear}
            </button>
            <button
              type="button"
              onClick={() => setPickerYear(y => y + 1)}
              className="h-6 w-6 rounded hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Next year"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 4 rows × 3 months grid + quarter labels on the left */}
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map(q => (
              <div key={q} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onQuarterClick(q as 0 | 1 | 2 | 3)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors w-6 shrink-0"
                  title={`Click to select all of Q${q + 1}`}
                >
                  Q{q + 1}
                </button>
                <div className="grid grid-cols-3 gap-1 flex-1">
                  {[0, 1, 2].map(i => {
                    const month = q * 3 + i;
                    const inRange = isMonthInRange(month);
                    const isAnchor = isAnchorMonth(month);
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => onMonthClick(month)}
                        className={`text-[11px] py-1.5 rounded transition-colors ${
                          inRange
                            ? "bg-primary text-white font-semibold"
                            : isAnchor
                            ? "bg-primary/30 text-primary font-semibold"
                            : "hover:bg-muted/60 text-foreground/80"
                        }`}
                      >
                        {MONTHS_SHORT[month]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer hint + All time + clear */}
          <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
            <p className="text-[9px] text-muted-foreground/70 leading-tight">
              {anchor ? "Click another month to extend the range" : "Click a month, quarter, or year"}
            </p>
            <button
              type="button"
              onClick={() => { setPreset("all"); setAnchor(null); setOpen(false); }}
              className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                preset === "all"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              All time
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Resolved range — explicit so users always know what window they're
          looking at, even when "All time" is selected. */}
      <span className="text-[10px] text-muted-foreground/80 ml-1">
        {fmt(dateRange.from)} → {fmt(dateRange.to)}
      </span>
    </div>
  );
}

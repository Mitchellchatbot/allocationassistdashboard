/**
 * Period controls for the Reports page.
 *
 *   <PeriodPill>   Weekly · Monthly · Yearly
 *   <PeriodChip>   "This month · September 2026 ⌄" — click to open the picker
 *   <PeriodArrow>  the round arrows on either side of the report. Click steps
 *                  one period; hovering morphs the arrow into a jump-to grid
 *                  (every week / month / year, each with a small signings bar)
 *                  so going from December back to January is one click, not
 *                  eleven.
 *
 * All three are controlled by the page: they report the offset the user
 * picked and never hold period state themselves.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint, PillToggle } from "@/components/reports/HoverHint";
import {
  PERIOD_WORD, MONTHS_SHORT, monthLabel, offsetOf, periodLabels, periodRange, shortDate,
  type Period,
} from "@/lib/report-period";
import type { DateRange } from "@/lib/placement-reporting";
import { cn } from "@/lib/utils";

export interface PeriodNavProps {
  period:    Period;
  offset:    number;
  /** Oldest offset with data (≤ 0). */
  minOffset: number;
  onJump:    (offset: number) => void;
  /** Distinct doctors signed in a range — drives the little bars in the picker. */
  signedIn:  (r: DateRange) => number;
}

export function PeriodPill({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <PillToggle
      value={period}
      onChange={onChange}
      ariaLabel="Report period"
      options={[
        { key: "weekly",  label: "Weekly",  hint: "One week at a time (Monday – Sunday)" },
        { key: "monthly", label: "Monthly", hint: "One calendar month at a time" },
        { key: "yearly",  label: "Yearly",  hint: "The last 12 months vs the 12 before" },
      ]}
    />
  );
}

export function PeriodChip(props: PeriodNavProps) {
  const [open, setOpen] = useState(false);
  const { rel, label } = periodLabels(props.period, props.offset);
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Popover open={open} onOpenChange={setOpen}>
        <Hint content={`Pick any ${PERIOD_WORD[props.period]}`}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 text-teal-800 px-2.5 py-1 font-medium hover:bg-teal-100 transition-colors"
            >
              <CalendarDays className="h-3 w-3" />
              {rel}
              <span className="text-teal-700/70 font-normal tabular-nums">· {label}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent align="end" className="w-[268px] p-0">
          <PeriodPicker {...props} onJump={o => { setOpen(false); props.onJump(o); }} />
        </PopoverContent>
      </Popover>
      {props.offset !== 0 && (
        <button type="button" onClick={() => props.onJump(0)} className="text-teal-700 hover:underline font-medium ml-0.5">
          Back to now
        </button>
      )}
    </div>
  );
}

/**
 * Round arrow that steps one period on click and, after a short hover, grows
 * into the jump-to grid. The arrow itself stays put at the edge; a card-coloured
 * shape expands behind it and the grid fades in beside it.
 */
export function PeriodArrow({ side, ...props }: PeriodNavProps & { side: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [panelH, setPanelH] = useState(220);
  const panel = useRef<HTMLDivElement>(null);
  const openT = useRef<number>(), closeT = useRef<number>();
  const dir = side === "left" ? -1 : 1;
  const target = props.offset + dir;
  const canStep = target <= 0 && target >= props.minOffset;
  const { word } = periodLabels(props.period, props.offset);
  const stepLabel = canStep ? periodLabels(props.period, target).label : null;

  useLayoutEffect(() => {
    if (open && panel.current) setPanelH(panel.current.offsetHeight);
  }, [open, props.period, props.offset]);

  const enter = () => { window.clearTimeout(closeT.current); window.clearTimeout(openT.current); openT.current = window.setTimeout(() => setOpen(true), 260); };
  const leave = () => { window.clearTimeout(openT.current); closeT.current = window.setTimeout(() => setOpen(false), 220); };

  return (
    <div
      className="relative h-11 w-11"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={() => { window.clearTimeout(closeT.current); setOpen(true); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
    >
      {/* The morphing shape: a 44px circle that stretches into the panel. */}
      <div
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 bg-card border shadow-lg transition-[width,height,border-radius,box-shadow,border-color] duration-300",
          side === "left" ? "left-0" : "right-0",
          open ? "border-teal-200 shadow-[0_24px_48px_-12px_rgba(15,118,110,0.28),0_0_0_4px_rgba(20,184,166,0.08)]" : "border-border/60",
        )}
        style={{
          width: open ? 324 : 44,
          height: open ? panelH + 12 : 44,
          borderRadius: open ? 18 : 22,
          transitionTimingFunction: "cubic-bezier(.2,.9,.25,1.08)",
        }}
      />
      <Hint content={canStep ? `${dir < 0 ? "Back" : "Forward"} to ${stepLabel}` : dir > 0 ? `You're on the current ${word}` : "No earlier data"} side={side === "left" ? "right" : "left"}>
        <button
          type="button"
          aria-label={dir < 0 ? `Previous ${word}` : `Next ${word}`}
          disabled={!canStep}
          onClick={() => { setOpen(false); props.onJump(target); }}
          className={cn(
            "group absolute top-1/2 -translate-y-1/2 z-[2] h-11 w-11 rounded-full flex items-center justify-center transition-[transform,background-color,color] duration-200",
            side === "left" ? "left-0" : "right-0",
            "text-muted-foreground hover:text-teal-700 hover:bg-teal-50 hover:scale-[1.08] active:scale-95 disabled:opacity-35 disabled:pointer-events-none",
            open && "text-teal-700",
          )}
        >
          {dir < 0
            ? <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
            : <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </Hint>
      <div
        ref={panel}
        className={cn(
          "absolute top-1/2 z-[1] w-[264px] transition-[opacity,transform] duration-200",
          side === "left" ? "left-[52px] origin-left" : "right-[52px] origin-right",
          open ? "opacity-100 pointer-events-auto delay-100" : "opacity-0 pointer-events-none",
        )}
        style={{ transform: `translate(${open ? 0 : dir * -10}px, -50%) scale(${open ? 1 : 0.97})` }}
      >
        {open && <PeriodPicker {...props} onJump={o => { setOpen(false); props.onJump(o); }} />}
      </div>
    </div>
  );
}

/* ── The jump-to grid ───────────────────────────────────────────────────── */

interface Cell { offset: number; top: string; sub: string; title: string; range: DateRange }

function PeriodPicker({ period, offset, minOffset, onJump, signedIn }: PeriodNavProps) {
  const now = useMemo(() => new Date(), []);
  const word = PERIOD_WORD[period];

  // Which page of the grid is showing. Monthly pages by calendar year, weekly
  // by blocks of 12 weeks, yearly shows the most recent six windows.
  const selRange = periodRange(period, offset, now);
  const [year, setYear] = useState(selRange.from.getFullYear());
  const [weekPage, setWeekPage] = useState(Math.floor(-offset / 12));
  const oldestYear = periodRange(period, minOffset, now).from.getFullYear();

  const { cells, title, prev, next } = useMemo((): { cells: Cell[]; title: ReactNode; prev?: () => void; next?: () => void } => {
    if (period === "monthly") {
      const cells = MONTHS_SHORT.map((m, i) => {
        const from = new Date(year, i, 1);
        const o = offsetOf("monthly", from, now);
        return { offset: o, top: m, sub: String(year), title: monthLabel(from, true), range: periodRange("monthly", o, now) };
      });
      return {
        cells, title: year,
        prev: year > oldestYear ? () => setYear(y => y - 1) : undefined,
        next: year < now.getFullYear() ? () => setYear(y => y + 1) : undefined,
      };
    }
    if (period === "weekly") {
      const end = -weekPage * 12;
      const cells = Array.from({ length: 12 }, (_, k) => {
        const o = end - 11 + k;
        const r = periodRange("weekly", o, now);
        return { offset: o, top: shortDate(r.from), sub: `W${isoWeek(r.from)}`, title: `${shortDate(r.from)} – ${shortDate(r.to)} ${r.to.getFullYear()}`, range: r };
      });
      return {
        cells, title: `${shortDate(cells[0].range.from)} – ${shortDate(cells[11].range.to)}`,
        prev: end - 11 > minOffset ? () => setWeekPage(p => p + 1) : undefined,
        next: weekPage > 0 ? () => setWeekPage(p => p - 1) : undefined,
      };
    }
    const count = Math.max(2, Math.min(6, 1 - minOffset));
    const cells = Array.from({ length: count }, (_, k) => {
      const o = -(count - 1) + k;
      const r = periodRange("yearly", o, now);
      return { offset: o, top: `${r.from.getFullYear()}–${String(r.to.getFullYear()).slice(2)}`, sub: `${MONTHS_SHORT[r.from.getMonth()]} – ${MONTHS_SHORT[r.to.getMonth()]}`, title: periodLabels("yearly", o, now).label, range: r };
    });
    return { cells, title: "Rolling 12 months" };
  }, [period, year, weekPage, minOffset, now, oldestYear]);

  const counts = useMemo(() => cells.map(c => (c.offset > 0 || c.offset < minOffset ? 0 : signedIn(c.range))), [cells, minOffset, signedIn]);
  const max = Math.max(1, ...counts);
  const cols = period === "yearly" ? "grid-cols-2" : "grid-cols-4";

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/80">Jump to a {word}</span>
        <span className="inline-flex items-center gap-1 text-[9.5px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" />now</span>
      </div>
      {(prev || next) && (
        <div className="flex items-center justify-between mb-1.5">
          <button type="button" onClick={prev} disabled={!prev} aria-label="Earlier" className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[12px] font-semibold text-foreground tabular-nums">{title}</span>
          <button type="button" onClick={next} disabled={!next} aria-label="Later" className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-30">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className={`grid ${cols} gap-1`}>
        {cells.map((c, i) => {
          const selected = c.offset === offset;
          const disabled = c.offset > 0 || c.offset < minOffset;
          return (
            <Hint key={c.offset} content={disabled ? (c.offset > 0 ? "Not reached yet" : "Before the first recorded placement") : <>{c.title} · <b>{counts[i]}</b> signed</>}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onJump(c.offset)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "relative rounded-lg px-1 pt-1.5 pb-2 text-center transition-[background-color,color,transform] duration-150",
                  selected ? "bg-teal-600 text-white shadow-sm" : "text-foreground hover:bg-teal-50 hover:-translate-y-px",
                  disabled && "opacity-35 pointer-events-none",
                )}
              >
                <div className="text-[11.5px] font-semibold leading-tight">{c.top}</div>
                <div className={cn("text-[9px]", selected ? "text-white/80" : "text-muted-foreground")}>{c.sub}</div>
                <div className={cn("mx-auto mt-1 h-1 w-7 rounded-full overflow-hidden", selected ? "bg-white/25" : "bg-muted")}>
                  <div className={cn("h-full rounded-full", selected ? "bg-white" : "bg-emerald-500")} style={{ width: `${disabled ? 0 : Math.max(8, (counts[i] / max) * 100)}%` }} />
                </div>
                {c.offset === 0 && <span className={cn("absolute top-1 right-1 h-1.5 w-1.5 rounded-full", selected ? "bg-white" : "bg-teal-500")} />}
              </button>
            </Hint>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-1 w-3 rounded-full bg-emerald-500" />signings</span>
        {offset !== 0
          ? <button type="button" onClick={() => onJump(0)} className="text-teal-700 font-medium hover:underline">Back to now</button>
          : <span>← → keys step one {word}</span>}
      </div>
    </div>
  );
}

/** ISO-8601 week number. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

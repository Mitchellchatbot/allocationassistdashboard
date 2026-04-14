import { useState, useEffect } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useFilters, type TimeRangePreset, type DateRange, formatDateRangeLabel } from "@/lib/filters";
import type { DateRange as DayPickerRange } from "react-day-picker";

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: "Today",        value: "today"   },
  { label: "This Week",    value: "week"    },
  { label: "This Month",   value: "month"   },
  { label: "This Quarter", value: "quarter" },
  { label: "This Year",    value: "year"    },
];

export function DateRangePicker() {
  const { preset, dateRange, setPreset, setCustomRange } = useFilters();
  const [open, setOpen] = useState(false);

  // Pending calendar selection — only committed when both dates are picked
  const [pending, setPending] = useState<DayPickerRange | undefined>(undefined);

  // Reset pending state whenever the popover opens
  useEffect(() => {
    if (open) {
      setPending({ from: dateRange.from, to: dateRange.to });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (p: TimeRangePreset) => {
    setPreset(p);
    setOpen(false);
  };

  const handleCalendarSelect = (range: DayPickerRange | undefined) => {
    setPending(range);
    if (range?.from && range?.to) {
      setCustomRange({ from: range.from, to: range.to });
      setOpen(false);
    }
  };

  const label = formatDateRangeLabel(preset, dateRange);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50 transition-all duration-150 shadow-sm min-w-[120px]">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-auto p-0 shadow-lg border border-border/60 rounded-xl overflow-hidden"
      >
        <div className="flex">

          {/* ── Preset buttons ── */}
          <div className="flex flex-col gap-0.5 p-2 border-r border-border/40 bg-muted/20 min-w-[130px]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1">Quick select</p>
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePreset(p.value)}
                className={`text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  preset === p.value && preset !== "custom"
                    ? "bg-primary text-white"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}

            <div className="h-px bg-border/40 my-1" />

            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1">Custom range</p>
            <div className="px-2 space-y-1.5">
              <div>
                <label className="text-[10px] text-muted-foreground">From</label>
                <input
                  type="date"
                  className="block w-full text-[11px] rounded-md border border-border/60 bg-background px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={pending?.from ? toInputValue(pending.from) : ""}
                  max={pending?.to ? toInputValue(pending.to) : toInputValue(new Date())}
                  onChange={e => {
                    const from = e.target.value ? new Date(e.target.value) : undefined;
                    const next = { ...pending, from };
                    setPending(next);
                    if (from && pending?.to) {
                      setCustomRange({ from, to: pending.to });
                      setOpen(false);
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">To</label>
                <input
                  type="date"
                  className="block w-full text-[11px] rounded-md border border-border/60 bg-background px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={pending?.to ? toInputValue(pending.to) : ""}
                  min={pending?.from ? toInputValue(pending.from) : undefined}
                  max={toInputValue(new Date())}
                  onChange={e => {
                    const to = e.target.value ? new Date(e.target.value) : undefined;
                    const next = { ...pending, to };
                    setPending(next);
                    if (pending?.from && to) {
                      setCustomRange({ from: pending.from, to });
                      setOpen(false);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── Calendar ── */}
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={pending}
              onSelect={handleCalendarSelect}
              disabled={{ after: new Date() }}
              defaultMonth={
                pending?.from
                  ? new Date(pending.from.getFullYear(), pending.from.getMonth() - 1)
                  : new Date(new Date().getFullYear(), new Date().getMonth() - 1)
              }
              classNames={{
                day_selected:     "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                day_range_middle: "bg-primary/15 text-foreground rounded-none",
                day_range_start:  "bg-primary text-primary-foreground rounded-l-full",
                day_range_end:    "bg-primary text-primary-foreground rounded-r-full",
                day_today:        "font-bold underline",
              }}
            />
            {preset === "custom" && (
              <p className="text-center text-[10px] text-muted-foreground pb-1">
                {formatDateRangeLabel("custom", dateRange)}
              </p>
            )}
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD for <input type="date"> */
function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

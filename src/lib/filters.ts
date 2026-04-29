import { createContext, useContext } from "react";

export type TimeRangePreset =
  | "today" | "week"
  | "month" | "lastMonth" | "last30days"
  | "quarter" | "lastQuarter"
  | "year" | "lastYear" | "last12months"
  | "all" | "custom";

/** Backward-compat alias used in older code */
export type TimeRange = TimeRangePreset;

export interface DateRange {
  from: Date;
  to: Date;   // inclusive end — callers treat this as end-of-day
}

export interface FilterContextType {
  preset:         TimeRangePreset;
  dateRange:      DateRange;
  setPreset:      (p: TimeRangePreset) => void;
  setCustomRange: (range: DateRange) => void;

  // Backward-compat — both map to preset/setPreset
  timeRange:    TimeRangePreset;
  setTimeRange: (v: TimeRangePreset) => void;
}

export const FilterContext = createContext<FilterContextType | null>(null);

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be inside FilterProvider");
  return ctx;
}

// ── Preset → actual date range ─────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getPresetRange(preset: TimeRangePreset): DateRange {
  const now   = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };

    case "week": {
      const dow  = today.getDay(); // 0 = Sun
      const diff = dow === 0 ? 6 : dow - 1; // days since Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { from: monday, to: today };
    }

    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };

    case "lastMonth": {
      // Calendar previous month: from = 1st of last month, to = last day of last month
      const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfPrev  = new Date(firstOfThis.getTime() - 86_400_000);
      const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
      return { from: firstOfPrev, to: lastOfPrev };
    }

    case "last30days": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: today };
    }

    case "quarter": {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qStartMonth, 1), to: today };
    }

    case "lastQuarter": {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const prevQEnd    = new Date(now.getFullYear(), qStartMonth, 1);
      prevQEnd.setDate(prevQEnd.getDate() - 1);                                // last day of previous quarter
      const prevQStartMonth = Math.floor(prevQEnd.getMonth() / 3) * 3;
      const prevQStart  = new Date(prevQEnd.getFullYear(), prevQStartMonth, 1);
      return { from: prevQStart, to: prevQEnd };
    }

    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: today };

    case "lastYear": {
      const y = now.getFullYear() - 1;
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
    }

    case "last12months": {
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() + 1);  // exactly 12 months back
      return { from, to: today };
    }

    case "all":
      // Far enough back to include every record in Zoho / Supabase, including
      // historical imports. Year 2000 is safe — the company didn't exist then.
      return { from: new Date(2000, 0, 1), to: today };

    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };
  }
}

// ── Display label ──────────────────────────────────────────────────────────

const PRESET_LABELS: Record<TimeRangePreset, string> = {
  today:        "Today",
  week:         "This Week",
  month:        "This Month",
  lastMonth:    "Last Month",
  last30days:   "Last 30 Days",
  quarter:      "This Quarter",
  lastQuarter:  "Last Quarter",
  year:         "This Year",
  lastYear:     "Last Year",
  last12months: "Last 12 Months",
  all:          "All Time",
  custom:       "Custom",
};

export function getPresetLabel(preset: TimeRangePreset): string {
  return PRESET_LABELS[preset];
}

export function formatDateRangeLabel(preset: TimeRangePreset, range: DateRange): string {
  if (preset !== "custom") return PRESET_LABELS[preset];

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const { from, to } = range;
  const sameYear  = from.getFullYear() === to.getFullYear();
  const sameDay   = sameYear && from.getMonth() === to.getMonth() && from.getDate() === to.getDate();

  if (sameDay) return fmt(from);
  if (sameYear) return `${fmt(from)} – ${fmt(to)}`;
  return `${fmt(from)} ${from.getFullYear()} – ${fmt(to)} ${to.getFullYear()}`;
}

// ── Subtitle label (used on page headers) ──────────────────────────────────

export function getTimeLabel(preset: TimeRangePreset, range?: DateRange): string {
  if (preset !== "custom") {
    const map: Record<TimeRangePreset, string> = {
      today:        "today",
      week:         "this week",
      month:        "this month",
      lastMonth:    "last month",
      last30days:   "last 30 days",
      quarter:      "this quarter",
      lastQuarter:  "last quarter",
      year:         "this year",
      lastYear:     "last year",
      last12months: "last 12 months",
      all:          "all time",
      custom:       "selected period",
    };
    return map[preset];
  }
  if (!range) return "selected period";
  return formatDateRangeLabel("custom", range).toLowerCase();
}

// ── Legacy helpers (kept for compat) ──────────────────────────────────────

export function getTimeMultiplier(_timeRange: TimeRange) { return 1; }
export function applyFilters(value: number, _timeRange: TimeRange) { return Math.round(value); }
export function formatFilteredValue(value: number, _timeRange: TimeRange, prefix = "") {
  return `${prefix}${value.toLocaleString()}`;
}

import { createContext, useContext } from "react";

export type TimeRange = "week" | "month" | "quarter" | "year";

export interface FilterContextType {
  timeRange: TimeRange;
  setTimeRange: (v: TimeRange) => void;
}

export const FilterContext = createContext<FilterContextType | null>(null);

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be inside FilterProvider");
  return ctx;
}

// Multipliers to simulate different time ranges on static data
const timeMultipliers: Record<TimeRange, number> = {
  week: 0.12,
  month: 0.35,
  quarter: 1,
  year: 3.8,
};

export function getTimeMultiplier(timeRange: TimeRange) {
  return timeMultipliers[timeRange];
}

export function applyFilters(value: number, timeRange: TimeRange) {
  return Math.round(value * timeMultipliers[timeRange]);
}

export function formatFilteredValue(value: number, timeRange: TimeRange, prefix = "") {
  const filtered = applyFilters(value, timeRange);
  return `${prefix}${filtered.toLocaleString()}`;
}

export function getTimeLabel(timeRange: TimeRange) {
  const labels: Record<TimeRange, string> = {
    week: "this week",
    month: "this month",
    quarter: "this quarter",
    year: "this year",
  };
  return labels[timeRange];
}

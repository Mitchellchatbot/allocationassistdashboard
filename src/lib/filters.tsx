import { createContext, useContext, useState, ReactNode } from "react";

type TimeRange = "week" | "month" | "quarter" | "year";
type Region = "all" | "uae" | "ksa" | "qatar" | "kuwait";

interface FilterContextType {
  timeRange: TimeRange;
  setTimeRange: (v: TimeRange) => void;
  region: Region;
  setRegion: (v: Region) => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");
  const [region, setRegion] = useState<Region>("all");

  return (
    <FilterContext.Provider value={{ timeRange, setTimeRange, region, setRegion }}>
      {children}
    </FilterContext.Provider>
  );
}

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

// Region filter ratios (approximate share of total)
const regionShares: Record<Region, number> = {
  all: 1,
  uae: 0.42,
  ksa: 0.30,
  qatar: 0.15,
  kuwait: 0.13,
};

export function getTimeMultiplier(timeRange: TimeRange) {
  return timeMultipliers[timeRange];
}

export function getRegionMultiplier(region: Region) {
  return regionShares[region];
}

export function applyFilters(value: number, timeRange: TimeRange, region: Region) {
  return Math.round(value * timeMultipliers[timeRange] * regionShares[region]);
}

export function formatFilteredValue(value: number, timeRange: TimeRange, region: Region, prefix = "") {
  const filtered = applyFilters(value, timeRange, region);
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

export function getRegionLabel(region: Region) {
  const labels: Record<Region, string> = {
    all: "All Regions",
    uae: "UAE",
    ksa: "Saudi Arabia",
    qatar: "Qatar",
    kuwait: "Kuwait",
  };
  return labels[region];
}

export type { TimeRange, Region };


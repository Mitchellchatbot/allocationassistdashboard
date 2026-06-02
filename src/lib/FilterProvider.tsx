import { useState, ReactNode } from "react";
import { FilterContext, type TimeRangePreset, type DateRange, getPresetRange } from "./filters";

export function FilterProvider({ children }: { children: ReactNode }) {
  // Default to "last 3 months" — covers the typical "what's been happening
  // lately?" question without pulling in a full year of stale data.
  // Rolls with today's date so 25 May → 1 Mar–25 May, 4 Jun → 1 Apr–4 Jun.
  const [preset, setPresetState] = useState<TimeRangePreset>("last3months");
  const [customRange, setCustomRangeState] = useState<DateRange | null>(null);

  const dateRange: DateRange =
    preset === "custom" && customRange ? customRange : getPresetRange(preset);

  const setPreset = (p: TimeRangePreset) => {
    setPresetState(p);
    if (p !== "custom") setCustomRangeState(null);
  };

  const setCustomRange = (range: DateRange) => {
    setCustomRangeState(range);
    setPresetState("custom");
  };

  return (
    <FilterContext.Provider
      value={{
        preset,
        dateRange,
        setPreset,
        setCustomRange,
        // backward-compat
        timeRange:    preset,
        setTimeRange: setPreset,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

import { useState, ReactNode } from "react";
import { FilterContext, type TimeRangePreset, type DateRange, getPresetRange } from "./filters";

export function FilterProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<TimeRangePreset>("quarter");
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

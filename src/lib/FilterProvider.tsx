import { useState, useMemo, useCallback, ReactNode } from "react";
import { FilterContext, type TimeRangePreset, type DateRange, getPresetRange } from "./filters";

export function FilterProvider({ children, initialPreset = "last3months" }: { children: ReactNode; initialPreset?: TimeRangePreset }) {
  // Default to "last 3 months" — covers the typical "what's been happening
  // lately?" question without pulling in a full year of stale data.
  // Rolls with today's date so 25 May → 1 Mar–25 May, 4 Jun → 1 Apr–4 Jun.
  // `initialPreset` lets a route open on a different period on the FIRST paint
  // (e.g. Finance opens on "This Year"), instead of rendering last3months and
  // then flipping via an effect — which recomputes every figure and looks like
  // the numbers are changing on their own.
  const [preset, setPresetState] = useState<TimeRangePreset>(initialPreset);
  const [customRange, setCustomRangeState] = useState<DateRange | null>(null);

  const dateRange: DateRange = useMemo(
    () =>
      preset === "custom" && customRange ? customRange : getPresetRange(preset),
    [preset, customRange]
  );

  const setPreset = useCallback((p: TimeRangePreset) => {
    setPresetState(p);
    if (p !== "custom") setCustomRangeState(null);
  }, []);

  const setCustomRange = useCallback((range: DateRange) => {
    setCustomRangeState(range);
    setPresetState("custom");
  }, []);

  const value = useMemo(
    () => ({
      preset,
      dateRange,
      setPreset,
      setCustomRange,
      // backward-compat
      timeRange:    preset,
      setTimeRange: setPreset,
    }),
    [preset, dateRange, setPreset, setCustomRange]
  );

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

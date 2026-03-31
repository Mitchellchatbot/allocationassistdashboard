import { useState, ReactNode } from "react";
import { FilterContext, type TimeRange, type Region } from "./filters";

export function FilterProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");
  const [region, setRegion] = useState<Region>("all");

  return (
    <FilterContext.Provider value={{ timeRange, setTimeRange, region, setRegion }}>
      {children}
    </FilterContext.Provider>
  );
}

import { useState, ReactNode } from "react";
import { FilterContext, type TimeRange } from "./filters";

export function FilterProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("quarter");

  return (
    <FilterContext.Provider value={{ timeRange, setTimeRange }}>
      {children}
    </FilterContext.Provider>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useFilters } from "@/lib/filters";

export interface WeeklySalesRaw {
  member_name:      string;
  date_col:         string;
  full_sales_calls: number;
  good_calls:       number;
  sales_count:      number;
}

export interface MemberSalesSummary {
  member_name:      string;
  full_sales_calls: number;
  good_calls:       number;
  sales_count:      number;
  good_call_rate:   number;
}

// Shared query key — no date range so the cache is reused across date changes
export const WEEKLY_SALES_QUERY_KEY = ["weekly-sales-raw"];

// Shared fetch fn — exported so DashboardLayout can prefetch it
export async function fetchWeeklySalesRaw(): Promise<WeeklySalesRaw[]> {
  const { data, error } = await supabase
    .from("weekly_sales")
    .select("member_name, date_col, full_sales_calls, good_calls, sales_count");
  if (error) throw error;
  return data ?? [];
}

// Parse "dd/mm/yyyy" → ms timestamp
function parseDDMMYYYY(s: string): number {
  const parts = s?.split("/");
  if (!parts || parts.length < 3) return NaN;
  const [d, m, y] = parts;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
}

export function useWeeklySales() {
  const { dateRange } = useFilters();

  // Raw fetch — long staleTime, shared cache key, prefetched by DashboardLayout
  const { data: raw = [], isLoading } = useQuery({
    queryKey:  WEEKLY_SALES_QUERY_KEY,
    queryFn:   fetchWeeklySalesRaw,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime:    30 * 60 * 1000, // keep in cache 30 min
  });

  // Client-side date filter + aggregation — instant, no network call
  const fromMs = dateRange.from.getTime();
  const toMs   = dateRange.to.getTime() + 86_400_000;

  const filtered = raw.filter(row => {
    const t = parseDDMMYYYY(row.date_col);
    if (isNaN(t)) return true;
    return t >= fromMs && t < toMs;
  });

  const map = new Map<string, MemberSalesSummary>();
  for (const row of filtered) {
    const key = (row.member_name ?? "").trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { member_name: key, full_sales_calls: 0, good_calls: 0, sales_count: 0, good_call_rate: 0 });
    }
    const m = map.get(key)!;
    m.full_sales_calls += row.full_sales_calls ?? 0;
    m.good_calls       += row.good_calls       ?? 0;
    m.sales_count      += row.sales_count      ?? 0;
  }
  for (const m of map.values()) {
    m.good_call_rate = m.full_sales_calls > 0
      ? Math.round((m.good_calls / m.full_sales_calls) * 100)
      : 0;
  }

  const data = Array.from(map.values()).sort((a, b) => b.full_sales_calls - a.full_sales_calls);

  return { data, isLoading };
}

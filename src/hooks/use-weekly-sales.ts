import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useFilters } from "@/lib/filters";

export interface MemberSalesSummary {
  member_name:      string;
  full_sales_calls: number;
  good_calls:       number;
  sales_count:      number;
  good_call_rate:   number; // good_calls / full_sales_calls × 100
}

// Parse "dd/mm/yyyy" → timestamp (ms). Returns NaN if unparseable.
function parseDDMMYYYY(s: string): number {
  const parts = s?.split("/");
  if (!parts || parts.length < 3) return NaN;
  const [d, m, y] = parts;
  const t = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  return t;
}

export function useWeeklySales() {
  const { dateRange } = useFilters();

  return useQuery({
    queryKey: ["weekly-sales", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async (): Promise<MemberSalesSummary[]> => {
      const { data, error } = await supabase
        .from("weekly_sales")
        .select("member_name, date_col, full_sales_calls, good_calls, sales_count");

      if (error) throw error;
      if (!data?.length) return [];

      const fromMs = dateRange.from.getTime();
      const toMs   = dateRange.to.getTime() + 86_400_000; // inclusive end

      const filtered = data.filter(row => {
        const t = parseDDMMYYYY(row.date_col);
        if (isNaN(t)) return true; // keep rows whose date can't be parsed
        return t >= fromMs && t < toMs;
      });

      // Aggregate by member
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

      // Compute good-call conversion rate
      for (const m of map.values()) {
        m.good_call_rate = m.full_sales_calls > 0
          ? Math.round((m.good_calls / m.full_sales_calls) * 100)
          : 0;
      }

      return Array.from(map.values()).sort((a, b) => b.full_sales_calls - a.full_sales_calls);
    },
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useFilters } from "@/lib/filters";

export interface MarketingExpense {
  id:           string;
  expense_date: string;   // YYYY-MM-DD
  category:     string;
  description:  string | null;
  amount:       number;
  currency:     string;
}

export interface CategorySpend {
  category: string;
  amount:   number;
  count:    number;
  pct:      number;   // % of total
}

export function useMarketingExpenses() {
  const { dateRange } = useFilters();

  const { data: rows = [], isLoading } = useQuery<MarketingExpense[]>({
    queryKey:  ["marketing-expenses"],
    queryFn:   async () => {
      const { data, error } = await supabase
        .from("marketing_expenses")
        .select("id, expense_date, category, description, amount, currency")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingExpense[];
    },
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    const fromISO = dateRange.from.toISOString().split("T")[0];
    const toISO   = dateRange.to.toISOString().split("T")[0];
    const inRange = rows.filter(r => {
      const d = r.expense_date ?? "";
      return d >= fromISO && d <= toISO;
    });

    const total = inRange.reduce((s, r) => s + (r.amount ?? 0), 0);

    const byCat = new Map<string, { amount: number; count: number }>();
    for (const r of inRange) {
      const cur = byCat.get(r.category) ?? { amount: 0, count: 0 };
      cur.amount += r.amount ?? 0;
      cur.count  += 1;
      byCat.set(r.category, cur);
    }

    const byCategory: CategorySpend[] = Array.from(byCat.entries())
      .map(([category, v]) => ({
        category,
        amount: v.amount,
        count:  v.count,
        pct:    total > 0 ? (v.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly breakdown for trend chart
    const byMonth = new Map<string, number>();
    for (const r of inRange) {
      const key = r.expense_date?.slice(0, 7) ?? "unknown";
      byMonth.set(key, (byMonth.get(key) ?? 0) + (r.amount ?? 0));
    }
    const monthly = Array.from(byMonth.entries())
      .sort()
      .map(([m, amount]) => ({
        month:  new Date(m + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        amount,
      }));

    return { rows: inRange, total, byCategory, monthly, isLoading };
  }, [rows, dateRange, isLoading]);
}

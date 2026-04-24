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
  avg:      number;   // avg per transaction
}

export interface MonthlyPoint {
  month:   string;   // display label
  monthKey: string;  // YYYY-MM for sort
  amount:  number;
  count:   number;
}

export interface TopTransaction {
  id:          string;
  date:        string;
  category:    string;
  description: string;
  amount:      number;
}

function fmtMonth(key: string): string {
  return new Date(key + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export function useMarketingExpenses() {
  const { dateRange } = useFilters();

  const { data: allRows = [], isLoading } = useQuery<MarketingExpense[]>({
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
    const rows = allRows.filter(r => {
      const d = r.expense_date ?? "";
      return d >= fromISO && d <= toISO;
    });

    // Previous period of equal length, immediately before the current window
    const spanMs    = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFrom  = new Date(dateRange.from.getTime() - spanMs - 86_400_000);
    const prevTo    = new Date(dateRange.from.getTime() - 86_400_000);
    const prevFromISO = prevFrom.toISOString().split("T")[0];
    const prevToISO   = prevTo.toISOString().split("T")[0];
    const prevRows = allRows.filter(r => {
      const d = r.expense_date ?? "";
      return d >= prevFromISO && d <= prevToISO;
    });

    const total     = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const prevTotal = prevRows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const growthPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

    // By category
    const byCat = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
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
        avg:    v.count  > 0 ? v.amount / v.count : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // By month
    const byMonthMap = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
      const key = r.expense_date?.slice(0, 7) ?? "unknown";
      const cur = byMonthMap.get(key) ?? { amount: 0, count: 0 };
      cur.amount += r.amount ?? 0;
      cur.count  += 1;
      byMonthMap.set(key, cur);
    }
    const monthly: MonthlyPoint[] = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ monthKey: k, month: fmtMonth(k), amount: v.amount, count: v.count }));

    const avgMonthly = monthly.length > 0 ? total / monthly.length : 0;

    // Top transactions
    const topTransactions: TopTransaction[] = rows
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map(r => ({
        id:          r.id,
        date:        r.expense_date,
        category:    r.category,
        description: r.description ?? "",
        amount:      r.amount,
      }));

    const biggest = topTransactions[0];

    const topCategory = byCategory[0];

    return {
      rows,
      total,
      prevTotal,
      growthPct,
      avgMonthly,
      byCategory,
      monthly,
      topTransactions,
      biggest,
      topCategory,
      transactionCount: rows.length,
      isLoading,
    };
  }, [allRows, dateRange, isLoading]);
}

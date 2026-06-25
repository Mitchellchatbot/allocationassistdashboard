import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ZohoBooksMonth { month: string; revenue: number; expenses: number }
export interface ZohoBooksDay { date: string; revenue: number; expenses: number }
export interface ZohoBooksCategory { name: string; amount: number }
export interface ZohoBooksExpenseTxn { date: string; amount: number; text: string }
export interface ZohoBooksExpenseCategory {
  category: string; amount: number; count: number; txns: ZohoBooksExpenseTxn[];
}

export interface ZohoBooksData {
  /** True once the Zoho Books secrets are set on the edge function. */
  configured:   boolean;
  /** True when the live fetch succeeded. */
  ok:           boolean;
  error?:       string;
  currency?:    string;
  revenue?:     number;   // invoiced total in the period
  expenses?:    number;
  profit?:      number;
  outstanding?: number;   // unpaid invoice balance
  invoiceCount?: number;
  expenseCount?: number;
  byMonth?:     ZohoBooksMonth[];
  byDay?:       ZohoBooksDay[];
  byCategory?:  ZohoBooksCategory[];
  /** Full per-category expense breakdown (payroll, software, rent, …) with
   *  per-transaction detail for drill-down. Sums to `expenses`. */
  expenseBreakdown?: ZohoBooksExpenseCategory[];
  /** Marketing/advertising expense transactions — text carries the channel
   *  (account / reference / description), classified on the dashboard. */
  marketingTxns?: { date: string; amount: number; text: string }[];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Pulls actual revenue + expenses from Zoho Books for the given date range.
 * Returns `{ configured: false }` until the Zoho Books secrets are set on the
 * edge function — so the Finance page can fall back to its estimate cleanly.
 */
export function useZohoBooks(dateRange: { from: Date; to: Date }) {
  const from = ymd(dateRange.from);
  const to   = ymd(dateRange.to);
  return useQuery<ZohoBooksData>({
    queryKey: ["zoho-books", from, to],
    queryFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const token   = session?.access_token ?? SUPABASE_ANON_KEY;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/zoho-books`, {
          method: "POST",
          headers: {
            apikey:          SUPABASE_ANON_KEY,
            Authorization:   `Bearer ${token}`,
            "content-type":  "application/json",
          },
          body: JSON.stringify({ from, to }),
        });
        // The function returns its status in the body for every case, so read it
        // regardless of HTTP status.
        return await res.json() as ZohoBooksData;
      } catch (e) {
        return { configured: false, ok: false, error: (e as Error).message };
      }
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

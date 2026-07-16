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
  /** Suspect non-retainer Scaled AI billing removed from `expenses`. */
  scaledAiCorrection?: number;
  /** ISO time the shared server cache for this range was last computed — drives
   *  the "Synced Xm ago" freshness chip. Present on every ok:true response. */
  synced_at?: string;
  /** True when the response is the SHARED cached result (served without hitting
   *  Zoho), false/undefined when freshly computed. */
  cached?: boolean;
  /** True when Zoho was unreachable/throttled and we served the last-known-good
   *  cached numbers instead — the UI shows an "as of" label, never wrong zeros. */
  stale?: boolean;
  /** True when a compute completed but some Zoho report page/month was throttled
   *  and no prior good cache existed — numbers may be incomplete. */
  partial?: boolean;
}

/** A single general-ledger leg posted to an expense account. */
export interface ZohoAccountTxn { date: string; type: string; text: string; amount: number }
export interface ZohoAccountTxnsData {
  configured: boolean;
  ok: boolean;
  error?: string;
  /** account name → its ledger transactions (bills, expenses, journals). */
  accounts?: Record<string, ZohoAccountTxn[]>;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Force the shared server cache to recompute this range NOW (the "Refresh now"
 *  button), bypassing the 15-min cache-serve. After it resolves the caller
 *  should invalidate ["zoho-books"] so every consumer repaints from the freshly
 *  written cache — so everyone converges on the same up-to-the-second numbers. */
export async function forceRefreshZohoBooks(dateRange: { from: Date; to: Date }): Promise<void> {
  const from = ymd(dateRange.from);
  const to   = ymd(dateRange.to);
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  await fetch(`${SUPABASE_URL}/functions/v1/zoho-books`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, force: true }),
  });
}

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
    retry: 1,          // one retry rides out a transient Zoho token-throttle blip
  });
}

/**
 * Per-account general-ledger transactions for the period — the line items
 * behind accounts funded by vendor bills / journal entries (payroll, hardware,
 * licensing…), which have no Expense-module records. Heavy (pages the whole
 * GL), so it's lazy: pass `enabled` true only once a drill-down is opened. One
 * fetch is cached and serves every account's drill-down.
 */
export function useZohoAccountTxns(dateRange: { from: Date; to: Date }, enabled: boolean) {
  const from = ymd(dateRange.from);
  const to   = ymd(dateRange.to);
  return useQuery<ZohoAccountTxnsData>({
    queryKey: ["zoho-accounttxns", from, to],
    queryFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const token   = session?.access_token ?? SUPABASE_ANON_KEY;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/zoho-books`, {
          method: "POST",
          headers: {
            apikey:         SUPABASE_ANON_KEY,
            Authorization:  `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "accounttxns", from, to }),
        });
        return await res.json() as ZohoAccountTxnsData;
      } catch (e) {
        return { configured: false, ok: false, error: (e as Error).message };
      }
    },
    enabled,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

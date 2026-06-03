/**
 * Counts placements (doctors with a confirmed joining date) grouped by
 * month. The single source of truth for "Placed" on the dashboard
 * trend chart.
 *
 * Why this exists: the previous implementation read Placed from Zoho
 * Deals (Stage = 'Closed Won', grouped by Closing_Date). AA almost
 * never closes deals in Zoho — Ammar confirmed on the 2026-06-03
 * walkthrough that placements are tracked in the Hammad sheet, not
 * Zoho. The portal mirror of that sheet is `doctor_lifecycle.joined_at`,
 * which is exactly the "hospital-confirmed joining date" the team
 * wants counted.
 *
 * Returns a map keyed by "MMM YY" (matching the format the
 * dashboard's leads-over-time series uses) so the values merge in
 * without further reshaping.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type PlacementsByMonth = Record<string, number>;

export function usePlacementsByMonth() {
  return useQuery<PlacementsByMonth>({
    queryKey: ["placements-by-month"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .select("joined_at")
        .not("joined_at", "is", null);

      if (error) throw error;

      const buckets: PlacementsByMonth = {};
      for (const row of data ?? []) {
        const raw = (row as { joined_at: string | null }).joined_at;
        if (!raw) continue;
        const d = new Date(raw);
        if (isNaN(d.getTime())) continue;
        // Match the "MMM YY" format use-zoho-data builds for leadsOverTime
        // so the dashboard can do a straight key lookup.
        const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
      return buckets;
    },
    staleTime: 60_000,
  });
}

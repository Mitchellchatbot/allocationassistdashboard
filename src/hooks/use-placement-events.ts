/**
 * Every line the team logged, which is what the reports count.
 *
 * placement_attempts holds one row per doctor+hospital journey, with a single
 * date per stage. That is the right shape for the doctor and hospital views,
 * but it is not what the team's figures measure: they count lines, and a
 * doctor is regularly put forward at the same hospital more than once — 811
 * interview lines in the 2026 workbook against 671 distinct pairs. A journey
 * row can only keep one of those.
 *
 * placement_events keeps them all, with the Sunday–Saturday week each belongs
 * to and which side of the report it counts on, so Reports can show the same
 * number the team publishes.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EventRow } from "@/lib/placement-reporting";

export interface PlacementEvent extends EventRow {
  id:         string;
  attempt_id: string;
}

const KEY = ["placement-events"] as const;

export function usePlacementEvents() {
  return useQuery<PlacementEvent[]>({
    queryKey: KEY,
    queryFn: async () => {
      // Supabase caps a single request at 1,000 rows whatever .limit() says,
      // so page through with .range(). Nine months is about 3,300 events.
      const PAGE = 1000;
      const all: PlacementEvent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("placement_events")
          .select("id, attempt_id, stage, occurred_at, week_ending, rep, country")
          // id breaks ties: paging on a non-unique sort lets rows with the
          // same date repeat on one page and vanish from another, which
          // quietly loses whole stages when thousands share a handful of days.
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as PlacementEvent[];
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
}

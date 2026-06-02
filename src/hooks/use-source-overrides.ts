/**
 * Lead-source override registry. Solves the Meta attribution issue from the
 * May 20 plan: leads tagged Lead_Source="XXX" that are actually from Meta
 * campaigns get corrected here without touching the Zoho data.
 *
 * Use `useSourceOverrideMap()` in components that need the corrected source;
 * call `applySourceOverride(leadId, raw, map)` to get the final value.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface SourceOverride {
  lead_id:         string;
  override_source: string;
  note:            string | null;
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
}

export function useSourceOverrides() {
  return useQuery({
    queryKey: ["source-overrides"],
    queryFn: async (): Promise<SourceOverride[]> => {
      const { data, error } = await supabase
        .from("lead_source_overrides")
        .select("*")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as SourceOverride[];
    },
    staleTime: 60_000,
  });
}

/** Convenient `{ leadId: source }` map for O(1) lookup. */
export function useSourceOverrideMap(): Map<string, string> {
  const { data = [] } = useSourceOverrides();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const o of data) m.set(o.lead_id, o.override_source);
    return m;
  }, [data]);
}

/** Returns the override-corrected source for a lead, falling back to a
 *  caller-supplied default (typically displaySource of the raw Lead_Source). */
export function applySourceOverride(leadId: string, fallback: string, map: Map<string, string>): string {
  return map.get(leadId) ?? fallback;
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** One question's view/drop-off counts from Typeform Insights. */
export interface InsightField {
  ref: string;
  title: string;
  type: string;
  views: number;
  dropoffs: number;
}

/**
 * Drop-off / completion analytics for one form, from the `form-insights` edge
 * function. `supported` distinguishes providers that expose a per-question funnel
 * (Typeform) from those that only give an overall submission count (Jotform).
 */
export interface FormInsights {
  formId: string;
  name: string;
  provider: string;
  supported: boolean;
  error?: string;
  status?: number;
  // Typeform (supported):
  completionRate?: number | null; // whole percent, e.g. 65
  visits?: number | null;         // total_visits
  uniqueVisits?: number | null;
  responses?: number | null;      // responses_count
  avgTimeSec?: number | null;
  fields?: InsightField[];
  // Jotform (unsupported funnel):
  submitted?: number;
  note?: string;
}

/** Fetch drop-off insights for a single form. Cached for a while — these move
 *  slowly and each call hits the provider's API. */
export function useFormInsights(formId: string | null, provider: string) {
  return useQuery({
    queryKey: ["form-insights", formId],
    // Only Typeform + Jotform have anything to fetch; skip elementor/internal.
    enabled: !!formId && (provider === "typeform" || provider === "jotform"),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<FormInsights> => {
      const { data, error } = await supabase.functions.invoke("form-insights", { body: { form_id: formId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed to load insights");
      return data as FormInsights;
    },
  });
}

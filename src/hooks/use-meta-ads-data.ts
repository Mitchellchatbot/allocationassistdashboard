import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  dailyBudget: string | null;
  startTime: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: string;
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  thumbnailUrl: string | null;
  title: string;
  body: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
};

export type MetaTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

export type MetaAdsData = {
  campaigns: MetaCampaign[];
  ads: MetaAd[];
  totals: MetaTotals;
  preset: string;
};

export function useMetaAdsData(datePreset = "last_30d") {
  return useQuery<MetaAdsData>({
    queryKey: ["meta-ads", datePreset],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads?date_preset=${datePreset}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
          },
        }
      );

      if (!res.ok) throw new Error(`meta-ads edge function returned ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json as MetaAdsData;
    },
    staleTime:            10 * 60 * 1000,
    gcTime:               30 * 60 * 1000,
    retry:                1,
    retryDelay:           10_000,
    refetchOnWindowFocus: false,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ChatbotStats {
  leads:          number;
  conversions:    number;
  conversionRate: number;
  qualified:      number;
  trend:          Array<{ month: string; leads: number; conversions: number }>;
  recent:         Array<{ name: string; specialty: string; exported_at: string; qualified: boolean; converted: boolean }>;
}

/** Chatbot (Care Assist) lead → conversion stats for a date range. Leads come
 *  live from the chatbot's own DB; conversions are matched against this org's
 *  Doctors on Board. Server-computed by the chatbot-stats edge function. */
export function useChatbotStats(from?: Date, to?: Date) {
  const fromIso = from?.toISOString();
  const toIso   = to?.toISOString();
  return useQuery({
    queryKey: ["chatbot-stats", fromIso ?? "", toIso ?? ""],
    queryFn: async (): Promise<ChatbotStats> => {
      const session = (await supabase.auth.getSession()).data.session;
      const token   = session?.access_token ?? SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chatbot-stats`, {
        method: "POST",
        headers: {
          "apikey":         SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "content-type":   "application/json",
        },
        body: JSON.stringify({ from: fromIso, to: toIso }),
      });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string } & Partial<ChatbotStats>;
      if (!res.ok || !j.ok) throw new Error(j.reason || `Chatbot stats failed (${res.status})`);
      return {
        leads:          j.leads          ?? 0,
        conversions:    j.conversions    ?? 0,
        conversionRate: j.conversionRate ?? 0,
        qualified:      j.qualified      ?? 0,
        trend:          j.trend          ?? [],
        recent:         j.recent         ?? [],
      };
    },
    staleTime: 5 * 60_000,
  });
}

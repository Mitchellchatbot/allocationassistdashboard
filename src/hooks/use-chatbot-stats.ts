import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ChatbotStats {
  leads:          number;
  conversions:    number;
  conversionRate: number;
  qualified:      number;
  trend:          Array<{ month: string; leads: number; conversions: number }>;
  bySpecialty:    Array<{ specialty: string; leads: number; conversions: number }>;
  recent:         Array<{ name: string; specialty: string; exported_at: string; qualified: boolean; converted: boolean }>;
}

export interface ChatbotInsights { overview: string; bullets: string[] }

async function callChatbotStats(args: { from?: Date; to?: Date; insights?: boolean }): Promise<Record<string, unknown>> {
  const session = (await supabase.auth.getSession()).data.session;
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chatbot-stats`, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ from: args.from?.toISOString(), to: args.to?.toISOString(), insights: args.insights }),
  });
  const j = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string } & Record<string, unknown>;
  if (!res.ok || !j.ok) throw new Error((j.reason as string) || `Chatbot stats failed (${res.status})`);
  return j;
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
      const j = await callChatbotStats({ from, to }) as Partial<ChatbotStats>;
      return {
        leads:          j.leads          ?? 0,
        conversions:    j.conversions    ?? 0,
        conversionRate: j.conversionRate ?? 0,
        qualified:      j.qualified      ?? 0,
        trend:          j.trend          ?? [],
        bySpecialty:    j.bySpecialty    ?? [],
        recent:         j.recent         ?? [],
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** On-demand AI read on chatbot performance for the selected window. Disabled
 *  by default (one AI call) — trigger with regenerate(). */
export function useChatbotInsights(from?: Date, to?: Date) {
  const qc = useQueryClient();
  const key = ["chatbot-insights", from?.toISOString() ?? "", to?.toISOString() ?? ""] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ChatbotInsights> => {
      const j = await callChatbotStats({ from, to, insights: true });
      const ins = (j.insights ?? null) as ChatbotInsights | null;
      if (!ins) throw new Error("AI insight unavailable right now.");
      return ins;
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const regen = useMutation({
    mutationFn: async () => {
      const j = await callChatbotStats({ from, to, insights: true });
      const ins = (j.insights ?? null) as ChatbotInsights | null;
      if (!ins) throw new Error("AI insight unavailable right now.");
      return ins;
    },
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  return {
    data:       query.data,
    isFetching: query.isFetching || regen.isPending,
    error:      (query.error ?? regen.error) as Error | null,
    generate:   () => (query.data ? regen.mutate() : query.refetch()),
  };
}

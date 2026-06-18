import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface PortalDigest {
  headline:   string;
  metrics:    string[];
  pipeline:   string[];
  marketing:  string[];
  operations: string[];
  attention:  string[];
}

async function fetchDigest(): Promise<PortalDigest> {
  const session = (await supabase.auth.getSession()).data.session;
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
    method: "POST",
    headers: {
      "apikey":         SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "content-type":   "application/json",
    },
    // Reuses the chat assistant's full-portal snapshot, in digest mode.
    body: JSON.stringify({ mode: "digest", currentPage: "/" }),
  });
  const j = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string } & Partial<PortalDigest>;
  if (!res.ok || !j.ok) throw new Error(j.reason || `Digest failed (${res.status})`);
  return {
    headline:   j.headline   ?? "",
    metrics:    j.metrics    ?? [],
    pipeline:   j.pipeline   ?? [],
    marketing:  j.marketing  ?? [],
    operations: j.operations ?? [],
    attention:  j.attention  ?? [],
  };
}

/** On-demand portal-wide AI digest. Disabled by default (it's a heavy AI call
 *  over the whole portal) — trigger with `.refetch()`. Result stays cached for
 *  the session so it isn't re-run on every render. */
export function usePortalDigest() {
  return useQuery({
    queryKey:  ["portal-digest"],
    queryFn:   fetchDigest,
    enabled:   false,
    staleTime: Infinity,
    gcTime:    30 * 60_000,
    retry:     false,
  });
}

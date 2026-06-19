import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type DigestPeriod = "daily" | "weekly" | "monthly";

export interface PortalDigest {
  headline:     string;
  pipeline?:    string[];
  marketing?:   string[];
  operations?:  string[];
  attention:    string[];
  period?:      DigestPeriod;
  cached?:      boolean;
  generated_at?: string;
}

async function fetchDigest(args: {
  period: DigestPeriod; role: string; allowedPages: string[]; force: boolean;
}): Promise<PortalDigest> {
  const session = (await supabase.auth.getSession()).data.session;
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
    method: "POST",
    headers: {
      "apikey":         SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "content-type":   "application/json",
    },
    body: JSON.stringify({
      mode: "digest",
      period:       args.period,
      role:         args.role,
      allowedPages: args.allowedPages,
      force:        args.force,
    }),
  });
  const j = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string } & Partial<PortalDigest>;
  if (!res.ok || !j.ok) throw new Error(j.reason || `Digest failed (${res.status})`);
  return {
    headline:     j.headline   ?? "",
    pipeline:     j.pipeline,
    marketing:    j.marketing,
    operations:   j.operations,
    attention:    j.attention  ?? [],
    period:       j.period as DigestPeriod | undefined,
    cached:       j.cached,
    generated_at: j.generated_at,
  };
}

/** Portal-wide AI digest for the chosen period, scoped to the viewer's access.
 *  Auto-loads on mount (the daily one is generated once per day server-side and
 *  shared, so most loads are a fast cache read). `regenerate()` forces a fresh
 *  run for the current period. */
export function usePortalDigest(period: DigestPeriod, role: string, allowedPages: string[]) {
  const qc = useQueryClient();
  const scopeSig = role === "admin" ? "all" : [...allowedPages].sort().join(",");
  const key = ["portal-digest", period, scopeSig] as const;

  const query = useQuery({
    queryKey:  key,
    queryFn:   () => fetchDigest({ period, role, allowedPages, force: false }),
    staleTime: Infinity,
    gcTime:    30 * 60_000,
    retry:     false,
  });

  const regen = useMutation({
    mutationFn: () => fetchDigest({ period, role, allowedPages, force: true }),
    onSuccess:  (d) => qc.setQueryData(key, d),
  });

  return {
    data:       query.data,
    isLoading:  query.isLoading,
    isFetching: query.isFetching || regen.isPending,
    error:      (query.error ?? regen.error) as Error | null,
    regenerate: () => regen.mutate(),
  };
}

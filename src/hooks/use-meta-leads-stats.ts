import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type GroupedStat = { label: string; count: number };

export type MetaLeadsStats = {
  total: number;
  withUtm: number;
  byCreative:  GroupedStat[];
  byCampaign:  GroupedStat[];
  byPlatform:  GroupedStat[];
  byLocation:  GroupedStat[];
  bySpeciality: GroupedStat[];
  byStage:     GroupedStat[];
};

// Normalize utm_source values into clean platform names
function normalizePlatform(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === "meta" || s === "fb" || s.startsWith("facebook")) return "Facebook";
  if (s === "ig" || s.startsWith("instagram")) return "Instagram";
  if (s === "google") return "Google";
  if (s === "youtube") return "YouTube";
  return "Other";
}

// Fetch all rows for a column from the RAW meta_leads table, paginated
async function groupBy(
  column: string,
  since: string | null,
  opts: { skipNumeric?: boolean; normalize?: (v: string) => string; splitComma?: boolean } = {}
): Promise<GroupedStat[]> {
  const PAGE = 1000;
  const map: Record<string, number> = {};
  let from = 0;

  while (true) {
    let q = supabase
      .from("meta_leads")
      .select(column)
      .not(column, "is", null)
      .neq(column, "")
      .neq(column, "xxxxx")
      .range(from, from + PAGE - 1);

    if (since) q = (q as any).gte("created_at", since);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as any[];
    for (const row of rows) {
      let val: string = String(row[column]).trim();
      if (!val) continue;
      if (opts.skipNumeric && /^\d+$/.test(val)) continue;

      const values = opts.splitComma
        ? val.split(",").map((s) => s.trim()).filter(Boolean)
        : [val];

      for (const v of values) {
        const key = opts.normalize ? opts.normalize(v) : v;
        if (!key) continue;
        map[key] = (map[key] ?? 0) + 1;
      }
    }

    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 30_000) break;
  }

  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function getDateFilter(preset: string): string | null {
  if (preset === "this_month") {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const days: Record<string, number> = { last_7d: 7, last_30d: 30, this_quarter: 90 };
  const d = days[preset];
  if (!d) return null;
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
}

export function useMetaLeadsStats(preset = "last_30d") {
  return useQuery<MetaLeadsStats>({
    queryKey: ["meta-leads-stats", preset],
    queryFn: async () => {
      const since = getDateFilter(preset);

      // Total count
      let countQ = supabase.from("meta_leads").select("*", { count: "exact", head: true });
      if (since) countQ = (countQ as any).gte("created_at", since);
      const { count: total } = await countQ;

      // Count leads that have UTM data (i.e. came via tracked ads)
      let utmQ = supabase.from("meta_leads")
        .select("*", { count: "exact", head: true })
        .not("utm_campaign", "is", null)
        .neq("utm_campaign", "")
        .neq("utm_campaign", "xxxxx");
      if (since) utmQ = (utmQ as any).gte("created_at", since);
      const { count: withUtm } = await utmQ;

      const [byCreative, byCampaign, byPlatform, byLocation, bySpeciality, byStage] =
        await Promise.all([
          groupBy("utm_content",  since, { skipNumeric: true }),
          groupBy("utm_campaign", since, {}),
          groupBy("utm_source",   since, { normalize: normalizePlatform }),
          groupBy("location",     since, {}),
          groupBy("speciality",   since, { splitComma: true }),
          groupBy("stage",        since, {}),
        ]);

      return {
        total:        total    ?? 0,
        withUtm:      withUtm  ?? 0,
        byCreative,
        byCampaign,
        byPlatform,
        byLocation,
        bySpeciality,
        byStage,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

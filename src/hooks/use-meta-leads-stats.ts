import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type GroupedStat = { label: string; count: number };

export type CampaignFunnel = {
  campaign:  string;
  total:     number;
  qualified: number;
  converted: number;
};

export type MetaLeadsStats = {
  total:           number;
  withUtm:         number;
  qualifiedCount:  number;  // meta_leads in qualified stages
  placedCount:     number;  // meta_leads in converted/placed stages
  byCreative:      GroupedStat[];
  byCampaign:      GroupedStat[];
  byPlatform:      GroupedStat[];
  byLocation:      GroupedStat[];
  bySpeciality:    GroupedStat[];
  byStage:         GroupedStat[];
  campaignFunnels: CampaignFunnel[];
};

// Stage classification mirrors how Zoho Lead_Status is treated elsewhere in the app.
// Kept in lower-case so we match regardless of casing variations across imports.
const QUALIFIED_STAGES = new Set([
  "initial sales call completed",
  "contact in future",
  "high priority follow up",
  "high priority follow-up",
  "qualified",
]);
const CONVERTED_STAGES = new Set([
  "closed won",
  "won",
  "converted",
  "placed",
  "placement",
]);

// Normalize utm_source values into clean platform names
function normalizePlatform(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === "meta" || s === "fb" || s.startsWith("facebook")) return "Facebook";
  if (s === "ig"   || s.startsWith("instagram")) return "Instagram";
  if (s === "google") return "Google";
  if (s === "youtube") return "YouTube";
  return "Other";
}

function groupByField(
  rows: Record<string, string>[],
  field: string,
  opts: { skipNumeric?: boolean; normalize?: (v: string) => string; splitComma?: boolean } = {}
): GroupedStat[] {
  const map: Record<string, number> = {};
  for (const row of rows) {
    let val = (row[field] ?? "").toString().trim();
    if (!val || val === "xxxxx") continue;
    if (opts.skipNumeric && /^\d+$/.test(val)) continue;

    const values = opts.splitComma
      ? val.split(",").map(s => s.trim()).filter(Boolean)
      : [val];

    for (const v of values) {
      const key = opts.normalize ? opts.normalize(v) : v;
      if (!key) continue;
      map[key] = (map[key] ?? 0) + 1;
    }
  }
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export interface DateRangeInput {
  from: Date;
  to:   Date;
}

export function useMetaLeadsStats(dateRange: DateRangeInput) {
  const fromKey = dateRange.from.toISOString().slice(0, 10);
  const toKey   = dateRange.to.toISOString().slice(0, 10);

  return useQuery<MetaLeadsStats>({
    queryKey: ["meta-leads-stats", fromKey, toKey],
    queryFn: async () => {
      const fromISO = dateRange.from.toISOString();
      // end-of-day for `to`
      const toISO = new Date(
        dateRange.to.getFullYear(),
        dateRange.to.getMonth(),
        dateRange.to.getDate(),
        23, 59, 59
      ).toISOString();

      // ── Fetch all rows in ONE query (much faster than 6 separate column queries)
      const PAGE = 1000;
      const allRows: Record<string, string>[] = [];
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from("meta_leads")
          .select("utm_content, utm_campaign, utm_source, location, speciality, stage, submitted_at, created_at")
          .range(offset, offset + PAGE - 1);

        if (error) throw error;
        const rows = (data ?? []) as Record<string, string>[];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
        if (offset > 50_000) break;
      }

      // Filter by date using submitted_at (actual lead date) falling back to created_at
      const fromMs = dateRange.from.getTime();
      const toMs   = new Date(
        dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59
      ).getTime();
      const filtered = allRows.filter(r => {
        const raw = r.submitted_at || r.created_at;
        if (!raw) return true;
        const t = new Date(raw).getTime();
        return t >= fromMs && t <= toMs;
      });

      const total   = filtered.length;
      const withUtm = filtered.filter(
        r => r.utm_campaign && r.utm_campaign.trim() !== "" && r.utm_campaign !== "xxxxx"
      ).length;

      const byCreative  = groupByField(filtered, "utm_content",  { skipNumeric: true });
      const byCampaign  = groupByField(filtered, "utm_campaign", {});
      const byPlatform  = groupByField(filtered, "utm_source",   { normalize: normalizePlatform });
      const byLocation  = groupByField(filtered, "location",     {});
      const bySpeciality = groupByField(filtered, "speciality",  { splitComma: true });
      const byStage     = groupByField(filtered, "stage",        {});

      // Build per-campaign funnel + global qualified/placed totals in one pass.
      const funnelMap = new Map<string, CampaignFunnel>();
      let qualifiedCount = 0;
      let placedCount    = 0;
      for (const r of filtered) {
        const stage = (r.stage ?? "").trim().toLowerCase();
        if (QUALIFIED_STAGES.has(stage)) qualifiedCount++;
        if (CONVERTED_STAGES.has(stage)) placedCount++;
        const camp = (r.utm_campaign ?? "").trim();
        if (!camp || camp === "xxxxx") continue;
        const cur = funnelMap.get(camp) ?? { campaign: camp, total: 0, qualified: 0, converted: 0 };
        cur.total++;
        if (QUALIFIED_STAGES.has(stage)) cur.qualified++;
        if (CONVERTED_STAGES.has(stage)) cur.converted++;
        funnelMap.set(camp, cur);
      }
      const campaignFunnels = Array.from(funnelMap.values()).sort((a, b) => b.total - a.total);

      return {
        total, withUtm, qualifiedCount, placedCount,
        byCreative, byCampaign, byPlatform, byLocation, bySpeciality, byStage, campaignFunnels,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

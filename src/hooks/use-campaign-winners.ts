import { useMemo } from "react";
import { useMetaLeadsStats } from "@/hooks/use-meta-leads-stats";
import { useMetaAdsApi, getMetaToken } from "@/hooks/use-meta-ads-api";
import { useFilters } from "@/lib/filters";

export interface CampaignRow {
  campaign:         string;
  total:            number;
  qualified:        number;
  converted:        number;
  spend:            number;       // 0 if no Meta token / no match
  costPerQualified: number;       // 0 if spend unavailable or qualified = 0
  costPerConversion: number;      // 0 if spend unavailable or converted = 0
  qualifiedRate:    number;       // 0..100
  conversionRate:   number;       // 0..100
}

export interface CampaignWinners {
  rows:             CampaignRow[];
  hasSpendData:     boolean;      // true if we matched Meta Ads spend to any campaign
  mostQualified:    CampaignRow | null;
  bestQualifiedKpi: CampaignRow | null; // cost per qualified if available, else best qualification rate
  bestConversionKpi: CampaignRow | null; // cost per conversion if available, else best conversion rate
}

function normaliseCampaignName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Builds per-campaign winners from meta_leads (utm_campaign + stage) joined with
 * Meta Ads spend per campaign. Spend matching is best-effort by normalised name —
 * a Meta Ads campaign and a utm_campaign with the same normalised slug will join.
 */
export function useCampaignWinners(): CampaignWinners {
  const { dateRange } = useFilters();
  const { data: leadsStats } = useMetaLeadsStats(dateRange);
  const { data: metaApi }    = useMetaAdsApi(dateRange);

  return useMemo(() => {
    const funnels = leadsStats?.campaignFunnels ?? [];
    const tokenAvailable = !!getMetaToken();

    // Build THREE lookups against Meta API campaigns:
    //  - id    → name (so a numeric utm_campaign can be translated to a readable name)
    //  - id    → spend
    //  - name  → spend (fallback: utm_campaign already contains a readable slug)
    const nameById  = new Map<string, string>();
    const spendById = new Map<string, number>();
    const spendByNameKey = new Map<string, number>();
    if (tokenAvailable && metaApi?.campaigns) {
      for (const c of metaApi.campaigns) {
        if (c.id)   {
          nameById.set(c.id, c.name);
          spendById.set(c.id, (spendById.get(c.id) ?? 0) + c.spend);
        }
        const nameKey = normaliseCampaignName(c.name);
        if (nameKey) spendByNameKey.set(nameKey, (spendByNameKey.get(nameKey) ?? 0) + c.spend);
      }
    }

    let hasSpendData = false;
    const rows: CampaignRow[] = funnels.map(f => {
      const raw     = f.campaign.trim();
      // If utm_campaign IS a Meta campaign ID, swap to the human-readable name.
      const display = nameById.get(raw) ?? f.campaign;
      // Spend: prefer ID match (exact), fall back to normalised-name match.
      const spend   = spendById.get(raw) ?? spendByNameKey.get(normaliseCampaignName(raw)) ?? 0;
      if (spend > 0) hasSpendData = true;
      return {
        campaign:          display,
        total:             f.total,
        qualified:         f.qualified,
        converted:         f.converted,
        spend,
        costPerQualified:  spend > 0 && f.qualified > 0 ? spend / f.qualified : 0,
        costPerConversion: spend > 0 && f.converted > 0 ? spend / f.converted : 0,
        qualifiedRate:     f.total > 0 ? (f.qualified / f.total) * 100 : 0,
        conversionRate:    f.total > 0 ? (f.converted / f.total) * 100 : 0,
      };
    });

    if (rows.length === 0) {
      return { rows, hasSpendData, mostQualified: null, bestQualifiedKpi: null, bestConversionKpi: null };
    }

    // Most qualified leads (raw count) — always available
    const mostQualified = [...rows]
      .filter(r => r.qualified > 0)
      .sort((a, b) => b.qualified - a.qualified)[0] ?? null;

    // Cost per qualified — only when we have spend data, else fall back to highest qualification rate.
    // Rate fallback requires >= 5 leads to avoid tiny campaigns winning by accident.
    let bestQualifiedKpi: CampaignRow | null;
    if (hasSpendData) {
      const candidates = rows.filter(r => r.spend > 0 && r.qualified > 0);
      bestQualifiedKpi = candidates.length
        ? [...candidates].sort((a, b) => a.costPerQualified - b.costPerQualified)[0]
        : null;
    } else {
      const candidates = rows.filter(r => r.total >= 5 && r.qualified > 0);
      bestQualifiedKpi = candidates.length
        ? [...candidates].sort((a, b) => b.qualifiedRate - a.qualifiedRate)[0]
        : null;
    }

    // Cost per conversion — same shape: spend if available, else conversion rate.
    let bestConversionKpi: CampaignRow | null;
    if (hasSpendData) {
      const candidates = rows.filter(r => r.spend > 0 && r.converted > 0);
      bestConversionKpi = candidates.length
        ? [...candidates].sort((a, b) => a.costPerConversion - b.costPerConversion)[0]
        : null;
    } else {
      const candidates = rows.filter(r => r.total >= 5 && r.converted > 0);
      bestConversionKpi = candidates.length
        ? [...candidates].sort((a, b) => b.conversionRate - a.conversionRate)[0]
        : null;
    }

    return { rows, hasSpendData, mostQualified, bestQualifiedKpi, bestConversionKpi };
  }, [leadsStats?.campaignFunnels, metaApi?.campaigns]);
}

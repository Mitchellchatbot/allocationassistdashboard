import { useMemo } from "react";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { normalizeChannelKey, type ChannelKey } from "@/lib/channel-mapping";

export interface ChannelEconomicsRow {
  channel:        ChannelKey;
  leads:          number;
  qualified:      number;
  converted:      number;
  spend:          number;
  costPerLead:      number; // 0 when leads = 0
  costPerQualified: number; // 0 when qualified = 0
  costPerConversion: number; // 0 when converted = 0 or no spend
  qualifiedRate: number;    // 0..100
  conversionRate: number;   // 0..100 (lead → "converted" status)
}

const QUALIFIED_STATUSES = new Set([
  "Initial Sales Call Completed",
  "Contact in Future",
  "High Priority Follow up",
]);
// "Converted" = lead progressed to a state that looks like a sale.
// We treat anything that signals genuine traction as a conversion.
const CONVERTED_STATUSES = new Set([
  "Contact in Future",
  "High Priority Follow up",
  "Closed Won",
]);

/**
 * Joins marketing-spend categories with Zoho lead sources on a normalised
 * channel key, all filtered by the active dashboard date range.
 *
 * Returns one row per channel that has at least one lead OR spend > 0.
 */
export function useChannelEconomics() {
  const { dateRange } = useFilters();
  const { byCategory } = useMarketingExpenses();
  const { data: zoho } = useZohoData();

  return useMemo(() => {
    const map = new Map<ChannelKey, ChannelEconomicsRow>();
    const ensure = (k: ChannelKey): ChannelEconomicsRow => {
      let cur = map.get(k);
      if (!cur) {
        cur = {
          channel: k, leads: 0, qualified: 0, converted: 0,
          spend: 0, costPerLead: 0, costPerQualified: 0, costPerConversion: 0,
          qualifiedRate: 0, conversionRate: 0,
        };
        map.set(k, cur);
      }
      return cur;
    };

    for (const c of byCategory) {
      ensure(normalizeChannelKey(c.category)).spend += c.amount;
    }

    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    for (const l of zoho?.rawLeads ?? []) {
      const t = l.Created_Time ? new Date(l.Created_Time).getTime() : NaN;
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      const row = ensure(normalizeChannelKey(l.Lead_Source));
      row.leads++;
      if (QUALIFIED_STATUSES.has(l.Lead_Status)) row.qualified++;
      if (CONVERTED_STATUSES.has(l.Lead_Status)) row.converted++;
    }

    const rows = Array.from(map.values());
    for (const r of rows) {
      r.costPerLead       = r.leads     > 0 ? r.spend / r.leads     : 0;
      r.costPerQualified  = r.qualified > 0 ? r.spend / r.qualified : 0;
      r.costPerConversion = r.converted > 0 ? r.spend / r.converted : 0;
      r.qualifiedRate     = r.leads     > 0 ? (r.qualified / r.leads)   * 100 : 0;
      r.conversionRate    = r.leads     > 0 ? (r.converted / r.leads)   * 100 : 0;
    }

    return rows
      .filter(r => r.leads > 0 || r.spend > 0)
      .sort((a, b) => b.leads - a.leads);
  }, [byCategory, zoho?.rawLeads, dateRange]);
}

/** "Best" picks: who's the clear winner on each metric, with sensible fallbacks. */
export function useChannelWinners() {
  const rows = useChannelEconomics();

  return useMemo(() => {
    if (rows.length === 0) return null;

    // Most leads = best on volume
    const mostLeads = [...rows].sort((a, b) => b.leads - a.leads)[0];

    // Lowest cost per lead — only consider channels that have BOTH spend and leads
    const cplCandidates = rows.filter(r => r.spend > 0 && r.leads > 0);
    const lowestCPL = cplCandidates.length
      ? [...cplCandidates].sort((a, b) => a.costPerLead - b.costPerLead)[0]
      : null;

    // Lowest cost per qualified — only channels with spend AND qualified leads
    const cpqCandidates = rows.filter(r => r.spend > 0 && r.qualified > 0);
    const lowestCPQ = cpqCandidates.length
      ? [...cpqCandidates].sort((a, b) => a.costPerQualified - b.costPerQualified)[0]
      : null;

    // Lowest cost per conversion — only channels with spend AND converted leads.
    // Falls back to highest conversion rate (>= 5 leads) when no channel has both
    // spend and a converted lead, so the card always has something to show.
    const cpcCandidates = rows.filter(r => r.spend > 0 && r.converted > 0);
    const lowestCPC = cpcCandidates.length
      ? [...cpcCandidates].sort((a, b) => a.costPerConversion - b.costPerConversion)[0]
      : null;
    const convCandidates = rows.filter(r => r.leads >= 5 && r.converted > 0);
    const bestConversion = convCandidates.length
      ? [...convCandidates].sort((a, b) => b.conversionRate - a.conversionRate)[0]
      : null;

    return { mostLeads, lowestCPL, lowestCPQ, lowestCPC, bestConversion };
  }, [rows]);
}

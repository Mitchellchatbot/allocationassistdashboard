import { useMemo } from "react";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { useZohoData, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
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
  // Lifetime (all-time, ignores date filter) — used to surface channels that
  // are losing money over time even if a recent window looks fine.
  lifetimeSpend:           number;
  lifetimeConverted:       number;
  lifetimeCostPerConversion: number; // 0 when no spend or no conversions ever
}

// Qualified = Initial Sales Call Completed + High Priority Follow up.
// Contact in Future is excluded (deferred conversation, not a pass).
const QUALIFIED_STATUSES = new Set([
  "Initial Sales Call Completed",
  "High Priority Follow up",
]);
// Converted = a row in the Zoho `Doctors on Board` module (api_name `Contacts`)
// attributed to this channel via Lead_Source. SOLE source of truth — the
// previous lead-status proxy was dropped because it counted engagement, not
// real conversions. There's no equivalent CONVERTED_STATUSES set anymore.

/**
 * Joins marketing-spend categories with Zoho lead sources on a normalised
 * channel key, all filtered by the active dashboard date range.
 *
 * Returns one row per channel that has at least one lead OR spend > 0.
 */
export function useChannelEconomics() {
  const { dateRange } = useFilters();
  const { byCategory, allRowsUnfiltered } = useMarketingExpenses();
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
          lifetimeSpend: 0, lifetimeConverted: 0, lifetimeCostPerConversion: 0,
        };
        map.set(k, cur);
      }
      return cur;
    };

    // ── Windowed (selected date range) ───────────────────────────────────
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
    }

    // Conversions — counted ONLY from Doctors on Board, attributed to channel
    // via Lead_Source, bucketed by Created_Time for the date window.
    const doctorsOnBoard = (zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined)?.rawDoctorsOnBoard ?? [];
    for (const dob of doctorsOnBoard) {
      const t = dob.Created_Time ? new Date(dob.Created_Time).getTime() : NaN;
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      ensure(normalizeChannelKey(dob.Lead_Source)).converted++;
    }

    // ── Lifetime (all-time, ignores date filter) ────────────────────────
    // Used for the "Cost / Conv. (lifetime)" column — surfaces channels
    // that are losing money over their full history, not just this window.
    for (const r of allRowsUnfiltered ?? []) {
      ensure(normalizeChannelKey(r.category)).lifetimeSpend += r.amount ?? 0;
    }
    for (const dob of doctorsOnBoard) {
      ensure(normalizeChannelKey(dob.Lead_Source)).lifetimeConverted++;
    }

    const rows = Array.from(map.values());
    for (const r of rows) {
      r.costPerLead       = r.leads     > 0 ? r.spend / r.leads     : 0;
      r.costPerQualified  = r.qualified > 0 ? r.spend / r.qualified : 0;
      r.costPerConversion = r.converted > 0 ? r.spend / r.converted : 0;
      r.qualifiedRate     = r.leads     > 0 ? (r.qualified / r.leads)   * 100 : 0;
      r.conversionRate    = r.leads     > 0 ? (r.converted / r.leads)   * 100 : 0;
      r.lifetimeCostPerConversion = r.lifetimeConverted > 0 && r.lifetimeSpend > 0
        ? r.lifetimeSpend / r.lifetimeConverted
        : 0;
    }

    return rows
      .filter(r => r.leads > 0 || r.spend > 0 || r.lifetimeSpend > 0)
      // Default sort: cheapest qualified first (channels with no qualified
      // leads sink to the bottom). This is the headline metric, so the most
      // efficient channels surface immediately.
      .sort((a, b) => {
        const aCpq = a.costPerQualified > 0 ? a.costPerQualified : Infinity;
        const bCpq = b.costPerQualified > 0 ? b.costPerQualified : Infinity;
        if (aCpq !== bCpq) return aCpq - bCpq;
        return b.leads - a.leads;
      });
  }, [byCategory, allRowsUnfiltered, zoho?.rawLeads, dateRange]);
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

    // Best lifetime cost per conversion — uses ALL-TIME spend and conversions
    // for each channel, ignoring the date filter. Surfaces channels that pay
    // back over their full history vs. ones that look fine in a recent window.
    const lifetimeCandidates = rows.filter(r => r.lifetimeSpend > 0 && r.lifetimeConverted > 0);
    const bestLifetimeCPC = lifetimeCandidates.length
      ? [...lifetimeCandidates].sort((a, b) => a.lifetimeCostPerConversion - b.lifetimeCostPerConversion)[0]
      : null;

    return { mostLeads, lowestCPL, lowestCPQ, lowestCPC, bestConversion, bestLifetimeCPC };
  }, [rows]);
}

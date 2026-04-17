/**
 * useMetaAdsApi — fetches real ad performance data from the Facebook Marketing API.
 *
 * Calls:
 *   1. GET /me/adaccounts          → get all ad accounts on the token
 *   2. GET /{account}/insights     → spend, impressions, clicks, reach, ctr, cpm, cpp
 *   3. GET /{account}/campaigns    → list of campaigns with their insights
 *
 * All requests go directly from the browser to graph.facebook.com.
 * The token is read from VITE_META_ACCESS_TOKEN in .env.
 */

import { useQuery } from "@tanstack/react-query";

const TOKEN  = import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined;
const GRAPH  = "https://graph.facebook.com/v19.0";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MetaAccountSummary {
  spend:       number;   // AED (or account currency)
  impressions: number;
  clicks:      number;
  reach:       number;
  ctr:         number;   // %
  cpm:         number;   // cost per 1k impressions
  cpp:         number;   // cost per purchase (if available)
  currency:    string;
}

export interface MetaCampaignRow {
  id:          string;
  name:        string;
  status:      string;
  spend:       number;
  impressions: number;
  clicks:      number;
  reach:       number;
  ctr:         number;
}

export interface MetaAdsApiData {
  accounts:  { id: string; name: string }[];
  summary:   MetaAccountSummary;
  campaigns: MetaCampaignRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const x = parseFloat(String(v ?? 0));
  return isNaN(x) ? 0 : x;
}

async function gql(path: string, params: Record<string, string>): Promise<unknown> {
  if (!TOKEN) throw new Error("VITE_META_ACCESS_TOKEN is not set");
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries({ ...params, access_token: TOKEN }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json() as { error?: { message: string }; [k: string]: unknown };
  if (json.error) throw new Error(json.error.message);
  return json;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useMetaAdsApi(dateRange: { from: Date; to: Date }) {
  const since = dateRange.from.toISOString().slice(0, 10);
  const until = dateRange.to.toISOString().slice(0, 10);

  return useQuery<MetaAdsApiData>({
    queryKey: ["meta-ads-api", since, until],
    enabled:  !!TOKEN,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      // 1. Get ad accounts
      const accountsResp = await gql("me/adaccounts", {
        fields: "id,name,account_status,currency",
        limit:  "50",
      }) as { data: { id: string; name: string; account_status: number; currency: string }[] };

      const activeAccounts = (accountsResp.data ?? []).filter(a => a.account_status === 1);
      if (activeAccounts.length === 0) {
        return {
          accounts:  (accountsResp.data ?? []).map(a => ({ id: a.id, name: a.name })),
          summary:   { spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpm: 0, cpp: 0, currency: "AED" },
          campaigns: [],
        };
      }

      const currency = activeAccounts[0]?.currency ?? "AED";

      // 2. Aggregate account-level insights across all active accounts
      const INSIGHT_FIELDS = "spend,impressions,clicks,reach,ctr,cpm,cpp";
      const TIME_RANGE = JSON.stringify({ since, until });

      const summaryParts = await Promise.all(
        activeAccounts.map(acc =>
          gql(`${acc.id}/insights`, {
            fields:     INSIGHT_FIELDS,
            time_range: TIME_RANGE,
            level:      "account",
          }).catch(() => ({ data: [] }))
        )
      ) as { data: Record<string, string>[] }[];

      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0;
      for (const part of summaryParts) {
        for (const row of part.data ?? []) {
          totalSpend       += n(row.spend);
          totalImpressions += n(row.impressions);
          totalClicks      += n(row.clicks);
          totalReach       += n(row.reach);
        }
      }
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

      // 3. Campaign insights across all active accounts
      const campaignParts = await Promise.all(
        activeAccounts.map(acc =>
          gql(`${acc.id}/campaigns`, {
            fields:     `name,status,insights.time_range(${TIME_RANGE}){${INSIGHT_FIELDS}}`,
            limit:      "100",
          }).catch(() => ({ data: [] }))
        )
      ) as { data: { id: string; name: string; status: string; insights?: { data: Record<string, string>[] } }[] }[];

      const campaigns: MetaCampaignRow[] = [];
      for (const part of campaignParts) {
        for (const c of part.data ?? []) {
          const ins = c.insights?.data?.[0] ?? {};
          campaigns.push({
            id:          c.id,
            name:        c.name,
            status:      c.status,
            spend:       n(ins.spend),
            impressions: n(ins.impressions),
            clicks:      n(ins.clicks),
            reach:       n(ins.reach),
            ctr:         n(ins.ctr),
          });
        }
      }
      campaigns.sort((a, b) => b.spend - a.spend);

      return {
        accounts:  activeAccounts.map(a => ({ id: a.id, name: a.name })),
        summary:   {
          spend:       totalSpend,
          impressions: totalImpressions,
          clicks:      totalClicks,
          reach:       totalReach,
          ctr:         +ctr.toFixed(2),
          cpm:         +cpm.toFixed(2),
          cpp:         0,
          currency,
        },
        campaigns,
      };
    },
  });
}

/**
 * useMetaAdsApi — full Meta Marketing API integration.
 *
 * All calls go browser → graph.facebook.com/v19.0 using VITE_META_ACCESS_TOKEN.
 *
 * Data fetched per call:
 *   1. /me/adaccounts                       — accounts, currency, spend totals
 *   2. /{account}/insights                  — summary KPIs + actions (leads etc.)
 *   3. /{account}/campaigns                 — list with objective, budget, insights
 *   4. /{account}/insights (time_increment=1) — daily spend/clicks/impressions
 *   5. /{account}/insights (breakdown=age,gender)
 *   6. /{account}/insights (breakdown=publisher_platform)
 *   7. /{account}/insights (breakdown=publisher_platform,platform_position)
 *
 * All breakdown calls run in parallel after account fetch.
 */

import { useQuery } from "@tanstack/react-query";

const GRAPH = "https://graph.facebook.com/v22.0";
export const META_TOKEN_LS_KEY = "meta_access_token";

// Fallback token — baked into the build so all users get live data without config.
// Update this when the token expires (every ~60 days for user tokens).
const DEFAULT_TOKEN = "EAAcQ2n9N75oBRGIjTf40yqBQZAXIuSDtAU3YhgZBwiBGHGSNsGHclgM3pkZCv9kLMsZA8SZA4AHEZCuEZCed6Dp69mGlrkZAMfzUe068YD1tL0c4pLtZADPjCvuzoZCt2B8xX4XI8rmWDr3yjI9xnU4PkiDrUa8bAZC56ydqYAqsoUvabEUqCucMvEi4IESyGjpyiMSOCpTOWU33nhI";

/** Priority: localStorage (admin override) → .env → hardcoded fallback */
export function getMetaToken(): string {
  return (
    localStorage.getItem(META_TOKEN_LS_KEY) ||
    (import.meta.env.VITE_META_ACCESS_TOKEN as string | undefined) ||
    DEFAULT_TOKEN
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MetaAccount {
  id:           string;
  name:         string;
  currency:     string;
  amountSpent:  number;   // lifetime spend on account
}

export interface MetaSummary {
  spend:        number;
  impressions:  number;
  clicks:       number;
  reach:        number;
  ctr:          number;   // %
  cpm:          number;   // cost per 1k impressions
  frequency:    number;   // impressions / reach
  leads:        number;   // lead form submissions (action)
  costPerLead:  number;
  currency:     string;
}

export interface MetaCampaignRow {
  id:          string;
  name:        string;
  status:      string;
  objective:   string;
  dailyBudget: number;
  spend:       number;
  impressions: number;
  clicks:      number;
  reach:       number;
  ctr:         number;
  leads:       number;
  frequency:   number;
}

export interface MetaDailyPoint {
  date:        string;   // "MMM D" display label
  dateISO:     string;   // YYYY-MM-DD for sorting
  spend:       number;
  impressions: number;
  clicks:      number;
  reach:       number;
  ctr:         number;
}

export interface MetaAgeRow {
  age:     string;
  male:    number;   // impressions
  female:  number;
  unknown: number;
  maleSpend:   number;
  femaleSpend: number;
}

export interface MetaPlatformRow {
  platform:    string;
  spend:       number;
  impressions: number;
  clicks:      number;
  reach:       number;
  ctr:         number;
}

export interface MetaPlacementRow {
  placement:   string;
  spend:       number;
  impressions: number;
  clicks:      number;
}

export interface MetaActionRow {
  type:         string;   // e.g. "lead", "purchase", "video_view"
  label:        string;   // human-readable
  value:        number;
  costPerAction: number;
}

export interface MetaAdCreative {
  thumbnail_url?: string;
  image_url?:     string;
  title?:         string;
  body?:          string;
  call_to_action_type?: string;
  effective_object_story_id?: string;  // "page_id_post_id" — lets us build a public post URL
  video_id?:      string;
}

export interface MetaAdRow {
  id:               string;
  name:             string;
  status:           string;
  creative:         MetaAdCreative;
  spend:            number;
  impressions:      number;
  clicks:           number;
  ctr:              number;
  leads:            number;
  qualityRanking?:  string;
  engagementRanking?: string;
}

export interface MetaAdsetRow {
  id:              string;
  name:            string;
  status:          string;
  dailyBudget:     number;
  targeting: {
    ageMin?:       number;
    ageMax?:       number;
    genders?:      string[];
    locations?:    string[];
    interests?:    string[];
  };
  spend:       number;
  impressions: number;
  clicks:      number;
  reach:       number;
}

export interface MetaAdsApiData {
  accounts:   MetaAccount[];
  summary:    MetaSummary;
  campaigns:  MetaCampaignRow[];
  dailySeries: MetaDailyPoint[];
  byAge:      MetaAgeRow[];
  byPlatform: MetaPlatformRow[];
  byPlacement: MetaPlacementRow[];
  actions:    MetaActionRow[];
}

export interface MetaTopAd {
  id:          string;
  name:        string;
  status:      string;
  thumbnail:   string | undefined;
  title:       string | undefined;
  body:        string | undefined;
  cta:         string | undefined;
  postUrl:     string | undefined;
  isVideo:     boolean;
  leads:       number;
  spend:       number;
  impressions: number;
  clicks:      number;
  ctr:         number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const x = parseFloat(String(v ?? "0"));
  return isNaN(x) ? 0 : x;
}

function actionVal(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  return n(actions?.find(a => a.action_type === type)?.value ?? "0");
}

// Sums all lead-related actions.
// Meta uses many different action_type strings depending on ad type and pixel setup.
// We use a broad match: known exact types + any type containing "lead".
function sumLeads(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions) return 0;

  // Only count actual lead form submissions — not messaging, contact, or registration events
  // which inflate the lead count and deflate CPL incorrectly.
  const LEAD_EXACT = new Set([
    "lead",
    "leadgen_grouped",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
    "omni_lead",
  ]);

  // Phase 1: exact known types
  const exact = actions
    .filter(a => LEAD_EXACT.has(a.action_type))
    .reduce((s, a) => s + n(a.value), 0);
  if (exact > 0) return exact;

  // Phase 2: any action_type that contains "lead" (catches custom conversions)
  return actions
    .filter(a => a.action_type.toLowerCase().includes("lead"))
    .reduce((s, a) => s + n(a.value), 0);
}

function costPerAction(
  cpa: { action_type: string; value: string }[] | undefined,
  type: string
): number {
  return n(cpa?.find(a => a.action_type === type)?.value ?? "0");
}

const ACTION_LABELS: Record<string, string> = {
  lead:                                  "Leads (form)",
  leadgen_grouped:                       "Leads (lead gen form)",
  "onsite_conversion.lead_grouped":      "Leads (on-site form)",
  "offsite_conversion.fb_pixel_lead":    "Leads (pixel)",
  omni_lead:                             "Leads (omni)",
  contact:                               "Contact",
  schedule:                              "Appointment Scheduled",
  submit_application:                    "Applications",
  complete_registration:                 "Registrations",
  omni_complete_registration:            "Registrations (omni)",
  landing_page_view:                     "Landing Page Views",
  link_click:                            "Link Clicks",
  purchase:                              "Purchases",
  add_to_cart:                           "Add to Cart",
  initiate_checkout:                     "Initiate Checkout",
  video_view:                            "Video Views",
  "video_p50_watched_actions":           "Video 50% Watched",
  "video_p75_watched_actions":           "Video 75% Watched",
  "video_p100_watched_actions":          "Video Completed",
  post_engagement:                       "Post Engagements",
  page_engagement:                       "Page Engagements",
  comment:                               "Comments",
  like:                                  "Page Likes",
  share:                                 "Shares",
  omni_view_content:                     "Content Views",
  "onsite_conversion.messaging_conversation_started_7d": "Messaging Conversations",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook:          "Facebook",
  instagram:         "Instagram",
  messenger:         "Messenger",
  audience_network:  "Audience Network",
  whatsapp:          "WhatsApp",
};

function fmtDateLabel(iso: string) {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
}

async function gql(path: string, params: Record<string, string>): Promise<unknown> {
  const token = getMetaToken();
  if (!token) throw new Error("Meta access token is not set");
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json() as { error?: { message: string }; [k: string]: unknown };
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

// ── Main hook ──────────────────────────────────────────────────────────────────

// Meta's /insights endpoint caps queryable history at ~37 months. If the user
// picks "All Time" globally (which goes back to year 2000), the API silently
// returns nothing — making every Meta KPI read as zero. Clamp to the past
// ~36 months so the call still succeeds.
const META_MAX_HISTORY_DAYS = 36 * 30; // ≈ 36 months

// Format YYYY-MM-DD in LOCAL time. toISOString() shifts to UTC, which rolls
// back a day for east-of-UTC users — making "Jan 1" become "Dec 31" before
// the Meta API sees it.
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useMetaAdsApi(dateRange: { from: Date; to: Date }) {
  const earliest = new Date(Date.now() - META_MAX_HISTORY_DAYS * 86_400_000);
  const fromClamped = dateRange.from < earliest ? earliest : dateRange.from;
  const since = ymdLocal(fromClamped);
  const until = ymdLocal(dateRange.to);

  return useQuery<MetaAdsApiData>({
    queryKey:            ["meta-ads-api-v3", since, until],
    enabled:             !!getMetaToken(),
    staleTime:           5 * 60 * 1000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      // ── 1. Ad accounts ───────────────────────────────────────────────────────
      const accountsResp = await gql("me/adaccounts", {
        fields: "id,name,account_status,currency,amount_spent",
        limit:  "50",
      }) as { data: { id: string; name: string; account_status: number; currency: string; amount_spent: string }[] };

      const allAccounts = accountsResp.data ?? [];
      const currency    = "AED";

      // Meta's amount_spent is in the SMALLEST currency unit (cents for USD,
      // fils for AED). Convert to major units to match how /insights reports
      // spend, otherwise the lifetime chip reads 100× higher than reality.
      const accountsMapped: MetaAccount[] = allAccounts.map(a => ({
        id:          a.id,
        name:        a.name,
        currency:    a.currency,
        amountSpent: n(a.amount_spent) / 100,
      }));

      if (allAccounts.length === 0) {
        return {
          accounts: accountsMapped, summary: { spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpm: 0, frequency: 0, leads: 0, costPerLead: 0, currency },
          campaigns: [], dailySeries: [], byAge: [], byPlatform: [], byPlacement: [], actions: [],
        };
      }

      const TIME_RANGE      = JSON.stringify({ since, until });
      const primaryId       = allAccounts[0].id;
      const INSIGHT_FIELDS  = "spend,impressions,clicks,reach,ctr,cpm,frequency,actions,cost_per_action_type";
      const CAMP_INS_FIELDS = "spend,impressions,clicks,reach,ctr,frequency,actions";

      // ── 2–7. All data fetched in parallel ────────────────────────────────────
      const [
        summaryParts,
        campaignParts,
        dailyResp,
        ageResp,
        platformResp,
        placementResp,
      ] = await Promise.all([

        // 2. Summary insights (all accounts)
        Promise.all(allAccounts.map(acc =>
          gql(`${acc.id}/insights`, {
            fields: INSIGHT_FIELDS, time_range: TIME_RANGE, level: "account",
          }).catch(() => ({ data: [] }))
        )),

        // 3. Campaigns (all accounts)
        Promise.all(allAccounts.map(acc =>
          gql(`${acc.id}/campaigns`, {
            fields: `name,status,objective,daily_budget,insights.time_range(${TIME_RANGE}){${CAMP_INS_FIELDS}}`,
            limit: "200",
          }).catch(() => ({ data: [] }))
        )),

        // 4. Daily time series (primary account)
        gql(`${primaryId}/insights`, {
          fields:         "spend,impressions,clicks,reach,ctr",
          time_range:     TIME_RANGE,
          time_increment: "1",
          level:          "account",
          limit:          "400",
        }).catch(() => ({ data: [] })),

        // 5. Age / gender breakdown (primary account)
        gql(`${primaryId}/insights`, {
          fields:    "spend,impressions,clicks,reach",
          breakdowns: "age,gender",
          time_range: TIME_RANGE,
          level:      "account",
          limit:      "500",
        }).catch(() => ({ data: [] })),

        // 6. Platform breakdown (primary account)
        gql(`${primaryId}/insights`, {
          fields:     "spend,impressions,clicks,reach,ctr",
          breakdowns: "publisher_platform",
          time_range: TIME_RANGE,
          level:      "account",
          limit:      "50",
        }).catch(() => ({ data: [] })),

        // 7. Placement breakdown (primary account)
        gql(`${primaryId}/insights`, {
          fields:     "spend,impressions,clicks",
          breakdowns: "publisher_platform,platform_position",
          time_range: TIME_RANGE,
          level:      "account",
          limit:      "200",
        }).catch(() => ({ data: [] })),
      ]) as [
        { data: (Record<string, unknown> & { actions?: {action_type:string;value:string}[]; cost_per_action_type?: {action_type:string;value:string}[] })[] }[],
        { data: { id: string; name: string; status: string; objective?: string; daily_budget?: string; insights?: { data: (Record<string,string> & { actions?: {action_type:string;value:string}[] })[] } }[] }[],
        { data: Record<string,string>[] },
        { data: (Record<string,string>)[] },
        { data: (Record<string,string>)[] },
        { data: (Record<string,string>)[] },
      ];

      // ── Aggregate summary ────────────────────────────────────────────────────
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0;
      let totalLeads = 0;
      const allActions: Map<string, number> = new Map();
      const allCpa:     Map<string, number> = new Map();

      for (const part of summaryParts) {
        for (const row of part.data ?? []) {
          totalSpend       += n(row.spend);
          totalImpressions += n(row.impressions);
          totalClicks      += n(row.clicks);
          totalReach       += n(row.reach);
          totalLeads       += sumLeads(row.actions);

          for (const act of row.actions ?? []) {
            allActions.set(act.action_type, (allActions.get(act.action_type) ?? 0) + n(act.value));
          }
          for (const cpa of row.cost_per_action_type ?? []) {
            if (!allCpa.has(cpa.action_type)) allCpa.set(cpa.action_type, n(cpa.value));
          }
        }
      }

      // Debug: log all action types returned by Meta so we can verify lead action coverage
      console.log('[MetaAds] action types from API:', Object.fromEntries(allActions));
      console.log('[MetaAds] totalLeads counted:', totalLeads);

      const ctr       = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpm       = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000  : 0;
      const frequency = totalReach > 0 ? totalImpressions / totalReach : 0;
      const cpl       = totalLeads > 0 ? totalSpend / totalLeads : 0;

      // ── Actions list (sorted by value, hide tiny/internal ones) ─────────────
      const HIDDEN_ACTION_PREFIXES = ["offsite_conversion.custom.", "pixel_", "app_custom_event"];
      const actions: MetaActionRow[] = Array.from(allActions.entries())
        .filter(([type]) => !HIDDEN_ACTION_PREFIXES.some(p => type.startsWith(p)))
        .map(([type, value]) => ({
          type,
          label:         ACTION_LABELS[type] ?? type.replace(/_/g, " "),
          value:         Math.round(value),
          costPerAction: +(allCpa.get(type) ?? 0).toFixed(2),
        }))
        .sort((a, b) => b.value - a.value);

      // ── Campaigns ────────────────────────────────────────────────────────────
      const campaigns: MetaCampaignRow[] = [];
      for (const part of campaignParts) {
        for (const c of part.data ?? []) {
          const ins = c.insights?.data?.[0] ?? {};
          campaigns.push({
            id:          c.id,
            name:        c.name,
            status:      c.status,
            objective:   (c.objective ?? "").replace(/_/g, " "),
            dailyBudget: n(c.daily_budget) / 100, // Meta returns in cents
            spend:       n(ins.spend),
            impressions: n(ins.impressions),
            clicks:      n(ins.clicks),
            reach:       n(ins.reach),
            ctr:         n(ins.ctr),
            leads:       sumLeads(ins.actions),
            frequency:   n(ins.reach) > 0 ? +(n(ins.impressions) / n(ins.reach)).toFixed(2) : 0,
          });
        }
      }
      campaigns.sort((a, b) => b.spend - a.spend);

      // ── Daily series ─────────────────────────────────────────────────────────
      const dailySeries: MetaDailyPoint[] = (dailyResp.data ?? [])
        .map(row => ({
          date:        fmtDateLabel(row.date_start),
          dateISO:     row.date_start,
          spend:       n(row.spend),
          impressions: n(row.impressions),
          clicks:      n(row.clicks),
          reach:       n(row.reach),
          ctr:         n(row.ctr),
        }))
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

      // ── Age / gender pivot ────────────────────────────────────────────────────
      const ageMap: Map<string, MetaAgeRow> = new Map();
      const AGE_ORDER = ["13-17","18-24","25-34","35-44","45-54","55-64","65+"];
      for (const row of ageResp.data ?? []) {
        const age    = row.age ?? "Unknown";
        const gender = (row.gender ?? "unknown").toLowerCase();
        if (!ageMap.has(age)) ageMap.set(age, { age, male: 0, female: 0, unknown: 0, maleSpend: 0, femaleSpend: 0 });
        const entry = ageMap.get(age)!;
        const impr = n(row.impressions);
        const spnd = n(row.spend);
        if (gender === "male")   { entry.male   += impr; entry.maleSpend   += spnd; }
        else if (gender === "female") { entry.female += impr; entry.femaleSpend += spnd; }
        else { entry.unknown += impr; }
      }
      const byAge = AGE_ORDER
        .map(a => ageMap.get(a))
        .filter(Boolean)
        .concat(Array.from(ageMap.values()).filter(r => !AGE_ORDER.includes(r.age))) as MetaAgeRow[];

      // ── Platform ──────────────────────────────────────────────────────────────
      const byPlatform: MetaPlatformRow[] = (platformResp.data ?? []).map(row => ({
        platform:    PLATFORM_LABELS[row.publisher_platform] ?? row.publisher_platform,
        spend:       n(row.spend),
        impressions: n(row.impressions),
        clicks:      n(row.clicks),
        reach:       n(row.reach),
        ctr:         n(row.ctr),
      })).sort((a, b) => b.impressions - a.impressions);

      // ── Placement ─────────────────────────────────────────────────────────────
      const PLACEMENT_LABELS: Record<string, string> = {
        feed: "Feed", story: "Stories", reels: "Reels",
        video_feeds: "Video Feeds", search: "Search",
        instagram_explore: "IG Explore", instagram_profile_feed: "IG Profile",
        messenger_inbox: "Messenger Inbox",
        audience_network_interstitial: "Audience Network",
        right_hand_column: "Right Column",
        instant_article: "Instant Articles",
      };
      const byPlacement: MetaPlacementRow[] = (placementResp.data ?? []).map(row => ({
        placement:   `${PLATFORM_LABELS[row.publisher_platform] ?? row.publisher_platform} · ${PLACEMENT_LABELS[row.platform_position] ?? row.platform_position}`,
        spend:       n(row.spend),
        impressions: n(row.impressions),
        clicks:      n(row.clicks),
      })).sort((a, b) => b.impressions - a.impressions).slice(0, 12);

      return {
        accounts: accountsMapped,
        summary:  {
          spend: +totalSpend.toFixed(2),
          impressions: totalImpressions,
          clicks: totalClicks,
          reach: totalReach,
          ctr:       +ctr.toFixed(2),
          cpm:       +cpm.toFixed(2),
          frequency: +frequency.toFixed(2),
          leads:     Math.round(totalLeads),
          costPerLead: +cpl.toFixed(2),
          currency,
        },
        campaigns,
        dailySeries,
        byAge,
        byPlatform,
        byPlacement,
        actions,
      };
    },
  });
}

// ── useMetaCampaignAds — ads + creatives + adsets for a single campaign ─────────

export function useMetaCampaignAds(campaignId: string | null, since: string, until: string) {
  return useQuery<{ ads: MetaAdRow[]; adsets: MetaAdsetRow[] }>({
    queryKey: ["meta-campaign-ads-v2", campaignId, since, until],
    enabled:  !!getMetaToken() && !!campaignId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      if (!campaignId) return { ads: [], adsets: [] };
      const TIME_RANGE = JSON.stringify({ since, until });

      const [adsResp, adsetsResp] = await Promise.all([
        // Ads with creatives + insights + quality rankings
        // creative.effective_object_story_id gives us the real FB post so we can build a preview URL
        gql(`${campaignId}/ads`, {
          fields: [
            "id", "name", "status",
            "creative{id,thumbnail_url,image_url,title,body,call_to_action_type,object_story_spec{link_data{image_hash,link,description,caption,message,call_to_action{type}},video_data{image_url,video_id,title,message,call_to_action{type}}},effective_object_story_id}",
            `insights.time_range(${TIME_RANGE}){spend,impressions,clicks,ctr,actions,quality_ranking,engagement_rate_ranking}`,
          ].join(","),
          limit: "100",
        }).catch(() => ({ data: [] })),

        // Adsets with targeting info + insights
        gql(`${campaignId}/adsets`, {
          fields: `id,name,status,daily_budget,targeting,insights.time_range(${TIME_RANGE}){spend,impressions,clicks,reach}`,
          limit: "50",
        }).catch(() => ({ data: [] })),
      ]) as [
        { data: {
          id: string; name: string; status: string;
          creative?: MetaAdCreative;
          insights?: { data: (Record<string,string> & { actions?: {action_type:string;value:string}[]; quality_ranking?: string; engagement_rate_ranking?: string })[] };
        }[] },
        { data: {
          id: string; name: string; status: string; daily_budget?: string;
          targeting?: {
            age_min?: number; age_max?: number;
            genders?: number[];
            geo_locations?: { countries?: string[]; cities?: { name: string }[] };
            flexible_spec?: { interests?: { name: string }[] }[];
          };
          insights?: { data: Record<string,string>[] };
        }[] },
      ];

      const ads: MetaAdRow[] = (adsResp.data ?? []).map((ad: {
        id: string; name: string; status: string;
        creative?: {
          thumbnail_url?: string; image_url?: string; title?: string; body?: string;
          call_to_action_type?: string; effective_object_story_id?: string;
          object_story_spec?: {
            link_data?: { image_hash?: string; link?: string; description?: string; message?: string; caption?: string; call_to_action?: { type?: string } };
            video_data?: { image_url?: string; video_id?: string; title?: string; message?: string; call_to_action?: { type?: string } };
          };
          asset_feed_spec?: { titles?: { text: string }[]; bodies?: { text: string }[] };
        };
        insights?: { data: (Record<string,string> & { actions?: {action_type:string;value:string}[]; quality_ranking?: string; engagement_rate_ranking?: string })[] };
      }) => {
        const ins = ad.insights?.data?.[0] ?? {};
        const cr  = ad.creative ?? {};
        const oss = cr.object_story_spec;

        // Resolve thumbnail: direct > video_data image > link_data fallback
        const thumb = cr.thumbnail_url
          || cr.image_url
          || oss?.video_data?.image_url
          || undefined;

        // Resolve title/body from multiple sources
        const title = cr.title
          || oss?.link_data?.caption
          || oss?.link_data?.description
          || oss?.video_data?.title
          || cr.asset_feed_spec?.titles?.[0]?.text
          || undefined;

        const body = (cr as { body?: string }).body
          || oss?.link_data?.message
          || oss?.video_data?.message
          || cr.asset_feed_spec?.bodies?.[0]?.text
          || undefined;

        const cta = cr.call_to_action_type
          || oss?.link_data?.call_to_action?.type
          || oss?.video_data?.call_to_action?.type
          || undefined;

        const videoId = oss?.video_data?.video_id;

        return {
          id:               ad.id,
          name:             ad.name,
          status:           ad.status,
          creative: {
            thumbnail_url: thumb,
            image_url:     cr.image_url,
            title,
            body,
            call_to_action_type: cta,
            effective_object_story_id: cr.effective_object_story_id,
            video_id: videoId,
          },
          spend:            n(ins.spend),
          impressions:      n(ins.impressions),
          clicks:           n(ins.clicks),
          ctr:              n(ins.ctr),
          leads:            sumLeads(ins.actions),
          qualityRanking:   ins.quality_ranking,
          engagementRanking: ins.engagement_rate_ranking,
        };
      }).sort((a, b) => b.spend - a.spend);

      const GENDER_MAP: Record<number, string> = { 1: "Male", 2: "Female" };
      const adsets: MetaAdsetRow[] = (adsetsResp.data ?? []).map(s => {
        const t = s.targeting ?? {};
        const ins = s.insights?.data?.[0] ?? {};
        return {
          id:          s.id,
          name:        s.name,
          status:      s.status,
          dailyBudget: n(s.daily_budget) / 100,
          targeting: {
            ageMin:    t.age_min,
            ageMax:    t.age_max,
            genders:   (t.genders ?? []).map((g: number) => GENDER_MAP[g] ?? "All"),
            locations: [
              ...(t.geo_locations?.countries ?? []),
              ...(t.geo_locations?.cities?.map((c: { name: string }) => c.name) ?? []),
            ],
            interests: t.flexible_spec?.flatMap((s: { interests?: { name: string }[] }) => (s.interests ?? []).map((i: { name: string }) => i.name)) ?? [],
          },
          spend:       n(ins.spend),
          impressions: n(ins.impressions),
          clicks:      n(ins.clicks),
          reach:       n(ins.reach),
        };
      });

      return { ads, adsets };
    },
  });
}

// ── useMetaAdsByName — search ads by name across an account ──────────────────
// Used when clicking a creative name in the "Top Ad Creatives" list.
// Does NOT pass a date range — searches all-time so the ad is always found
// regardless of when it ran.  Stats (leads) come from Supabase instead.

const CREATIVE_FIELDS =
  "id,name,status," +
  "creative{id,thumbnail_url,image_url,title,body,call_to_action_type," +
    "object_story_spec{" +
      "link_data{description,caption,message,call_to_action{type}}," +
      "video_data{image_url,video_id,title,message,call_to_action{type}}" +
    "}," +
    "effective_object_story_id}";

function mapAdCreative(ad: {
  id: string; name: string; status: string;
  creative?: {
    thumbnail_url?: string; image_url?: string; title?: string; body?: string;
    call_to_action_type?: string; effective_object_story_id?: string;
    object_story_spec?: {
      link_data?: { description?: string; message?: string; caption?: string; call_to_action?: { type?: string } };
      video_data?: { image_url?: string; video_id?: string; title?: string; message?: string; call_to_action?: { type?: string } };
    };
    asset_feed_spec?: { titles?: { text: string }[]; bodies?: { text: string }[] };
  };
}): MetaAdRow {
  const cr  = ad.creative ?? {};
  const oss = cr.object_story_spec;
  const thumb = cr.thumbnail_url || cr.image_url || oss?.video_data?.image_url;
  const title = (cr as { title?: string }).title || oss?.link_data?.caption || oss?.link_data?.description || oss?.video_data?.title || cr.asset_feed_spec?.titles?.[0]?.text;
  const body  = (cr as { body?: string }).body || oss?.link_data?.message || oss?.video_data?.message || cr.asset_feed_spec?.bodies?.[0]?.text;
  const cta   = (cr as { call_to_action_type?: string }).call_to_action_type || oss?.link_data?.call_to_action?.type || oss?.video_data?.call_to_action?.type;
  return {
    id: ad.id, name: ad.name, status: ad.status,
    creative: {
      thumbnail_url: thumb, image_url: (cr as { image_url?: string }).image_url,
      title, body, call_to_action_type: cta,
      effective_object_story_id: (cr as { effective_object_story_id?: string }).effective_object_story_id,
      video_id: oss?.video_data?.video_id,
    },
    spend: 0, impressions: 0, clicks: 0, ctr: 0, leads: 0,
  };
}

// Meta only returns ACTIVE/PAUSED by default — must explicitly request all statuses
// or archived/deleted ads (e.g. old ads that generated lots of leads) won't appear.
const ALL_STATUSES = JSON.stringify([
  "ACTIVE", "PAUSED", "ARCHIVED", "DELETED",
]);

// Search across ALL ad accounts — ads may live in any of them.
export function useMetaAdsByName(adName: string | null, accountIds: string[]) {
  const key = accountIds.join(",");
  return useQuery<MetaAdRow[]>({
    queryKey: ["meta-ads-by-name-v4", adName, key],
    enabled:  !!adName && accountIds.length > 0 && !!getMetaToken(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      if (!adName || accountIds.length === 0) return [];
      const term = adName.toLowerCase();

      // For each account: try API-side filter first, then client-side fallback.
      // All accounts searched in parallel.
      const perAccount = await Promise.all(accountIds.map(async (accountId) => {
        // Strategy 1: API-side CONTAIN filter (fast)
        const filtered = await gql(`${accountId}/ads`, {
          fields: CREATIVE_FIELDS,
          filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value: adName }]),
          effective_status: ALL_STATUSES,
          limit: "20",
        }).catch(() => ({ data: [] })) as { data: unknown[] };

        if ((filtered.data ?? []).length > 0) {
          return filtered.data as Parameters<typeof mapAdCreative>[0][];
        }

        // Strategy 2: client-side filter — handles special chars like |
        const all = await gql(`${accountId}/ads`, {
          fields: CREATIVE_FIELDS,
          effective_status: ALL_STATUSES,
          limit: "500",
        }).catch(() => ({ data: [] })) as { data: unknown[] };

        return (all.data ?? []).filter(
          (a) => typeof (a as { name?: string }).name === "string" &&
                 (a as { name: string }).name.toLowerCase().includes(term)
        ) as Parameters<typeof mapAdCreative>[0][];
      }));

      // Flatten results from all accounts, dedupe by id
      const seen = new Set<string>();
      return perAccount.flat().filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      }).map(mapAdCreative);
    },
  });
}

// ── useMetaTopAds — fetch all ads across all accounts with insights ─────────
// Returns ads sorted by leads. Each ad already carries its thumbnail so the
// preview is instant — no secondary search needed.

const TOP_AD_FIELDS =
  "id,name,status," +
  "creative{thumbnail_url,image_url,title,body,call_to_action_type," +
    "object_story_spec{" +
      "link_data{description,caption,message,call_to_action{type}}," +
      "video_data{image_url,video_id,title,message,call_to_action{type}}" +
    "}," +
    "effective_object_story_id}";

export function useMetaTopAds(accountIds: string[], since: string, until: string) {
  const key = accountIds.join(",");
  return useQuery<MetaTopAd[]>({
    queryKey: ["meta-top-ads-v2", key, since, until],
    enabled:  accountIds.length > 0 && !!getMetaToken(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      if (accountIds.length === 0) return [];

      // Meta's /ads endpoint is strict on Development-access apps:
      //   - `effective_status` cannot include ARCHIVED or DELETED
      //   - `insights.time_range` with `actions` field is capped tightly
      //   - `limit` above ~50 sometimes 400s
      // Cap window at 90 days, drop archived/deleted, lower the limit.
      const MAX_DAYS = 90;
      const untilD = new Date(`${until}T00:00:00Z`);
      const sinceD = new Date(`${since}T00:00:00Z`);
      const earliest = new Date(untilD.getTime() - MAX_DAYS * 86_400_000);
      const sinceClamped = sinceD < earliest ? ymdLocal(earliest) : since;
      const TIME_RANGE = JSON.stringify({ since: sinceClamped, until });
      const SAFE_STATUSES = JSON.stringify(["ACTIVE", "PAUSED"]);

      const perAccount = await Promise.all(accountIds.map(accountId =>
        gql(`${accountId}/ads`, {
          fields: `${TOP_AD_FIELDS},insights.time_range(${TIME_RANGE}){spend,impressions,clicks,ctr,actions}`,
          effective_status: SAFE_STATUSES,
          limit: "50",
        }).catch(() => ({ data: [] }))
      )) as { data: {
        id: string; name: string; status: string;
        creative?: {
          thumbnail_url?: string; image_url?: string; title?: string; body?: string;
          call_to_action_type?: string; effective_object_story_id?: string;
          object_story_spec?: {
            link_data?: { description?: string; caption?: string; message?: string; call_to_action?: { type?: string } };
            video_data?: { image_url?: string; video_id?: string; title?: string; message?: string; call_to_action?: { type?: string } };
          };
        };
        insights?: { data: (Record<string,string> & { actions?: {action_type:string;value:string}[] })[] };
      }[] }[];

      const seen = new Set<string>();
      const ads: MetaTopAd[] = [];

      for (const resp of perAccount) {
        for (const ad of resp.data ?? []) {
          if (seen.has(ad.id)) continue;
          seen.add(ad.id);

          const ins = ad.insights?.data?.[0] ?? {};
          const leads  = sumLeads(ins.actions);
          const spend  = n(ins.spend);
          // Only include ads that have some activity in the period
          if (leads === 0 && spend === 0 && n(ins.impressions) === 0) continue;

          const cr  = ad.creative ?? {};
          const oss = cr.object_story_spec;
          const thumb = cr.thumbnail_url || cr.image_url || oss?.video_data?.image_url;
          const title = (cr as { title?: string }).title || oss?.link_data?.caption || oss?.link_data?.description || oss?.video_data?.title;
          const body  = (cr as { body?: string }).body || oss?.link_data?.message || oss?.video_data?.message;
          const cta   = (cr as { call_to_action_type?: string }).call_to_action_type || oss?.link_data?.call_to_action?.type || oss?.video_data?.call_to_action?.type;
          const postId = (cr as { effective_object_story_id?: string }).effective_object_story_id;

          ads.push({
            id:          ad.id,
            name:        ad.name,
            status:      ad.status,
            thumbnail:   thumb,
            title,
            body,
            cta,
            postUrl:     postId ? `https://www.facebook.com/${postId}` : undefined,
            isVideo:     !!oss?.video_data?.video_id,
            leads,
            spend,
            impressions: n(ins.impressions),
            clicks:      n(ins.clicks),
            ctr:         n(ins.ctr),
          });
        }
      }

      // Return everything we already fetched (typically up to 50 per account
      // before dedup). The Per-Creative table caps display via a "Show more"
      // button so we don't slice here.
      return ads.sort((a, b) => b.leads - a.leads || b.spend - a.spend);
    },
  });
}

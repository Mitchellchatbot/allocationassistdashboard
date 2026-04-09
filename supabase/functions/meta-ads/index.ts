/**
 * Meta Ads Proxy — Supabase Edge Function
 *
 * Fetches campaign insights + ad creatives (thumbnail images) from
 * the Meta Graph API. Secrets needed in Supabase dashboard:
 *   META_ACCESS_TOKEN   — long-lived system user token
 *   META_AD_ACCOUNT_ID  — e.g. act_164775630831034
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TOKEN   = Deno.env.get('META_ACCESS_TOKEN')!;
const ACCOUNT = Deno.env.get('META_AD_ACCOUNT_ID') ?? 'act_164775630831034';
const API     = 'https://graph.facebook.com/v20.0';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${API}${path}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (!TOKEN) {
    return json({ error: 'META_ACCESS_TOKEN secret not set in Supabase' }, 500);
  }

  try {
    const url = new URL(req.url);
    const preset = url.searchParams.get('date_preset') ?? 'last_30d';

    // 1 — Campaign insights (no ROAS — use only safe fields)
    const insightsData = await graphGet(`/${ACCOUNT}/insights`, {
      fields:      'campaign_id,campaign_name,impressions,clicks,spend,actions',
      level:       'campaign',
      date_preset: preset,
      limit:       '50',
    });

    // Build lookup: campaignId → metrics
    type Insight = {
      campaign_id: string;
      campaign_name: string;
      impressions: string;
      clicks: string;
      spend: string;
      actions?: Array<{ action_type: string; value: string }>;
    };

    const insightMap: Record<string, Insight> = {};
    for (const row of (insightsData.data ?? []) as Insight[]) {
      insightMap[row.campaign_id] = row;
    }

    // 2 — Campaigns (for status + daily_budget)
    const campaignsData = await graphGet(`/${ACCOUNT}/campaigns`, {
      fields: 'id,name,status,daily_budget,start_time',
      limit:  '50',
    });

    type Campaign = {
      id: string;
      name: string;
      status: string;
      daily_budget?: string;
      start_time?: string;
    };

    const campaigns = ((campaignsData.data ?? []) as Campaign[]).map((c) => {
      const ins = insightMap[c.id];
      const leads = ins?.actions?.find(
        (a) => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead'
      );
      return {
        id:           c.id,
        name:         c.name,
        status:       c.status,
        dailyBudget:  c.daily_budget ? (parseInt(c.daily_budget) / 100).toFixed(2) : null,
        startTime:    c.start_time ?? null,
        impressions:  ins ? parseInt(ins.impressions) : 0,
        clicks:       ins ? parseInt(ins.clicks)      : 0,
        spend:        ins ? parseFloat(ins.spend)     : 0,
        leads:        leads ? parseInt(leads.value)   : 0,
        ctr:          ins && parseInt(ins.impressions) > 0
                        ? ((parseInt(ins.clicks) / parseInt(ins.impressions)) * 100).toFixed(2)
                        : '0.00',
      };
    });

    // 3 — Ads with creative thumbnails
    const adsData = await graphGet(`/${ACCOUNT}/ads`, {
      fields: 'id,name,status,campaign_id,creative{id,name,title,body,thumbnail_url}',
      limit:  '100',
    });

    // Ad-level insights
    const adInsightsData = await graphGet(`/${ACCOUNT}/insights`, {
      fields:      'ad_id,ad_name,campaign_id,impressions,clicks,spend,actions',
      level:       'ad',
      date_preset: preset,
      limit:       '100',
    });

    type AdInsight = {
      ad_id: string;
      campaign_id: string;
      impressions: string;
      clicks: string;
      spend: string;
      actions?: Array<{ action_type: string; value: string }>;
    };

    const adInsightMap: Record<string, AdInsight> = {};
    for (const row of (adInsightsData.data ?? []) as AdInsight[]) {
      adInsightMap[row.ad_id] = row;
    }

    type Ad = {
      id: string;
      name: string;
      status: string;
      campaign_id: string;
      creative?: {
        id: string;
        name?: string;
        title?: string;
        body?: string;
        thumbnail_url?: string;
      };
    };

    const ads = ((adsData.data ?? []) as Ad[]).map((a) => {
      const ins = adInsightMap[a.id];
      const leads = ins?.actions?.find(
        (x) => x.action_type === 'lead' || x.action_type === 'offsite_conversion.fb_pixel_lead'
      );
      const campaign = campaigns.find((c) => c.id === a.campaign_id);
      return {
        id:           a.id,
        name:         a.name,
        status:       a.status,
        campaignId:   a.campaign_id,
        campaignName: campaign?.name ?? a.campaign_id,
        thumbnailUrl: a.creative?.thumbnail_url ?? null,
        title:        a.creative?.title ?? a.name,
        body:         a.creative?.body ?? '',
        impressions:  ins ? parseInt(ins.impressions) : 0,
        clicks:       ins ? parseInt(ins.clicks)      : 0,
        spend:        ins ? parseFloat(ins.spend)     : 0,
        leads:        leads ? parseInt(leads.value)   : 0,
      };
    });

    // 4 — Totals
    const totals = campaigns.reduce(
      (acc, c) => ({
        spend:       acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks:      acc.clicks + c.clicks,
        leads:       acc.leads + c.leads,
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    );

    return json({ campaigns, ads, totals, preset });
  } catch (err) {
    console.error('[meta-ads]', err);
    return json({ error: String(err) }, 500);
  }
});

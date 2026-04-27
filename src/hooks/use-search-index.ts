import { useMemo } from "react";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useChannelEconomics } from "@/hooks/use-channel-economics";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";

/**
 * Aggregates every searchable entity in the dashboard into a single flat list
 * the universal search can fuzzy-match against. Each entity is normalized to
 * { id, kind, label, sublabel, keywords, route } where:
 *   - kind:    grouping (Lead, Deal, Channel, Recruiter, Page, etc.)
 *   - label:   what the user sees as the result title
 *   - sublabel: optional secondary line (specialty, status, etc.)
 *   - keywords: extra tokens to widen fuzzy match (synonyms, ids, source codes)
 *   - route:   where to navigate when the user picks the result
 */

export type SearchKind =
  | "Metric"
  | "Lead"
  | "Deal"
  | "Channel"
  | "Recruiter"
  | "Campaign"
  | "Transaction"
  | "Page";

export interface SearchEntity {
  id:        string;
  kind:      SearchKind;
  label:     string;
  sublabel?: string;
  keywords:  string;     // Extra fuzzy-match tokens, space-separated
  route:     string;     // navigation target on select
}

const PAGES: SearchEntity[] = [
  { id: "page:dashboard",    kind: "Page", label: "Dashboard",        sublabel: "Overview", route: "/",               keywords: "home overview kpi summary" },
  { id: "page:sales",        kind: "Page", label: "Sales Tracker",    sublabel: "Recruiter performance", route: "/sales", keywords: "recruiters team conversion pipeline" },
  { id: "page:marketing",    kind: "Page", label: "Marketing",        sublabel: "Channel performance",  route: "/marketing", keywords: "channels sources cpl cpqa cpa" },
  { id: "page:doctor",       kind: "Page", label: "Doctor Progress",  sublabel: "Pipeline by stage",   route: "/leads-pipeline", keywords: "leads pipeline doctors progress stages" },
  { id: "page:team",         kind: "Page", label: "Team Performance", sublabel: "Recruiters",          route: "/team", keywords: "team recruiters performance" },
  { id: "page:finance",      kind: "Page", label: "Finance",          sublabel: "Spend & revenue",     route: "/finance", keywords: "money cost expenses revenue transactions roi" },
  { id: "page:meta-ads",     kind: "Page", label: "Meta Ads",         sublabel: "Facebook & Instagram", route: "/meta-ads", keywords: "facebook instagram fb ig ads campaigns spend" },
  { id: "page:contracts",    kind: "Page", label: "Contracts",        sublabel: "Contract builder",    route: "/contracts", keywords: "agreements documents legal" },
  { id: "page:follow-ups",   kind: "Page", label: "Follow-ups",       sublabel: "Pending follow-ups",  route: "/follow-ups", keywords: "tasks reminders calls" },
  { id: "page:settings",     kind: "Page", label: "Settings",         sublabel: "Users & integrations", route: "/settings", keywords: "config users admin integrations" },
];

// Specific metrics, charts, and insights — each routes to the page that surfaces them.
// Keywords list synonyms / related terms so loose queries still hit the right answer.
const METRICS: SearchEntity[] = [
  // Marketing-side metrics
  { id: "metric:leads-by-source",     kind: "Metric", label: "Leads by Source",            sublabel: "Marketing · which channels generate doctors",      route: "/marketing", keywords: "channel source acquisition where leads come from origin breakdown distribution" },
  { id: "metric:cpl",                  kind: "Metric", label: "Cost Per Lead (by channel)", sublabel: "Marketing · CPL per source",                       route: "/marketing", keywords: "cost per lead cpl spend efficiency channel acquisition cost" },
  { id: "metric:cpql",                 kind: "Metric", label: "Cost Per Qualified Lead",    sublabel: "Marketing · CPQL per channel",                     route: "/marketing", keywords: "cost per qualified cpq cpqa qualified lead efficiency" },
  { id: "metric:cost-per-conversion",  kind: "Metric", label: "Cost Per Conversion",        sublabel: "Marketing · cost per converted lead",              route: "/marketing", keywords: "cost per conversion cpc placement cost roi efficiency" },
  { id: "metric:conversion-rate",      kind: "Metric", label: "Conversion Rate by Channel", sublabel: "Marketing · lead → sale rate",                     route: "/marketing", keywords: "conversion rate lead to sale qualified to converted percentage" },
  { id: "metric:qualified-leads",      kind: "Metric", label: "Qualified Leads",            sublabel: "Marketing · how many leads qualify",               route: "/marketing", keywords: "qualified leads qualification rate qualifying initial sales call" },
  { id: "metric:qualification-rate",   kind: "Metric", label: "Qualification Rate",         sublabel: "Marketing · % qualified",                          route: "/marketing", keywords: "qualification rate percentage funnel" },
  { id: "metric:contact-rate",         kind: "Metric", label: "Contact Rate by Channel",    sublabel: "Marketing · contacted vs uncontacted",             route: "/marketing", keywords: "contact rate contacted uncontacted reachable response" },
  { id: "metric:uncontacted",          kind: "Metric", label: "Uncontacted Leads",          sublabel: "Doctor Progress · leads never contacted",          route: "/leads-pipeline?stage=Not%20Contacted", keywords: "uncontacted not contacted no contact follow up needed waiting" },
  { id: "metric:best-channel",         kind: "Metric", label: "Best Channel",               sublabel: "Marketing · top performer by volume / CPL / CPQL", route: "/marketing", keywords: "best channel winner top top performing volume" },
  { id: "metric:campaign-winners",     kind: "Metric", label: "Campaign Winners",           sublabel: "Marketing · most qualified / lowest CPQL",         route: "/marketing", keywords: "best campaign top campaign most qualified lowest cost winner" },

  // Doctor / pipeline metrics
  { id: "metric:doctor-pipeline",      kind: "Metric", label: "Doctor Pipeline",            sublabel: "Dashboard · funnel by stage",                      route: "/", keywords: "pipeline funnel stages doctors workflow" },
  { id: "metric:license-pipeline",     kind: "Metric", label: "License Pipeline (DOH/DHA/MOH)", sublabel: "Dashboard · license status counts",            route: "/", keywords: "license doh dha moh ministry of health authorization status" },
  { id: "metric:high-priority",        kind: "Metric", label: "High Priority Follow-ups",   sublabel: "Doctor Progress · urgent leads",                   route: "/leads-pipeline?stage=High%20Priority%20Follow%20up", keywords: "high priority follow up urgent need attention" },

  // Sales / recruiter metrics
  { id: "metric:recruiter-performance", kind: "Metric", label: "Recruiter Performance",     sublabel: "Team · contact rate, qualified, placed",           route: "/team", keywords: "recruiter performance sales rep team workload contact rate placed" },
  { id: "metric:total-leads",          kind: "Metric", label: "Total Leads Managed",        sublabel: "Sales · all leads in pipeline",                    route: "/sales", keywords: "total leads count all leads volume managed" },
  { id: "metric:closed-revenue",       kind: "Metric", label: "Pipeline Value",             sublabel: "Dashboard · open deals value",                     route: "/", keywords: "pipeline value open deals weighted closed won revenue placement" },

  // Finance metrics
  { id: "metric:total-spend",          kind: "Metric", label: "Total Marketing Spend",      sublabel: "Finance · spend in period",                        route: "/finance", keywords: "total spend marketing budget expenses cost" },
  { id: "metric:transactions",         kind: "Metric", label: "All Transactions",           sublabel: "Finance · sortable expense list",                  route: "/finance", keywords: "transactions expenses receipts payments sortable" },
  { id: "metric:revenue",              kind: "Metric", label: "Placement Revenue",          sublabel: "Finance · Closed Won deals",                       route: "/finance", keywords: "revenue closed won placement income money earned" },
  { id: "metric:roi",                  kind: "Metric", label: "Return on Investment (ROI)", sublabel: "Finance · revenue vs spend",                       route: "/finance", keywords: "roi return on investment efficiency profit ratio" },
  { id: "metric:roas",                 kind: "Metric", label: "ROAS",                       sublabel: "Finance · return on ad spend",                     route: "/finance", keywords: "roas return on ad spend efficiency ads" },
  { id: "metric:cost-per-placement",   kind: "Metric", label: "Cost Per Placement",         sublabel: "Finance / Meta Ads · spend ÷ placements",          route: "/finance", keywords: "cost per placement cpp placed deals" },

  // Meta Ads metrics
  { id: "metric:impressions",          kind: "Metric", label: "Impressions",                sublabel: "Meta Ads · total ad views",                        route: "/meta-ads", keywords: "impressions views meta facebook instagram ad reach exposure" },
  { id: "metric:reach",                kind: "Metric", label: "Reach",                      sublabel: "Meta Ads · unique people who saw ads",             route: "/meta-ads", keywords: "reach unique people audience size meta facebook" },
  { id: "metric:clicks",               kind: "Metric", label: "Link Clicks",                sublabel: "Meta Ads · CTR & click volume",                    route: "/meta-ads", keywords: "clicks link clicks ctr click through rate" },
  { id: "metric:ctr",                  kind: "Metric", label: "CTR (Click-Through Rate)",   sublabel: "Meta Ads · clicks ÷ impressions",                  route: "/meta-ads", keywords: "ctr click through rate engagement" },
  { id: "metric:cpm",                  kind: "Metric", label: "CPM",                        sublabel: "Meta Ads · cost per 1000 impressions",             route: "/meta-ads", keywords: "cpm cost per thousand mille impressions" },
  { id: "metric:frequency",            kind: "Metric", label: "Frequency",                  sublabel: "Meta Ads · average impressions per person",        route: "/meta-ads", keywords: "frequency saturation repeat exposure ad fatigue" },
  { id: "metric:top-ads",              kind: "Metric", label: "Top Ads by Leads",           sublabel: "Meta Ads · best performing ad creatives",          route: "/meta-ads", keywords: "top ads best ads creatives performance leads" },
  { id: "metric:ad-spend-by-platform", kind: "Metric", label: "Spend by Platform",          sublabel: "Meta Ads · Facebook vs Instagram",                 route: "/meta-ads", keywords: "platform facebook instagram audience network spend split" },
  { id: "metric:age-gender",           kind: "Metric", label: "Impressions by Age & Gender", sublabel: "Meta Ads · demographic breakdown",                route: "/meta-ads", keywords: "demographics age gender male female audience" },
  { id: "metric:actions",              kind: "Metric", label: "Actions & Conversions",      sublabel: "Meta Ads · all tracked events",                    route: "/meta-ads", keywords: "actions conversions purchases events pixel" },
  { id: "metric:meta-leads",           kind: "Metric", label: "Leads from Forms",           sublabel: "Meta Ads · form submissions in Supabase",          route: "/meta-ads", keywords: "form leads supabase submissions lead form" },
];

export function useSearchIndex(): SearchEntity[] {
  const { data: zoho } = useZohoData();
  const channelEcon    = useChannelEconomics();
  const { byCategory } = useMarketingExpenses();

  return useMemo(() => {
    const out: SearchEntity[] = [...METRICS, ...PAGES];

    // ── Leads ────────────────────────────────────────────────────────────
    for (const l of zoho?.rawLeads ?? []) {
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
      if (!name) continue;
      const specialty = (l.Specialty ?? l.Specialty_New ?? "").toString();
      const status    = (l.Lead_Status ?? "").toString();
      const recruiter = ((l.Owner as Record<string, string> | undefined)?.name) ?? "";
      const source    = displaySource(l.Lead_Source);
      out.push({
        id:       `lead:${l.id ?? name}`,
        kind:     "Lead",
        label:    name,
        sublabel: [specialty, status, recruiter].filter(Boolean).join(" · ") || undefined,
        keywords: `${specialty} ${status} ${source} ${recruiter} ${l.Email ?? ""} ${l.Phone ?? ""} ${l.Mobile ?? ""} ${l.Nationality ?? ""}`,
        route:    `/leads-pipeline?q=${encodeURIComponent(name)}`,
      });
    }

    // ── Deals ────────────────────────────────────────────────────────────
    for (const d of zoho?.rawDeals ?? []) {
      if (!d.Deal_Name) continue;
      out.push({
        id:       `deal:${d.id ?? d.Deal_Name}`,
        kind:     "Deal",
        label:    d.Deal_Name,
        sublabel: `${d.Stage ?? "—"} · AED ${(d.Amount ?? 0).toLocaleString()}`,
        keywords: `${d.Stage ?? ""} ${d.Lead_Source ?? ""} deal placement closed won`,
        route:    "/finance",
      });
    }

    // ── Channels ─────────────────────────────────────────────────────────
    for (const c of channelEcon) {
      out.push({
        id:       `channel:${c.channel}`,
        kind:     "Channel",
        label:    c.channel,
        sublabel: `${c.leads.toLocaleString()} leads · ${c.qualified.toLocaleString()} qualified`,
        keywords: `${c.channel} channel source marketing`,
        route:    `/leads-pipeline?source=${encodeURIComponent(c.channel)}`,
      });
    }

    // ── Recruiters (from leads.Owner) ────────────────────────────────────
    const recruiterCounts = new Map<string, number>();
    for (const l of zoho?.rawLeads ?? []) {
      const name = ((l.Owner as Record<string, string> | undefined)?.name) ?? "";
      if (!name) continue;
      recruiterCounts.set(name, (recruiterCounts.get(name) ?? 0) + 1);
    }
    for (const [name, count] of recruiterCounts) {
      out.push({
        id:       `recruiter:${name}`,
        kind:     "Recruiter",
        label:    name,
        sublabel: `${count.toLocaleString()} leads owned`,
        keywords: `recruiter sales rep team owner ${name}`,
        route:    `/leads-pipeline?recruiter=${encodeURIComponent(name)}`,
      });
    }

    // ── Marketing expense categories (transactions search) ────────────────
    for (const cat of byCategory.slice(0, 30)) {
      out.push({
        id:       `txncat:${cat.category}`,
        kind:     "Transaction",
        label:    cat.category,
        sublabel: `${cat.count} transactions · AED ${Math.round(cat.amount).toLocaleString()}`,
        keywords: `expense spend channel ${cat.category}`,
        route:    "/finance",
      });
    }

    return out;
  }, [zoho?.rawLeads, zoho?.rawDeals, channelEcon, byCategory]);
}

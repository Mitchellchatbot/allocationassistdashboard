import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useZohoData } from "@/hooks/use-zoho-data";

export type GroupedStat = { label: string; count: number };

export type CampaignFunnel = {
  campaign:  string;
  total:     number;
  qualified: number;
  converted: number;
};

export type CreativeFunnel = {
  creative:  string;   // raw utm_content value
  total:     number;
  qualified: number;
  converted: number;
};

export type MetaLeadsStats = {
  total:           number;
  withUtm:         number;
  qualifiedCount:  number;  // meta_leads in qualified stages
  placedCount:     number;  // meta_leads in converted/placed stages
  totalAllTime:    number;  // meta_leads rows ignoring date filter
  zohoMatched:     number;  // meta_leads matched to a Zoho lead in this period
  byCreative:      GroupedStat[];
  byCampaign:      GroupedStat[];
  byPlatform:      GroupedStat[];
  byLocation:      GroupedStat[];
  bySpeciality:    GroupedStat[];
  byStage:         GroupedStat[];
  campaignFunnels: CampaignFunnel[];
  creativeFunnels: CreativeFunnel[];
};

// Stage classification mirrors how Zoho Lead_Status is treated elsewhere in the app.
// Kept in lower-case so we match regardless of casing variations across imports.
// QUALIFIED is a superset of CONVERTED — a converted lead must first be qualified.
// "Contact in Future" is NOT qualified — it's a deferred conversation, not a pass.
const CONVERTED_STAGES = new Set([
  "closed won",
  "won",
  "converted",
  "placed",
  "placement",
  "high priority follow up",
  "high priority follow-up",
]);
const QUALIFIED_STAGES = new Set([
  "initial sales call completed",
  "qualified",
  ...CONVERTED_STAGES,
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

// Normalize email/phone/name for cross-reference against Zoho leads.
function normalizeEmail(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase();
}
function normalizePhone(s: string | undefined | null): string {
  return (s ?? "").replace(/\D/g, "");   // digits only — handles "+44…" vs "0044…" etc.
}
function normalizeName(first: string | undefined | null, last: string | undefined | null): string {
  return `${(first ?? "").trim().toLowerCase()} ${(last ?? "").trim().toLowerCase()}`.trim();
}

export function useMetaLeadsStats(dateRange: DateRangeInput) {
  const fromKey = dateRange.from.toISOString().slice(0, 10);
  const toKey   = dateRange.to.toISOString().slice(0, 10);

  // Cross-reference meta_leads → Zoho leads by email/phone so we can derive
  // the qualification stage even when meta_leads.stage is empty (which is
  // common for fresh form imports that haven't been touched in Zoho yet).
  const { data: zoho } = useZohoData();

  // Memoize the Zoho lookup maps so we don't rebuild them on every render.
  // The maps only need to change when the Zoho leads array reference changes.
  const { zohoStatusByEmail, zohoStatusByPhone, zohoStatusByName, zohoCount } = useMemo(() => {
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const byName  = new Map<string, string>();
    for (const l of zoho?.rawLeads ?? []) {
      const status = (l.Lead_Status ?? "").trim();
      if (!status) continue;
      const email = normalizeEmail(l.Email);
      const phone = normalizePhone(l.Phone ?? l.Mobile);
      const name  = normalizeName(l.First_Name, l.Last_Name);
      if (email) byEmail.set(email, status);
      if (phone) byPhone.set(phone, status);
      if (name)  byName.set(name, status);
    }
    return {
      zohoStatusByEmail: byEmail,
      zohoStatusByPhone: byPhone,
      zohoStatusByName:  byName,
      zohoCount: zoho?.rawLeads?.length ?? 0,
    };
  }, [zoho?.rawLeads]);

  return useQuery<MetaLeadsStats>({
    queryKey: ["meta-leads-stats", fromKey, toKey, zohoCount],
    queryFn: async () => {
      const fromISO = dateRange.from.toISOString();
      // end-of-day for `to`
      const toISO = new Date(
        dateRange.to.getFullYear(),
        dateRange.to.getMonth(),
        dateRange.to.getDate(),
        23, 59, 59
      ).toISOString();

      // ── Fetch only rows in the date range (filter at SQL, not client side).
      // Prior approach pulled all 15K+ rows then filtered locally; SQL-side
      // filtering on submitted_at typically returns a few hundred rows for
      // a 1-year window — order-of-magnitude faster.
      const PAGE = 1000;
      const allRows: Record<string, string>[] = [];
      let offset = 0;
      const FULL_COLS    = "utm_content, utm_campaign, utm_source, location, speciality, stage, submitted_at, created_at, email, phone, first_name, last_name";
      const FALLBACK_COLS = "utm_content, utm_campaign, utm_source, location, speciality, stage, submitted_at, created_at";
      let cols = FULL_COLS;
      let triedFallback = false;

      // SQL filter on created_at (always auto-populated by Supabase).
      // We re-filter client-side using submitted_at when present, since the
      // form-side date is what the user really cares about.
      while (true) {
        const { data, error } = await supabase
          .from("meta_leads")
          .select(cols)
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(offset, offset + PAGE - 1);

        if (error) {
          if (!triedFallback) {
            console.warn("[useMetaLeadsStats] full SELECT failed, retrying without email/phone:", error.message);
            cols = FALLBACK_COLS;
            triedFallback = true;
            continue; // retry the same page with reduced columns
          }
          throw error;
        }
        const rows = (data ?? []) as Record<string, string>[];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
        if (offset > 50_000) break;
      }

      // Refine: prefer submitted_at when present (form date), else trust created_at.
      const fromMs = dateRange.from.getTime();
      const toMs   = new Date(
        dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59
      ).getTime();
      const filtered = allRows.filter(r => {
        const raw = r.submitted_at || r.created_at;
        if (!raw) return true;
        const t = new Date(raw).getTime();
        if (isNaN(t)) return true;
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

      // Resolve a lead's stage. Prefer Zoho's Lead_Status when we can find a
      // matching record (by email, phone, or name) — Zoho is the canonical
      // qualification source. Fall back to meta_leads.stage only when no Zoho
      // match exists, since meta_leads.stage is often a form-specific value
      // (e.g. "submitted") that doesn't map to recruitment qualification.
      let zohoMatched = 0;
      const resolveStage = (r: Record<string, string>): string => {
        const email = normalizeEmail(r.email);
        const phone = normalizePhone(r.phone);
        const name  = normalizeName(r.first_name, r.last_name);
        const zohoStatus = (email && zohoStatusByEmail.get(email))
                        || (phone && zohoStatusByPhone.get(phone))
                        || (name  && zohoStatusByName.get(name))
                        || "";
        if (zohoStatus) {
          zohoMatched++;
          return zohoStatus.trim().toLowerCase();
        }
        // No Zoho match — fall back to meta_leads.stage (rarely useful, but
        // keeps form-side analytics working when Zoho is empty).
        return (r.stage ?? "").trim().toLowerCase();
      };

      // Build per-campaign + per-creative funnels + global totals in one pass.
      // utm_content is treated as the creative identifier (it usually mirrors
      // the ad name on Meta, e.g. "RnP-Q4-Doc-IG_Reels-vid01").
      const campaignMap = new Map<string, CampaignFunnel>();
      const creativeMap = new Map<string, CreativeFunnel>();
      let qualifiedCount = 0;
      let placedCount    = 0;
      for (const r of filtered) {
        const stage = resolveStage(r);
        if (QUALIFIED_STAGES.has(stage)) qualifiedCount++;
        if (CONVERTED_STAGES.has(stage)) placedCount++;

        const camp = (r.utm_campaign ?? "").trim();
        if (camp && camp !== "xxxxx") {
          const cur = campaignMap.get(camp) ?? { campaign: camp, total: 0, qualified: 0, converted: 0 };
          cur.total++;
          if (QUALIFIED_STAGES.has(stage)) cur.qualified++;
          if (CONVERTED_STAGES.has(stage)) cur.converted++;
          campaignMap.set(camp, cur);
        }

        // Skip creatives with no name, the placeholder, or pure-numeric
        // content (often a Meta-internal ID, not an ad creative we can match).
        const creative = (r.utm_content ?? "").trim();
        if (creative && creative !== "xxxxx" && !/^\d+$/.test(creative)) {
          const cur = creativeMap.get(creative) ?? { creative, total: 0, qualified: 0, converted: 0 };
          cur.total++;
          if (QUALIFIED_STAGES.has(stage)) cur.qualified++;
          if (CONVERTED_STAGES.has(stage)) cur.converted++;
          creativeMap.set(creative, cur);
        }
      }
      const campaignFunnels = Array.from(campaignMap.values()).sort((a, b) => b.total - a.total);
      const creativeFunnels = Array.from(creativeMap.values()).sort((a, b) => b.total - a.total);

      return {
        total, withUtm, qualifiedCount, placedCount,
        totalAllTime: allRows.length, zohoMatched,
        byCreative, byCampaign, byPlatform, byLocation, bySpeciality, byStage,
        campaignFunnels, creativeFunnels,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useZohoData } from "@/hooks/use-zoho-data";

/**
 * Per-ad / per-adset / per-campaign lead-and-conversion counts derived from
 * the `meta_leads` table cross-referenced with Zoho.
 *
 * Why this exists: Meta Insights API's `actions` field doesn't reliably
 * return lead counts at the adset level for AA's account configuration —
 * the form-submission events live in our own `meta_leads` table instead.
 * This hook bridges the gap: it pulls every Meta lead-form submission in
 * the date range, groups by `utm_content` (= ad_id) and `utm_campaign`
 * (= campaign_id or slug), and joins to Zoho leads / Doctors on Board to
 * derive qualified + converted counts.
 *
 * Returned shape lets callers look up by ad_id, adset_id (after rolling up
 * via the ads → adset_id mapping from useMetaTopAds), or campaign id/slug.
 */
export interface AttributionCounts {
  leads:     number;
  qualified: number;
  converted: number;
}

/** Per-row attribution payload — used by drill-down modals to show the
 *  actual people behind each count, with their qualification + conversion
 *  status already resolved from Zoho. */
export interface MetaLeadRow {
  id:           string;
  firstName:    string | null;
  lastName:     string | null;
  fullName:     string;
  email:        string | null;
  phone:        string | null;
  speciality:   string | null;
  location:     string | null;
  submittedAt:  string | null;
  utmCampaign:  string | null;
  utmContent:   string | null;
  zohoStatus:   string | null;
  qualified:    boolean;
  converted:    boolean;
}

const QUALIFIED_STATUSES = new Set([
  "Initial Sales Call Completed",
  "High Priority Follow up",
]);
// Anything in DoB module is converted — regardless of Lead_Status.

// Aggressive normalization — strip ALL non-alphanumeric so "Video | Emilie 5",
// "video emilie 5", and "Video Emilie 5" all collapse to "videoemilie5".
// Mirrors useMetaLeadsStats so the count cell and the modal list match.
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function useMetaLeadAttribution(
  since: string,
  until: string,
  /**
   * Optional list of ads in the date range — used to translate utm_content
   * values (which AA stores as creative NAMES like "Apr'26 - Static 1", not
   * Meta ad IDs) into ad IDs by name match. Without this, ad-level
   * attribution requires utm_content to literally be the Meta ad ID, which
   * is rare in practice. Pass `topAds` from useMetaTopAds if you have it.
   */
  ads?: { id: string; name: string }[],
) {
  // Outermost diagnostic — fires on every render of the hook regardless of
  // useMemo deps. If you see "[attribution-hook]" but no "[attribution] RECOMPUTE"
  // in the console, the inner useMemo is using its cached value (deps haven't
  // changed). If you see neither, the hook isn't being called.
  console.log(`[attribution-hook] called: since=${since}, until=${until}, ads.len=${ads?.length ?? 0}`);

  const { data: zoho } = useZohoData();

  const query = useQuery({
    // submitted_at is text in this DB; many rows have empty/NULL values.
    // Using created_at (which is a real timestamptz, populated by Postgres
    // on insert) avoids the silent-drop issue and makes the date filter
    // type-safe.
    queryKey: ["meta-lead-attribution", since, until],
    queryFn: async () => {
      // Need EVERY column the modal will display + `id` so the dedup in
      // pushTo can key off something stable. Earlier we synthesised an id
      // from `${email}-${created_at}` which collided for any rows with the
      // same email/timestamp, deflating modal counts (242 → 18).
      const COLS = "id, utm_campaign, utm_content, email, phone, first_name, last_name, speciality, location, submitted_at, created_at";
      const FALLBACK_COLS = "id, utm_campaign, utm_content, submitted_at, created_at";
      let cols = COLS;

      // PAGINATE — Supabase/PostgREST caps single SELECTs at 1000 rows
      // regardless of `.limit()`. Loop with .range() until we exhaust the
      // window, mirroring how useMetaLeadsStats does it.
      const PAGE = 1000;
      const all: Record<string, string>[] = [];
      let offset = 0;
      let triedFallback = false;
      while (true) {
        const { data, error } = await supabase
          .from("meta_leads")
          .select(cols)
          .gte("created_at", `${since}T00:00:00Z`)
          .lte("created_at", `${until}T23:59:59Z`)
          .range(offset, offset + PAGE - 1);
        if (error) {
          if (!triedFallback) {
            console.warn("[meta-lead-attribution] full SELECT failed, retrying with minimal cols:", error.message);
            cols = FALLBACK_COLS;
            triedFallback = true;
            continue;   // retry same offset with smaller column list
          }
          throw error;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
        // Safety cap so a misconfigured filter can't run away
        if (offset > 50_000) {
          console.warn("[meta-lead-attribution] pagination hit 50k safety cap");
          break;
        }
      }
      console.log(`[meta-lead-attribution] paginated fetch — total rows: ${all.length}`);
      return all;
    },
    staleTime: 60_000,
  });

  return useMemo(() => {
    const DEBUG = true; // toggle to silence
    if (DEBUG) console.log("[attribution] ────────── RECOMPUTE ──────────");
    if (DEBUG) console.log("[attribution] inputs: rows=" + (query.data?.length ?? 0) + ", ads=" + (ads?.length ?? 0));
    const rawLeads = (zoho as { rawLeads?: { Email: string | null; Phone: string | null; Mobile: string | null; Lead_Status: string }[] } | undefined)?.rawLeads ?? [];
    const rawDob   = (zoho as { rawDoctorsOnBoard?: { Email: string | null; Phone: string | null; Mobile: string | null }[] } | undefined)?.rawDoctorsOnBoard ?? [];

    const statusByEmail = new Map<string, string>();
    const statusByPhone = new Map<string, string>();
    const dobByEmail    = new Set<string>();
    const dobByPhone    = new Set<string>();
    for (const l of rawLeads) {
      if (l.Email)  statusByEmail.set(norm(l.Email), l.Lead_Status);
      if (l.Phone)  statusByPhone.set(norm(l.Phone), l.Lead_Status);
      if (l.Mobile) statusByPhone.set(norm(l.Mobile), l.Lead_Status);
    }
    for (const d of rawDob) {
      if (d.Email)  dobByEmail.add(norm(d.Email));
      if (d.Phone)  dobByPhone.add(norm(d.Phone));
      if (d.Mobile) dobByPhone.add(norm(d.Mobile));
    }

    // utm_content → ad_id (Meta convention) OR ad name (AA's actual usage)
    const byAd       = new Map<string, AttributionCounts>();
    // utm_campaign → could be id OR a name slug. Index BOTH so callers can
    // look up by either form without round-tripping through Meta API.
    const byCampaign = new Map<string, AttributionCounts>();

    // Name-based index: AA's marketers fill utm_content with the creative
    // NAME ("Apr'26 - Static 1") rather than the Meta ad ID. Build a
    // lookup so a meta_leads row with utm_content="Apr'26 - Static 1"
    // resolves to all ads whose name matches that string. Match strategy:
    //   1. Exact match (case-insensitive) on full ad.name
    //   2. Substring match either way (utm contained in name OR vice versa)
    // Multiple ads may share the same name; we credit each.
    const adIdsByName = new Map<string, string[]>();
    // Set of known ad IDs (normalized) — used to detect the rare case where
    // utm_content is literally the Meta ad ID rather than a creative name.
    // We need this as a separate index because byAd is the running counts
    // map and gets polluted by every utm_content value we process — using
    // it for "is this utm an ad id" checks short-circuits the name resolver
    // after the first lead with each utm_content value (real bug, found
    // 2026-05-05 when modals showed 3 leads against counts of 242).
    const knownAdIds = new Set<string>();
    if (ads) {
      for (const ad of ads) {
        const k = norm(ad.name);
        if (k) {
          const list = adIdsByName.get(k) ?? [];
          list.push(ad.id);
          adIdsByName.set(k, list);
        }
        const idKey = norm(ad.id);
        if (idKey) knownAdIds.add(idKey);
      }
    }
    if (DEBUG) {
      console.log("[attribution] adIdsByName built — unique normalized names:", adIdsByName.size, "knownAdIds:", knownAdIds.size);
      const sampleNames = [...adIdsByName.keys()].slice(0, 5);
      console.log("[attribution] sample ad names (normalized):", sampleNames);
    }
    function resolveUtmToAdIds(utm: string): string[] {
      if (!utm) return [];
      // 1. Direct id match (rare — only when utm_content IS literally the
      //    Meta ad id rather than a creative name).
      if (knownAdIds.has(utm)) return [utm];
      // 2. Exact name match.
      const exact = adIdsByName.get(utm);
      if (exact) return exact;
      // 3. Substring match — catches ad names with trailing modifiers
      //    (e.g. utm_content "Video Emilie 5" matches ad "Video Emilie 5 — UK").
      const matches: string[] = [];
      for (const [name, ids] of adIdsByName.entries()) {
        if (name.includes(utm) || utm.includes(name)) matches.push(...ids);
      }
      return matches;
    }

    const bump = (m: Map<string, AttributionCounts>, key: string, qualified: boolean, converted: boolean) => {
      if (!key) return;
      let cur = m.get(key);
      if (!cur) { cur = { leads: 0, qualified: 0, converted: 0 }; m.set(key, cur); }
      cur.leads++;
      if (qualified) cur.qualified++;
      if (converted) cur.converted++;
    };

    // Parallel maps that hold the enriched LEAD ROWS (not just counts).
    // Used by drill-down modals so we can show the actual names behind
    // each count instead of just a number.
    const rowsByAd:       Map<string, MetaLeadRow[]> = new Map();
    const rowsByCampaign: Map<string, MetaLeadRow[]> = new Map();
    const pushTo = (m: Map<string, MetaLeadRow[]>, key: string, r: MetaLeadRow) => {
      if (!key) return;
      const list = m.get(key);
      if (list) { if (!list.some(x => x.id === r.id)) list.push(r); }
      else m.set(key, [r]);
    };

    let synthIdx = 0;
    // Tally what we encounter as we walk meta_leads — top utm_content
    // distribution + how many resolve via name to at least one ad.
    const utmContentTally = new Map<string, { count: number; resolved: number }>();
    let withId = 0, withUtmContent = 0, withFirstName = 0;
    for (const row of query.data ?? []) {
      const email = norm(row.email);
      const phone = norm(row.phone);
      const zohoStatus = statusByEmail.get(email) ?? statusByPhone.get(phone) ?? null;
      const converted  = (email && dobByEmail.has(email)) || (phone && dobByPhone.has(phone));
      const qualified  = !!converted || (!!zohoStatus && QUALIFIED_STATUSES.has(zohoStatus));

      const enriched: MetaLeadRow = {
        // Real id when available; otherwise a monotonic counter that's
        // guaranteed unique within this batch — prevents the dedup in
        // pushTo from collapsing rows with overlapping email/timestamp.
        id:           row.id ?? `synth-${synthIdx++}`,
        firstName:    row.first_name ?? null,
        lastName:     row.last_name ?? null,
        fullName:     [row.first_name, row.last_name].filter(Boolean).join(" ") || (row.email ?? "Unknown"),
        email:        row.email ?? null,
        phone:        row.phone ?? null,
        speciality:   row.speciality ?? null,
        location:     row.location ?? null,
        submittedAt:  row.submitted_at ?? row.created_at ?? null,
        utmCampaign:  row.utm_campaign ?? null,
        utmContent:   row.utm_content ?? null,
        zohoStatus,
        qualified:    !!qualified,
        converted:    !!converted,
      };

      if (row.id) withId++;
      if (row.utm_content) withUtmContent++;
      if (row.first_name) withFirstName++;

      const utmContent = norm(row.utm_content);
      const rawUtm = (row.utm_content ?? "").trim();
      const resolvedIds = resolveUtmToAdIds(utmContent);
      const tallyKey = rawUtm || "(empty)";
      const cur = utmContentTally.get(tallyKey) ?? { count: 0, resolved: 0 };
      cur.count++;
      if (resolvedIds.length > 0) cur.resolved++;
      utmContentTally.set(tallyKey, cur);

      // First record under the raw utm_content key (counts AND rows).
      bump(byAd,    utmContent, !!qualified, !!converted);
      pushTo(rowsByAd, utmContent, enriched);
      // Then resolve to actual ad IDs via name matching.
      for (const adId of resolvedIds) {
        if (adId !== utmContent) {
          bump(byAd, adId, !!qualified, !!converted);
          pushTo(rowsByAd, adId, enriched);
        }
      }

      const utm = norm(row.utm_campaign);
      if (utm) {
        bump(byCampaign, utm, !!qualified, !!converted);
        pushTo(rowsByCampaign, utm, enriched);
        const slug = slugify(row.utm_campaign);
        if (slug && slug !== utm) {
          bump(byCampaign, slug, !!qualified, !!converted);
          pushTo(rowsByCampaign, slug, enriched);
        }
      }
    }

    const lookup = (m: Map<string, AttributionCounts>, key: string | null | undefined): AttributionCounts => {
      const k = norm(key);
      return m.get(k) ?? m.get(slugify(key)) ?? { leads: 0, qualified: 0, converted: 0 };
    };

    if (DEBUG) {
      console.log(`[attribution] processed ${query.data?.length ?? 0} rows — withId=${withId}, withUtmContent=${withUtmContent}, withFirstName=${withFirstName}`);
      const top = [...utmContentTally.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([utm, { count, resolved }]) => ({ utm_content: utm, count, "rows that resolved to an ad": resolved }));
      console.log("[attribution] top 10 utm_content values:");
      console.table(top);
      console.log(`[attribution] byAd map size=${byAd.size}, rowsByAd map size=${rowsByAd.size}`);
      // Add a tester so the user can run "lookupAttribution(adId)" in console.
      (window as unknown as Record<string, unknown>).__attrib = {
        byAd, rowsByAd, byCampaign, rowsByCampaign,
        adIdsByName, knownAdIds,
        lookupAdId: (id: string) => {
          const k = norm(id);
          return {
            normalized: k,
            countsAtKey: byAd.get(k),
            rowsAtKey: (rowsByAd.get(k) ?? []).length,
            sampleRows: (rowsByAd.get(k) ?? []).slice(0, 3),
          };
        },
        lookupAdName: (name: string) => {
          const k = norm(name);
          const ids = adIdsByName.get(k) ?? [];
          return {
            normalized: k,
            adIdsWithThisName: ids,
            countsForFirstId: ids[0] ? byAd.get(norm(ids[0])) : null,
            rowsForFirstId: ids[0] ? (rowsByAd.get(norm(ids[0])) ?? []).length : 0,
          };
        },
      };
      console.log("[attribution] window.__attrib is available — try __attrib.lookupAdName('Video | Emilie 5') in the console");
    }

    const rowsLookup = (m: Map<string, MetaLeadRow[]>, key: string | null | undefined): MetaLeadRow[] => {
      const k = norm(key);
      return m.get(k) ?? m.get(slugify(key)) ?? [];
    };

    return {
      isLoading: query.isLoading,
      error:     query.error,
      /** Counts for a specific ad (uses utm_content = Meta ad ID). */
      forAd:       (adId: string | null | undefined) => lookup(byAd, adId),
      /** Counts for a specific campaign (id or name — both work). */
      forCampaign: (campaignIdOrName: string | null | undefined) => lookup(byCampaign, campaignIdOrName),
      /** Counts for an adset, given the list of ad ids that belong to it. */
      forAdset:    (adIds: string[]): AttributionCounts => {
        const total: AttributionCounts = { leads: 0, qualified: 0, converted: 0 };
        for (const id of adIds) {
          const c = lookup(byAd, id);
          total.leads     += c.leads;
          total.qualified += c.qualified;
          total.converted += c.converted;
        }
        return total;
      },
      /** Actual lead ROWS for a specific ad — used by drill-down modals. */
      leadsForAd:       (adId: string | null | undefined) => rowsLookup(rowsByAd, adId),
      leadsForCampaign: (campaignIdOrName: string | null | undefined) => rowsLookup(rowsByCampaign, campaignIdOrName),
      /** Lead rows aggregated across all ads in an adset (deduped by id). */
      leadsForAdset:    (adIds: string[]): MetaLeadRow[] => {
        const seen = new Set<string>();
        const out: MetaLeadRow[] = [];
        for (const id of adIds) {
          for (const r of rowsLookup(rowsByAd, id)) {
            if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
          }
        }
        return out;
      },
    };
  }, [query.data, query.isLoading, query.error, zoho]);
}

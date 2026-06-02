import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useMemo } from "react";

/**
 * Per-campaign lead drill-down. Returns the actual people who filled out a
 * Meta lead form attributed (via utm_campaign) to the given campaign — name,
 * email, submission date, and where they are in our funnel (qualified /
 * converted) by joining to Zoho leads on email/phone client-side.
 *
 * utm_campaign in meta_leads is sometimes the Meta campaign ID (numeric
 * string), sometimes a readable slug, and occasionally the campaign name —
 * so we accept BOTH and match against either.
 */
export interface MetaCampaignLead {
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
  // Resolved by joining to Zoho:
  zohoStatus:   string | null;
  qualified:    boolean;
  converted:    boolean;
}

const QUALIFIED_STATUSES = new Set([
  "Initial Sales Call Completed",
  "High Priority Follow up",
]);
// Anything in DoB module is converted regardless of Lead_Status.

export function useMetaCampaignLeads(
  campaignId:   string | null,
  campaignName: string | null,
  since:        string,   // YYYY-MM-DD
  until:        string,   // YYYY-MM-DD
) {
  const { data: zoho } = useZohoData();

  const query = useQuery({
    queryKey: ["meta-campaign-leads", campaignId, campaignName, since, until],
    enabled:  !!campaignId,
    queryFn: async () => {
      // Pull every meta_leads row for the date range, then filter client-side
      // by utm_campaign match. Doing the filter in Postgres requires guessing
      // which form the utm_campaign takes (id vs name slug vs human name) —
      // safer to pull and filter in JS where we can try several match modes.
      const { data, error } = await supabase
        .from("meta_leads")
        .select("id, first_name, last_name, email, phone, speciality, location, submitted_at, created_at, utm_campaign, utm_content")
        .gte("submitted_at", `${since}T00:00:00Z`)
        .lte("submitted_at", `${until}T23:59:59Z`)
        .order("submitted_at", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const slugify = (s: string | null) => (s ?? "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const idMatch    = (campaignId   ?? "").trim();
      const nameSlug   = slugify(campaignName);

      return (data ?? []).filter(row => {
        const utm = (row.utm_campaign ?? "").trim();
        if (!utm) return false;
        if (idMatch && utm === idMatch) return true;
        if (nameSlug && slugify(utm) === nameSlug) return true;
        // Some accounts ship utm_campaign as the human-readable name itself.
        if (campaignName && utm.toLowerCase() === campaignName.toLowerCase()) return true;
        return false;
      });
    },
    staleTime: 60_000,
  });

  // Cross-reference with Zoho leads + Doctors on Board so we can show
  // qualification / conversion status alongside each row.
  const enriched = useMemo<MetaCampaignLead[]>(() => {
    if (!query.data) return [];
    const rawLeads = (zoho as { rawLeads?: { Email: string | null; Phone: string | null; Mobile: string | null; Lead_Status: string }[] } | undefined)?.rawLeads ?? [];
    const rawDob   = (zoho as { rawDoctorsOnBoard?: { Email: string | null; Phone: string | null; Mobile: string | null }[] } | undefined)?.rawDoctorsOnBoard ?? [];

    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const statusByEmail = new Map<string, string>();
    const statusByPhone = new Map<string, string>();
    const dobByEmail    = new Set<string>();
    const dobByPhone    = new Set<string>();

    for (const l of rawLeads) {
      if (l.Email) statusByEmail.set(norm(l.Email), l.Lead_Status);
      if (l.Phone) statusByPhone.set(norm(l.Phone), l.Lead_Status);
      if (l.Mobile) statusByPhone.set(norm(l.Mobile), l.Lead_Status);
    }
    for (const d of rawDob) {
      if (d.Email)  dobByEmail.add(norm(d.Email));
      if (d.Phone)  dobByPhone.add(norm(d.Phone));
      if (d.Mobile) dobByPhone.add(norm(d.Mobile));
    }

    return query.data.map((row): MetaCampaignLead => {
      const email = norm(row.email);
      const phone = norm(row.phone);
      const zohoStatus = statusByEmail.get(email) ?? statusByPhone.get(phone) ?? null;
      const converted = (email && dobByEmail.has(email)) || (phone && dobByPhone.has(phone)) || false;
      const qualified = converted || (!!zohoStatus && QUALIFIED_STATUSES.has(zohoStatus));
      const firstName = row.first_name ?? null;
      const lastName  = row.last_name ?? null;
      const fullName  = [firstName, lastName].filter(Boolean).join(" ") || (row.email ?? "Unknown");
      return {
        id:           row.id ?? "",
        firstName, lastName, fullName,
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
    });
  }, [query.data, zoho]);

  return { data: enriched, isLoading: query.isLoading, error: query.error };
}

/**
 * useZohoLeads — infinite-scroll paginated leads directly from Zoho.
 *
 * - Initial load: 100 leads
 * - Each subsequent page: 50 leads
 * - When search is set: hits Zoho's /Leads/search endpoint instead,
 *   so only matching records come back — no need to load everything first.
 * - 300ms debounce on search to avoid hammering on every keypress.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { zohoGet } from "@/lib/zoho";
import type { Doctor } from "./use-meta-leads";

const FIELDS = [
  "Full_Name", "Lead_Status", "Specialty_New", "Specialty",
  "Country_of_Specialty_training", "Owner", "Has_DOH", "Has_DHA",
  "Has_MOH", "License", "Created_Time",
].join(",");

const STATUS_TO_STAGE: Record<string, string> = {
  "Not Contacted":                "New Application",
  "Attempted to Contact":         "Screening",
  "Initial Sales Call Completed": "Initial Call Done",
  "Contact in Future":            "Follow-up Scheduled",
  "High Priority Follow up":      "High Priority",
  "Unqualified Leads":            "Unqualified",
  "Not Interested":               "Not Interested",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(l: any): Doctor {
  const daysOld = Math.max(1, Math.floor(
    (Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000
  ));
  const daysInStage = daysOld <= 44 ? daysOld : (daysOld % 44) + 1;

  let destination = "—";
  let license = l.License ?? "—";
  if (l.Has_DHA && l.Has_DHA !== "No") {
    destination = "UAE (Dubai)";
    license = `DHA (${l.Has_DHA})`;
  } else if (l.Has_DOH && l.Has_DOH !== "No") {
    destination = "UAE (Abu Dhabi)";
    license = `DOH (${l.Has_DOH})`;
  } else if (l.Has_MOH && l.Has_MOH !== "No") {
    destination = "UAE / GCC";
    license = `MOH (${l.Has_MOH})`;
  }

  const status: Doctor["status"] =
    l.Lead_Status === "High Priority Follow up" ? "at-risk" :
    daysInStage > 30 ? "delayed" :
    daysInStage > 18 ? "at-risk" : "on-track";

  return {
    id:         `AA-${l.id.slice(-5).toUpperCase()}`,
    name:       l.Full_Name || "—",
    specialty:  l.Specialty_New || l.Specialty || "—",
    stage:      STATUS_TO_STAGE[l.Lead_Status] ?? l.Lead_Status,
    origin:     l.Country_of_Specialty_training ?? "—",
    destination,
    assignedTo: l.Owner?.name ?? "—",
    daysInStage,
    status,
    license,
  };
}

/** 300ms debounce so search only fires after the user stops typing */
export function useDebounce(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface ZohoLeadPage {
  doctors: Doctor[];
  hasMore: boolean;
}

export function useZohoLeads(search: string) {
  const isSearching = search.trim().length > 0;

  return useInfiniteQuery<ZohoLeadPage>({
    queryKey: ["zoho-leads-infinite", search],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      // First load: 100, subsequent: 50
      const perPage = page === 1 ? "100" : "50";
      const module = isSearching ? "Leads/search" : "Leads";

      const params: Record<string, string> = {
        fields: FIELDS,
        per_page: perPage,
        page: String(page),
      };

      if (isSearching) {
        // Zoho word search — searches across all text fields
        params.word = search.trim();
      }

      const data = await zohoGet<{
        data?: Record<string, unknown>[];
        info?: { more_records: boolean };
      }>(module, params);

      return {
        doctors: (data.data ?? []).map(mapLead),
        hasMore: data.info?.more_records ?? false,
      };
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length + 1 : undefined,
  });
}

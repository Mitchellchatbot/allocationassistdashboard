/**
 * useZohoLeads — client-side search + pagination over the cached Zoho data.
 *
 * Reads rawLeads from useZohoData (TanStack Query cache) instead of making
 * direct Zoho API calls. This eliminates all rate-limiting issues entirely —
 * no network requests happen when scrolling or typing in search.
 */

import { useMemo, useState, useEffect } from "react";
import { useZohoData } from "@/hooks/use-zoho-data";
import type { ZohoLead } from "@/hooks/use-zoho-data";
import type { Doctor } from "./use-meta-leads";

const STATUS_TO_STAGE: Record<string, string> = {
  "Not Contacted":                "New Application",
  "Attempted to Contact":         "Screening",
  "Initial Sales Call Completed": "Initial Call Done",
  "Contact in Future":            "Follow-up Scheduled",
  "High Priority Follow up":      "High Priority",
  "Unqualified Leads":            "Unqualified",
  "Not Interested":               "Not Interested",
};

function mapLead(l: ZohoLead): Doctor {
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
    (l.Lead_Status === "Unqualified Leads" || l.Lead_Status === "Not Interested") ? "closed" :
    l.Lead_Status === "High Priority Follow up" && daysInStage > 2 ? "delayed" :
    l.Lead_Status === "High Priority Follow up" ? "at-risk" :
    daysInStage > 30 ? "delayed" :
    daysInStage > 18 ? "at-risk" : "on-track";

  return {
    id:         `AA-${l.id.slice(-5).toUpperCase()}`,
    zohoId:     l.id,
    leadStatus: l.Lead_Status,
    name:       l.Full_Name || "—",
    specialty:  l.Specialty_New || l.Specialty || "—",
    stage:      STATUS_TO_STAGE[l.Lead_Status ?? ""] ?? l.Lead_Status ?? "—",
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

const PAGE_SIZE = 100;

export interface LeadsFilters {
  stage?:     string; // Lead_Status value, e.g. "Not Contacted"
  recruiter?: string; // Owner.name
  badge?:     string; // "on-track" | "delayed" | "at-risk"
}

/** Compute the status badge from raw lead fields (mirrors mapLead logic). */
function getBadge(l: ZohoLead): Doctor["status"] {
  // Terminal statuses — these are not "on track", they're done
  if (l.Lead_Status === "Unqualified Leads" || l.Lead_Status === "Not Interested") return "closed";
  const daysOld = Math.max(1, Math.floor(
    (Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000
  ));
  const daysInStage = daysOld <= 44 ? daysOld : (daysOld % 44) + 1;
  if (l.Lead_Status === "High Priority Follow up" && daysInStage > 2) return "delayed";
  if (l.Lead_Status === "High Priority Follow up") return "at-risk";
  if (daysInStage > 30) return "delayed";
  if (daysInStage > 18) return "at-risk";
  return "on-track";
}

export function useZohoLeads(search: string, filters: LeadsFilters = {}) {
  const { data: zoho, isLoading } = useZohoData();
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  // Reset to first page whenever search or filters change
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [search, filters.stage, filters.recruiter, filters.badge]);

  // Client-side filtering across search + all filter dimensions — no network calls
  const filtered = useMemo(() => {
    const leads = zoho?.rawLeads ?? [];
    const term = search.trim().toLowerCase();

    return leads.filter(l => {
      // Text search — covers every visible column
      if (term) {
        // Destination string (mirrors mapLead logic) for "Dubai", "Abu Dhabi", "GCC" searches
        const dest =
          (l.Has_DHA && l.Has_DHA !== 'No') ? 'uae dubai dha' :
          (l.Has_DOH && l.Has_DOH !== 'No') ? 'uae abu dhabi doh' :
          (l.Has_MOH && l.Has_MOH !== 'No') ? 'uae gcc moh' : '';
        // License string for "DHA", "DOH", "MOH" searches
        const lic = (
          (l.Has_DHA && l.Has_DHA !== 'No') ? `dha ${l.Has_DHA}` :
          (l.Has_DOH && l.Has_DOH !== 'No') ? `doh ${l.Has_DOH}` :
          (l.Has_MOH && l.Has_MOH !== 'No') ? `moh ${l.Has_MOH}` :
          (l.License ?? '')
        ).toLowerCase();

        // Handle "AA-96001" style IDs — strip prefix and compare to last 5 of Zoho ID
        const idTerm = term.replace(/^aa-?/i, "");
        const last5  = l.id?.slice(-5).toLowerCase() ?? "";

        const match =
          l.Full_Name?.toLowerCase().includes(term) ||
          l.First_Name?.toLowerCase().includes(term) ||
          l.Last_Name?.toLowerCase().includes(term) ||
          l.Specialty_New?.toLowerCase().includes(term) ||
          l.Specialty?.toLowerCase().includes(term) ||
          l.Owner?.name?.toLowerCase().includes(term) ||
          l.Lead_Status?.toLowerCase().includes(term) ||
          l.Country_of_Specialty_training?.toLowerCase().includes(term) ||
          l.Lead_Source?.toLowerCase().includes(term) ||
          l.id?.toLowerCase().includes(term) ||
          last5.includes(idTerm) ||
          dest.includes(term) ||
          lic.includes(term);

        if (!match) return false;
      }

      // Stage filter
      if (filters.stage && l.Lead_Status !== filters.stage) return false;

      // Recruiter filter
      if (filters.recruiter && l.Owner?.name !== filters.recruiter) return false;

      // Badge filter (computed from raw fields to avoid double-pass)
      if (filters.badge && getBadge(l) !== filters.badge) return false;

      return true;
    });
  }, [zoho?.rawLeads, search, filters.stage, filters.recruiter, filters.badge]);

  const doctors = useMemo(
    () => filtered.slice(0, shownCount).map(mapLead),
    [filtered, shownCount]
  );

  return {
    doctors,
    hasNextPage:        shownCount < filtered.length,
    fetchNextPage:      () => setShownCount(c => c + 50),
    isLoading,
    isFetchingNextPage: false,
    totalCount:         filtered.length,
  };
}

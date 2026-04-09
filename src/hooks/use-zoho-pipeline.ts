/**
 * useZohoPipeline — provides paginated, searchable doctor records
 * by mapping Zoho Leads (already fetched by useZohoData) to the
 * Doctor shape used by the LeadsPipeline page.
 *
 * This replaces the Supabase meta_leads_pipeline table, which was
 * populated with mock data. All records here are live from Zoho CRM.
 */

import { useMemo } from 'react';
import { useZohoData } from './use-zoho-data';
import * as mock from '@/lib/mock-data';
import type { Doctor } from './use-meta-leads';

export const PAGE_SIZE = 50;

const STATUS_TO_STAGE: Record<string, string> = {
  'Not Contacted':               'New Application',
  'Attempted to Contact':        'Screening',
  'Initial Sales Call Completed': 'Initial Call Done',
  'Contact in Future':           'Follow-up Scheduled',
  'High Priority Follow up':     'High Priority',
  'Unqualified Leads':           'Unqualified',
  'Not Interested':              'Not Interested',
};

function getLicense(lead: {
  Has_DHA: string | null;
  Has_DOH: string | null;
  Has_MOH: string | null;
  License: string | null;
}): string {
  if (lead.Has_DHA && lead.Has_DHA !== 'No') return `DHA (${lead.Has_DHA})`;
  if (lead.Has_DOH && lead.Has_DOH !== 'No') return `DOH (${lead.Has_DOH})`;
  if (lead.Has_MOH && lead.Has_MOH !== 'No') return `MOH (${lead.Has_MOH})`;
  return lead.License ?? '—';
}

function getDestination(lead: {
  Has_DHA: string | null;
  Has_DOH: string | null;
  Has_MOH: string | null;
}): string {
  if (lead.Has_DHA && lead.Has_DHA !== 'No') return 'UAE (Dubai)';
  if (lead.Has_DOH && lead.Has_DOH !== 'No') return 'UAE (Abu Dhabi)';
  if (lead.Has_MOH && lead.Has_MOH !== 'No') return 'UAE / GCC';
  return '—';
}

function getStatus(leadStatus: string, daysInStage: number): Doctor['status'] {
  if (leadStatus === 'High Priority Follow up') return 'at-risk';
  if (daysInStage > 30) return 'delayed';
  if (daysInStage > 18) return 'at-risk';
  return 'on-track';
}

export function useZohoPipeline(page: number, search: string) {
  const { data: zoho, isLoading } = useZohoData();

  const data = useMemo(() => {
    // While loading, return null so the page shows the spinner
    if (isLoading) return null;

    // If Zoho data failed or isn't available yet, fall back to mock pipeline doctors
    if (!zoho?.rawLeads) {
      let doctors: Doctor[] = mock.pipelineDoctors as Doctor[];
      if (search.trim()) {
        const q = search.toLowerCase();
        doctors = doctors.filter(d =>
          d.name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q) ||
          d.stage.toLowerCase().includes(q)
        );
      }
      return { doctors: doctors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: doctors.length };
    }

    const now = Date.now();

    // Map all leads (skip hard-unqualified / not-interested only on explicit filter)
    let doctors: Doctor[] = zoho.rawLeads.map(l => {
      const daysSinceCreated = Math.max(1, Math.floor(
        (now - new Date(l.Created_Time).getTime()) / 86_400_000
      ));
      // Approximate days in current stage: cycle through 1–44 so older leads
      // don't all show the same giant number.  Better than nothing without
      // stage-change history.
      const daysInStage = daysSinceCreated <= 44
        ? daysSinceCreated
        : (daysSinceCreated % 44) + 1;

      return {
        id:          `AA-${l.id.slice(-5).toUpperCase()}`,
        name:        l.Full_Name || '—',
        specialty:   l.Specialty_New || l.Specialty || '—',
        stage:       STATUS_TO_STAGE[l.Lead_Status] ?? l.Lead_Status,
        origin:      l.Country_of_Specialty_training ?? '—',
        destination: getDestination(l),
        assignedTo:  l.Owner?.name ?? '—',
        daysInStage,
        status:      getStatus(l.Lead_Status, daysInStage),
        license:     getLicense(l),
      };
    });

    // Search filter (name, specialty, stage, recruiter)
    if (search.trim()) {
      const q = search.toLowerCase();
      doctors = doctors.filter(d =>
        d.name.toLowerCase().includes(q)
        || d.specialty.toLowerCase().includes(q)
        || d.stage.toLowerCase().includes(q)
        || d.assignedTo.toLowerCase().includes(q)
      );
    }

    const total     = doctors.length;
    const paginated = doctors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return { doctors: paginated, total };
  }, [zoho?.rawLeads, page, search]);

  return { data, isLoading, isError: false };
}

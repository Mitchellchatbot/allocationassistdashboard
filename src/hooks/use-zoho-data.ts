/**
 * useZohoData — fetches Leads + Deals + Calls from Zoho CRM and aggregates
 * them into the shape the dashboard needs.
 *
 * Real field names confirmed from live API on 2026-04-09:
 *   Leads:  Full_Name, Lead_Status, Lead_Source, Owner{name}, Specialty,
 *           Specialty_New, Country_of_Specialty_training, Created_Time,
 *           Has_DOH, Has_DHA, Has_MOH, License, Recruiter, Age
 *   Deals:  Deal_Name, Stage, Amount, Owner{name}, Closing_Date, Lead_Source
 *   Calls:  Call_Type, Call_Status, Owner{name}, Created_Time
 *           (Emails module blocked by Zoho permissions — stays mock)
 */

import { useQuery } from '@tanstack/react-query';
import { zohoFetchAll } from '@/lib/zoho';

// ── Zoho field types ─────────────────────────────────────────────────────────

interface ZohoLead {
  id: string;
  Full_Name: string;
  First_Name: string;
  Last_Name: string;
  Lead_Status: string;
  Lead_Source: string | null;
  Owner: { name: string; email: string };
  Specialty: string | null;
  Specialty_New: string | null;
  Country_of_Specialty_training: string | null;
  Created_Time: string;
  Has_DOH: string | null;
  Has_DHA: string | null;
  Has_MOH: string | null;
  License: string | null;
  Recruiter: string | null;
  Age: number | null;
  Prime_Classification: string | null;
}

interface ZohoDeal {
  id: string;
  Deal_Name: string;
  Stage: string;
  Amount: number;
  Owner: { name: string; email: string };
  Closing_Date: string;
  Lead_Source: string | null;
}

interface ZohoCall {
  id: string;
  Call_Type: string;   // "Outbound" | "Inbound" | "Missed"
  Call_Status: string;
  Owner: { name: string; email: string };
  Created_Time: string;
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const k = key(item) ?? 'Unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function sumBy<T>(arr: T[], key: (item: T) => number): number {
  return arr.reduce((s, item) => s + (key(item) ?? 0), 0);
}

// Maps Zoho Lead_Status → a friendly pipeline label
const STATUS_LABEL: Record<string, string> = {
  'Not Contacted':               'New Application',
  'Attempted to Contact':        'Screening',
  'Initial Sales Call Completed': 'Initial Call Done',
  'Contact in Future':           'Follow-up Scheduled',
  'High Priority Follow up':     'High Priority',
  'Unqualified Leads':           'Unqualified',
  'Not Interested':              'Not Interested',
};

// Colours for pipeline stage bars (matches existing dashboard palette)
const STAGE_COLORS: Record<string, string> = {
  'New Application':      'hsl(210, 75%, 52%)',
  'Screening':            'hsl(170, 55%, 45%)',
  'Initial Call Done':    'hsl(38, 88%, 50%)',
  'Follow-up Scheduled':  'hsl(280, 50%, 52%)',
  'High Priority':        'hsl(340, 60%, 52%)',
  'Unqualified':          'hsl(220, 9%, 60%)',
  'Not Interested':       'hsl(0, 60%, 55%)',
  // Deal stages
  'Qualification':        'hsl(210, 75%, 52%)',
  'Needs Analysis':       'hsl(170, 55%, 45%)',
  'Value Proposition':    'hsl(38, 88%, 50%)',
  'Proposal/Price Quote': 'hsl(280, 50%, 52%)',
  'Closed Won':           'hsl(142, 70%, 40%)',
  'Closed Lost':          'hsl(0, 60%, 55%)',
};

const SOURCE_DISPLAY: Record<string, string> = {
  'Website/SEO':          'SEO / Organic',
  'Website Landing Page': 'Landing Page',
  'Facebook':             'Facebook Ads',
  'LinkedIn':             'LinkedIn',
  'Google Ads':           'Google Ads',
  'Referral':             'Referrals',
};

function displaySource(src: string | null): string {
  if (!src) return 'Direct / Unknown';
  return SOURCE_DISPLAY[src] ?? src;
}

// ── Main aggregation ──────────────────────────────────────────────────────────

function aggregateZohoData(leads: ZohoLead[], deals: ZohoDeal[], calls: ZohoCall[]) {
  // ── KPIs ──────────────────────────────────────────────────────────────────
  const activeleadStatuses = new Set([
    'Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed',
    'Contact in Future', 'High Priority Follow up',
  ]);
  const activeLeads   = leads.filter(l => activeleadStatuses.has(l.Lead_Status));
  const closedWon     = deals.filter(d => d.Stage === 'Closed Won');
  const totalRevenue  = sumBy(closedWon, d => d.Amount);
  const awaitingLicense = leads.filter(
    l => l.Has_DOH === 'In Progress' || l.Has_DHA === 'In Progress' || l.Has_MOH === 'In Progress'
  ).length;

  // ── Pipeline funnel (leads by status) ────────────────────────────────────
  const statusCounts = countBy(leads, l => STATUS_LABEL[l.Lead_Status] ?? l.Lead_Status);
  const totalLeads   = leads.length;
  const placementFunnel = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({
      stage,
      count,
      pct: parseFloat(((count / totalLeads) * 100).toFixed(1)),
    }));

  // ── Pipeline stage bars (for Sales page) ─────────────────────────────────
  const pipelineStages = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({
      stage,
      count,
      color: STAGE_COLORS[stage] ?? 'hsl(210, 75%, 52%)',
    }));

  // Add deal stages
  const dealStageCounts = countBy(deals, d => d.Stage);
  const dealStages = Object.entries(dealStageCounts).map(([stage, count]) => ({
    stage,
    count,
    color: STAGE_COLORS[stage] ?? 'hsl(210, 75%, 52%)',
  }));

  // ── Source / channel performance ─────────────────────────────────────────
  const sourceGroups = countBy(leads, l => displaySource(l.Lead_Source));
  const channels = Object.entries(sourceGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([channel, doctors]) => {
      const channelDeals = closedWon.filter(d => displaySource(d.Lead_Source) === channel);
      const placed = channelDeals.length;
      return {
        channel,
        doctors,
        placed,
        cost: 0,   // spend data not in Zoho Leads/Deals — would need Campaigns module
        cpa: placed > 0 ? 0 : 0,
      };
    });

  // ── Marketing channel metrics (for Marketing page) ───────────────────────
  const marketing = channels.map(c => ({
    channel: c.channel,
    doctors: c.doctors,
    placements: c.placed,
    spend: 0,
    cpa: 0,
    roi: 0,
  }));

  // ── Recruiter performance (for Team + Sales pages) ───────────────────────
  const recruiterDeals: Record<string, { deals: ZohoDeal[] }> = {};
  deals.forEach(d => {
    const name = d.Owner?.name ?? 'Unknown';
    if (!recruiterDeals[name]) recruiterDeals[name] = { deals: [] };
    recruiterDeals[name].deals.push(d);
  });

  const recruiterLeads = countBy(leads, l => l.Owner?.name ?? 'Unknown');

  const recruiters = Object.entries(recruiterDeals)
    .map(([name, { deals: rDeals }]) => {
      const won     = rDeals.filter(d => d.Stage === 'Closed Won');
      const revenue = sumBy(won, d => d.Amount);
      return {
        name,
        region: 'GCC',   // Destination not stored on Deals
        doctors: recruiterLeads[name] ?? 0,
        placements: won.length,
        revenue: `AED ${revenue.toLocaleString()}`,
        calls: callsByRecruiter[name] ?? 0,
        score: Math.min(100, Math.round((won.length / Math.max(rDeals.length, 1)) * 100)),
      };
    })
    .sort((a, b) => b.placements - a.placements);

  // ── Leads over time (group by month of Created_Time) ─────────────────────
  const monthBuckets: Record<string, { doctors: number; qualified: number }> = {};
  leads.forEach(l => {
    const d = new Date(l.Created_Time);
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!monthBuckets[key]) monthBuckets[key] = { doctors: 0, qualified: 0 };
    monthBuckets[key].doctors++;
    if (activeleadStatuses.has(l.Lead_Status)) monthBuckets[key].qualified++;
  });

  const placedPerMonth = countBy(
    deals.filter(d => d.Stage === 'Closed Won'),
    d => {
      const dt = new Date(d.Closing_Date);
      return dt.toLocaleString('default', { month: 'short', year: '2-digit' });
    }
  );

  const leadsOverTime = Object.entries(monthBuckets)
    .sort((a, b) => new Date('1 ' + a[0]).getTime() - new Date('1 ' + b[0]).getTime())
    .slice(-9)
    .map(([month, vals]) => ({
      month: month.split(' ')[0], // just "Jan", "Feb" etc.
      doctors: vals.doctors,
      qualified: vals.qualified,
      placed: placedPerMonth[month] ?? 0,
    }));

  // ── Finance KPIs ──────────────────────────────────────────────────────────
  const fmtAED = (v: number) =>
    v >= 1_000_000 ? `AED ${(v / 1_000_000).toFixed(2)}M`
    : v >= 1000    ? `AED ${(v / 1000).toFixed(0)}K`
    : `AED ${v}`;

  const financeMetrics = [
    { label: 'Marketing Spend',       value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'from Campaigns module' },
    { label: 'Placement Revenue',     value: fmtAED(totalRevenue),  icon: 'dollar' as const, change: 0, period: 'Closed Won deals' },
    { label: 'Cost per Placement',    value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data' },
    { label: 'Return on Investment',  value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data' },
  ];

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Active Doctors',    value: activeLeads.length.toLocaleString(), change: 0, period: 'live from Zoho', icon: 'users'     as const },
    { label: 'Doctors Placed',    value: closedWon.length.toString(),          change: 0, period: 'Closed Won deals', icon: 'check' as const },
    { label: 'Awaiting License',  value: awaitingLicense > 0 ? awaitingLicense.toString() : leads.filter(l => l.License).length.toString(), change: 0, period: 'live from Zoho', icon: 'file' as const },
    { label: 'Total Leads',       value: totalLeads.toLocaleString(),           change: 0, period: 'all Zoho leads', icon: 'building'  as const },
    { label: 'Avg. Time to Place', value: '—',                                 change: 0, period: 'needs history',   icon: 'clock'    as const },
    { label: 'Revenue',           value: fmtAED(totalRevenue),                  change: 0, period: 'Closed Won deals', icon: 'dollar' as const },
  ];

  // ── Calls (real data from Zoho Calls module) ──────────────────────────────
  const outboundCalls = calls.filter(c => c.Call_Type === 'Outbound');
  const callsByRecruiter = countBy(outboundCalls, c => c.Owner?.name ?? 'Unknown');

  // ── Sales metrics ─────────────────────────────────────────────────────────
  const sales = {
    dealsClosed: closedWon.length,
    conversionRate: deals.length > 0
      ? parseFloat(((closedWon.length / deals.length) * 100).toFixed(1))
      : 0,
    avgCycleTime: 0,
    outboundCalls: outboundCalls.length,   // live from Zoho Calls module
    emailsSent: 0,                          // Zoho Emails module blocked by permissions
    followUpsPending: leads.filter(l => l.Lead_Status === 'High Priority Follow up').length,
  };

  return {
    kpis,
    leadsOverTime,
    placementFunnel,
    pipelineStages,
    dealStages,
    channels,
    marketing,
    recruiters,
    sales,
    financeMetrics,
    totalLeads,
    activeLeads: activeLeads.length,
    closedWon: closedWon.length,
    totalRevenue,
    rawLeads: leads,
    rawDeals: deals,
  };
}

// ── React Query hook ─────────────────────────────────────────────────────────

const LEAD_FIELDS = [
  'Full_Name', 'First_Name', 'Last_Name', 'Lead_Status', 'Lead_Source',
  'Owner', 'Specialty', 'Specialty_New', 'Country_of_Specialty_training',
  'Created_Time', 'Has_DOH', 'Has_DHA', 'Has_MOH', 'License',
  'Recruiter', 'Age', 'Prime_Classification',
];

const DEAL_FIELDS = [
  'Deal_Name', 'Stage', 'Amount', 'Owner', 'Closing_Date', 'Lead_Source',
];

const CALL_FIELDS = [
  'Call_Type', 'Call_Status', 'Owner', 'Created_Time',
];

export function useZohoData() {
  return useQuery({
    queryKey: ['zoho-data'],
    queryFn: async () => {
      const [leads, deals, calls] = await Promise.all([
        zohoFetchAll<ZohoLead>('Leads', LEAD_FIELDS, 15),  // up to 3,000 leads
        zohoFetchAll<ZohoDeal>('Deals', DEAL_FIELDS, 5),
        zohoFetchAll<ZohoCall>('Calls', CALL_FIELDS, 10),  // up to 2,000 calls
      ]);
      return aggregateZohoData(leads, deals, calls);
    },
    staleTime: 10 * 60 * 1000,   // re-fetch every 10 minutes
    gcTime:    30 * 60 * 1000,
    retry: 2,
  });
}

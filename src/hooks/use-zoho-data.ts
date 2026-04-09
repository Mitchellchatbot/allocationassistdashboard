/**
 * useZohoData — fetches Leads + Deals + Calls + Accounts from Zoho CRM
 * and aggregates them into the shape the dashboard needs.
 *
 * Real field names confirmed from live API:
 *   Leads:    Full_Name, Lead_Status, Lead_Source, Owner{name}, Specialty,
 *             Specialty_New, Country_of_Specialty_training, Created_Time,
 *             Has_DOH, Has_DHA, Has_MOH, License, Recruiter, Age, Prime_Classification
 *   Deals:    Deal_Name, Stage, Amount, Owner{name}, Closing_Date, Lead_Source, Created_Time
 *   Calls:    Subject, Call_Type, Call_Status, Owner{name}, Created_Time
 *   Accounts: Account_Name, Industry, Owner{name}  (partner hospitals)
 *   Emails:   BLOCKED — Zoho token lacks email scope
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
  Created_Time: string;
}

interface ZohoCall {
  id: string;
  Subject: string | null;
  Call_Type: string;   // "Outbound" | "Inbound" | "Missed"
  Call_Status: string;
  Owner: { name: string; email: string };
  Created_Time: string;
}

interface ZohoAccount {
  id: string;
  Account_Name: string;
  Industry: string | null;
  Owner: { name: string; email: string };
}

interface ZohoCampaign {
  id: string;
  Campaign_Name: string;
  Type: string | null;
  Status: string | null;
  Start_Date: string | null;
  End_Date: string | null;
  Budgeted_Cost: number | null;
  Actual_Cost: number | null;
  Owner: { name: string; email: string };
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

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hrs   = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins < 60)  return `${mins} min ago`;
  if (hrs  < 24)  return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

function licenseLabel(lead: Pick<ZohoLead, 'Has_DHA' | 'Has_DOH' | 'Has_MOH' | 'License'>): string {
  if (lead.Has_DHA && lead.Has_DHA !== 'No') return `DHA (${lead.Has_DHA})`;
  if (lead.Has_DOH && lead.Has_DOH !== 'No') return `DOH (${lead.Has_DOH})`;
  if (lead.Has_MOH && lead.Has_MOH !== 'No') return `MOH (${lead.Has_MOH})`;
  return lead.License ?? '—';
}

// ── Main aggregation ──────────────────────────────────────────────────────────

function aggregateZohoData(
  leads: ZohoLead[],
  deals: ZohoDeal[],
  calls: ZohoCall[],
  accounts: ZohoAccount[],
  campaigns: ZohoCampaign[],
) {
  // ── Status sets ───────────────────────────────────────────────────────────
  const activeStatuses = new Set([
    'Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed',
    'Contact in Future', 'High Priority Follow up',
  ]);

  const activeLeads    = leads.filter(l => activeStatuses.has(l.Lead_Status));
  const closedWon      = deals.filter(d => d.Stage === 'Closed Won');
  const totalRevenue   = sumBy(closedWon, d => d.Amount);
  const awaitingLicense = leads.filter(
    l => l.Has_DOH === 'In Progress' || l.Has_DHA === 'In Progress' || l.Has_MOH === 'In Progress'
  ).length;

  // ── Avg time to place (Created_Time → Closing_Date on Closed Won deals) ──
  const wonWithDates = closedWon.filter(d => d.Created_Time && d.Closing_Date);
  const avgCycleDays = wonWithDates.length > 0
    ? Math.round(
        wonWithDates.reduce((sum, d) => {
          const ms = new Date(d.Closing_Date).getTime() - new Date(d.Created_Time).getTime();
          return sum + ms / 86_400_000;
        }, 0) / wonWithDates.length
      )
    : 0;
  const avgCycleTime = avgCycleDays > 0 ? `${avgCycleDays} days` : '—';

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const fmtAED = (v: number) =>
    v >= 1_000_000 ? `AED ${(v / 1_000_000).toFixed(2)}M`
    : v >= 1000    ? `AED ${(v / 1000).toFixed(0)}K`
    : `AED ${v}`;

  const kpis = [
    { label: 'Active Doctors',    value: activeLeads.length.toLocaleString(), change: 0, period: 'live from Zoho',     icon: 'users'     as const },
    { label: 'Doctors Placed',    value: closedWon.length.toString(),          change: 0, period: 'Closed Won deals',  icon: 'check'     as const },
    { label: 'Awaiting License',  value: awaitingLicense > 0
      ? awaitingLicense.toString()
      : leads.filter(l => l.Has_DOH || l.Has_DHA || l.Has_MOH).length.toString(),
      change: 0, period: 'license in progress', icon: 'file' as const },
    { label: 'Partner Hospitals', value: accounts.length.toLocaleString(),     change: 0, period: 'Zoho Accounts',     icon: 'building'  as const },
    { label: 'Avg. Time to Place', value: avgCycleTime,                        change: 0, period: 'deal create → close', icon: 'clock'   as const },
    { label: 'Revenue',           value: fmtAED(totalRevenue),                 change: 0, period: 'Closed Won deals',  icon: 'dollar'    as const },
  ];

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

  // Deal stages
  const dealStageCounts = countBy(deals, d => d.Stage);
  const dealStages = Object.entries(dealStageCounts).map(([stage, count]) => ({
    stage,
    count,
    color: STAGE_COLORS[stage] ?? 'hsl(210, 75%, 52%)',
  }));

  // ── Workflow stages (same data as pipeline, different shape) ──────────────
  const workflow = pipelineStages.map(s => ({ name: s.stage, count: s.count }));

  // ── Real stage conversion rates ───────────────────────────────────────────
  const contacted      = leads.filter(l => l.Lead_Status !== 'Not Contacted'
    && l.Lead_Status !== 'Unqualified Leads'
    && l.Lead_Status !== 'Not Interested').length;
  const callCompleted  = leads.filter(l =>
    l.Lead_Status === 'Initial Sales Call Completed'
    || l.Lead_Status === 'Contact in Future'
    || l.Lead_Status === 'High Priority Follow up').length;

  const stageConversion = [
    {
      stage: 'Applied → Contacted',
      rate: totalLeads > 0 ? parseFloat(((contacted / totalLeads) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Contacted → Initial Call',
      rate: contacted > 0 ? parseFloat(((callCompleted / contacted) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Leads → Deals',
      rate: totalLeads > 0 ? parseFloat(((deals.length / totalLeads) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Deals → Placement',
      rate: deals.length > 0 ? parseFloat(((closedWon.length / deals.length) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Overall Conversion',
      rate: totalLeads > 0 ? parseFloat(((closedWon.length / totalLeads) * 100).toFixed(2)) : 0,
    },
  ];

  // ── Source / channel performance ─────────────────────────────────────────
  const sourceGroups = countBy(leads, l => displaySource(l.Lead_Source));
  const channels = Object.entries(sourceGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([channel, doctors]) => {
      const channelDeals = closedWon.filter(d => displaySource(d.Lead_Source) === channel);
      return { channel, doctors, placed: channelDeals.length, cost: 0, cpa: 0 };
    });

  // ── Marketing channel metrics ─────────────────────────────────────────────
  const marketing = channels.map(c => ({
    channel: c.channel,
    doctors: c.doctors,
    placements: c.placed,
    spend: 0,   // Campaigns module not available
    cpa: 0,
    roi: 0,
  }));

  // ── Recruiter performance ─────────────────────────────────────────────────
  const outboundCalls    = calls.filter(c => c.Call_Type === 'Outbound');
  const callsByRecruiter = countBy(outboundCalls, c => c.Owner?.name ?? 'Unknown');
  const recruiterLeads   = countBy(leads, l => l.Owner?.name ?? 'Unknown');

  const recruiterDeals: Record<string, ZohoDeal[]> = {};
  deals.forEach(d => {
    const name = d.Owner?.name ?? 'Unknown';
    recruiterDeals[name] = [...(recruiterDeals[name] ?? []), d];
  });

  const recruiters = Object.entries(recruiterDeals)
    .map(([name, rDeals]) => {
      const won     = rDeals.filter(d => d.Stage === 'Closed Won');
      const revenue = sumBy(won, d => d.Amount);
      return {
        name,
        region: 'GCC',
        doctors:    recruiterLeads[name] ?? 0,
        placements: won.length,
        revenue:    `AED ${revenue.toLocaleString()}`,
        calls:      callsByRecruiter[name] ?? 0,
        score: Math.min(100, Math.round((won.length / Math.max(rDeals.length, 1)) * 100)),
      };
    })
    .sort((a, b) => b.placements - a.placements);

  // ── Leads over time (group by month of Created_Time) ─────────────────────
  const monthBuckets: Record<string, { doctors: number; qualified: number }> = {};
  leads.forEach(l => {
    const d   = new Date(l.Created_Time);
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!monthBuckets[key]) monthBuckets[key] = { doctors: 0, qualified: 0 };
    monthBuckets[key].doctors++;
    if (activeStatuses.has(l.Lead_Status)) monthBuckets[key].qualified++;
  });

  const placedPerMonth = countBy(
    closedWon,
    d => {
      const dt = new Date(d.Closing_Date);
      return dt.toLocaleString('default', { month: 'short', year: '2-digit' });
    }
  );

  const leadsOverTime = Object.entries(monthBuckets)
    .sort((a, b) => new Date('1 ' + a[0]).getTime() - new Date('1 ' + b[0]).getTime())
    .slice(-9)
    .map(([month, vals]) => ({
      month:     month.split(' ')[0],
      doctors:   vals.doctors,
      qualified: vals.qualified,
      placed:    placedPerMonth[month] ?? 0,
    }));

  // ── Finance KPIs ──────────────────────────────────────────────────────────
  const financeMetrics = [
    { label: 'Marketing Spend',      value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'Campaigns module N/A' },
    { label: 'Placement Revenue',    value: fmtAED(totalRevenue), icon: 'dollar' as const, change: 0, period: 'Closed Won deals'      },
    { label: 'Cost per Placement',   value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data'      },
    { label: 'Return on Investment', value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data'      },
  ];

  // ── Sales metrics ─────────────────────────────────────────────────────────
  const sales = {
    dealsClosed:        closedWon.length,
    conversionRate:     deals.length > 0
      ? parseFloat(((closedWon.length / deals.length) * 100).toFixed(1))
      : 0,
    avgCycleTime,
    outboundCalls:      outboundCalls.length,
    emailsSent:         0,   // Zoho Emails module permission denied
    followUpsPending:   leads.filter(l => l.Lead_Status === 'High Priority Follow up').length,
  };

  // ── Real recent activity (most recent calls) ──────────────────────────────
  const recentActivity = calls
    .filter(c => c.Created_Time)
    .sort((a, b) => new Date(b.Created_Time).getTime() - new Date(a.Created_Time).getTime())
    .slice(0, 7)
    .map(c => ({
      action: c.Call_Type === 'Outbound'
        ? 'Outbound call made'
        : c.Call_Type === 'Inbound'
          ? 'Inbound call received'
          : 'Missed call',
      detail: c.Subject || `${c.Call_Status} — by ${c.Owner?.name ?? 'Unknown'}`,
      time:   formatRelativeTime(c.Created_Time),
      type:   (c.Call_Type === 'Missed' ? 'alert' : c.Call_Type === 'Inbound' ? 'lead' : 'interview') as
              'lead' | 'placement' | 'license' | 'alert' | 'interview' | 'document' | 'partnership',
    }));

  // ── Real bottlenecks from Zoho data ──────────────────────────────────────
  const highPriorityLeads  = leads.filter(l => l.Lead_Status === 'High Priority Follow up');
  const noResponseLeads    = leads.filter(l => l.Lead_Status === 'Attempted to Contact');
  const uncontactedLeads   = leads.filter(l => l.Lead_Status === 'Not Contacted');
  const inProgressLicense  = leads.filter(
    l => l.Has_DOH === 'In Progress' || l.Has_DHA === 'In Progress' || l.Has_MOH === 'In Progress'
  );

  function severity(count: number): 'high' | 'medium' | 'low' {
    return count > 20 ? 'high' : count > 5 ? 'medium' : 'low';
  }

  const bottlenecks = [
    {
      area:     'High Priority Follow-ups',
      severity: severity(highPriorityLeads.length),
      avgDelay: '—',
      affected: highPriorityLeads.length,
      detail:   'Leads flagged for urgent follow-up by recruiter',
    },
    {
      area:     'License Applications In Progress',
      severity: severity(inProgressLicense.length),
      avgDelay: 'Ongoing',
      affected: inProgressLicense.length,
      detail:   'Doctors waiting on DOH / DHA / MOH license approval',
    },
    {
      area:     'Contact Attempts — No Response',
      severity: severity(noResponseLeads.length),
      avgDelay: '—',
      affected: noResponseLeads.length,
      detail:   'Recruiter attempted contact but doctor has not responded',
    },
    {
      area:     'New Applications — Not Yet Contacted',
      severity: severity(uncontactedLeads.length),
      avgDelay: '—',
      affected: uncontactedLeads.length,
      detail:   'Fresh leads that no recruiter has reached out to yet',
    },
  ].filter(b => b.affected > 0) as Array<{
    area: string;
    severity: 'high' | 'medium' | 'low';
    avgDelay: string;
    affected: number;
    detail: string;
  }>;

  // ── Real campaigns from Zoho Campaigns module ─────────────────────────────
  const zohoStatusMap: Record<string, 'active' | 'completed' | 'paused'> = {
    'Active':    'active',
    'Inactive':  'paused',
    'Completed': 'completed',
    'Planning':  'paused',
  };

  const campaignsList = campaigns
    .slice(0, 20)   // show 20 most recent
    .map(c => ({
      name:    c.Campaign_Name.length > 65
        ? c.Campaign_Name.slice(0, 62) + '…'
        : c.Campaign_Name,
      channel: 'Email Marketing',
      doctors: 0,               // no reach stats stored in Zoho CRM
      spend:   c.Actual_Cost ?? c.Budgeted_Cost ?? 0,
      status:  zohoStatusMap[c.Status ?? ''] ?? 'active',
    }));

  // ── Raw leads (for pipeline doctor table) ─────────────────────────────────
  const rawLeads = leads;
  const rawDeals = deals;

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
    stageConversion,
    recentActivity,
    workflow,
    bottlenecks,
    totalLeads,
    activeLeads:    activeLeads.length,
    closedWon:      closedWon.length,
    totalRevenue,
    partnerHospitals: accounts.length,
    campaignsList,
    rawLeads,
    rawDeals,
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
  'Deal_Name', 'Stage', 'Amount', 'Owner', 'Closing_Date', 'Lead_Source', 'Created_Time',
];

const CALL_FIELDS = [
  'Subject', 'Call_Type', 'Call_Status', 'Owner', 'Created_Time',
];

const ACCOUNT_FIELDS = [
  'Account_Name', 'Industry', 'Owner',
];

const CAMPAIGN_FIELDS = [
  'Campaign_Name', 'Type', 'Status', 'Start_Date', 'End_Date',
  'Budgeted_Cost', 'Actual_Cost', 'Owner',
];

export function useZohoData() {
  return useQuery({
    queryKey: ['zoho-data'],
    queryFn: async () => {
      // Leads, Deals, Calls in parallel — one token refresh is shared
      const [leads, deals, calls] = await Promise.all([
        zohoFetchAll<ZohoLead>('Leads',   LEAD_FIELDS,  15),
        zohoFetchAll<ZohoDeal>('Deals',   DEAL_FIELDS,   5),
        zohoFetchAll<ZohoCall>('Calls',   CALL_FIELDS,  10),
      ]);
      // Accounts + Campaigns fetched sequentially after so the token is already
      // cached and we don't trigger Zoho's concurrent-refresh rate limit
      const accounts  = await zohoFetchAll<ZohoAccount>('Accounts',  ACCOUNT_FIELDS,  5);
      const campaigns = await zohoFetchAll<ZohoCampaign>('Campaigns', CAMPAIGN_FIELDS, 2); // 400 max
      return aggregateZohoData(leads, deals, calls, accounts, campaigns);
    },
    staleTime: 10 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
    retry: 2,
  });
}

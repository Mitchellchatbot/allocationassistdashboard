import { useMemo } from "react";
import { useFilters, getTimeLabel } from "@/lib/filters";
import { useZohoData, aggregateZohoData, type ZohoLead, type ZohoDeal } from "@/hooks/use-zoho-data";

const CUTOFF_DAYS: Record<string, number> = {
  week:    7,
  month:   30,
  quarter: 90,
  year:    365,
};

// How many months of time-series history to show per range
const MONTH_SLICE: Record<string, number> = {
  week:    1,
  month:   1,
  quarter: 3,
  year:    9,
};

const EMPTY_EMAIL = { total: 0, bySender: {} as Record<string, number>, sampled: 0 };

export function useFilteredData() {
  const { timeRange } = useFilters();
  const { data: zoho, isLoading: zohoLoading, error: zohoError } = useZohoData();

  return useMemo(() => {
    const timeLabel  = getTimeLabel(timeRange);
    const monthSlice = MONTH_SLICE[timeRange] ?? 1;

    if (!zoho) {
      return {
        kpis: [], timeData: [], funnel: [], channels: [], regions: [],
        pipeline: [], workflow: [], sales: {
          dealsClosed: 0, conversionRate: 0, avgCycleTime: "—",
          outboundCalls: 0, emailsSent: 0, followUpsPending: 0,
          totalLeadsManaged: 0, activeInPipeline: 0, contactedRate: 0,
        },
        recruiters: [], marketing: [], costVsConv: [], finance: [],
        roiData: [], doctors: [], campaigns: [], timeLabel,
        stageConversion: [], activity: [], operationalHealth: [],
        roadmapPhases: [], bottlenecks: [],
        licenseOverview: null, alerts: [],
        filteredLeads: [] as ZohoLead[], filteredDeals: [] as ZohoDeal[],
        zohoLoading, zohoError, isLive: false,
      };
    }

    // ── Filter raw arrays to the selected time window ─────────────────────
    const cutoff = Date.now() - CUTOFF_DAYS[timeRange] * 86_400_000;
    const inWindow = (dateStr: string) => new Date(dateStr).getTime() >= cutoff;

    const filteredLeads = zoho.rawLeads.filter(l => inWindow(l.Created_Time));
    const filteredCalls = zoho.rawCalls.filter(c => inWindow(c.Created_Time));

    // Closed deals: filter by Closing_Date (when the deal was actually won/lost).
    // Open deals: keep all — they represent the current pipeline state regardless of
    // when they were created, so don't cut them off with a Created_Time filter.
    const filteredDeals = zoho.rawDeals.filter(d => {
      if (d.Stage === 'Closed Won' || d.Stage === 'Closed Lost') {
        return d.Closing_Date ? inWindow(d.Closing_Date) : false;
      }
      return true; // keep all open/active deals
    });
    // accounts and campaigns are not time-sensitive — keep full set
    const filteredAccounts  = zoho.rawAccounts;
    const filteredCampaigns = zoho.rawCampaigns;

    // ── Re-aggregate with filtered data ───────────────────────────────────
    const agg = aggregateZohoData(
      filteredLeads,
      filteredDeals,
      filteredCalls,
      filteredAccounts,
      filteredCampaigns,
      EMPTY_EMAIL,
    );

    // ── Time-series chart: use full history sliced to N months ────────────
    // (filtering to e.g. last 7 days would leave the chart nearly empty)
    const timeData = zoho.leadsOverTime.slice(-monthSlice);

    const kpis = agg.kpis.map(k => ({ ...k, period: k.period ?? timeLabel }));

    const regions: Array<{ region: string; doctors: number; placements: number; hospitals: number }> = [];
    const costVsConv: Array<{ month: string; cost: number; placements: number }> = [];
    const roiData: Array<{ channel: string; roi: number }> = [];
    const operationalHealth: Array<{ metric: string; value: number; unit: string; target?: number }> = [];
    const roadmapPhases: Array<{
      phase: string; timeline: string;
      status: 'completed' | 'in-progress' | 'planned';
      progress: number;
      items: Array<{ task: string; done: boolean }>;
    }> = [];

    const doctors = filteredLeads.slice(0, 200).map(l => ({
      id:          l.id,
      name:        l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty:   l.Specialty ?? l.Specialty_New ?? '—',
      stage:       l.Lead_Status ?? '—',
      origin:      l.Country_of_Specialty_training ?? '—',
      destination: 'UAE',
      assignedTo:  l.Owner?.name ?? '—',
      daysInStage: Math.max(0, Math.floor((Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000)),
      status: (['Unqualified Leads', 'Not Interested'].includes(l.Lead_Status)
        ? 'at-risk'
        : l.Lead_Status === 'High Priority Follow up'
          ? 'delayed'
          : 'on-track') as 'on-track' | 'delayed' | 'at-risk',
      license:
        l.Has_DHA && l.Has_DHA !== 'No' ? `DHA (${l.Has_DHA})` :
        l.Has_DOH && l.Has_DOH !== 'No' ? `DOH (${l.Has_DOH})` :
        l.Has_MOH && l.Has_MOH !== 'No' ? `MOH (${l.Has_MOH})` :
        l.License ?? '—',
    }));

    const finance = agg.financeMetrics.map(f => ({ ...f, period: f.period ?? timeLabel }));
    const recruiters = agg.recruiters.map(r => ({ ...r, role: 'Recruiter' }));

    return {
      kpis,
      timeData,
      funnel:      agg.placementFunnel,
      channels:    agg.channels,
      regions,
      pipeline:    agg.pipelineStages,
      workflow:    agg.workflow,
      sales:       agg.sales,
      recruiters,
      marketing:   agg.marketing,
      costVsConv,
      finance,
      roiData,
      doctors,
      campaigns:   agg.campaignsList,
      timeLabel,
      stageConversion: agg.stageConversion,
      activity:    agg.recentActivity,
      operationalHealth,
      roadmapPhases,
      bottlenecks: agg.bottlenecks,
      licenseOverview: agg.licenseOverview,
      alerts: agg.alerts,
      filteredLeads,
      filteredDeals,
      zohoLoading,
      zohoError,
      isLive: true,
    };
  }, [timeRange, zoho, zohoLoading, zohoError]);
}

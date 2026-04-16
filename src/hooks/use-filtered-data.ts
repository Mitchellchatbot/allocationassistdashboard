import { useMemo } from "react";
import { useFilters, getTimeLabel } from "@/lib/filters";
import { useZohoData, aggregateZohoData, type ZohoLead, type ZohoDeal } from "@/hooks/use-zoho-data";

const EMPTY_EMAIL = { total: 0, bySender: {} as Record<string, number>, sampled: 0 };

export function useFilteredData() {
  const { preset, dateRange } = useFilters();
  const { data: zoho, isLoading: zohoLoading, error: zohoError } = useZohoData();

  return useMemo(() => {
    const timeLabel = getTimeLabel(preset, dateRange);

    // How many months to show in the time-series chart
    const spanDays   = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / 86_400_000) + 1;
    const monthSlice = Math.max(1, Math.ceil(spanDays / 28));

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

    // ── Filter raw arrays to the selected date window ────────────────────
    // `to` is treated as inclusive end-of-day: add 1 full day before comparison
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000; // exclusive upper bound

    const inWindow = (dateStr: string | null | undefined) => {
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      if (isNaN(t)) return false;
      return t >= fromMs && t < toMs;
    };

    const filteredLeads = zoho.rawLeads.filter(l => inWindow(l.Created_Time));
    const filteredCalls = zoho.rawCalls.filter(c => inWindow(c.Created_Time));

    // Closed deals: filter by Closing_Date.
    // Open deals: keep all — they represent current pipeline state.
    const filteredDeals = zoho.rawDeals.filter(d => {
      if (d.Stage === 'Closed Won' || d.Stage === 'Closed Lost') {
        return d.Closing_Date ? inWindow(d.Closing_Date) : false;
      }
      return true;
    });

    const filteredAccounts  = zoho.rawAccounts;
    const filteredCampaigns = zoho.rawCampaigns;

    // ── Re-aggregate ──────────────────────────────────────────────────────
    const agg = aggregateZohoData(
      filteredLeads,
      filteredDeals,
      filteredCalls,
      filteredAccounts,
      filteredCampaigns,
      EMPTY_EMAIL,
    );

    // ── Time-series chart: slice to the number of months in the range ────
    const timeData = zoho.leadsOverTime.slice(-monthSlice);

    const kpis      = agg.kpis.map(k => ({ ...k, period: k.period ?? timeLabel }));
    const finance   = agg.financeMetrics.map(f => ({ ...f, period: f.period ?? timeLabel }));
    const recruiters = agg.recruiters.map(r => ({ ...r, role: 'Recruiter' }));

    const regions:          Array<{ region: string; doctors: number; placements: number; hospitals: number }> = [];
    const costVsConv:       Array<{ month: string; cost: number; placements: number }> = [];
    const roiData:          Array<{ channel: string; roi: number }> = [];
    const operationalHealth: Array<{ metric: string; value: number; unit: string; target?: number }> = [];
    const roadmapPhases:    Array<{
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
  }, [preset, dateRange, zoho, zohoLoading, zohoError]);
}

import { useMemo } from "react";
import { useFilters, getTimeLabel } from "@/lib/filters";
import { useZohoData } from "@/hooks/use-zoho-data";

export function useFilteredData() {
  const { timeRange } = useFilters();
  const { data: zoho, isLoading: zohoLoading, error: zohoError } = useZohoData();

  return useMemo(() => {
    const timeLabel = getTimeLabel(timeRange);

    // Month slice mapping for time-series charts
    const monthSlice = { week: 1, month: 1, quarter: 3, year: 9 }[timeRange];

    // ── Live data only — no mock fallback ─────────────────────────────────
    const kpis = zoho
      ? zoho.kpis.map(k => ({ ...k, period: k.period ?? timeLabel }))
      : [];

    const timeData = zoho ? zoho.leadsOverTime.slice(-monthSlice) : [];

    const funnel = zoho ? zoho.placementFunnel : [];

    const pipeline = zoho ? zoho.pipelineStages : [];

    const channels = zoho ? zoho.channels : [];

    // Regions — no region data available from Zoho (no Destination Country field)
    const regions: Array<{ region: string; doctors: number; placements: number; hospitals: number }> = [];

    const workflow = zoho ? zoho.workflow : [];

    const sales = zoho
      ? {
          dealsClosed:      zoho.sales.dealsClosed,
          conversionRate:   zoho.sales.conversionRate,
          avgCycleTime:     zoho.sales.avgCycleTime,
          outboundCalls:    zoho.sales.outboundCalls,
          emailsSent:       zoho.sales.emailsSent,
          followUpsPending: zoho.sales.followUpsPending,
        }
      : {
          dealsClosed: 0,
          conversionRate: 0,
          avgCycleTime: "—",
          outboundCalls: 0,
          emailsSent: 0,
          followUpsPending: 0,
        };

    const recruiters = zoho
      ? zoho.recruiters.map(r => ({ ...r, role: 'Recruiter' }))
      : [];

    const marketing = zoho ? zoho.marketing : [];

    const costVsConv: Array<{ month: string; cost: number; placements: number }> = [];

    const finance = zoho
      ? zoho.financeMetrics.map(f => ({ ...f, period: f.period ?? timeLabel }))
      : [];

    const roiData: Array<{ channel: string; roi: number }> = [];

    // Pipeline doctors — drive from real Zoho leads
    const doctors = zoho
      ? zoho.rawLeads.slice(0, 200).map(l => ({
          id: l.id,
          name: l.Full_Name ?? `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() ?? '—',
          specialty: l.Specialty ?? l.Specialty_New ?? '—',
          stage: l.Lead_Status ?? '—',
          origin: l.Country_of_Specialty_training ?? '—',
          destination: 'UAE',
          assignedTo: l.Owner?.name ?? '—',
          daysInStage: Math.max(
            0,
            Math.floor((Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000)
          ),
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
        }))
      : [];

    const campaigns = zoho ? zoho.campaignsList : [];

    // Operational health / roadmap — no live source yet
    const operationalHealth: Array<{ metric: string; value: number; unit: string; target?: number }> = [];
    const roadmapPhases: Array<{
      phase: string;
      timeline: string;
      status: 'completed' | 'in-progress' | 'planned';
      progress: number;
      items: Array<{ task: string; done: boolean }>;
    }> = [];

    const bottlenecks = zoho ? zoho.bottlenecks : [];

    const stageConversion = zoho ? zoho.stageConversion : [];

    const activity = zoho ? zoho.recentActivity : [];

    return {
      kpis, timeData, funnel, channels, regions, pipeline, workflow,
      sales, recruiters, marketing, costVsConv, finance, roiData,
      doctors, campaigns, timeLabel, stageConversion,
      activity,
      operationalHealth,
      roadmapPhases,
      bottlenecks,
      zohoLoading,
      zohoError,
      isLive: !!zoho,
    };
  }, [timeRange, zoho, zohoLoading, zohoError]);
}

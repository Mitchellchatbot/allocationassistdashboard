import { useMemo } from "react";
import { useFilters, getTimeMultiplier, getRegionMultiplier, getTimeLabel } from "@/lib/filters";
import * as mock from "@/lib/mock-data";
import { useZohoData } from "@/hooks/use-zoho-data";

function scale(val: number, tm: number, rm: number) {
  return Math.round(val * tm * rm);
}

function fmtMoney(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

const regionToDestination: Record<string, string> = {
  uae: "UAE",
  ksa: "KSA",
  qatar: "Qatar",
  kuwait: "Kuwait",
};

export function useFilteredData() {
  const { timeRange, region } = useFilters();
  const { data: zoho, isLoading: zohoLoading } = useZohoData();

  return useMemo(() => {
    const tm = getTimeMultiplier(timeRange);
    const rm = getRegionMultiplier(region);
    const timeLabel = getTimeLabel(timeRange);

    // ── If Zoho data is available use it, otherwise fall back to mock ──────

    // KPIs
    const kpis = zoho
      ? zoho.kpis.map(k => ({ ...k, period: timeLabel }))
      : mock.overviewKpis.map(k => {
          const rawNum = parseFloat(k.value.replace(/[$,%M\s]/g, "").replace(/,/g, ""));
          let filtered: string;
          if (k.value.includes("days")) {
            filtered = k.value;
          } else if (k.value.includes("$") && k.value.includes("M")) {
            filtered = `$${(rawNum * tm * rm).toFixed(2)}M`;
          } else if (k.value.includes("$") || k.value.includes("%")) {
            filtered = k.value;
          } else {
            filtered = scale(rawNum, tm, rm).toLocaleString();
          }
          return { ...k, value: filtered, period: timeLabel };
        });

    // Leads over time
    const monthSlice = { week: 1, month: 1, quarter: 3, year: 9 }[timeRange];
    const timeData = zoho
      ? zoho.leadsOverTime.slice(-monthSlice)
      : mock.leadsOverTime.slice(-monthSlice).map(d => ({
          ...d,
          doctors: scale(d.doctors, 1, rm),
          qualified: scale(d.qualified, 1, rm),
          placed: scale(d.placed, 1, rm),
        }));

    // Placement funnel
    const funnel = zoho
      ? zoho.placementFunnel.map(f => ({ ...f, count: scale(f.count, tm, rm) }))
      : mock.placementFunnel.map(f => ({ ...f, count: scale(f.count, tm, rm) }));

    // Pipeline stages (Sales page)
    const pipeline = zoho
      ? zoho.pipelineStages.map(s => ({ ...s, count: scale(s.count, tm, rm) }))
      : mock.pipelineStages.map(s => ({ ...s, count: scale(s.count, tm, rm) }));

    // Source channels
    const channels = zoho
      ? zoho.channels.map(c => ({ ...c, doctors: scale(c.doctors, tm, rm), placed: scale(c.placed, tm, rm) }))
      : mock.channelPerformance.map(c => ({
          ...c,
          doctors: scale(c.doctors, tm, rm),
          cost: scale(c.cost, tm, rm),
          placed: scale(c.placed, tm, rm),
        }));

    // Regions — still mock (region data not in Zoho Leads without Destination Country)
    const regions = region === "all"
      ? mock.regionData.map(r => ({
          ...r,
          doctors: scale(r.doctors, tm, 1),
          placements: scale(r.placements, tm, 1),
        }))
      : mock.regionData
          .filter(r => r.region.toLowerCase().replace(" ", "") === region || r.region === regionToDestination[region])
          .map(r => ({
            ...r,
            doctors: scale(r.doctors, tm, 1),
            placements: scale(r.placements, tm, 1),
          }));

    // Workflow stages (mock — no direct Zoho equivalent)
    const workflow = mock.workflowStages.map(s => ({ ...s, count: scale(s.count, tm, rm) }));

    // Sales metrics
    const sales = zoho
      ? {
          dealsClosed: zoho.sales.dealsClosed,
          conversionRate: zoho.sales.conversionRate,
          avgCycleTime: zoho.sales.avgCycleTime || mock.salesMetrics.avgCycleTime,
          outboundCalls: scale(mock.salesMetrics.outboundCalls, tm, rm),  // mock until Activities API
          emailsSent: scale(mock.salesMetrics.emailsSent, tm, rm),
          followUpsPending: zoho.sales.followUpsPending,
        }
      : {
          dealsClosed: scale(mock.salesMetrics.dealsClosed, tm, rm),
          conversionRate: mock.salesMetrics.conversionRate,
          avgCycleTime: mock.salesMetrics.avgCycleTime,
          outboundCalls: scale(mock.salesMetrics.outboundCalls, tm, rm),
          emailsSent: scale(mock.salesMetrics.emailsSent, tm, rm),
          followUpsPending: scale(mock.salesMetrics.followUpsPending, 1, rm),
        };

    // Recruiters
    const recruiters = zoho
      ? (region === "all"
          ? zoho.recruiters.map(r => ({ ...r, doctors: scale(r.doctors, tm, 1), placements: scale(r.placements, tm, 1) }))
          : zoho.recruiters.map(r => ({ ...r, doctors: scale(r.doctors, tm, 1), placements: scale(r.placements, tm, 1) })))
      : (region === "all"
          ? mock.topRecruiters.map(r => ({ ...r, doctors: scale(r.doctors, tm, 1), placements: scale(r.placements, tm, 1) }))
          : mock.topRecruiters
              .filter(r => {
                const regionMap: Record<string, string> = { uae: "UAE", ksa: "KSA", qatar: "Qatar", kuwait: "Kuwait" };
                return r.region === regionMap[region];
              })
              .map(r => ({ ...r, doctors: scale(r.doctors, tm, 1), placements: scale(r.placements, tm, 1) })));

    // Marketing
    const marketing = zoho
      ? zoho.marketing.map(m => ({ ...m, doctors: scale(m.doctors, tm, rm), placements: scale(m.placements, tm, rm) }))
      : mock.marketingChannelMetrics.map(m => ({
          ...m,
          doctors: scale(m.doctors, tm, rm),
          spend: scale(m.spend, tm, rm),
          placements: scale(m.placements, tm, rm),
        }));

    const costVsConv = mock.costVsConversions.map(c => ({
      ...c,
      cost: scale(c.cost, tm, rm),
      placements: scale(c.placements, tm, rm),
    }));

    // Finance
    const finance = zoho
      ? zoho.financeMetrics.map(f => ({ ...f, period: timeLabel }))
      : mock.financeMetrics.map(f => {
          const rawNum = parseFloat(f.value.replace(/[$,%Mx\s]/g, "").replace(/,/g, ""));
          let filtered: string;
          if (f.value.includes("M")) {
            filtered = `$${(rawNum * tm * rm).toFixed(2)}M`;
          } else if (f.value.includes("x") || f.label.includes("CAC")) {
            filtered = f.value;
          } else {
            filtered = `$${scale(rawNum, tm, rm).toLocaleString()}`;
          }
          return { ...f, value: filtered, period: timeLabel };
        });

    const roiData = mock.channelROI;

    // Pipeline doctors (LeadsPipeline page — kept on Supabase)
    const doctors = region === "all"
      ? mock.pipelineDoctors
      : mock.pipelineDoctors.filter(d => {
          const destMap: Record<string, string> = { uae: "UAE", ksa: "KSA", qatar: "Qatar", kuwait: "Kuwait" };
          return d.destination === destMap[region];
        });

    // Campaigns (mock — Zoho Campaigns module not yet integrated)
    const campaigns = mock.campaignPerformance.map(c => ({
      ...c,
      doctors: scale(c.doctors, tm, rm),
      spend: scale(c.spend, tm, rm),
    }));

    // Operational health — mock
    const timeAdjust: Record<string, number> = { week: 1.3, month: 1.1, quarter: 1, year: 0.85 };
    const pctAdjust:  Record<string, number> = { week: 0.85, month: 0.92, quarter: 1, year: 1.15 };
    const operationalHealth = mock.operationalHealth.map(m => ({
      ...m,
      value: m.unit === "hrs"
        ? Math.round(m.value * (timeAdjust[timeRange] ?? 1))
        : Math.min(100, Math.round(m.value * (pctAdjust[timeRange] ?? 1))),
    }));

    const timeDelayAdjust: Record<string, number> = { week: 0.7, month: 0.85, quarter: 1, year: 1.2 };
    const bottlenecks = mock.bottlenecks.map(b => ({
      ...b,
      affected: scale(b.affected, tm, rm),
      avgDelay: `${Math.round(parseInt(b.avgDelay) * (timeDelayAdjust[timeRange] ?? 1))} days`,
    }));

    const rateAdjust: Record<string, number> = { week: 0.92, month: 0.96, quarter: 1, year: 1.04 };
    const stageConversion = mock.stageConversion.map(s => ({
      ...s,
      rate: Math.min(100, +(s.rate * (rateAdjust[timeRange] ?? 1)).toFixed(1)),
    }));

    return {
      kpis, timeData, funnel, channels, regions, pipeline, workflow,
      sales, recruiters, marketing, costVsConv, finance, roiData,
      doctors, campaigns, timeLabel, stageConversion,
      activity: mock.recentActivity,
      operationalHealth,
      roadmapPhases: mock.roadmapPhases,
      bottlenecks,
      zohoLoading,
      isLive: !!zoho,
    };
  }, [timeRange, region, zoho, zohoLoading]);
}

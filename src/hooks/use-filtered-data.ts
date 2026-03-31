import { useMemo } from "react";
import { useFilters, getTimeMultiplier, getRegionMultiplier, getTimeLabel } from "@/lib/filters";
import * as data from "@/lib/mock-data";

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

  return useMemo(() => {
    const tm = getTimeMultiplier(timeRange);
    const rm = getRegionMultiplier(region);
    const timeLabel = getTimeLabel(timeRange);

    // KPIs
    const kpis = data.overviewKpis.map(k => {
      const rawNum = parseFloat(k.value.replace(/[$,%M\s]/g, "").replace(/,/g, ""));
      let filtered: string;
      if (k.value.includes("days")) {
        // Processing time stays the same
        filtered = k.value;
      } else if (k.value.includes("$") && k.value.includes("M")) {
        filtered = `$${(rawNum * tm * rm).toFixed(2)}M`;
      } else if (k.value.includes("$")) {
        filtered = k.value; // rates don't change
      } else if (k.value.includes("%")) {
        filtered = k.value; // rates don't change
      } else {
        filtered = scale(rawNum, tm, rm).toLocaleString();
      }
      return { ...k, value: filtered, period: timeLabel };
    });

    // Leads over time — slice based on time range
    const monthSlice = { week: 1, month: 1, quarter: 3, year: 9 }[timeRange];
    const timeData = data.leadsOverTime.slice(-monthSlice).map(d => ({
      ...d,
      doctors: scale(d.doctors, 1, rm),
      qualified: scale(d.qualified, 1, rm),
      placed: scale(d.placed, 1, rm),
    }));

    // Funnel
    const funnel = data.placementFunnel.map(f => ({
      ...f,
      count: scale(f.count, tm, rm),
    }));

    // Channels
    const channels = data.channelPerformance.map(c => ({
      ...c,
      doctors: scale(c.doctors, tm, rm),
      cost: scale(c.cost, tm, rm),
      placed: scale(c.placed, tm, rm),
    }));

    // Regions — filter if specific region selected
    const regions = region === "all"
      ? data.regionData.map(r => ({
          ...r,
          doctors: scale(r.doctors, tm, 1),
          placements: scale(r.placements, tm, 1),
        }))
      : data.regionData
          .filter(r => r.region.toLowerCase().replace(" ", "") === region || r.region === regionToDestination[region])
          .map(r => ({
            ...r,
            doctors: scale(r.doctors, tm, 1),
            placements: scale(r.placements, tm, 1),
          }));

    // Pipeline stages
    const pipeline = data.pipelineStages.map(s => ({
      ...s,
      count: scale(s.count, tm, rm),
    }));

    // Workflow
    const workflow = data.workflowStages.map(s => ({
      ...s,
      count: scale(s.count, tm, rm),
    }));

    // Sales metrics
    const sales = {
      dealsClosed: scale(data.salesMetrics.dealsClosed, tm, rm),
      conversionRate: data.salesMetrics.conversionRate,
      avgCycleTime: data.salesMetrics.avgCycleTime,
      outboundCalls: scale(data.salesMetrics.outboundCalls, tm, rm),
      emailsSent: scale(data.salesMetrics.emailsSent, tm, rm),
      followUpsPending: scale(data.salesMetrics.followUpsPending, 1, rm),
    };

    // Recruiters — filter by region
    const recruiters = region === "all"
      ? data.topRecruiters.map(r => ({
          ...r,
          doctors: scale(r.doctors, tm, 1),
          placements: scale(r.placements, tm, 1),
        }))
      : data.topRecruiters
          .filter(r => {
            const regionMap: Record<string, string> = { uae: "UAE", ksa: "KSA", qatar: "Qatar", kuwait: "Kuwait" };
            return r.region === regionMap[region];
          })
          .map(r => ({
            ...r,
            doctors: scale(r.doctors, tm, 1),
            placements: scale(r.placements, tm, 1),
          }));

    // Marketing
    const marketing = data.marketingChannelMetrics.map(m => ({
      ...m,
      doctors: scale(m.doctors, tm, rm),
      spend: scale(m.spend, tm, rm),
      placements: scale(m.placements, tm, rm),
    }));

    const costVsConv = data.costVsConversions.map(c => ({
      ...c,
      cost: scale(c.cost, tm, rm),
      placements: scale(c.placements, tm, rm),
    }));

    // Finance
    const finance = data.financeMetrics.map(f => {
      const rawNum = parseFloat(f.value.replace(/[$,%Mx\s]/g, "").replace(/,/g, ""));
      let filtered: string;
      if (f.value.includes("M")) {
        filtered = `$${(rawNum * tm * rm).toFixed(2)}M`;
      } else if (f.value.includes("x")) {
        filtered = f.value; // ROI stays same
      } else if (f.label.includes("CAC")) {
        filtered = f.value; // Rate stays same
      } else {
        filtered = `$${scale(rawNum, tm, rm).toLocaleString()}`;
      }
      return { ...f, value: filtered, period: timeLabel };
    });

    const roiData = data.channelROI; // ROI ratios don't change with time/region

    // Pipeline doctors — filter by destination region
    const doctors = region === "all"
      ? data.pipelineDoctors
      : data.pipelineDoctors.filter(d => {
          const destMap: Record<string, string> = { uae: "UAE", ksa: "KSA", qatar: "Qatar", kuwait: "Kuwait" };
          return d.destination === destMap[region];
        });

    // Campaigns
    const campaigns = data.campaignPerformance.map(c => ({
      ...c,
      doctors: scale(c.doctors, tm, rm),
      spend: scale(c.spend, tm, rm),
    }));

    return {
      kpis, timeData, funnel, channels, regions, pipeline, workflow,
      sales, recruiters, marketing, costVsConv, finance, roiData,
      doctors, campaigns, timeLabel,
      stageConversion: data.stageConversion,
      activity: data.recentActivity,
      operationalHealth: data.operationalHealth,
      roadmapPhases: data.roadmapPhases,
      bottlenecks: data.bottlenecks,
    };
  }, [timeRange, region]);
}

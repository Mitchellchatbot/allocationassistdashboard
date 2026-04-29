import { useMemo } from "react";
import { useFilters, getTimeLabel } from "@/lib/filters";
import { useZohoData, aggregateZohoData, type ZohoLead, type ZohoDeal } from "@/hooks/use-zoho-data";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { useCurrency } from "@/lib/CurrencyProvider";

const EMPTY_EMAIL = { total: 0, bySender: {} as Record<string, number>, sampled: 0 };

export function useFilteredData() {
  const { preset, dateRange } = useFilters();
  const { data: zoho, isLoading: zohoLoading, error: zohoError } = useZohoData();
  const { fmt: fmtMoney, currency } = useCurrency();
  // Total marketing spend in the active date window — drives the
  // "Cost per Doctor" KPI (spend ÷ DoBs onboarded in the same window).
  const { total: spendInWindow } = useMarketingExpenses();

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
        stageConversion: [], activity: [], placementCycles: [], placementDurations: [], operationalHealth: [],
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
    const filteredDoB       = (zoho.rawDoctorsOnBoard ?? [])
      .filter(d => inWindow(d.Created_Time));

    // ── Re-aggregate ──────────────────────────────────────────────────────
    const agg = aggregateZohoData(
      filteredLeads,
      filteredDeals,
      filteredCalls,
      filteredAccounts,
      filteredCampaigns,
      EMPTY_EMAIL,
      filteredDoB,
    );

    // ── Override placementCycles using FULL leads for the lookup ──────────
    // aggregateZohoData built the lookup from `filteredLeads` (window only).
    // A DoB created in 2026 typically matches a lead from 2024/2025, so we
    // rebuild from `zoho.rawLeads` (all-time) and re-match the window's DoBs.
    const ne = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
    const np = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
    // Loose name match: strip honorifics (Dr./Mr./Mrs./Ms./Prof.), suffixes
    // (MD, MBBS, PhD, etc.), all punctuation, and collapse whitespace. Most
    // DoB rows don't have Email/Phone exposed via the API, so name matching
    // is the only path — has to be tolerant.
    const cleanName = (s: string | null | undefined) => (s ?? '')
      .toLowerCase()
      .replace(/\b(dr|mr|mrs|ms|prof|sir|madam|md|mbbs|phd|frcs|mrcp|mrcs|do)\.?\b/gi, '')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const nn = (f: string | null | undefined, l: string | null | undefined) =>
      cleanName(`${f ?? ''} ${l ?? ''}`);
    const nnFromFull = (full: string | null | undefined) => cleanName(full ?? '');

    const byEmail = new Map<string, ZohoLead>();
    const byPhone = new Map<string, ZohoLead>();
    const byName  = new Map<string, ZohoLead>();
    for (const l of zoho.rawLeads) {
      const e = ne(l.Email);
      const p = np(l.Phone ?? l.Mobile);
      const n = nn(l.First_Name, l.Last_Name);
      if (e && !byEmail.has(e)) byEmail.set(e, l);
      if (p && !byPhone.has(p)) byPhone.set(p, l);
      if (n && !byName.has(n))  byName.set(n, l);
    }
    const cycles: { name: string; days: number }[] = [];
    let hitEmail = 0, hitPhone = 0, hitName = 0, missed = 0;
    let dobHasEmail = 0, dobHasPhone = 0;
    for (const dob of filteredDoB) {
      if (!dob.Created_Time) continue;
      const dobEmail = ne(dob.Email);
      const dobPhone = np(dob.Phone ?? dob.Mobile);
      // Try name from First_Name + Last_Name first; fall back to Full_Name
      // (some DoB rows have only the latter set).
      const dobName  = nn(dob.First_Name, dob.Last_Name) || nnFromFull(dob.Full_Name);
      if (dobEmail) dobHasEmail++;
      if (dobPhone) dobHasPhone++;
      let lead: ZohoLead | undefined;
      if (dobEmail && byEmail.has(dobEmail))      { lead = byEmail.get(dobEmail); hitEmail++; }
      else if (dobPhone && byPhone.has(dobPhone)) { lead = byPhone.get(dobPhone); hitPhone++; }
      else if (dobName  && byName.has(dobName))   { lead = byName.get(dobName);   hitName++;  }
      else { missed++; continue; }
      if (!lead?.Created_Time) { missed++; continue; }
      const days = (new Date(dob.Created_Time).getTime() - new Date(lead.Created_Time).getTime()) / 86_400_000;
      if (days < 0 || days > 730) { missed++; continue; }
      cycles.push({
        name: dob.Full_Name || `${dob.First_Name ?? ''} ${dob.Last_Name ?? ''}`.trim() || '—',
        days: Math.round(days),
      });
    }
    console.log(`[useFilteredData] placementCycles — DoBs in window:${filteredDoB.length} matched:${cycles.length} (email:${hitEmail} phone:${hitPhone} name:${hitName}) missed:${missed} | DoB fields populated → email:${dobHasEmail} phone:${dobHasPhone}`);
    // Sample 5 unmatched DoBs so we can verify the hypothesis: their original
    // Lead got converted out of the Leads module so it's missing from cache.
    const unmatchedSamples: { dobEmail: string; dobPhone: string; dobName: string; emailExistsInLeads: boolean; phoneExistsInLeads: boolean }[] = [];
    for (const dob of filteredDoB) {
      if (unmatchedSamples.length >= 5) break;
      const e = ne(dob.Email);
      const p = np(dob.Phone ?? dob.Mobile);
      const n = nn(dob.First_Name, dob.Last_Name) || nnFromFull(dob.Full_Name);
      const matched =
        (e && byEmail.has(e)) ||
        (p && byPhone.has(p)) ||
        (n && byName.has(n));
      if (!matched && (e || p || n)) {
        unmatchedSamples.push({
          dobEmail: e || '(none)',
          dobPhone: p || '(none)',
          dobName: n || '(none)',
          emailExistsInLeads: e ? byEmail.has(e) : false,
          phoneExistsInLeads: p ? byPhone.has(p) : false,
        });
      }
    }
    console.log('[useFilteredData] sample unmatched DoBs:\n' + unmatchedSamples.map((s, i) => `  ${i + 1}. email="${s.dobEmail}" phone="${s.dobPhone}" name="${s.dobName}" → emailInLeads=${s.emailExistsInLeads} phoneInLeads=${s.phoneExistsInLeads}`).join('\n'));
    console.log(`[useFilteredData] lookup-map sizes — leads-by-email:${byEmail.size} leads-by-phone:${byPhone.size} leads-by-name:${byName.size} (universe: ${zoho.rawLeads.length} leads)`);
    agg.placementCycles = cycles;

    // ── Time-series chart: slice to the number of months in the range ────
    const timeData = zoho.leadsOverTime.slice(-monthSlice);

    // Time to Placement — avg days each DoB record was active before its
    // last status change (Modified_Time − Created_Time). We use this proxy
    // instead of Lead-Created → DoB-Created because converted leads
    // disappear from Zoho's API after conversion (only ~2/143 DoBs match
    // back to a Lead in our cache). DoB.Modified_Time is set on every
    // record, so this gives us a real number for every placement.
    const placementDurations: { name: string; days: number }[] = [];
    for (const dob of filteredDoB) {
      if (!dob.Created_Time || !dob.Modified_Time) continue;
      const created  = new Date(dob.Created_Time).getTime();
      const modified = new Date(dob.Modified_Time).getTime();
      const days = (modified - created) / 86_400_000;
      if (days <= 0 || days > 730) continue;   // sanity bounds: 0–2 years
      placementDurations.push({
        name: dob.Full_Name || `${dob.First_Name ?? ''} ${dob.Last_Name ?? ''}`.trim() || '—',
        days: Math.round(days),
      });
    }
    const placementAvgDays = placementDurations.length > 0
      ? Math.round(placementDurations.reduce((s, c) => s + c.days, 0) / placementDurations.length)
      : 0;
    const placementVal = placementAvgDays > 0 ? `${placementAvgDays} days` : "—";
    const placementSub = placementDurations.length === 0
      ? "no doctors onboarded in period"
      : `${placementDurations.length.toLocaleString()} placements`;

    // Reformat money KPIs in the active currency. Other KPIs (counts, %, dur)
    // are unaffected.
    const kpis = agg.kpis.map(k => {
      const period = k.period ?? timeLabel;
      if (k.label === "Pipeline Value") {
        return {
          ...k,
          value:  fmtMoney(agg.openPipelineValue),
          period: `weighted ${fmtMoney(agg.weightedPipelineValue)} · ${agg.openDeals} open deals`,
        };
      }
      if (k.label === "Time to Placement") {
        return { ...k, value: placementVal, period: placementSub };
      }
      return { ...k, period };
    });
    const finance = agg.financeMetrics.map(f => {
      const period = f.period ?? timeLabel;
      if (f.label === "Placement Revenue") {
        return { ...f, value: fmtMoney(agg.totalRevenue), period };
      }
      return { ...f, period };
    });
    const recruiters = agg.recruiters.map(r => ({ ...r, role: 'Sales Consultant' }));

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
      placementCycles: agg.placementCycles,
      placementDurations,
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
  }, [preset, dateRange, zoho, zohoLoading, zohoError, currency, fmtMoney]);
}

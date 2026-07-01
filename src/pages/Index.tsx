import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PortalDigest } from "@/components/PortalDigest";
import { DashboardGreeting } from "@/components/DashboardGreeting";
import { SectionDateRange } from "@/components/SectionDateRange";
import { ExpandableKPICard as ExpandableKPICardBase } from "@/components/ExpandableKPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useFilters } from "@/lib/filters";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useMetaLeadsStats, normalizeEmail, normalizePhone } from "@/hooks/use-meta-leads-stats";
import { useCurrency } from "@/lib/CurrencyProvider";
import { REVENUE_PER_CONVERSION_AED } from "@/lib/revenue";
import { useDoctorRevenue } from "@/hooks/use-doctor-dossier";
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Line,
} from "recharts";
import { InfoIcon } from "@/components/InfoIcon";
import {
  Activity, Award, AlertTriangle, Calendar, FileText, Handshake,
  UserPlus, Phone, Loader2, Users, TrendingUp, DollarSign, Clock, CheckCircle,
} from "lucide-react";

// Short explanation for each pipeline stage on the funnel chart.
const FUNNEL_STAGE_HINTS: Record<string, string> = {
  "Not Contacted":                "Lead in Zoho with no recruiter outreach yet.",
  "Attempted to Contact":         "Recruiter tried at least once but hasn't connected.",
  "Initial Sales Call Completed": "Lead reached a real sales call. First qualified milestone.",
  "Follow-up Scheduled":          'Deferred conversation ("Contact in Future"). NOT qualified.',
  "Contact in Future":            "Deferred conversation. NOT counted as qualified.",
  "High Priority Follow up":      "Hot lead owes the team a callback. Qualified + converted.",
  "Closed Won":                   "Lead became a placement.",
  "Closed Lost":                  "Lead is dead — closed without a placement.",
  "Unqualified":                  "Lead doesn't meet our criteria.",
  "Unqualified Leads":            "Lead doesn't meet our criteria.",
  "Not Interested":               "Lead actively declined.",
};
import { ChannelIcon } from "@/components/ChannelIcon";
import { Link } from "react-router-dom";
import { useState, useMemo, memo } from "react";

// Memoized wrapper so stable (useMemo'd) kpiDefs let each card skip re-render
// when its props are referentially unchanged. Same component, same props,
// same output — React.memo only adds a shallow-prop bail-out.
const ExpandableKPICard = memo(ExpandableKPICardBase);

const activityIcons: Record<string, React.ReactNode> = {
  lead:        <UserPlus   className="h-3 w-3 text-info" />,
  placement:   <Award      className="h-3 w-3 text-success" />,
  license:     <FileText   className="h-3 w-3 text-primary" />,
  alert:       <AlertTriangle className="h-3 w-3 text-warning" />,
  interview:   <Calendar   className="h-3 w-3 text-muted-foreground" />,
  document:    <Activity   className="h-3 w-3 text-info" />,
  partnership: <Handshake  className="h-3 w-3 text-primary" />,
  call:        <Phone      className="h-3 w-3 text-primary" />,
};

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

const CHANNEL_RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
] as const;

// Strict qualified definition: Initial Sales Call Completed + High Priority Follow up.
const qualStatusesForCard = new Set(['Initial Sales Call Completed', 'High Priority Follow up']);
const qualStatusesForRate = new Set(['Initial Sales Call Completed', 'High Priority Follow up']);

const Index = () => {
  // fmtAED comes from the global currency context (AED/USD toggle in header).
  const { kpis, timeData, funnel, stageConversion, filteredLeads, filteredDeals, placementCycles, placementDurations, zohoLoading } = useFilteredData();
  const { dateRange } = useFilters();
  const { fmt: fmtAED } = useCurrency();
  const { data: zoho } = useZohoData();
  // Meta cross-reference so channel attribution matches the Marketing page:
  // a lead/DoB with a junk/blank Lead_Source whose email or phone is in
  // meta_leads is attributed to "Meta" (the narrowed "XXXX → Meta" fix — a
  // real Lead_Source channel always wins; see Marketing.tsx channelOf).
  const { data: metaStats } = useMetaLeadsStats(dateRange);
  const channelOf = useMemo(() => {
    const metaEmails = metaStats?.metaLeadEmails ?? new Set<string>();
    const metaPhones = metaStats?.metaLeadPhones ?? new Set<string>();
    return (email: string | null | undefined, phone: string | null | undefined, leadSource: string | null | undefined): string => {
      const ds = displaySource(leadSource);
      if (ds !== "Undefined") return ds;          // a real channel always wins
      const e = normalizeEmail(email);
      const p = normalizePhone(phone);
      if ((e && metaEmails.has(e)) || (p && metaPhones.has(p))) return "Meta";
      return ds;
    };
  }, [metaStats?.metaLeadEmails, metaStats?.metaLeadPhones]);
  // "Where Qualified Leads Come From" — channel breakdown of qualified leads
  // in the selected period. Uses page-level date range via filteredLeads.
  const QUALIFIED_SET = useMemo(() => new Set([
    'Initial Sales Call Completed',
    'High Priority Follow up',
    'High Priority Follow-up',
  ]), []);
  const qualifiedChannels = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of filteredLeads) {
      if (!QUALIFIED_SET.has(l.Lead_Status)) continue;
      const ch = channelOf(l.Email, l.Phone ?? l.Mobile, l.Lead_Source);
      map[ch] = (map[ch] ?? 0) + 1;
    }
    // Diagnostic: status breakdown per channel — helps explain why some
    // channels (e.g. Dave) have conversions but no qualified leads.
    if (import.meta.env.DEV) {
      const statusByCh: Record<string, Record<string, number>> = {};
      for (const l of filteredLeads) {
        const ch  = displaySource(l.Lead_Source);
        const st  = l.Lead_Status || '(empty)';
        statusByCh[ch] = statusByCh[ch] ?? {};
        statusByCh[ch][st] = (statusByCh[ch][st] ?? 0) + 1;
      }
      console.log('[Index] Lead_Status counts by channel (in period):', statusByCh);
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, count]) => ({ channel, count }));
  }, [filteredLeads, QUALIFIED_SET]);

  // "Where Conversions Come From" — channel breakdown of DoB rows in the
  // selected period.
  const conversionChannels = useMemo(() => {
    const map: Record<string, number> = {};
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      if (!d.Created_Time) continue;
      const t = new Date(d.Created_Time).getTime();
      if (t < fromMs || t >= toMs) continue;
      const ch = channelOf(d.Email, d.Phone ?? d.Mobile, d.Lead_Source);
      map[ch] = (map[ch] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, count]) => ({ channel, count }));
  }, [zoho?.rawDoctorsOnBoard, dateRange, channelOf]);


  // ── Expanded content for each KPI card ──────────────────────────────────────

  // 1. Best Channel → simply the channel with the most converted doctors
  // (DoB rows) in the period. Headline value = revenue (conversions × per-
  // doctor fee) so the card answers "which channel is making us the most
  // money right now?"
  const { revenueForDoctor } = useDoctorRevenue();
  const bestChannelData = useMemo(() => {
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    const convByCh = new Map<string, number>();
    const revByCh  = new Map<string, number>();
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      if (!d.Created_Time) continue;
      const t = new Date(d.Created_Time).getTime();
      if (t < fromMs || t >= toMs) continue;
      const ch = channelOf(d.Email, d.Phone ?? d.Mobile, d.Lead_Source);
      if (ch === 'Undefined') continue;
      convByCh.set(ch, (convByCh.get(ch) ?? 0) + 1);
      const dname = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      revByCh.set(ch, (revByCh.get(ch) ?? 0) + revenueForDoctor(dname));
    }
    // Revenue = sum of each converted doctor's ACTUAL Zoho Books invoices
    // (estimate fallback for not-yet-invoiced), ranked by money produced.
    const ranked = Array.from(convByCh.entries())
      .map(([channel, conversions]) => ({
        channel,
        conversions,
        revenue: revByCh.get(channel) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    return { ranked };
  }, [zoho?.rawDoctorsOnBoard, dateRange, channelOf, revenueForDoctor]);

  const winner = bestChannelData.ranked[0];

  const bestChannelContent = useMemo(() => (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        Channel ranked by revenue in the selected period — the sum of each converted doctor's <strong>actual Zoho Books invoices</strong> (a {fmtAED(REVENUE_PER_CONVERSION_AED)} estimate fills in for doctors not invoiced yet).
      </p>
      <div>
        <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/70 mb-1">Top 5 channels by revenue</p>
        <div className="divide-y divide-border/30">
          {bestChannelData.ranked.length === 0
            ? <p className="text-[11px] text-muted-foreground py-2">No conversions in this period</p>
            : bestChannelData.ranked.slice(0, 5).map(r => (
                <div key={r.channel} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-[11px] font-medium truncate">{r.channel}</span>
                  <div className="text-right tabular-nums shrink-0">
                    <span className="text-[11px] font-bold">{fmtAED(r.revenue)}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{r.conversions} conv</span>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  ), [bestChannelData, fmtAED]);

  // 2. Lead → Placement → conversion funnel steps
  const conversionContent = useMemo(() => (
    <div className="space-y-2.5">
      {stageConversion.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No data</p>
        : stageConversion.map(s => {
          const barColor = s.rate >= 50 ? 'bg-success' : s.rate >= 20 ? 'bg-primary' : s.rate >= 5 ? 'bg-warning' : 'bg-destructive/60';
          const txtColor = s.rate >= 50 ? 'text-success' : s.rate >= 20 ? 'text-primary' : s.rate >= 5 ? 'text-warning' : 'text-destructive';
          return (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">{s.stage}</span>
                <span className={`text-[11px] font-bold tabular-nums ${txtColor}`}>{s.rate}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.max(s.rate, 0.5)}%` }} />
              </div>
            </div>
          );
        })
      }
    </div>
  ), [stageConversion]);

  // 3. Pipeline Value → top open deals
  const openDeals = useMemo(() => filteredDeals
    .filter(d => d.Stage !== 'Closed Won' && d.Stage !== 'Closed Lost')
    .sort((a, b) => b.Amount - a.Amount)
    .slice(0, 5), [filteredDeals]);
  const pipelineContent = useMemo(() => (
    <div className="divide-y divide-border/30">
      {openDeals.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No open deals</p>
        : openDeals.map(d => (
          <div key={d.id} className="flex items-start justify-between py-1.5 gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium truncate">{d.Deal_Name}</p>
              <p className="text-[10px] text-muted-foreground">{d.Stage}</p>
            </div>
            <span className="text-[11px] font-semibold text-info tabular-nums shrink-0">{fmtAED(d.Amount)}</span>
          </div>
        ))
      }
    </div>
  ), [openDeals, fmtAED]);

  // 4. Qualified Leads → top recently-qualified leads in the selected date range.
  // Strict qualified definition: Initial Sales Call Completed + High Priority Follow up.
  // Closed Won is a placement, tracked separately via Deals.
  const qualifiedLeadsList = useMemo(() => filteredLeads
    .filter(l => qualStatusesForCard.has(l.Lead_Status))
    .sort((a, b) => new Date(b.Created_Time).getTime() - new Date(a.Created_Time).getTime())
    .slice(0, 5), [filteredLeads]);
  const notContactedCount = useMemo(() => filteredLeads.filter(l => l.Lead_Status === 'Not Contacted').length, [filteredLeads]);
  const qualifiedLeadsContent = useMemo(() => (
    <div className="space-y-2">
      <div className="divide-y divide-border/30">
        {qualifiedLeadsList.length === 0
          ? <p className="text-[11px] text-muted-foreground py-2">No qualified leads in this period</p>
          : qualifiedLeadsList.map(l => {
            const name = l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—';
            return (
              <div key={l.id} className="flex items-start justify-between py-1.5 gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium truncate">{name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{l.Lead_Status ?? '—'} · {l.Specialty ?? l.Specialty_New ?? '—'}</p>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {l.Created_Time ? new Date(l.Created_Time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                </span>
              </div>
            );
          })
        }
      </div>
      {notContactedCount > 0 && (
        <Link
          to="/leads-pipeline?stage=Not%20Contacted"
          className="flex items-center justify-between rounded-md bg-warning/10 hover:bg-warning/20 px-2.5 py-1.5 text-[11px] text-warning font-medium transition-colors"
        >
          <span>{notContactedCount.toLocaleString()} qualified but not contacted</span>
          <span className="text-[10px]">View list →</span>
        </Link>
      )}
    </div>
  ), [qualifiedLeadsList, notContactedCount]);

  // 5. Time to Placement → avg DoB-record cycle duration. Drill-down shows
  // the 5 placements CLOSEST TO the average — the most "typical" sample so
  // users see what the headline number actually represents (not the
  // outliers).
  const cycleData = useMemo(() => {
    const durations = placementDurations ?? [];
    const avgDays   = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d.days, 0) / durations.length)
      : 0;
    // Rank by |days − avgDays| asc → take 5 most representative
    const representative = durations
      .slice()
      .sort((a, b) => Math.abs(a.days - avgDays) - Math.abs(b.days - avgDays))
      .slice(0, 5)
      // Then re-sort by days asc so the list reads cleanly
      .sort((a, b) => a.days - b.days);
    return { durations, avgDays, representative };
  }, [placementDurations]);
  const cycleContent = useMemo(() => {
    const { durations, avgDays, representative } = cycleData;
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
          Average days each Doctors on Board record was active before its last status change (<code>Modified_Time − Created_Time</code>). A proxy for time-from-first-touch to placement — exact lead-to-placement cycle isn't computable because converted leads disappear from Zoho's API after conversion.
        </p>
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/70 mb-1">5 most-typical placements (closest to avg)</p>
          <div className="divide-y divide-border/30">
            {representative.length === 0
              ? <p className="text-[11px] text-muted-foreground py-2">No placements with measurable cycle in this period</p>
              : <>
                  {representative.map((d, i) => {
                    const delta = d.days - avgDays;
                    return (
                      <div key={`${d.name}-${i}`} className="flex items-center justify-between py-1.5 gap-2">
                        <p className="text-[11px] font-medium truncate">{d.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-semibold tabular-nums text-warning">{d.days} days</span>
                          {delta !== 0 && (
                            <span className={`text-[9px] font-medium tabular-nums ${delta > 0 ? "text-rose-600/80" : "text-emerald-600/80"}`}>
                              {delta > 0 ? "+" : ""}{delta}d
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between py-1.5 gap-2 pt-2">
                    <p className="text-[11px] font-semibold">Avg. across {durations.length.toLocaleString()} placements</p>
                    <span className="text-[11px] font-bold tabular-nums shrink-0 text-primary">{avgDays} days</span>
                  </div>
                </>
            }
          </div>
        </div>
      </div>
    );
  }, [cycleData]);

  // 6. Qualification Rate → qualified vs unqualified breakdown.
  // Strict qualified definition: Initial Sales Call Completed + High Priority Follow up.
  // Previous version used !unqualStatuses (a blocklist) which inflated the count by
  // also counting Not Contacted / Attempted / Contact in Future as qualified.
  const { qualCount, unqualCount, notIntCount, total } = useMemo(() => {
    let qualCount = 0, unqualCount = 0, notIntCount = 0;
    for (const l of filteredLeads) {
      if (qualStatusesForRate.has(l.Lead_Status)) qualCount++;
      if (l.Lead_Status === 'Unqualified Leads') unqualCount++;
      if (l.Lead_Status === 'Not Interested') notIntCount++;
    }
    return { qualCount, unqualCount, notIntCount, total: filteredLeads.length };
  }, [filteredLeads]);
  const qualCats = useMemo(() => [
    { label: 'Qualified',           count: qualCount,   color: 'bg-success'       },
    { label: 'Unqualified',         count: unqualCount, color: 'bg-warning'        },
    { label: 'Not Interested',      count: notIntCount, color: 'bg-destructive/70' },
  ], [qualCount, unqualCount, notIntCount]);
  const qualRateContent = useMemo(() => (
    <div className="space-y-2.5">
      {qualCats.map(c => (
        <div key={c.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">{c.label}</span>
            <span className="text-[11px] font-semibold tabular-nums">
              {c.count.toLocaleString()}
              <span className="text-muted-foreground ml-1">({total > 0 ? Math.round((c.count / total) * 100) : 0}%)</span>
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${c.color} transition-all`} style={{ width: `${total > 0 ? (c.count / total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  ), [qualCats, total]);

  // ── KPI card definitions ─────────────────────────────────────────────────────
  const kpiDefs = useMemo(() => kpis.length > 0 ? [
    {
      title: 'Best Channel',
      value: winner ? winner.channel : '—',
      icon: Users, color: 'text-blue-600', bg: 'bg-blue-50',
      frontExtra: winner
        ? `${fmtAED(winner.revenue)} · ${winner.conversions} conversion${winner.conversions === 1 ? "" : "s"}`
        : 'no conversions in period',
      hintMeaning: "Channel with the most converted doctors (Doctors on Board rows) in the selected period. Headline is the revenue that channel produced — conversions × per-doctor fee.",
      hintSource:  "Zoho Doctors on Board × revenue per conversion.",
      expandedContent: bestChannelContent,
      expandedHeight: 280,
    },
    {
      title: kpis[1]?.label ?? 'Lead → Conversion',
      value: kpis[1]?.value ?? '—',
      icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50',
      frontExtra: kpis[1]?.period,
      hintMeaning: "Share of leads that became a converted doctor — i.e. show up in the Zoho Doctors on Board module. NOT derived from Closed Won deals or lead status.",
      hintSource:  "Zoho Doctors on Board module (api_name: Contacts).",
      expandedContent: conversionContent,
      expandedHeight: 300,
    },
    {
      title: kpis[2]?.label ?? 'Pipeline Value',
      value: kpis[2]?.value ?? '—',
      icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50',
      frontExtra: kpis[2]?.period,
      hintMeaning: "Total $ value of open deals. Weighted figure applies stage probability.",
      hintSource:  "Zoho CRM (Deals — Amount).",
      expandedContent: pipelineContent,
      expandedHeight: 250,
    },
    {
      title: kpis[3]?.label ?? 'Qualified Leads',
      value: kpis[3]?.value ?? '—',
      icon: CheckCircle, color: 'text-amber-600', bg: 'bg-amber-50',
      frontExtra: kpis[3]?.period,
      hintMeaning: "Leads at Initial Sales Call Completed or High Priority Follow up. Conversions are tracked separately via the Doctors on Board module.",
      hintSource:  "Zoho CRM (Lead_Status).",
      expandedContent: qualifiedLeadsContent,
      expandedHeight: 250,
    },
    {
      title: kpis[4]?.label ?? 'Time to Placement',
      value: kpis[4]?.value ?? '—',
      icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50',
      frontExtra: kpis[4]?.period,
      hintMeaning: "Average days each Doctors on Board record was active before its last status change (Modified_Time − Created_Time). Proxy for time-from-first-touch to placement — exact lead→placement cycle isn't computable because converted leads disappear from Zoho's API after conversion.",
      hintSource:  "Zoho Doctors on Board (Modified_Time − Created_Time).",
      expandedContent: cycleContent,
      expandedHeight: 280,
    },
    {
      title: kpis[5]?.label ?? 'Qualification Rate',
      value: kpis[5]?.value ?? '—',
      icon: CheckCircle, color: 'text-sky-600', bg: 'bg-sky-50',
      frontExtra: kpis[5]?.period,
      hintMeaning: "Qualified leads ÷ total leads in the period.",
      hintSource:  "Zoho CRM (Lead_Status).",
      expandedContent: qualRateContent,
      expandedHeight: 220,
    },
  ] : [], [kpis, winner, fmtAED, bestChannelContent, conversionContent, pipelineContent, qualifiedLeadsContent, cycleContent, qualRateContent]);

  return (
    <DashboardLayout title="Dashboard" subtitle="A quick look at how doctor placements and operations are performing" docSlug="overview/dashboard">
      <DashboardGreeting />

      {/* AI digest of the entire portal — daily auto-generated, weekly/monthly
          on demand, scoped to what the viewer can access. Replaces the old
          Pending Actions panel (its "Needs attention" section supersedes it). */}
      <PortalDigest />

      <SectionDateRange />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6" data-tour="dashboard-kpis">
        {zohoLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[88px] rounded-xl bg-muted/40 animate-pulse" />
            ))
          : kpiDefs.map((def) => (
              <ExpandableKPICard key={def.title} {...def} />
            ))
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Applications over time */}
        <Card className="lg:col-span-3 shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
              Doctor Applications Over Time
              <InfoIcon meaning="Monthly count of new Zoho leads created in the period." source="Zoho CRM (Created_Time)." size={13} side="bottom" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            {zohoLoading ? (
              <div className="h-[240px] bg-muted/30 rounded-lg animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                {/* ComposedChart — was AreaChart, which doesn't allow
                    <Line> children. Recharts threw at render time with
                    a minified invariant. Switched to ComposedChart so
                    the Area + two Line series can coexist. */}
                <ComposedChart data={timeData}>
                  <defs>
                    <linearGradient id="docFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(170,55%,45%)" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                  <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                  <Tooltip contentStyle={tip} />
                  <Area type="monotone" dataKey="doctors" stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#docFill)" name="Applied" />
                  <Line type="monotone" dataKey="qualified" stroke="hsl(210,75%,52%)" strokeWidth={1.5} dot={false} name="Qualified" />
                  <Line type="monotone" dataKey="placed" stroke="hsl(158,50%,42%)" strokeWidth={1.5} dot={false} name="Placed" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="flex gap-4 mt-2 justify-center">
              {[{ c: "bg-primary", l: "Applied" }, { c: "bg-info", l: "Qualified" }, { c: "bg-success", l: "Placed" }].map(i => (
                <span key={i.l} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${i.c}`} />{i.l}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card className="lg:col-span-2 shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
              How Doctors Move Through the Process
              <InfoIcon meaning="Distribution of leads across pipeline statuses. Click any row to see what that stage means." source="Zoho CRM (Lead_Status)." size={13} side="bottom" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {zohoLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : funnel.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">No pipeline data</p>
            ) : (
              <div className="space-y-3">
                {funnel.map((item, i) => {
                  const hint = FUNNEL_STAGE_HINTS[item.stage];
                  return (
                    <div key={item.stage}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground">
                          {item.stage}
                          {hint && <InfoIcon meaning={hint} source="Zoho CRM (Lead_Status)." side="right" />}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-foreground tabular-nums">{item.count.toLocaleString()}</span>
                          <span className="text-[11px] text-muted-foreground w-8 text-right tabular-nums">{item.pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${item.pct}%`, backgroundColor: `hsl(170, ${55 - i * 5}%, ${45 + i * 4}%)` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Where Qualified Leads Come From — raw counts only, page date range */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
              Where Qualified Leads Come From
              <InfoIcon meaning="Channel breakdown of qualified leads (Lead_Status = Initial Sales Call Completed or High Priority Follow up) in the selected period." source="Zoho CRM (Lead_Source × Lead_Status)." size={13} side="bottom" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {zohoLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : qualifiedChannels.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">No qualified leads in period</p>
            ) : (() => {
              const maxQ = qualifiedChannels[0]?.count ?? 1;
              return (
                <div className="divide-y divide-border/30">
                  {qualifiedChannels.map(ch => (
                    <div key={ch.channel} className="py-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={ch.channel} size={14} />
                          <span className="text-[13px] font-medium text-foreground">{ch.channel}</span>
                        </div>
                        <span className="text-[14px] font-semibold tabular-nums">{ch.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${maxQ > 0 ? (ch.count / maxQ) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Where Conversions Come From — DoB rows by channel, raw counts only */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
              Where Conversions Come From
              <InfoIcon meaning="Channel breakdown of Doctors on Board rows in the selected period (Created_Time within range)." source="Zoho Doctors on Board (Lead_Source)." size={13} side="bottom" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {zohoLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 bg-muted/30 rounded animate-pulse" />
                ))}
              </div>
            ) : conversionChannels.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">No conversions in period</p>
            ) : (() => {
              const maxC = conversionChannels[0]?.count ?? 1;
              return (
                <div className="divide-y divide-border/30">
                  {conversionChannels.map(ch => (
                    <div key={ch.channel} className="py-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={ch.channel} size={14} />
                          <span className="text-[13px] font-medium text-foreground">{ch.channel}</span>
                        </div>
                        <span className="text-[14px] font-semibold tabular-nums">{ch.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full transition-all"
                          style={{ width: `${maxC > 0 ? (ch.count / maxC) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Index;

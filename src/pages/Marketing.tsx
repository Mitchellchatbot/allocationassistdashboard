import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Star, User, ArrowLeft, X } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ChannelWinnerCards, ChannelEconomicsTable } from "@/components/ChannelEconomics";
import { CampaignWinnerCards } from "@/components/CampaignWinners";
import { LeadsBySourceChart } from "@/components/LeadsBySourceChart";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};


const Marketing = () => {
  const { data: zoho } = useZohoData();
  const { dateRange } = useFilters();

  const marketing = useMemo(() => {
    if (!zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    const recentLeads = zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs;
    });

    const leadsByChannel:        Record<string, number> = {};
    const activeByChannel:       Record<string, number> = {};
    const contactedByChannel:    Record<string, number> = {};
    const qualifiedByChannel:    Record<string, number> = {};
    const convertedByChannel:    Record<string, number> = {};

    // A lead has been "contacted" if its status is anything past Not Contacted.
    // "Qualified" includes converted statuses (a converted lead must first be qualified).
    // "Converted" is a strict subset of qualified.
    const activeStatuses = new Set([
      'Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed',
      'Contact in Future', 'High Priority Follow up',
    ]);
    // "Contact in Future" is NOT qualified — recruiter deferred, not a pass.
    const qualifiedStatuses = new Set([
      'Initial Sales Call Completed', 'High Priority Follow up', 'Closed Won',
    ]);
    const convertedStatuses = new Set([
      'High Priority Follow up', 'Closed Won',
    ]);

    for (const l of recentLeads) {
      const ch = displaySource(l.Lead_Source);
      leadsByChannel[ch] = (leadsByChannel[ch] ?? 0) + 1;
      if (activeStatuses.has(l.Lead_Status)) {
        activeByChannel[ch] = (activeByChannel[ch] ?? 0) + 1;
      }
      if (l.Lead_Status && l.Lead_Status !== 'Not Contacted') {
        contactedByChannel[ch] = (contactedByChannel[ch] ?? 0) + 1;
      }
      if (qualifiedStatuses.has(l.Lead_Status)) {
        qualifiedByChannel[ch] = (qualifiedByChannel[ch] ?? 0) + 1;
      }
      if (convertedStatuses.has(l.Lead_Status)) {
        convertedByChannel[ch] = (convertedByChannel[ch] ?? 0) + 1;
      }
    }

    return Object.entries(leadsByChannel)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, doctors]) => {
        const active         = activeByChannel[channel] ?? 0;
        const contacted      = contactedByChannel[channel] ?? 0;
        const qualified      = qualifiedByChannel[channel] ?? 0;
        const converted      = convertedByChannel[channel] ?? 0;
        const uncontacted    = (active > 0 ? active : doctors) - contacted;
        // All percentages use TOTAL leads as denominator so they're comparable.
        const contactRate    = doctors > 0 ? Math.round((contacted  / doctors) * 100) : 0;
        const qualifiedRate  = doctors > 0 ? Math.round((qualified  / doctors) * 100) : 0;
        const conversionRate = doctors > 0 ? Math.round((converted  / doctors) * 100) : 0;
        return { channel, doctors, contacted, uncontacted, qualified, converted, contactRate, qualifiedRate, conversionRate };
      });
  }, [zoho?.rawLeads, dateRange]);

  const bestChannel = marketing.length > 0
    ? marketing.reduce((a, b) => (a.doctors > b.doctors ? a : b))
    : null;

  // Hide low-volume channels (< 10 leads) behind a "Show all" toggle so the grid stays scannable
  const MIN_LEADS_THRESHOLD = 10;
  const [showAllChannels, setShowAllChannels] = useState(false);
  const visibleMarketing = useMemo(() => {
    if (showAllChannels) return marketing;
    return marketing.filter(c => c.doctors >= MIN_LEADS_THRESHOLD);
  }, [marketing, showAllChannels]);
  const hiddenChannelCount = marketing.length - visibleMarketing.length;

  // KPI card expand panel
  const [selectedKpiChannel, setSelectedKpiChannel] = useState<string | null>(null);

  const kpiPanelDoctors = useMemo(() => {
    if (!selectedKpiChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs && displaySource(l.Lead_Source) === selectedKpiChannel;
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
      status:    l.Lead_Status ?? '—',
      contacted: l.Lead_Status !== 'Not Contacted',
    }));
  }, [selectedKpiChannel, zoho?.rawLeads, dateRange]);

  // Flip state for chart cards
  const [acquiredChannel, setAcquiredChannel] = useState<string | null>(null);
  const [uncontactedChannel, setUncontactedChannel] = useState<string | null>(null);

  // Doctor lists for back faces (derived from raw leads in the date window)
  const acquiredDoctors = useMemo(() => {
    if (!acquiredChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs && displaySource(l.Lead_Source) === acquiredChannel;
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
      status:    l.Lead_Status ?? '—',
    }));
  }, [acquiredChannel, zoho?.rawLeads, dateRange]);

  const uncontactedDoctors = useMemo(() => {
    if (!uncontactedChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs
        && displaySource(l.Lead_Source) === uncontactedChannel
        && l.Lead_Status === 'Not Contacted';
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
    }));
  }, [uncontactedChannel, zoho?.rawLeads, dateRange]);

  return (
    <DashboardLayout title="Marketing" subtitle="See which channels bring in the most doctors and how well they convert">
      {/* Campaign-level winners (most qualified / lowest cost-per-qualified / lowest cost-per-conversion) */}
      <CampaignWinnerCards />

      {/* Channel winner KPIs (best volume / lowest CPL / lowest CPQ / highest conversion) */}
      <ChannelWinnerCards />

      {/* Channel KPI cards */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
          Channels {visibleMarketing.length > 0 && <span className="opacity-60">· {visibleMarketing.length} of {marketing.length}</span>}
        </p>
        {hiddenChannelCount > 0 && (
          <button
            onClick={() => setShowAllChannels(s => !s)}
            className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
          >
            {showAllChannels ? `Hide ${hiddenChannelCount} smaller channels` : `Show ${hiddenChannelCount} smaller channels`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
        {visibleMarketing.map(ch => {
          const isSelected = selectedKpiChannel === ch.channel;
          const isBest = bestChannel?.channel === ch.channel;
          const cardButton = (
            <button
              key={ch.channel}
              onClick={() => setSelectedKpiChannel(isSelected ? null : ch.channel)}
              className={`text-left rounded-xl border p-3 bg-kpi shadow-sm transition-all duration-200
                hover:shadow-md hover:scale-[1.02] focus:outline-none w-full
                ${isSelected
                  ? 'ring-2 ring-primary border-primary/40 scale-[1.02]'
                  : isBest
                  ? 'ring-1 ring-primary/40 border-kpi/60'
                  : 'border-kpi/60'
                }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <ChannelIcon channel={ch.channel} size={14} />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">{ch.channel}</p>
                {isBest && !isSelected && <Star className="h-3 w-3 text-primary fill-primary ml-auto shrink-0" />}
                {isSelected && <X className="h-3 w-3 text-primary ml-auto shrink-0" />}
              </div>
              <p className="text-lg font-semibold tabular-nums">{ch.doctors}</p>
              <p className="text-[10px] text-muted-foreground">{ch.contacted} contacted <span className="opacity-60">({ch.contactRate}% of total)</span></p>
              <p className="text-[10px] text-primary/70">{ch.qualified} qualified <span className="opacity-60">({ch.qualifiedRate}%)</span></p>
              <p className="text-[10px] text-primary">{ch.converted} converted <span className="opacity-60">({ch.conversionRate}%)</span></p>
            </button>
          );
          return (
            <UiTooltip key={ch.channel}>
              <TooltipTrigger asChild>{cardButton}</TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px] max-w-[280px] leading-snug">
                <strong>{ch.channel}</strong> — {ch.doctors} doctors in this period.
                <div className="mt-1 space-y-0.5 text-[10px]">
                  <div><strong>Contacted:</strong> any status past Not Contacted ({ch.contactRate}% of leads).</div>
                  <div><strong>Qualified:</strong> reached Initial Sales Call Completed or High Priority Follow up ({ch.qualifiedRate}%).</div>
                  <div><strong>Converted:</strong> reached High Priority Follow up or Closed Won ({ch.conversionRate}%).</div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{isBest ? "Top channel by volume." : "Click to filter the dashboard to this channel."}</div>
              </TooltipContent>
            </UiTooltip>
          );
        })}
      </div>

      {/* Expand panel — slides open below cards when one is selected */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: selectedKpiChannel ? '320px' : '0px', opacity: selectedKpiChannel ? 1 : 0, marginBottom: selectedKpiChannel ? '20px' : '0px', marginTop: selectedKpiChannel ? '12px' : '0px' }}
      >
        {selectedKpiChannel && (
          <div className="rounded-xl border border-border/50 bg-card shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <ChannelIcon channel={selectedKpiChannel} size={14} />
              <span className="text-[12px] font-semibold uppercase tracking-wide">{selectedKpiChannel}</span>
              <span className="text-[11px] text-muted-foreground">· {kpiPanelDoctors.length} doctor{kpiPanelDoctors.length !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/70 inline-block" />{kpiPanelDoctors.filter(d => d.contacted).length} contacted</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />{kpiPanelDoctors.filter(d => !d.contacted).length} to reach</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  to={`/leads-pipeline?source=${encodeURIComponent(selectedKpiChannel)}&stage=Not%20Contacted`}
                  className="h-7 inline-flex items-center gap-1 rounded-md bg-warning/10 hover:bg-warning/20 text-warning px-2 text-[10px] font-medium transition-colors"
                >
                  Pull uncontacted →
                </Link>
                <Link
                  to={`/leads-pipeline?source=${encodeURIComponent(selectedKpiChannel)}`}
                  className="h-7 inline-flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary px-2 text-[10px] font-medium transition-colors"
                >
                  All leads →
                </Link>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
              {kpiPanelDoctors.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-6">No doctors found in this period</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {kpiPanelDoctors.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${d.contacted ? 'bg-primary/10' : 'bg-warning/10'}`}>
                        <User className={`h-3 w-3 ${d.contacted ? 'text-primary' : 'text-warning'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium truncate leading-tight">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight">{d.specialty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Doctors Acquired by Channel — top 8, horizontal — flippable */}
        <div style={{ perspective: '1000px' }} className="rounded-lg">
          <div style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s ease, height 0.35s ease',
            transform: acquiredChannel ? 'rotateX(-180deg)' : 'rotateX(0deg)',
            height: acquiredChannel ? '340px' : '340px',
          }}>
            {/* Front */}
            <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctors Acquired by Channel</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={marketing.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 4, right: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                    <XAxis
                      type="number"
                      fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <YAxis
                      type="category" dataKey="channel"
                      fontSize={10} width={90} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), 'Doctors']} />
                    <Bar dataKey="doctors" radius={[0, 4, 4, 0]} name="Doctors" cursor="pointer" onClick={(data) => setAcquiredChannel(data.channel)}>
                      {marketing.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`hsl(170, ${55 - i * 3}%, ${42 + i * 3}%)`} />
                      ))}
                      <LabelList dataKey="doctors" position="right" fontSize={10} fill="hsl(220,10%,45%)" formatter={(v: number) => v.toLocaleString()} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-[10px] text-muted-foreground mt-1">Click a bar to see the doctors list</p>
              </CardContent>
            </Card>
            {/* Back */}
            <Card className="shadow-sm border-border/50 absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ChannelIcon channel={acquiredChannel ?? ''} size={13} />
                    {acquiredChannel}
                  </CardTitle>
                  <button onClick={() => setAcquiredChannel(null)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/70 transition-colors">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{acquiredDoctors.length} doctor{acquiredDoctors.length !== 1 ? 's' : ''} from this channel</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '256px' }}>
                {acquiredDoctors.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">No doctors found</p>
                ) : (
                  <div className="space-y-1.5">
                    {acquiredDoctors.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{d.specialty} · {d.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Contacted vs Uncontacted — top 8, stacked horizontal — flippable */}
        <div style={{ perspective: '1000px' }} className="rounded-lg">
          <div style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s ease, height 0.35s ease',
            transform: uncontactedChannel ? 'rotateX(-180deg)' : 'rotateX(0deg)',
            height: '340px',
          }}>
            {/* Front */}
            <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <CardHeader className="pb-1 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Contacted vs Still to Reach</CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-info/80 inline-block" />Contacted</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30 inline-block" />Uncontacted</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={marketing.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 4, right: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                    <XAxis
                      type="number"
                      fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <YAxis
                      type="category" dataKey="channel"
                      fontSize={10} width={90} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <Tooltip
                      contentStyle={tip}
                      formatter={(v: number, name: string) => [v.toLocaleString(), name]}
                    />
                    {/* Flat-ended stacked bars — radius arrays render incorrectly
                        on stacked horizontal bars in Recharts 2.x. */}
                    <Bar dataKey="contacted"   stackId="a" fill="hsl(210,75%,52%)" name="Contacted" />
                    <Bar dataKey="uncontacted" stackId="a" fill="hsl(220,14%,85%)" name="Uncontacted" cursor="pointer" onClick={(data) => setUncontactedChannel(data.channel)} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-[10px] text-muted-foreground mt-1">Click a bar to see uncontacted doctors</p>
              </CardContent>
            </Card>
            {/* Back */}
            <Card className="shadow-sm border-border/50 absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ChannelIcon channel={uncontactedChannel ?? ''} size={13} />
                    {uncontactedChannel} — Uncontacted
                  </CardTitle>
                  <button onClick={() => setUncontactedChannel(null)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/70 transition-colors">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{uncontactedDoctors.length} doctor{uncontactedDoctors.length !== 1 ? 's' : ''} still to reach</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '256px' }}>
                {uncontactedDoctors.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">All doctors contacted!</p>
                ) : (
                  <div className="space-y-1.5">
                    {uncontactedDoctors.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="h-6 w-6 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-warning" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{d.specialty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Leads by source — qualification rate + spend overlay */}
      <LeadsBySourceChart />

      {/* Channel economics: spend joined with leads */}
      <ChannelEconomicsTable />

      {/* Channel summary table */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Contacted</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Qualified</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Converted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketing.map(ch => (
                  <TableRow key={ch.channel} className="hover:bg-muted/30">
                    <TableCell className="text-[12px] font-medium py-2.5">
                      <div className="flex items-center gap-2">
                        <ChannelIcon channel={ch.channel} size={13} />
                        {ch.channel}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{ch.doctors}</TableCell>
                    <TableCell className="text-right py-2.5">
                      <span className={`text-[12px] tabular-nums ${
                        ch.contactRate >= 70 ? 'text-success' :
                        ch.contactRate >= 40 ? 'text-primary' :
                        'text-warning'
                      }`}>
                        <span className="font-semibold">{ch.contacted}</span>
                        <span className="text-[10px] font-normal ml-1 opacity-70">({ch.contactRate}%)</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right py-2.5">
                      <span className="text-[12px] tabular-nums text-primary/80">
                        <span className="font-semibold">{ch.qualified}</span>
                        <span className="text-[10px] font-normal ml-1 opacity-70">({ch.qualifiedRate}%)</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right py-2.5">
                      <span className={`text-[12px] tabular-nums ${
                        ch.conversionRate >= 40 ? 'text-success' :
                        ch.conversionRate >= 20 ? 'text-primary' :
                        'text-warning'
                      }`}>
                        <span className="font-semibold">{ch.converted}</span>
                        <span className="text-[10px] font-normal ml-1 opacity-70">({ch.conversionRate}%)</span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Marketing;

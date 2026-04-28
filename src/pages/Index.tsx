import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useCurrency } from "@/lib/CurrencyProvider";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
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
import { useState, useMemo } from "react";

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

const Index = () => {
  // fmtAED comes from the global currency context (AED/USD toggle in header).
  const { kpis, timeData, funnel, stageConversion, filteredLeads, filteredDeals, zohoLoading } = useFilteredData();
  const { fmt: fmtAED } = useCurrency();
  const { data: zoho } = useZohoData();
  const [channelDays, setChannelDays] = useState<number>(30);

  // "Where Doctors Come From" — filtered by local date range
  const filteredChannels = useMemo(() => {
    if (!zoho?.rawLeads) return [];
    const cutoff = Date.now() - channelDays * 86_400_000;
    const recent = zoho.rawLeads.filter(l =>
      new Date(l.Created_Time).getTime() >= cutoff
    );
    const map: Record<string, number> = {};
    for (const l of recent) {
      const ch = displaySource(l.Lead_Source);
      map[ch] = (map[ch] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([channel, doctors]) => ({ channel, doctors }));
  }, [zoho?.rawLeads, channelDays]);

  const activity = zoho?.recentActivity ?? [];

  // ── Expanded content for each KPI card ──────────────────────────────────────

  // 1. Qualified Active → status breakdown (reuse funnel data)
  const qualifiedActiveContent = (
    <div className="space-y-2">
      {funnel.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No data</p>
        : funnel.slice(0, 7).map(item => (
          <div key={item.stage}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">{item.stage}</span>
              <span className="text-[11px] font-semibold tabular-nums">{item.count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.pct}%` }} />
            </div>
          </div>
        ))
      }
    </div>
  );

  // 2. Lead → Placement → conversion funnel steps
  const conversionContent = (
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
  );

  // 3. Pipeline Value → top open deals
  const openDeals = filteredDeals
    .filter(d => d.Stage !== 'Closed Won' && d.Stage !== 'Closed Lost')
    .sort((a, b) => b.Amount - a.Amount)
    .slice(0, 5);
  const pipelineContent = (
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
  );

  // 4. Qualified Leads → top recently-qualified leads in the selected date range
  const qualStatusesForCard = new Set(['Initial Sales Call Completed', 'High Priority Follow up', 'Closed Won']);
  const qualifiedLeadsList = filteredLeads
    .filter(l => qualStatusesForCard.has(l.Lead_Status))
    .sort((a, b) => new Date(b.Created_Time).getTime() - new Date(a.Created_Time).getTime())
    .slice(0, 5);
  const notContactedCount = filteredLeads.filter(l => l.Lead_Status === 'Not Contacted').length;
  const qualifiedLeadsContent = (
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
  );

  // 5. Avg. Time to Place → individual cycle times
  const dealsWithCycle = filteredDeals
    .filter(d => d.Stage === 'Closed Won' && d.Created_Time && d.Closing_Date)
    .map(d => ({
      name: d.Deal_Name,
      days: Math.round((new Date(d.Closing_Date).getTime() - new Date(d.Created_Time).getTime()) / 86_400_000),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  const cycleContent = (
    <div className="divide-y divide-border/30">
      {dealsWithCycle.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No completed deal data</p>
        : dealsWithCycle.map(d => (
          <div key={d.name} className="flex items-center justify-between py-1.5 gap-2">
            <p className="text-[11px] font-medium truncate">{d.name}</p>
            <span className="text-[11px] font-semibold tabular-nums shrink-0 text-warning">{d.days} days</span>
          </div>
        ))
      }
    </div>
  );

  // 6. Qualification Rate → qualified vs unqualified breakdown
  const unqualStatuses = new Set(['Unqualified Leads', 'Not Interested']);
  const qualCount      = filteredLeads.filter(l => !unqualStatuses.has(l.Lead_Status)).length;
  const unqualCount    = filteredLeads.filter(l => l.Lead_Status === 'Unqualified Leads').length;
  const notIntCount    = filteredLeads.filter(l => l.Lead_Status === 'Not Interested').length;
  const total          = filteredLeads.length;
  const qualCats = [
    { label: 'Qualified / Active',  count: qualCount,   color: 'bg-success'       },
    { label: 'Unqualified',         count: unqualCount, color: 'bg-warning'        },
    { label: 'Not Interested',      count: notIntCount, color: 'bg-destructive/70' },
  ];
  const qualRateContent = (
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
  );

  // ── KPI card definitions ─────────────────────────────────────────────────────
  const kpiDefs = kpis.length > 0 ? [
    {
      title: kpis[0]?.label ?? 'Qualified Active',
      value: kpis[0]?.value ?? '—',
      icon: Users, color: 'text-primary', bg: 'bg-primary/10',
      frontExtra: kpis[0]?.period,
      expandedContent: qualifiedActiveContent,
      expandedHeight: 270,
    },
    {
      title: kpis[1]?.label ?? 'Lead → Placement',
      value: kpis[1]?.value ?? '—',
      icon: TrendingUp, color: 'text-success', bg: 'bg-success/10',
      frontExtra: kpis[1]?.period,
      expandedContent: conversionContent,
      expandedHeight: 300,
    },
    {
      title: kpis[2]?.label ?? 'Pipeline Value',
      value: kpis[2]?.value ?? '—',
      icon: DollarSign, color: 'text-info', bg: 'bg-info/10',
      frontExtra: kpis[2]?.period,
      expandedContent: pipelineContent,
      expandedHeight: 250,
    },
    {
      title: kpis[3]?.label ?? 'Qualified Leads',
      value: kpis[3]?.value ?? '—',
      icon: CheckCircle, color: 'text-success', bg: 'bg-success/10',
      frontExtra: kpis[3]?.period,
      expandedContent: qualifiedLeadsContent,
      expandedHeight: 250,
    },
    {
      title: kpis[4]?.label ?? 'Avg. Time to Place',
      value: kpis[4]?.value ?? '—',
      icon: Clock, color: 'text-warning', bg: 'bg-warning/10',
      frontExtra: kpis[4]?.period,
      expandedContent: cycleContent,
      expandedHeight: 230,
    },
    {
      title: kpis[5]?.label ?? 'Qualification Rate',
      value: kpis[5]?.value ?? '—',
      icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10',
      frontExtra: kpis[5]?.period,
      expandedContent: qualRateContent,
      expandedHeight: 220,
    },
  ] : [];

  return (
    <DashboardLayout title="Dashboard" subtitle="A quick look at how doctor placements and operations are performing">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
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
                <AreaChart data={timeData}>
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
                </AreaChart>
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
        {/* Where Doctors Come From — with date filter */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
                Where Doctors Come From
                <InfoIcon meaning="Top channels by number of new leads in the selected window." source="Zoho CRM (Lead_Source)." size={13} side="bottom" />
              </CardTitle>
              <div className="flex gap-0.5">
                {CHANNEL_RANGES.map(r => (
                  <button
                    key={r.label}
                    onClick={() => setChannelDays(r.days)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                      channelDays === r.days
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {zohoLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredChannels.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">No data for this period</p>
            ) : (
              <div className="space-y-2">
                {filteredChannels.map((ch) => (
                  <div key={ch.channel} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                    <ChannelIcon channel={ch.channel} size={14} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{ch.channel}</p>
                      <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.round((ch.doctors / Math.max(...filteredChannels.map(c => c.doctors))) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[15px] font-semibold text-foreground tabular-nums">{ch.doctors}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="inline-flex items-center gap-1 text-[14px] font-semibold text-foreground">
              Recent Activity
              <InfoIcon meaning="Latest pipeline events — new leads, status changes, deal updates." source="Zoho CRM." size={13} side="bottom" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {zohoLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[11px]">Loading activity…</span>
              </div>
            ) : activity.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {activity.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 pb-2 border-b border-border/40 last:border-0 last:pb-0 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                      {activityIcons[item.type] ?? activityIcons.call}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground leading-tight">{item.action}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Index;

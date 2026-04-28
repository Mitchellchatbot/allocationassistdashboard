import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { Phone, Mail, Clock, Users, UserCheck, Activity, ArrowRight, PhoneCall, AlertTriangle } from "lucide-react";

const Sales = () => {
  const { pipeline, sales, recruiters, stageConversion, filteredLeads } = useFilteredData();

  const maxLeads = Math.max(...recruiters.map(r => r.doctors), 1);

  // Overall conversion rate using the same lead-status metric as per-recruiter breakdown.
  // "Contact in Future" is excluded — it's unqualified (recruiter deferred).
  const convertedStatuses = new Set(['Initial Sales Call Completed', 'High Priority Follow up']);
  const overallConversionRate = filteredLeads.length > 0
    ? parseFloat(((filteredLeads.filter(l => convertedStatuses.has(l.Lead_Status)).length / filteredLeads.length) * 100).toFixed(1))
    : 0;

  // ── Expanded content for KPI cards ──────────────────────────────────────────

  // 1. Total Leads Managed → top 5 recruiters
  const topRecruiters = recruiters.slice(0, 5);
  const maxR = Math.max(...topRecruiters.map(r => r.doctors), 1);
  const totalLeadsContent = (
    <div className="space-y-2">
      {topRecruiters.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No sales consultant data</p>
        : topRecruiters.map((r, i) => (
          <div key={r.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{r.name}</span>
              <span className="text-[11px] font-semibold tabular-nums">{r.doctors.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(r.doctors / maxR) * 100}%`, backgroundColor: `hsl(${i * 47 % 360},55%,50%)` }}
              />
            </div>
          </div>
        ))
      }
    </div>
  );

  // 2. Active in Pipeline → pipeline stage breakdown
  const activePipelineContent = (
    <div className="space-y-2">
      {pipeline.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No pipeline data</p>
        : pipeline.slice(0, 6).map(s => {
          const pct = sales.activeInPipeline > 0 ? Math.round((s.count / sales.activeInPipeline) * 100) : 0;
          return (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{s.stage}</span>
                <span className="text-[11px] font-semibold tabular-nums">{s.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          );
        })
      }
    </div>
  );

  // 3. Conversion Rate → lead conversion rate per recruiter
  const conversionRateContent = (
    <div className="space-y-2">
      {recruiters.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No sales consultant data</p>
        : recruiters.slice(0, 5).map(r => {
          const rate = (r as { conversionRate?: number }).conversionRate ?? 0;
          const barColor = rate >= 40 ? 'bg-success' : rate >= 20 ? 'bg-primary' : 'bg-warning';
          const maxRate = Math.max(...recruiters.map(x => (x as { conversionRate?: number }).conversionRate ?? 0), 1);
          return (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{r.name}</span>
                <span className={`text-[11px] font-semibold tabular-nums ${rate >= 40 ? 'text-success' : rate >= 20 ? 'text-primary' : 'text-warning'}`}>{rate}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${(rate / maxRate) * 100}%` }} />
              </div>
            </div>
          );
        })
      }
    </div>
  );

  // 4. Qualified Contact Rate → contact rate per recruiter (qualified leads only)
  const qualifiedStatuses = new Set(['Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed', 'Contact in Future', 'High Priority Follow up']);
  const qualifiedLeads = filteredLeads.filter(l => qualifiedStatuses.has(l.Lead_Status));
  const qualifiedContacted = qualifiedLeads.filter(l => l.Lead_Status !== 'Not Contacted');
  const qualifiedContactRate = qualifiedLeads.length > 0
    ? parseFloat(((qualifiedContacted.length / qualifiedLeads.length) * 100).toFixed(1))
    : 0;

  const contactRateContent = (
    <div className="space-y-2">
      {recruiters.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No sales consultant data</p>
        : recruiters.slice(0, 5).map(r => {
          const rate = (r as { contactRate?: number }).contactRate ?? 0;
          const barColor = rate >= 70 ? 'bg-success' : rate >= 40 ? 'bg-primary' : 'bg-warning';
          return (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{r.name}</span>
                <span className={`text-[11px] font-semibold tabular-nums ${rate >= 70 ? 'text-success' : rate >= 40 ? 'text-primary' : 'text-warning'}`}>{rate}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${rate}%` }} />
              </div>
            </div>
          );
        })
      }
      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">Qualified leads only (excl. unqualified/not interested)</p>
    </div>
  );

  // 5. Urgent Follow-ups → list of high priority leads
  const urgentLeads = filteredLeads
    .filter(l => l.Lead_Status === 'High Priority Follow up')
    .slice(0, 8);
  const urgentContent = (
    <div className="divide-y divide-border/30">
      {urgentLeads.length === 0
        ? <p className="text-[11px] text-muted-foreground py-2">No urgent follow-ups</p>
        : urgentLeads.map(l => {
          const daysOld = Math.max(1, Math.floor((Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000));
          const daysInStage = daysOld <= 44 ? daysOld : (daysOld % 44) + 1;
          const slaBreached = daysInStage > 2;
          return (
            <div key={l.id} className="flex items-start justify-between py-1.5 gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-medium truncate">{l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—'}</p>
                  {slaBreached && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 border border-destructive/30 px-1 py-0 text-[8px] font-semibold text-destructive shrink-0">
                      <AlertTriangle className="h-2 w-2" />SLA
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{l.Owner?.name ?? '—'}</p>
              </div>
              <span className={`text-[10px] tabular-nums shrink-0 ${slaBreached ? 'text-destructive font-semibold' : 'text-warning'}`}>{daysInStage}d</span>
            </div>
          );
        })
      }
      {filteredLeads.filter(l => l.Lead_Status === 'High Priority Follow up').length > 8 && (
        <p className="text-[10px] text-muted-foreground text-center py-1.5">
          +{filteredLeads.filter(l => l.Lead_Status === 'High Priority Follow up').length - 8} more
        </p>
      )}
    </div>
  );

  return (
    <DashboardLayout title="Sales Tracker" subtitle="See where doctors are in the process and how recruiters are performing">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <ExpandableKPICard
          title="Total Leads Managed"
          value={sales.totalLeadsManaged.toLocaleString()}
          icon={Users}
          color="text-primary"
          bg="bg-primary/10"
          expandedContent={totalLeadsContent}
          expandedHeight={260}
        />
        <ExpandableKPICard
          title="Active in Pipeline"
          value={sales.activeInPipeline.toLocaleString()}
          icon={Activity}
          color="text-success"
          bg="bg-success/10"
          expandedContent={activePipelineContent}
          expandedHeight={260}
        />
        <ExpandableKPICard
          title="Lead Conversion Rate"
          value={`${overallConversionRate}%`}
          icon={UserCheck}
          color="text-info"
          bg="bg-info/10"
          expandedContent={conversionRateContent}
          expandedHeight={240}
        />
        <ExpandableKPICard
          title="Qualified Contact Rate"
          value={`${qualifiedContactRate}%`}
          icon={PhoneCall}
          color="text-warning"
          bg="bg-warning/10"
          expandedContent={contactRateContent}
          expandedHeight={240}
        />
        <ExpandableKPICard
          title="Urgent Follow-ups"
          value={sales.followUpsPending.toLocaleString()}
          icon={Clock}
          color="text-destructive"
          bg="bg-destructive/10"
          expandedContent={urgentContent}
          expandedHeight={280}
        />
      </div>

      {/* ── Stage Distribution ────────────────────────────────────────────── */}
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold text-foreground">Stage Distribution</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap items-stretch gap-1.5">
            {pipeline.slice(0, 5).map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-1.5">
                <div className="rounded-xl border border-border/50 bg-card px-4 py-3 text-center min-w-[90px] hover:border-primary/30 hover:shadow-sm hover:scale-[1.02] transition-all duration-200">
                  <div className="h-[3px] rounded-full mb-2 w-6 mx-auto" style={{ backgroundColor: stage.color }} />
                  <p className="text-[18px] font-bold text-foreground tabular-nums leading-none mb-0.5">{stage.count.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{stage.stage}</p>
                </div>
                {i < Math.min(pipeline.length, 5) - 1 && <ArrowRight className="h-3 w-3 text-border/60 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Middle row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">

        {/* Team Outreach */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground">Team Outreach</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {[
              { icon: Phone, label: "Calls Made",        val: sales.outboundCalls.toLocaleString(), sub: "outbound from Zoho Calls", color: "bg-primary/10 text-primary" },
              { icon: Mail,  label: "Emails Sent",       val: sales.emailsSent.toLocaleString(),    sub: "sampled from contacted leads",  color: "bg-info/10 text-info" },
              { icon: Clock, label: "Follow-ups Needed", val: sales.followUpsPending.toString(),    sub: "High Priority Follow up status", color: "bg-warning/10 text-warning" },
            ].map(m => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className={`h-9 w-9 rounded-lg ${m.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground">{m.sub}</p>
                  </div>
                  <p className="text-[22px] font-bold tabular-nums text-foreground">{m.val}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Conversion funnel */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground">Conversion at Each Step</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {stageConversion.map((s, i) => {
              const isLast = i === stageConversion.length - 1;
              const barColor = s.rate >= 50 ? "bg-success" : s.rate >= 20 ? "bg-primary" : s.rate >= 5 ? "bg-warning" : "bg-destructive/60";
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[12px] ${isLast ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s.stage}</span>
                    <span className={`text-[13px] font-bold tabular-nums ${s.rate >= 50 ? "text-success" : s.rate >= 20 ? "text-primary" : s.rate >= 5 ? "text-warning" : "text-destructive"}`}>
                      {s.rate}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${Math.max(s.rate, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Recruiter table ────────────────────────────────────────────────── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-foreground">Sales Consultant Performance</CardTitle>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="h-3 w-3" />
              {recruiters.length} active
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_70px_60px_65px_65px] gap-3 px-3 pb-1 border-b border-border/40">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Sales Consultant</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Leads</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Contacted</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right hidden md:block">Contact %</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right hidden md:block">Conv. %</span>
            </div>

            {recruiters.map((rep, i) => (
              <div
                key={rep.name}
                className="grid grid-cols-[1fr_70px_60px_65px_65px] gap-3 items-center px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors group"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
                    style={{ backgroundColor: `hsl(${(i * 47) % 360}, 55%, 50%)` }}
                  >
                    {rep.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{rep.name}</p>
                    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1 w-20">
                      <div
                        className="h-full rounded-full bg-primary/50 group-hover:bg-primary transition-colors duration-200"
                        style={{ width: `${(rep.doctors / maxLeads) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <span className="text-[12px] tabular-nums text-right text-muted-foreground">{rep.doctors.toLocaleString()}</span>
                <span className="text-[12px] tabular-nums text-right text-foreground">
                  {(rep as { contacted?: number }).contacted?.toLocaleString() ?? '—'}
                </span>
                <span className={`text-[12px] font-semibold tabular-nums text-right hidden md:block ${
                  ((rep as { contactRate?: number }).contactRate ?? 0) >= 70 ? 'text-success' :
                  ((rep as { contactRate?: number }).contactRate ?? 0) >= 40 ? 'text-primary' : 'text-warning'
                }`}>
                  {(rep as { contactRate?: number }).contactRate ?? 0}%
                </span>
                <span className={`text-[12px] font-semibold tabular-nums text-right hidden md:block ${
                  ((rep as { conversionRate?: number }).conversionRate ?? 0) >= 40 ? 'text-success' :
                  ((rep as { conversionRate?: number }).conversionRate ?? 0) >= 20 ? 'text-primary' : 'text-warning'
                }`}>
                  {(rep as { conversionRate?: number }).conversionRate ?? 0}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Sales;

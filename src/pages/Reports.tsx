import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocLink } from "@/components/DocLink";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { HI_TEAM_MEMBERS, findHiMemberByEmail } from "@/lib/hi-team";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Users, Building2, TrendingUp, TrendingDown, Minus,
  AlertCircle, Calendar, Activity, Sparkles, Send, UserCheck,
  CalendarCheck, FileSignature, MapPin, CreditCard, CheckCircle2, ArrowRight,
  Inbox, CalendarRange, ServerCog,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, Legend } from "recharts";
import { useReportingMetrics } from "@/hooks/use-reporting-metrics";
import { defaultRange, type ReportingFilters } from "@/lib/hospital-reporting";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import { PlacementsCard } from "@/components/reports/PlacementsCard";
import { RecapCard } from "@/components/reports/RecapCard";
import { DoctorTable } from "@/components/reports/DoctorTable";
import { CollapsibleSection, ScopeChip } from "@/components/reports/CollapsibleSection";
import { TopOfFunnelContent, useTopOfFunnelStats } from "@/components/reports/TopOfFunnelCard";
import { OperationsContent, useOperationsSummary } from "@/components/reports/OperationsCard";

/**
 * Phase 5 — Hospital Introduction Department reporting page.
 *
 * Date range + four filter dropdowns drive every panel:
 *   - KPI strip (shortlists, interviews, offered, signed, joined, paid, profile sends)
 *   - Weekly trend chart (shortlisted / interviews / signed)
 *   - Per-team-member table (Rodina did X, Mohammed did Y)
 *   - Per-hospital table with relationship health score + warming/cooling badge
 *   - "Doctors on the way" panel (signed but not joined, for chase reminders)
 *
 * Source: Saif Ullah meeting, May 20 2026 — Phase 5 spec.
 */
export default function Reports() {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [hospital,   setHospital]   = useState<string>("__all");
  const [teamMember, setTeamMember] = useState<string>("__all");
  const [specialty,  setSpecialty]  = useState<string>("__all");

  const filters: ReportingFilters = useMemo(() => ({
    range:      defaultRange(rangeDays),
    hospital:   hospital === "__all"   ? null : hospital,
    teamMember: teamMember === "__all" ? null : teamMember,
    specialty:  specialty === "__all"  ? null : specialty,
  }), [rangeDays, hospital, teamMember, specialty]);

  const bundle = useReportingMetrics(filters);

  // Summary-first restructure (2026-06-08): one open-section map drives
  // every Collapsible. Everything starts CLOSED except the KPI strip +
  // trend chart (which aren't in the map — always rendered open). Pure
  // UI state, nothing persisted.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => (v: boolean) => setOpen(s => ({ ...s, [k]: v }));

  // Headline numbers for the collapsed triggers, so the key figure is
  // visible WITHOUT expanding the section.
  const { data: funnelStats, isLoading: funnelLoading } = useTopOfFunnelStats();
  const opsSummary = useOperationsSummary();

  const hospitalFilter  = hospital  === "__all" ? null : hospital;
  const specialtyFilter = specialty === "__all" ? null : specialty;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-teal-600" />
              Reports
              <DocLink slug="hospital-introduction/reports" />
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hospital Introduction Department metrics for the last {rangeDays} days. Filter by hospital, team member, or specialty.
            </p>
          </div>
          <FilterBar
            rangeDays={rangeDays} setRangeDays={setRangeDays}
            hospital={hospital} setHospital={setHospital}
            teamMember={teamMember} setTeamMember={setTeamMember}
            specialty={specialty} setSpecialty={setSpecialty}
            options={bundle.options}
          />
        </div>

        {/* ── KPI strip — the single canonical home for absolute totals.
            Split into two labeled clusters so the 7-wide rainbow reads as
            two ideas (work-in-progress vs results) instead of one flat
            row. Always open. ─────────────────────────────────────────── */}
        <KpiStrip bundle={bundle} />

        {/* ── Top of funnel — what's arriving before the HI pipeline even
            starts (submissions + outreach coverage). Default-collapsed;
            the trigger shows the all-time submission count. ──────────── */}
        <CollapsibleSection
          title="Top of funnel"
          icon={<Inbox className="h-4 w-4 text-slate-600" />}
          description="Form submissions + outreach coverage (new → contacted → qualified). Independent of the date filter above."
          summary={
            <SummaryBadge
              loading={funnelLoading}
              value={funnelStats?.total ?? 0}
              label="submissions"
            />
          }
          open={!!open.funnel}
          onOpenChange={toggle("funnel")}
        >
          <TopOfFunnelContent stats={funnelStats} loading={funnelLoading} />
        </CollapsibleSection>

        {/* ── Weekly trend + Doctors on the way — kept OPEN (the trend is
            the at-a-glance health line; the chase list is actionable). ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-600" />
                Weekly trend
              </CardTitle>
              <CardDescription className="text-[11px]">
                Shortlists, interviews, and signs per week. Helps catch dropoffs early.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart trend={bundle.trend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Doctors on the way
              </CardTitle>
              <CardDescription className="text-[11px]">
                Signed but not yet joined. Tick-scheduler nudges weekly.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DoctorsOnTheWay rows={bundle.doctorsOnTheWay} />
            </CardContent>
          </Card>
        </div>

        {/* ── Recap — week/month deltas. DELTAS ONLY now (absolutes live
            in the KPI strip). Fixed-week by design, so a scope chip flags
            that it ignores the date filter. ─────────────────────────── */}
        <CollapsibleSection
          title="Weekly + Monthly recap"
          icon={<CalendarRange className="h-4 w-4 text-teal-600" />}
          scope={<ScopeChip>This / last week + month</ScopeChip>}
          description="Change in each placement-attempt milestone vs the prior period (the KPI strip up top holds the absolute totals). One doctor shortlisted at 4 hospitals = 4 shortlists."
          open={!!open.recap}
          onOpenChange={toggle("recap")}
        >
          <RecapCard hospital={hospitalFilter} specialty={specialtyFilter} />
        </CollapsibleSection>

        {/* ── Pipeline health / Operations — the machinery behind the
            funnel: contracts, CV backlog, batch sends, candidate pool.
            Default-collapsed; trigger flags anything that needs a chase. ── */}
        <CollapsibleSection
          title="Pipeline health / Operations"
          icon={<ServerCog className="h-4 w-4 text-slate-600" />}
          scope={<ScopeChip>Recent ops</ScopeChip>}
          description="Contracts e-sign funnel, CV upload backlog, batch sends, and the candidate pool. Reflects recent operations, not the date filter."
          summary={
            <div className="flex items-center gap-1.5 justify-end flex-wrap">
              <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                {opsSummary.contractsSigned} signed
              </Badge>
              {opsSummary.cvPending > 0 && (
                <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                  {opsSummary.cvPending} CV pending
                </Badge>
              )}
              {opsSummary.failedBatches > 0 && (
                <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-700 border-rose-200">
                  {opsSummary.failedBatches} batch failed
                </Badge>
              )}
            </div>
          }
          open={!!open.ops}
          onOpenChange={toggle("ops")}
        >
          <OperationsContent />
        </CollapsibleSection>

        {/* ── Breakdowns — the heavy per-entity tables, grouped under one
            labeled region. All default-collapsed so first paint stays
            light. ───────────────────────────────────────────────────── */}
        <div className="pt-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Breakdowns
          </h2>
          <div className="space-y-6">
            {/* By team */}
            <CollapsibleSection
              title="By team member"
              icon={<Users className="h-4 w-4 text-violet-600" />}
              description="Rolls up flow actions by whoever triggered them. Signed counts will populate as new contracts are completed under this version."
              summary={<SummaryBadge loading={bundle.isLoading} value={bundle.team.length} label="members" />}
              open={!!open.team}
              onOpenChange={toggle("team")}
              flush
            >
              <TeamTable rows={bundle.team} loading={bundle.isLoading} />
            </CollapsibleSection>

            {/* By hospital — surfaced above the per-doctor table so the team
                scans accounts first (who's warming / cooling). */}
            <CollapsibleSection
              title="By hospital"
              icon={<Building2 className="h-4 w-4 text-sky-600" />}
              description={`Open vacancies + activity + relationship health. Warming/cooling vs the prior ${rangeDays}-day window.`}
              summary={<SummaryBadge loading={bundle.isLoading} value={bundle.hospitals.length} label="hospitals" />}
              open={!!open.hospital}
              onOpenChange={toggle("hospital")}
              flush
            >
              <HospitalTable rows={bundle.hospitals} loading={bundle.isLoading} />
            </CollapsibleSection>

            {/* Placements (Ammar 2026-06-03) — replaces the Hammad sheet.
                Per-(doctor, hospital) milestones + 45-day payment clock.
                Carries its own action header + its own 5-row window, so it
                stays a self-contained collapsible Card. */}
            <PlacementsCard
              rangeDays={rangeDays}
              hospital={hospitalFilter}
              specialty={specialtyFilter}
              open={!!open.placements}
              onOpenChange={toggle("placements")}
            />

            {/* Per-doctor breakdown — companion to the hospital table.
                Ammar 2026-06-03: 'add another table over here for the
                individual doctors themselves'. */}
            <DoctorTable
              rangeDays={rangeDays}
              hospital={hospitalFilter}
              specialty={specialtyFilter}
              open={!!open.doctors}
              onOpenChange={toggle("doctors")}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Compact "N label" pill for collapsed-section triggers. */
function SummaryBadge({ loading, value, label }: { loading: boolean; value: number; label: string }) {
  if (loading) return <Skeleton className="h-5 w-20" />;
  return (
    <Badge variant="outline" className="text-[10px] bg-slate-50 tabular-nums">
      {value.toLocaleString()} {label}
    </Badge>
  );
}

function FilterBar({ rangeDays, setRangeDays, hospital, setHospital, teamMember, setTeamMember, specialty, setSpecialty, options }: {
  rangeDays: 7 | 30 | 90;
  setRangeDays: (n: 7 | 30 | 90) => void;
  hospital: string; setHospital: (s: string) => void;
  teamMember: string; setTeamMember: (s: string) => void;
  specialty: string; setSpecialty: (s: string) => void;
  options: { hospitals: string[]; teamMembers: string[]; specialties: string[] };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="reports-filters">
      <div className="inline-flex rounded-md border bg-white">
        {[7, 30, 90].map(n => (
          <button
            key={n}
            onClick={() => setRangeDays(n as 7 | 30 | 90)}
            className={`px-3 py-1.5 text-[11px] font-medium border-r last:border-r-0 ${rangeDays === n ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {n}d
          </button>
        ))}
      </div>
      <Select value={hospital} onValueChange={setHospital}>
        <SelectTrigger className="h-8 w-[180px] text-[11px]"><SelectValue placeholder="Hospital" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All hospitals</SelectItem>
          {options.hospitals.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={teamMember} onValueChange={setTeamMember}>
        <SelectTrigger className="h-8 w-[200px] text-[11px]"><SelectValue placeholder="Team member" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All team members</SelectItem>
          {/* HI roster pinned at the top — surfaced as full names so the
              filter reads "Rodaina Thabit" rather than the raw email. */}
          <SelectGroup>
            <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">Hospital Introduction</SelectLabel>
            {HI_TEAM_MEMBERS.map(m => (
              <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>
            ))}
          </SelectGroup>
          {/* Everyone else who's ever stamped a created_by (sales / admin
              recruiters). Excludes anyone already in the HI group. */}
          {options.teamMembers.filter(m => !findHiMemberByEmail(m)).length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">Other</SelectLabel>
                {options.teamMembers
                  .filter(m => !findHiMemberByEmail(m))
                  .map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <Select value={specialty} onValueChange={setSpecialty}>
        <SelectTrigger className="h-8 w-[170px] text-[11px]"><SelectValue placeholder="Specialty" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All specialties</SelectItem>
          {options.specialties.slice(0, 100).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function KpiStrip({ bundle }: { bundle: ReturnType<typeof useReportingMetrics> }) {
  const navigate = useNavigate();
  const { rawRuns, rawLifecycles, filters } = bundle;

  // Pre-bucket all the drilldown lists ONCE per filter/data change. Doing
  // this inside useMemo means the flip animation never re-runs the
  // filter+sort + JSX build mid-rotation — the back face just paints what's
  // already in memory.
  const drilldowns = useMemo(() => {
    const inRange = (iso: string | null | undefined): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= filters.range.from.getTime() && t <= filters.range.to.getTime();
    };
    const passesRunFilters = (r: FlowRun): boolean => {
      if (filters.hospital   && r.hospital   !== filters.hospital)   return false;
      if (filters.doctorId   && r.doctor_id  !== filters.doctorId)   return false;
      if (filters.teamMember && (r.created_by ?? "").toLowerCase() !== filters.teamMember.toLowerCase()) return false;
      if (filters.specialty) {
        const sp = (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined;
        if (!sp || !sp.toLowerCase().includes(filters.specialty.toLowerCase())) return false;
      }
      return true;
    };
    const filteredRunsByKey = (flowKey: string): FlowRun[] =>
      rawRuns
        .filter(r => r.flow_key === flowKey && passesRunFilters(r) && inRange(r.started_at))
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const usingFilter = !!(filters.doctorId || filters.hospital || filters.teamMember || filters.specialty);
    const eligibleDoctorIds: Set<string> | null = usingFilter
      ? (() => {
          const set = new Set<string>();
          for (const r of rawRuns) if (passesRunFilters(r) && r.doctor_id) set.add(r.doctor_id);
          return set;
        })()
      : null;
    const passesLifecycleFilters = (l: DoctorLifecycle) => !eligibleDoctorIds || eligibleDoctorIds.has(l.doctor_id);
    const lifecyclesByMilestone = (key: "signed_at" | "joined_at" | "paid_at"): DoctorLifecycle[] =>
      rawLifecycles
        .filter(l => l[key] && inRange(l[key]) && passesLifecycleFilters(l))
        .sort((a, b) => new Date(b[key] as string).getTime() - new Date(a[key] as string).getTime());

    return {
      profile_sent:     filteredRunsByKey("profile_sent"),
      shortlist:        filteredRunsByKey("shortlist"),
      interview:        filteredRunsByKey("interview"),
      contract_signing: filteredRunsByKey("contract_signing"),
      signed:           lifecyclesByMilestone("signed_at"),
      joined:           lifecyclesByMilestone("joined_at"),
      paid:             lifecyclesByMilestone("paid_at"),
    };
  }, [rawRuns, rawLifecycles, filters]);

  const tiles: Array<{
    label: string;
    value: number;
    icon: typeof Send;
    color: string;
    bg: string;
    drilldown: React.ReactNode;
    onClickThrough: () => void;
    meaning: string;
    source: string;
    /** Which cluster the tile belongs to — "pipeline" = work in
     *  progress (sends → offered), "outcomes" = results (signed → paid).
     *  Realises the grouping the old grid-cols-7 only hinted at in a
     *  comment. */
    group: "pipeline" | "outcomes";
  }> = [
    // Palette is deliberately quieter than v1: every tile sits on the same
    // bg-card neutral, only the thin accent stripe + icon carry stage color.
    // Reads as one visual unit, not a 7-colour rainbow.
    {
      label: "Profile sends",   value: bundle.kpis.profilesSent, icon: Send,
      color: "text-slate-600",  bg: "bg-card", group: "pipeline",
      meaning: "Doctor profiles emailed to a hospital recruiter in the selected window.",
      source:  "automation_flow_runs · flow_key=profile_sent",
      onClickThrough: () => navigate("/automations?flow=profile_sent"),
      drilldown: <RunsList rows={drilldowns.profile_sent} kind="hospital" emptyCta="profile_sent" onJump={() => navigate(`/automations?flow=profile_sent`)} />,
    },
    {
      label: "Shortlisted",     value: bundle.kpis.shortlisted, icon: UserCheck,
      color: "text-indigo-600", bg: "bg-card", group: "pipeline",
      meaning: "Doctors a hospital marked shortlisted in the window.",
      source: "automation_flow_runs · flow_key=shortlist",
      onClickThrough: () => navigate("/automations?flow=shortlist"),
      drilldown: <RunsList rows={drilldowns.shortlist} kind="hospital" emptyCta="shortlist" onJump={() => navigate(`/automations?flow=shortlist`)} />,
    },
    {
      label: "Interviews",      value: bundle.kpis.interviews, icon: CalendarCheck,
      color: "text-sky-600",    bg: "bg-card", group: "pipeline",
      meaning: "Interviews scheduled in the window (interview flow triggered).",
      source: "automation_flow_runs · flow_key=interview",
      onClickThrough: () => navigate("/automations?flow=interview"),
      drilldown: <RunsList rows={drilldowns.interview} kind="hospital" emptyCta="interview" onJump={() => navigate(`/automations?flow=interview`)} />,
    },
    {
      label: "Offered",         value: bundle.kpis.offered, icon: FileSignature,
      color: "text-amber-600",  bg: "bg-card", group: "pipeline",
      meaning: "Contracts sent for signature in the window (contract_signing flow started).",
      source: "automation_flow_runs · flow_key=contract_signing",
      onClickThrough: () => navigate("/automations?flow=contract_signing"),
      drilldown: <RunsList rows={drilldowns.contract_signing} kind="hospital" emptyCta="contract" onJump={() => navigate(`/automations?flow=contract_signing`)} />,
    },
    // Won column — all share the emerald family so the eye reads them as
    // related milestones rather than three different states.
    {
      label: "Signed",          value: bundle.kpis.signed, icon: CheckCircle2,
      color: "text-emerald-600", bg: "bg-card", group: "outcomes",
      meaning: "Doctors who signed their contract in the window.",
      source: "doctor_lifecycle.signed_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.signed} milestone="signed_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
    {
      label: "Joined",          value: bundle.kpis.joined, icon: MapPin,
      color: "text-emerald-700", bg: "bg-card", group: "outcomes",
      meaning: "Doctors whose hospital-confirmed joining date fell in the window.",
      source: "doctor_lifecycle.joined_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.joined} milestone="joined_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
    {
      label: "Paid",            value: bundle.kpis.paid, icon: CreditCard,
      color: "text-emerald-800", bg: "bg-card", group: "outcomes",
      meaning: "Doctors whose second-payment invoice was marked paid in the window.",
      source: "doctor_lifecycle.paid_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.paid} milestone="paid_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
  ];

  const pipeline = tiles.filter(t => t.group === "pipeline");
  const outcomes = tiles.filter(t => t.group === "outcomes");

  // Two labeled clusters: "Pipeline" (work in progress) + "Outcomes"
  // (results). Realises the grouping the old single grid-cols-7 only
  // gestured at in a comment.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
      <KpiCluster label="Pipeline" tiles={pipeline} className="lg:col-span-4" innerCols="lg:grid-cols-4" />
      <KpiCluster label="Outcomes" tiles={outcomes} className="lg:col-span-3" innerCols="lg:grid-cols-3" baseDelay={pipeline.length} />
    </div>
  );
}

function KpiCluster({ label, tiles, className, innerCols, baseDelay = 0 }: {
  label: string;
  tiles: Array<{
    label: string; value: number; icon: typeof Send; color: string; bg: string;
    drilldown: React.ReactNode; onClickThrough: () => void; meaning: string; source: string;
  }>;
  className?: string;
  innerCols: string;
  baseDelay?: number;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${innerCols} gap-3`}>
        {tiles.map((t, idx) => (
          <div key={t.label} className="aa-fade-up" style={{ animationDelay: `${(baseDelay + idx) * 50}ms` }}>
            <ExpandableKPICard
              title={t.label}
              value={t.value.toLocaleString()}
              icon={t.icon}
              color={t.color}
              bg={t.bg}
              hintMeaning={t.meaning}
              hintSource={t.source}
              expandedHeight={260}
              expandedContent={
                <div className="space-y-2">
                  {t.drilldown}
                  <button
                    onClick={(e) => { e.stopPropagation(); t.onClickThrough(); }}
                    className="w-full text-[10px] text-teal-700 hover:text-teal-900 hover:bg-teal-50 px-2 py-1.5 rounded-md border border-teal-200/60 mt-2 flex items-center justify-center gap-1 transition-colors"
                  >
                    View all
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RunsList({ rows, kind, emptyCta, onJump }: {
  rows: FlowRun[];
  kind: "hospital" | "stage";
  emptyCta: string;
  onJump: (r: FlowRun) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-4 text-[11px] text-muted-foreground italic">
        Nothing in this window. Trigger one from the {emptyCta} flow.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {rows.slice(0, 8).map(r => (
        <button
          key={r.id}
          onClick={(e) => { e.stopPropagation(); onJump(r); }}
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
        >
          <div className="text-[11px] font-medium text-slate-900 truncate">{r.doctor_name}</div>
          <div className="text-[9px] text-muted-foreground truncate">
            {kind === "hospital" && r.hospital ? r.hospital : r.current_stage}
            <> · {relativeShort(r.started_at)}</>
          </div>
        </button>
      ))}
      {rows.length > 8 && (
        <div className="text-[10px] text-muted-foreground italic text-center pt-1">
          +{rows.length - 8} more
        </div>
      )}
    </div>
  );
}

function LifecycleList({ rows, milestone, onJump }: {
  rows: DoctorLifecycle[];
  milestone: "signed_at" | "joined_at" | "paid_at";
  onJump: (doctorId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-4 text-[11px] text-muted-foreground italic">
        Nothing in this window.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {rows.slice(0, 8).map(l => (
        <button
          key={l.doctor_id}
          onClick={(e) => { e.stopPropagation(); onJump(l.doctor_id); }}
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
        >
          <div className="text-[11px] font-medium text-slate-900 truncate">{l.doctor_name ?? l.doctor_id}</div>
          <div className="text-[9px] text-muted-foreground truncate">
            {relativeShort(l[milestone])}
          </div>
        </button>
      ))}
      {rows.length > 8 && (
        <div className="text-[10px] text-muted-foreground italic text-center pt-1">
          +{rows.length - 8} more
        </div>
      )}
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="px-4 py-3 space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? "w-[28%]" : "w-[8%]"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function relativeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30)  return `${days}d ago`;
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}

function TrendChart({ trend }: { trend: ReturnType<typeof useReportingMetrics>["trend"] }) {
  if (!trend || trend.length === 0) {
    return <div className="text-center text-[12px] text-muted-foreground py-12">No activity in this range.</div>;
  }
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
          <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <ChartTooltip
            labelFormatter={(d: string) => `Week of ${new Date(d).toLocaleDateString()}`}
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="shortlisted" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="interviews"  stroke="#0284c7" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="signed"      stroke="#14a098" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TeamTable({ rows, loading }: { rows: ReturnType<typeof useReportingMetrics>["team"]; loading: boolean }) {
  if (loading) return <TableSkeleton rows={4} cols={6} />;
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
        No team-attributed activity in this range yet. Once Rodina, Mohammed et al. start triggering flows in the dashboard, their counts will roll up here.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[11px]">Team member</TableHead>
          <TableHead className="text-[11px] text-right">Profile sends</TableHead>
          <TableHead className="text-[11px] text-right">Shortlisted</TableHead>
          <TableHead className="text-[11px] text-right">Interviews</TableHead>
          <TableHead className="text-[11px] text-right">Offered</TableHead>
          <TableHead className="text-[11px] text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.email}>
            <TableCell className="text-[12px] font-medium">{r.email}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.profilesSent}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.shortlisted}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.interviews}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.offered}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums font-medium">{r.total}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HospitalTable({ rows, loading }: { rows: ReturnType<typeof useReportingMetrics>["hospitals"]; loading: boolean }) {
  if (loading) return <TableSkeleton rows={6} cols={8} />;
  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
        No hospital activity in this range. Try widening the date filter, or trigger a few flows from Automations.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[11px]">Hospital</TableHead>
          <TableHead className="text-[11px] text-right">Open vacancies</TableHead>
          <TableHead className="text-[11px] text-right">Shortlisted</TableHead>
          <TableHead className="text-[11px] text-right">Interviews</TableHead>
          <TableHead className="text-[11px] text-right">Signed</TableHead>
          <TableHead className="text-[11px] text-right">Last activity</TableHead>
          <TableHead className="text-[11px] text-right">Trend</TableHead>
          <TableHead className="text-[11px] text-right">Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.hospital}>
            <TableCell className="text-[12px] font-medium">{r.hospital}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.openVacancies}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.shortlisted}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.interviews}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.signed}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">
              {r.daysSinceLastInteraction == null
                ? <span className="text-muted-foreground">—</span>
                : r.daysSinceLastInteraction === 0
                  ? "today"
                  : `${r.daysSinceLastInteraction}d ago`}
            </TableCell>
            <TableCell className="text-right">
              <TrendBadge trend={r.trend} signed={r.signed} prior={r.signedPrior} />
            </TableCell>
            <TableCell className="text-right">
              <HealthBadge score={r.health} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TrendBadge({ trend, signed, prior }: { trend: "warming" | "steady" | "cooling"; signed: number; prior: number }) {
  const Icon = trend === "warming" ? TrendingUp : trend === "cooling" ? TrendingDown : Minus;
  const cls = trend === "warming" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : trend === "cooling" ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <Badge variant="outline" className={`${cls} text-[9px] uppercase tracking-wider`} title={`${signed} signed vs ${prior} in the prior window`}>
      <Icon className="h-2.5 w-2.5 mr-1" /> {trend}
    </Badge>
  );
}

function HealthBadge({ score }: { score: number }) {
  const tone =
    score >= 70 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    score >= 40 ? "bg-amber-100 text-amber-800 border-amber-200"      :
                  "bg-rose-100 text-rose-800 border-rose-200";
  return (
    <Badge variant="outline" className={`${tone} tabular-nums text-[10px]`}>
      {score}
    </Badge>
  );
}

function DoctorsOnTheWay({ rows }: { rows: ReturnType<typeof useReportingMetrics>["doctorsOnTheWay"] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
        Nobody's mid-relocation right now.
      </div>
    );
  }
  return (
    <div className="divide-y max-h-[260px] overflow-y-auto">
      {rows.slice(0, 20).map(r => {
        const overdue = r.daysSinceSigned > 14;
        return (
          <div key={r.doctor_id} className={`px-3 py-2 flex items-center gap-2 ${overdue ? "bg-amber-50/40" : ""}`}>
            {overdue && <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">{r.doctor_name}</div>
              <div className="text-[10px] text-muted-foreground">
                Signed {formatDate(r.signed_at)} · {r.daysSinceSigned}d ago
              </div>
            </div>
          </div>
        );
      })}
      {rows.length > 20 && (
        <div className="px-3 py-2 text-[10px] text-muted-foreground bg-slate-50">
          +{rows.length - 20} more
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}

void Calendar; void Input; void Label;

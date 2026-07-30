import { memo, useMemo, useState, lazy, Suspense } from "react";
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
import { useReportingMetrics } from "@/hooks/use-reporting-metrics";
import { defaultRange, pctChange, type ReportingFilters, type KpiTotals } from "@/lib/hospital-reporting";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import { PlacementsCard } from "@/components/reports/PlacementsCard";
import { CeoSummary } from "@/components/reports/CeoSummary";
import { DoctorTable } from "@/components/reports/DoctorTable";
import { CollapsibleSection, ScopeChip } from "@/components/reports/CollapsibleSection";
import { DataGate } from "@/components/reports/AwaitingData";
import { PlacementBreakdowns } from "@/components/reports/PlacementBreakdowns";
import { VacanciesSummary } from "@/components/reports/VacanciesSummary";
import { DataQualityCard } from "@/components/reports/DataQualityCard";
import { TopOfFunnelContent, useTopOfFunnelStats } from "@/components/reports/TopOfFunnelCard";
import { OperationsContent, useOperationsSummary } from "@/components/reports/OperationsCard";

// Lazy so the recharts (vendor-charts) chunk is deferred until the trend
// chart actually mounts. Wrapped in <Suspense> at the usage site with a
// 260px fallback matching the chart height so layout doesn't jump.
const ReportsTrendChart = lazy(() => import("./ReportsTrendChart"));

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
  // Filters live in the URL so a view is shareable/bookmarkable and sticks
  // across navigation. Default range is "This year" (365d) — the 30-day default
  // hid the imported 2025–26 backlog, which the team kept tripping over.
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeDays  = Number(searchParams.get("range")) || 365;
  const hospital   = searchParams.get("hospital")  ?? "__all";
  const teamMember = searchParams.get("team")      ?? "__all";
  const specialty  = searchParams.get("specialty") ?? "__all";
  const setParam = (key: string, val: string, def: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (val === def) next.delete(key); else next.set(key, val);
    return next;
  }, { replace: true });
  const setRangeDays  = (n: number) => setParam("range", String(n), "365");
  const setHospital   = (v: string) => setParam("hospital", v, "__all");
  const setTeamMember = (v: string) => setParam("team", v, "__all");
  const setSpecialty  = (v: string) => setParam("specialty", v, "__all");

  const filters: ReportingFilters = useMemo(() => ({
    range:      defaultRange(rangeDays),
    hospital:   hospital === "__all"   ? null : hospital,
    teamMember: teamMember === "__all" ? null : teamMember,
    specialty:  specialty === "__all"  ? null : specialty,
  }), [rangeDays, hospital, teamMember, specialty]);

  const bundle = useReportingMetrics(filters);

  // CEO-first restructure (2026-07-31): the page now opens on an answer-first
  // hero (CeoSummary) + the trend + "where the wins are", and demotes ALL the
  // per-entity / ops tables into a collapsed "Operational detail" region. One
  // open-section map drives every Collapsible; everything starts CLOSED so the
  // exec surface stays a clean one-screen read. Pure UI state, nothing persisted.
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
              Hospital Introduction Department metrics for {rangeDays >= 3650 ? "all time" : rangeDays >= 365 ? "the last year" : `the last ${rangeDays} days`}. Filter by hospital, team member, or specialty.
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

        {/* ── CEO summary — answer-first hero: a plain-English headline + a
            Weekly/Monthly outcome scoreboard (distinct doctors, one consistent
            source). This is the "are we okay?" layer; everything below it is
            progressively more detail. ─────────────────────────────────────── */}
        <CeoSummary hospital={hospitalFilter} specialty={specialtyFilter} />

        {/* ── At-a-glance health line — the one chart a CEO reads without
            expanding anything. Kept visible, full width. ──────────────────── */}
        <Card>
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
            <Suspense fallback={<div className="h-[260px] w-full" />}>
              <ReportsTrendChart trend={bundle.trend} />
            </Suspense>
          </CardContent>
        </Card>

        {/* ── Where the wins are — the segment layer: which region, which
            specialties, which hospitals, how long the journey takes, and what
            we're recruiting for. Kept visible so the CEO sees WHERE results
            come from without digging. ─────────────────────────────────────── */}
        <div className="pt-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Where the wins are
          </h2>
          <div className="space-y-6">
            <PlacementBreakdowns range={filters.range} hospital={hospitalFilter} specialty={specialtyFilter} />
            <VacanciesSummary />
          </div>
        </div>

        {/* ── Operational detail — the depth layer. Everything the team needs
            but a CEO shouldn't scroll past: full range metrics, funnel, chase
            list, per-person / per-hospital / per-doctor tables, ops machinery.
            All collapsed by default. ──────────────────────────────────────── */}
        <div className="pt-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Operational detail
          </h2>
          <div className="space-y-6">
            {/* Full absolute totals over the custom range + per-tile drill-downs
                — the analyst's scoreboard, demoted below the CEO summary. */}
            <CollapsibleSection
              title="All metrics · custom range"
              icon={<BarChart3 className="h-4 w-4 text-teal-600" />}
              description="Absolute totals over the date range chosen above, with per-tile drill-downs. The CEO summary at the top uses calendar weeks/months instead."
              summary={<SummaryBadge loading={bundle.isLoading} value={bundle.kpis.signed} label="signed" />}
              open={!!open.metrics}
              onOpenChange={toggle("metrics")}
            >
              <div className="pt-1">
                <KpiStrip bundle={bundle} />
              </div>
            </CollapsibleSection>

            {/* Top of funnel */}
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

            {/* Doctors on the way — signed but not yet relocated (chase list). */}
            <CollapsibleSection
              title="Doctors on the way"
              icon={<Sparkles className="h-4 w-4 text-amber-600" />}
              description="Signed but not yet joined. Tick-scheduler nudges weekly."
              summary={<SummaryBadge loading={bundle.isLoading} value={bundle.doctorsOnTheWay.length} label="in transit" />}
              open={!!open.dotw}
              onOpenChange={toggle("dotw")}
              flush
            >
              <DoctorsOnTheWay rows={bundle.doctorsOnTheWay} />
            </CollapsibleSection>

            {/* Pipeline health / Operations */}
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

            {/* Data quality — surfaces unclassified hospital regions to fix
                (only renders when there's something to clean up). */}
            <DataQualityCard />

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
              <DataGate
                has={bundle.team.length > 0}
                loading={bundle.isLoading}
                title="No per-person results yet"
                note="This fills in as your team marks doctors (shortlist / interview / offer / sign / relocate) in the dashboard — each marking is attributed to whoever recorded it. The imported historical placements have no owner, so they aren't counted per person here."
              >
                <TeamTable rows={bundle.team} loading={bundle.isLoading} />
              </DataGate>
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
  rangeDays: number;
  setRangeDays: (n: number) => void;
  hospital: string; setHospital: (s: string) => void;
  teamMember: string; setTeamMember: (s: string) => void;
  specialty: string; setSpecialty: (s: string) => void;
  options: { hospitals: string[]; teamMembers: string[]; specialties: string[] };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="reports-filters">
      <div className="inline-flex rounded-md border bg-white">
        {[{ n: 7, l: "7d" }, { n: 30, l: "30d" }, { n: 90, l: "90d" }, { n: 365, l: "1y" }, { n: 3650, l: "All" }].map(({ n, l }) => (
          <button
            key={n}
            onClick={() => setRangeDays(n)}
            className={`px-3 py-1.5 text-[11px] font-medium border-r last:border-r-0 ${rangeDays === n ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {l}
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
      // range.to is local midnight of the last selected day — treat it as
      // end-of-day (+1 day, exclusive) so the final day is included, matching
      // the app-wide convention used by Sales/Marketing/Finance.
      return t >= filters.range.from.getTime() && t < filters.range.to.getTime() + 86_400_000;
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
    const lifecyclesByMilestone = (
      key: "shortlisted_at" | "interviewed_at" | "offered_at" | "signed_at" | "joined_at" | "paid_at",
    ): DoctorLifecycle[] =>
      rawLifecycles
        .filter(l => l[key] && inRange(l[key]) && passesLifecycleFilters(l))
        .sort((a, b) => new Date(b[key] as string).getTime() - new Date(a[key] as string).getTime());
    // Relocated = explicit relocation marking, else the actual join.
    const relocatedList = rawLifecycles
      .filter(l => (l.relocated_at ?? l.joined_at) && inRange(l.relocated_at ?? l.joined_at) && passesLifecycleFilters(l))
      .sort((a, b) => new Date((b.relocated_at ?? b.joined_at) as string).getTime() - new Date((a.relocated_at ?? a.joined_at) as string).getTime());

    return {
      profile_sent:     filteredRunsByKey("profile_sent"),
      shortlisted:      lifecyclesByMilestone("shortlisted_at"),
      interviewed:      lifecyclesByMilestone("interviewed_at"),
      offered:          lifecyclesByMilestone("offered_at"),
      signed:           lifecyclesByMilestone("signed_at"),
      relocated:        relocatedList,
      paid:             lifecyclesByMilestone("paid_at"),
    };
  }, [rawRuns, rawLifecycles, filters]);

  const tiles = useMemo<Array<{
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
  }>>(() => [
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
      meaning: "Doctors shortlisted in the window (from the marking system + imported reports).",
      source: "doctor_lifecycle.shortlisted_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.shortlisted} milestone="shortlisted_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
    {
      label: "Interviews",      value: bundle.kpis.interviews, icon: CalendarCheck,
      color: "text-sky-600",    bg: "bg-card", group: "pipeline",
      meaning: "Doctors interviewed in the window (from the marking system + imported reports).",
      source: "doctor_lifecycle.interviewed_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.interviewed} milestone="interviewed_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
    {
      label: "Offered",         value: bundle.kpis.offered, icon: FileSignature,
      color: "text-amber-600",  bg: "bg-card", group: "pipeline",
      meaning: "Doctors offered in the window (from the marking system + imported reports).",
      source: "doctor_lifecycle.offered_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.offered} milestone="offered_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
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
      label: "Relocated",       value: bundle.kpis.joined, icon: MapPin,
      color: "text-emerald-700", bg: "bg-card", group: "outcomes",
      meaning: "Doctors who relocated / started at the hospital in the window (explicit relocation marking, else the confirmed joining date).",
      source: "doctor_lifecycle.relocated_at ?? joined_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.relocated} milestone="joined_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
    {
      label: "Paid",            value: bundle.kpis.paid, icon: CreditCard,
      color: "text-emerald-800", bg: "bg-card", group: "outcomes",
      meaning: "Doctors whose second-payment invoice was marked paid in the window.",
      source: "doctor_lifecycle.paid_at",
      onClickThrough: () => navigate("/doctors?tab=profiles"),
      drilldown: <LifecycleList rows={drilldowns.paid} milestone="paid_at" onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)} />,
    },
  ], [drilldowns, bundle.kpis, navigate]);

  // Attach a period-over-period delta to each tile (▲/▼ vs the prior equal
  // window). Keyed by the tile label so the value + delta stay in lockstep.
  const KEY_BY_LABEL: Record<string, keyof KpiTotals> = {
    "Profile sends": "profilesSent", "Shortlisted": "shortlisted", "Interviews": "interviews",
    "Offered": "offered", "Signed": "signed", "Relocated": "joined", "Paid": "paid",
  };
  const tilesD = tiles.map(t => {
    const k = KEY_BY_LABEL[t.label];
    return { ...t, delta: k ? pctChange(bundle.kpis[k], bundle.kpisPrior[k]) : undefined };
  });
  const pipeline = tilesD.filter(t => t.group === "pipeline");
  const outcomes = tilesD.filter(t => t.group === "outcomes");

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
    delta?: number | null;
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
              delta={t.delta}
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

const RunsList = memo(function RunsList({ rows, kind, emptyCta, onJump }: {
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
});

const LifecycleList = memo(function LifecycleList({ rows, milestone, onJump }: {
  rows: DoctorLifecycle[];
  milestone: "shortlisted_at" | "interviewed_at" | "offered_at" | "signed_at" | "joined_at" | "paid_at";
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
});

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

function TeamTable({ rows, loading }: { rows: ReturnType<typeof useReportingMetrics>["team"]; loading: boolean }) {
  if (loading) return <TableSkeleton rows={4} cols={7} />;
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
          <TableHead className="text-[11px] text-right">Signed</TableHead>
          <TableHead className="text-[11px] text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.email}>
            <TableCell className="text-[12px] font-medium">{findHiMemberByEmail(r.email)?.name ?? r.email}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.profilesSent}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.shortlisted}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.interviews}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums">{r.offered}</TableCell>
            <TableCell className="text-[12px] text-right tabular-nums text-emerald-700 font-medium">{r.signed}</TableCell>
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

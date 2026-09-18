import { memo, useMemo, useState, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocLink } from "@/components/DocLink";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { HI_TEAM_MEMBERS } from "@/lib/hi-team";
import {
  BarChart3, Users, Building2, Calendar, Activity, UserCheck,
  CalendarCheck, FileSignature, MapPin, CreditCard, CheckCircle2, ArrowRight,
  ServerCog,
} from "lucide-react";
import { usePlacementReporting, type PlacementReportingBundle } from "@/hooks/use-placement-reporting";
import {
  defaultRange, pctChange, passesFilters, stageAt, inRange, STAGES,
  type ReportingFilters, type StageKey,
} from "@/lib/placement-reporting";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlacementsCard } from "@/components/reports/PlacementsCard";
import { CeoSummary } from "@/components/reports/CeoSummary";
import { DoctorTable } from "@/components/reports/DoctorTable";
import { CollapsibleSection } from "@/components/reports/CollapsibleSection";
import { PlacementBreakdowns } from "@/components/reports/PlacementBreakdowns";
import { VacanciesSummary } from "@/components/reports/VacanciesSummary";
import { DataQualityCard } from "@/components/reports/DataQualityCard";
import { ChartSkeleton } from "@/components/reports/Skeletons";
import { TeamPerformance } from "@/components/reports/TeamPerformance";
import { HospitalPerformance } from "@/components/reports/HospitalPerformance";

// Lazy so the recharts (vendor-charts) chunk is deferred until the trend
// chart actually mounts. Wrapped in <Suspense> at the usage site with a
// 260px fallback matching the chart height so layout doesn't jump.
const ReportsTrendChart = lazy(() => import("./ReportsTrendChart"));

/**
 * Phase 5 — Hospital Introduction Department reporting page.
 *
 * ONE SOURCE: placement_attempts, written by exactly two things — the imported
 * sheet and the Processing page's stage marking. Nothing here is derived from
 * the sends machinery any more. The page used to blend automation_flow_runs
 * and doctor_lifecycle into the same screen as the placement scoreboard, which
 * meant two panels could give different answers to "how many did we sign?"
 * and both be right about their own table. Removed along with those sources:
 * the "Profile sends" tile, "By flow activity", "Top of funnel", the
 * relationship-health score and the ops summary.
 *
 * Two supporting tables survive, neither sends-derived: hospitals (who
 * represents an account — credit follows the allocation, not who clicked) and
 * vacancies (open roles, so an account that's hiring but idle stands out).
 *
 * Date range + three filter dropdowns drive every panel:
 *   - KPI strip (shortlisted / interviewed / offered / signed / relocated / paid)
 *   - Weekly trend chart (shortlisted / interviews / signed)
 *   - Per-team-member table, credited via the hospital's representative
 *   - Per-hospital table with open roles and time since last movement
 *   - The placement ledger + a per-doctor breakdown
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
  // Which of the four views is showing. Also a URL param so a link can point
  // straight at "Team" — and, just as importantly, so only the active view's
  // components mount (the page used to build all 16 sections on every paint).
  const view = (searchParams.get("view") ?? "overview") as ViewKey;
  const setView       = (v: string) => setParam("view", v, "overview");
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

  const bundle = usePlacementReporting(filters);

  // CEO-first restructure (2026-07-31): the page now opens on an answer-first
  // hero (CeoSummary) + the trend + "where the wins are", and demotes ALL the
  // per-entity / ops tables into a collapsed "Operational detail" region. One
  // open-section map drives every Collapsible; everything starts CLOSED so the
  // exec surface stays a clean one-screen read. Pure UI state, nothing persisted.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => (v: boolean) => setOpen(s => ({ ...s, [k]: v }));

  const hospitalFilter  = hospital  === "__all" ? null : hospital;
  const specialtyFilter = specialty === "__all" ? null : specialty;

  const rangeWord = rangeDays >= 3650 ? "all time" : rangeDays >= 365 ? "the last year" : `the last ${rangeDays} days`;

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
              {VIEWS.find(v => v.key === view)?.blurb.replace("{range}", rangeWord)}
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

        {/* ── One question per view ────────────────────────────────────────
            The page used to stack 16 sections in a single scroll. Same
            content, now split by the question being asked: how are we doing
            (Overview), who's delivering (Team), which accounts (Hospitals),
            and everything operational (Detail). Only the active view mounts. */}
        <ViewTabs view={view} setView={setView} />

        {view === "overview" && (
          <div className="space-y-6">
            {/* Answer-first hero: a plain-English headline + a Weekly/Monthly
                outcome scoreboard (distinct doctors, one consistent source). */}
            <CeoSummary hospital={hospitalFilter} specialty={specialtyFilter} />

            {/* The one chart that's worth reading without expanding anything. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-teal-600" />
                  Trend
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Shortlists, interviews, and signs over time — switch between by week and by month. Helps catch dropoffs early.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartSkeleton />}>
                  <ReportsTrendChart trend={bundle.trend} loading={bundle.isLoading} />
                </Suspense>
              </CardContent>
            </Card>

            {/* Where the wins are — region, specialties, lifecycle. The
                per-hospital ranking is suppressed here; the Hospitals tab
                owns that view. */}
            <SectionLabel>Where the wins are</SectionLabel>
            <PlacementBreakdowns range={filters.range} hospital={hospitalFilter} specialty={specialtyFilter} hideHospitals />
          </div>
        )}

        {view === "team" && (
          <div className="space-y-6">
            {/* Credit follows the hospital's representative — same source as
                the Overview scoreboard, so the numbers reconcile. */}
            <TeamPerformance range={filters.range} hospital={hospitalFilter} specialty={specialtyFilter} />
          </div>
        )}

        {view === "hospitals" && (
          <div className="space-y-6">
            <HospitalPerformance
              range={filters.range}
              hospital={hospitalFilter}
              specialty={specialtyFilter}
              vacancies={bundle.vacancyByHospital}
            />
            <VacanciesSummary />

            {/* Surfaces unclassified hospital regions to fix (only renders
                when there's something to clean up). */}
            <DataQualityCard />
          </div>
        )}

        {view === "detail" && (
          <div className="space-y-6">
            {/* Full absolute totals over the custom range + per-tile drill-downs
                — the analyst's scoreboard, demoted below the CEO summary. */}
            <CollapsibleSection
              title="All metrics · custom range"
              icon={<BarChart3 className="h-4 w-4 text-teal-600" />}
              description="Absolute totals over the date range chosen above, with per-tile drill-downs. The CEO summary at the top uses calendar weeks/months instead."
              summary={<SummaryBadge loading={bundle.isLoading} value={bundle.totals.signed} label="signed" />}
              open={!!open.metrics}
              onOpenChange={toggle("metrics")}
            >
              <div className="pt-1">
                <KpiStrip bundle={bundle} />
              </div>
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
        )}
      </div>
    </DashboardLayout>
  );
}

/** The four questions the page answers, in the order you'd ask them. */
type ViewKey = "overview" | "team" | "hospitals" | "detail";
const VIEWS: Array<{ key: ViewKey; label: string; icon: typeof BarChart3; blurb: string }> = [
  { key: "overview",  label: "Overview",  icon: Activity,
    blurb: "How the Hospital Introduction department is doing over {range} — results, trend, and where the wins come from." },
  { key: "team",      label: "Team",      icon: Users,
    blurb: "Who's delivering over {range}. Every stage is credited to the representative who owns the hospital." },
  { key: "hospitals", label: "Hospitals", icon: Building2,
    blurb: "Which accounts are moving over {range} — activity, open roles, and relationship health." },
  { key: "detail",    label: "Detail",    icon: ServerCog,
    blurb: "The operational layer for {range}: full metrics, the placement ledger, and per-doctor rows." },
];

/** Segmented view switcher. Same visual language as the range picker in the
 *  filter bar, so the page reads as one control surface. */
function ViewTabs({ view, setView }: { view: ViewKey; setView: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5 shadow-sm">
      {VIEWS.map(v => {
        const Icon = v.icon;
        const active = view === v.key;
        return (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              active ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-slate-400"}`} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small uppercase divider used between blocks inside a view. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </h2>
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
  options: { hospitals: string[]; specialties: string[] };
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
          {/* The HI roster, and only the HI roster. The list used to be
              padded with every address that had ever stamped a created_by on a
              flow run — an artefact of the sends machinery, and not who
              represents the account. Credit now follows the hospital's
              assigned rep, so the roster IS the complete set of options. */}
          <SelectGroup>
            <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">Hospital Introduction</SelectLabel>
            {HI_TEAM_MEMBERS.map(m => (
              <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>
            ))}
          </SelectGroup>
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

/**
 * Absolute stage totals over the chosen range, with a drill-down behind each
 * tile.
 *
 * Every tile counts DISTINCT DOCTORS out of placement_attempts. The old strip
 * led with "Profile sends" from automation_flow_runs, which measured emails
 * leaving the building rather than placements progressing — it's gone, along
 * with the rest of the sends-derived sources.
 */
function KpiStrip({ bundle }: { bundle: PlacementReportingBundle }) {
  const navigate = useNavigate();
  const { attempts, totals, totalsPrior, filters } = bundle;

  // Pre-bucket the drilldown lists ONCE per filter/data change, so the flip
  // animation never re-runs the filter+sort mid-rotation — the back face just
  // paints what's already in memory.
  const drilldowns = useMemo(() => {
    const out = {} as Record<StageKey, AttemptHit[]>;
    for (const stage of STAGES) {
      const hits: AttemptHit[] = [];
      const seen = new Set<string>();
      for (const a of attempts) {
        if (!passesFilters(a, filters)) continue;
        const t = stageAt(a, stage);
        if (!inRange(t, filters.range)) continue;
        // One entry per doctor, matching the headline count. The first hit
        // wins, so the listed hospital is that doctor's earliest at this stage.
        if (seen.has(a.doctor_id)) continue;
        seen.add(a.doctor_id);
        hits.push({ doctorId: a.doctor_id, name: a.doctor_name, hospital: a.hospital_name, at: t! });
      }
      out[stage.key] = hits.sort((x, y) => y.at - x.at);
    }
    return out;
  }, [attempts, filters]);

  const tiles = useMemo(() => TILES.map(t => ({
    ...t,
    value: totals[t.key],
    delta: pctChange(totals[t.key], totalsPrior[t.key]),
    drilldown: (
      <AttemptList
        rows={drilldowns[t.key]}
        onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)}
      />
    ),
    onClickThrough: () => navigate("/processing"),
  })), [drilldowns, totals, totalsPrior, navigate]);

  const pipeline = tiles.filter(t => t.group === "pipeline");
  const outcomes = tiles.filter(t => t.group === "outcomes");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
      <KpiCluster label="Pipeline" tiles={pipeline} className="lg:col-span-3" innerCols="lg:grid-cols-3" />
      <KpiCluster label="Outcomes" tiles={outcomes} className="lg:col-span-3" innerCols="lg:grid-cols-3" baseDelay={pipeline.length} />
    </div>
  );
}

/** One doctor's appearance at a stage, for the tile drill-downs. */
interface AttemptHit { doctorId: string; name: string; hospital: string; at: number }

/**
 * Tile definitions. `source` is shown in the card's hint, and now names one
 * table for every tile — the whole point of the change.
 */
const TILES: Array<{
  key: StageKey; label: string; icon: typeof UserCheck; color: string; bg: string;
  meaning: string; source: string; group: "pipeline" | "outcomes";
}> = [
  { key: "shortlisted", label: "Shortlisted", icon: UserCheck,     color: "text-indigo-600", bg: "bg-indigo-50/60",  group: "pipeline",
    meaning: "Doctors shortlisted in the window — from the imported sheet and the Processing page.",
    source:  "placement_attempts.shortlisted_at" },
  { key: "interviewed", label: "Interviews",  icon: CalendarCheck, color: "text-sky-600", bg: "bg-sky-50/60",     group: "pipeline",
    meaning: "Doctors interviewed in the window.",
    source:  "placement_attempts.interviewed_at" },
  { key: "offered",     label: "Offered",     icon: FileSignature, color: "text-amber-600", bg: "bg-amber-50/60",   group: "pipeline",
    meaning: "Doctors offered a role in the window.",
    source:  "placement_attempts.offered_at" },
  { key: "signed",      label: "Signed",      icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50/60", group: "outcomes",
    meaning: "Doctors who signed with a hospital in the window.",
    source:  "placement_attempts.signed_at" },
  { key: "relocated",   label: "Relocated",   icon: MapPin,        color: "text-emerald-700", bg: "bg-emerald-50/80", group: "outcomes",
    meaning: "Doctors who relocated / started in the window (explicit relocation marking, else the confirmed join).",
    source:  "placement_attempts.relocated_at ?? joined_at" },
  { key: "paid",        label: "Paid",        icon: CreditCard,    color: "text-emerald-800", bg: "bg-emerald-100/60", group: "outcomes",
    meaning: "Doctors whose second-payment invoice was marked paid in the window.",
    source:  "placement_attempts.paid_at" },
];

function KpiCluster({ label, tiles, className, innerCols, baseDelay = 0 }: {
  label: string;
  tiles: Array<{
    label: string; value: number; icon: typeof UserCheck; color: string; bg: string;
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

/**
 * Drill-down body behind a KPI tile: the doctors counted by that tile, most
 * recent first.
 *
 * One row per doctor, matching the headline number exactly — the tile would
 * otherwise say 12 and list 17, which is the kind of mismatch that makes people
 * stop trusting the page.
 */
const AttemptList = memo(function AttemptList({ rows, onJump }: {
  rows: AttemptHit[];
  onJump: (doctorId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-4 text-[11px] text-muted-foreground italic">
        Nothing in this window. Mark a stage on the Processing page, or import an updated sheet.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {rows.slice(0, 8).map(r => (
        <button
          key={r.doctorId}
          onClick={(e) => { e.stopPropagation(); onJump(r.doctorId); }}
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
        >
          <div className="text-[11px] font-medium text-slate-900 truncate">{r.name}</div>
          <div className="text-[9px] text-muted-foreground truncate">
            {r.hospital || "—"} · {relativeShort(new Date(r.at).toISOString())}
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

void Calendar; void Input; void Label;

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocLink } from "@/components/DocLink";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Users, Building2, Activity, UserCheck,
  CalendarCheck, FileSignature, MapPin, CreditCard, CheckCircle2, ArrowRight,
  ServerCog,
} from "lucide-react";
import { usePlacementAttempts } from "@/hooks/use-placement-attempts";
import { usePlacementReporting, type PlacementReportingBundle } from "@/hooks/use-placement-reporting";
import {
  pctChange, passesFilters, stageAt, inRange, computeStageTotals, STAGES,
  type ReportingFilters, type StageKey, type StageTotals, type DateRange,
} from "@/lib/placement-reporting";
import {
  periodRange, periodLabels, offsetOf, earliestMilestone, countInRange, isPeriod,
  type Period,
} from "@/lib/report-period";
import { ExpandableKPICard } from "@/components/ExpandableKPICard";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlacementsCard } from "@/components/reports/PlacementsCard";
import { CeoSummary } from "@/components/reports/CeoSummary";
import { DoctorTable } from "@/components/reports/DoctorTable";
import { CollapsibleSection } from "@/components/reports/CollapsibleSection";
import { StageFunnel, RegionCard, LifecycleCard } from "@/components/reports/PlacementBreakdowns";
import { VacanciesSummary } from "@/components/reports/VacanciesSummary";
import { DataQualityCard } from "@/components/reports/DataQualityCard";
import { TeamPerformance } from "@/components/reports/TeamPerformance";
import { HospitalPerformance } from "@/components/reports/HospitalPerformance";
import { SpecialtyTiles } from "@/components/reports/SpecialtyTiles";
import { TrendCard } from "@/components/reports/TrendCard";
import { AttentionCard, type ReportView } from "@/components/reports/AttentionCard";
import { JumpRail, scrollParent } from "@/components/reports/JumpRail";
import { PeriodArrow, PeriodChip, PeriodPill } from "@/components/reports/PeriodNav";
import { Hint } from "@/components/reports/HoverHint";

/**
 * Phase 5 — Hospital Introduction Department reporting page.
 *
 * ONE SOURCE: placement_attempts, written by exactly two things — the imported
 * sheet and the Processing page's stage marking. Nothing here is derived from
 * the sends machinery any more. The page used to blend automation_flow_runs
 * and doctor_lifecycle into the same screen as the placement scoreboard, which
 * meant two panels could give different answers to "how many did we sign?"
 * and both be right about their own table.
 *
 * Two supporting tables survive, neither sends-derived: hospitals (who
 * represents an account — credit follows the allocation, not who clicked) and
 * vacancies (open roles, so an account that's hiring but idle stands out).
 *
 * ONE PERIOD drives every panel: a Weekly / Monthly / Yearly pill plus the
 * round arrows on either side of the report, which step one period back or
 * forward — or, on hover, open a jump-to grid so any week or month is one
 * click away. This replaced the free-form "7d / 30d / 90d / 1y / All" range
 * and the hospital / team-member / specialty dropdowns (2026-09): the boss
 * reads the report one calendar period at a time, and the Team and Hospitals
 * views already break the numbers down by rep and by account.
 *
 * Period, offset and view all live in the URL (?per=monthly&off=-2&view=team)
 * so any view is shareable and survives navigation.
 */
export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view   = (searchParams.get("view") ?? "overview") as ReportView;
  const perRaw = searchParams.get("per");
  const period: Period = isPeriod(perRaw) ? perRaw : "monthly";
  const offRaw = Math.min(0, Math.trunc(Number(searchParams.get("off")) || 0));

  // How far back the data goes, in periods — the arrows and picker stop there.
  const { data: allAttempts = [], isLoading: attemptsLoading } = usePlacementAttempts();
  const minOffset = useMemo(() => {
    const first = earliestMilestone(allAttempts);
    return first ? Math.min(0, offsetOf(period, first)) : 0;
  }, [allAttempts, period]);
  const offset = attemptsLoading ? offRaw : Math.max(offRaw, minOffset);

  const labels = useMemo(() => periodLabels(period, offset), [period, offset]);
  const range: DateRange = labels.range;
  const prior: DateRange = useMemo(() => periodRange(period, offset - 1), [period, offset]);

  const filters: ReportingFilters = useMemo(() => ({
    range, hospital: null, teamMember: null, specialty: null,
  }), [range]);
  const bundle = usePlacementReporting(filters);
  const totalsPrior = useMemo(
    () => computeStageTotals(bundle.attempts, { ...filters, range: prior }),
    [bundle.attempts, filters, prior],
  );

  const setParams = useCallback((next: Partial<{ view: string; per: Period; off: number }>) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      // Drop the old free-range filters if an old bookmark still carries them.
      for (const k of ["range", "hospital", "team", "specialty"]) p.delete(k);
      if (next.view !== undefined) { if (next.view === "overview") p.delete("view"); else p.set("view", next.view); }
      if (next.per !== undefined)  { if (next.per === "monthly") p.delete("per"); else p.set("per", next.per); }
      if (next.off !== undefined)  { if (next.off === 0) p.delete("off"); else p.set("off", String(next.off)); }
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  // ── Period change with a slide: out one way, swap the data, in from the other ──
  const controls = useAnimationControls();
  const busy = useRef(false);
  const go = useCallback(async (next: { per?: Period; off: number }) => {
    const switching = next.per !== undefined && next.per !== period;
    const target = Math.min(0, next.off);
    if (!switching && target === offset) return;
    if (busy.current) return;
    busy.current = true;
    const d = switching ? 0 : Math.sign(target - offset);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // A hidden tab pauses animation frames; never let that strand the page mid-slide.
    const settle = (p: Promise<unknown>, ms: number) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    try {
      if (!still) await settle(controls.start({ x: -d * 48, y: 0, opacity: 0, filter: "blur(2px)", transition: { duration: 0.17, ease: [0.4, 0, 1, 1] } }), 260);
      setParams({ per: next.per, off: target });
      if (!still) {
        controls.set({ x: d * 48, y: d === 0 ? 6 : 0, opacity: 0, filter: "blur(2px)" });
        await settle(controls.start({ x: 0, y: 0, opacity: 1, filter: "blur(0px)", transition: { duration: 0.28, ease: [0, 0, 0.2, 1] } }), 380);
      }
    } finally {
      controls.set({ x: 0, y: 0, opacity: 1, filter: "blur(0px)" });
      busy.current = false;
    }
  }, [controls, offset, period, setParams]);

  const jumpOffset = useCallback((o: number) => go({ off: Math.max(minOffset, o) }), [go, minOffset]);

  // ← / → step one period, unless the user is typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox'], [role='slider'], [role='tablist'], [role='radiogroup']")) return;
      if (document.querySelector("[role='dialog'][data-state='open']")) return;
      const o = offset + (e.key === "ArrowLeft" ? -1 : 1);
      if (o > 0 || o < minOffset) return;
      e.preventDefault();
      go({ off: o });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, offset, minOffset]);

  const signedIn = useCallback(
    (r: DateRange) => countInRange(allAttempts, r, ["signed"]).signed,
    [allAttempts],
  );

  // Detail-tab collapsibles. Metrics + placements start open; the per-doctor
  // table stays closed until asked for (or jumped to).
  const [open, setOpen] = useState<Record<string, boolean>>({ metrics: true, placements: true });
  const toggle = (k: string) => (v: boolean) => setOpen(s => ({ ...s, [k]: v }));

  // Deep link from Automations / search: /reports?placement=<doctorId> opens a
  // new attempt in the Placements ledger, which lives on the Detail tab.
  useEffect(() => {
    if (!searchParams.get("placement") || view === "detail") return;
    setOpen(s => ({ ...s, placements: true }));
    setParams({ view: "detail" });
  }, [searchParams, view, setParams]);

  // ── Jump to a section, switching view first if needed ──
  const [pending, setPending] = useState<string | null>(null);
  const jumpTo = useCallback((v: ReportView, id: string) => {
    const detailKey = ({ "s-metrics": "metrics", "s-placements": "placements", "s-doctors": "doctors" } as Record<string, string>)[id];
    if (detailKey) setOpen(s => ({ ...s, [detailKey]: true }));
    if (v !== view) setParams({ view: v });
    setPending(`${id}#${Date.now()}`);
  }, [view, setParams]);
  useEffect(() => {
    if (!pending) return;
    const id = pending.split("#")[0];
    let tries = 0, raf = 0;
    const tick = () => {
      const el = document.getElementById(id);
      if (!el && tries++ < 40) { raf = requestAnimationFrame(tick); return; }
      setPending(null);
      if (!el) return;
      const sc = scrollParent(el);
      const top = el.getBoundingClientRect().top - (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + sc.scrollTop - 12;
      sc.scrollTo({ top, behavior: "smooth" });
      el.animate?.(
        [{ boxShadow: "0 0 0 0 rgba(20,184,166,0)" }, { boxShadow: "0 0 0 4px rgba(20,184,166,0.35)" }, { boxShadow: "0 0 0 0 rgba(20,184,166,0)" }],
        { duration: 1200, delay: 300 },
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pending, view]);

  const nav = { period, offset, minOffset, onJump: jumpOffset, signedIn };
  const blurb = VIEWS.find(v => v.key === view)?.blurb.replace("{range}", labels.phrase);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-teal-600" />
            Reports
            <DocLink slug="hospital-introduction/reports" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{blurb}</p>
        </div>

        {/* One question per view, and one period for all of them. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ViewTabs view={view} setView={v => setParams({ view: v })} />
          <div className="flex items-center gap-2 flex-wrap" data-tour="reports-filters">
            <PeriodChip {...nav} />
            <PeriodPill period={period} onChange={p => go({ per: p, off: 0 })} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[44px_minmax(0,1fr)_44px] xl:grid-cols-[44px_minmax(0,1fr)_224px_44px] gap-x-3 gap-y-6 items-start">
          {/* Left arrow — sticky so it stays beside the report while scrolling. */}
          <div className="hidden md:block self-stretch">
            <div className="sticky top-[38vh] z-30"><PeriodArrow side="left" {...nav} /></div>
          </div>

          <motion.div animate={controls} className="min-w-0 space-y-6">
            {view === "overview" && (
              <>
                <div id="s-summary">
                  <CeoSummary
                    range={range}
                    prior={prior}
                    word={labels.word}
                    lead={labels.lead}
                    label={labels.label}
                    isCurrent={offset === 0}
                  />
                </div>
                <AttentionCard range={range} word={labels.word} onJump={jumpTo} />
                <SpecialtyTiles range={range} prior={prior} word={labels.word} />
                <TrendCard period={period} offset={offset} />
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-3"><StageFunnel totals={bundle.totals} loading={bundle.isLoading} word={labels.word} /></div>
                  <div className="lg:col-span-2"><RegionCard range={range} word={labels.word} /></div>
                </div>
                <LifecycleCard range={range} word={labels.word} />
              </>
            )}

            {view === "team" && (
              // Credit follows the hospital's representative — same source as
              // the Overview scoreboard, so the numbers reconcile.
              <TeamPerformance range={range} />
            )}

            {view === "hospitals" && (
              <>
                <HospitalPerformance range={range} vacancies={bundle.vacancyByHospital} word={labels.word} />
                <div id="s-vacancies"><VacanciesSummary /></div>
                {/* Only renders when there's an unclassified region to clean up. */}
                <div id="s-quality"><DataQualityCard /></div>
              </>
            )}

            {view === "detail" && (
              <>
                <div id="s-metrics">
                  <CollapsibleSection
                    title="All metrics"
                    icon={<BarChart3 className="h-4 w-4 text-teal-600" />}
                    description={`Distinct doctors at each stage in ${labels.phrase}, compared with the ${labels.word} before. Open a tile for the doctors behind it.`}
                    summary={<SummaryBadge loading={bundle.isLoading} value={bundle.totals.signed} label="signed" />}
                    open={!!open.metrics}
                    onOpenChange={toggle("metrics")}
                  >
                    <div className="pt-1">
                      <KpiStrip bundle={bundle} prior={totalsPrior} word={labels.word} />
                    </div>
                  </CollapsibleSection>
                </div>

                {/* Placements (Ammar 2026-06-03) — replaces the Hammad sheet.
                    Per-(doctor, hospital) milestones + 45-day payment clock. */}
                <div id="s-placements">
                  <PlacementsCard range={range} open={!!open.placements} onOpenChange={toggle("placements")} />
                </div>

                {/* Per-doctor breakdown — companion to the hospital table. */}
                <div id="s-doctors">
                  <DoctorTable range={range} open={!!open.doctors} onOpenChange={toggle("doctors")} />
                </div>
              </>
            )}
          </motion.div>

          <aside className="hidden xl:block sticky top-0 self-start">
            <JumpRail view={view} onJump={jumpTo} />
          </aside>

          <div className="hidden md:block self-stretch">
            <div className="sticky top-[38vh] z-30 flex justify-end"><PeriodArrow side="right" {...nav} /></div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** The four questions the page answers, in the order you'd ask them. */
const VIEWS: Array<{ key: ReportView; label: string; icon: typeof BarChart3; question: string; blurb: string }> = [
  { key: "overview",  label: "Overview",  icon: Activity,  question: "How are we doing? Results, trend, and where the wins come from.",
    blurb: "How the Hospital Introduction department did in {range} — results, trend, and where the wins come from." },
  { key: "team",      label: "Team",      icon: Users,     question: "Who's delivering? Every stage is credited to the hospital's rep.",
    blurb: "Who delivered in {range}. Every stage is credited to the representative who owns the hospital." },
  { key: "hospitals", label: "Hospitals", icon: Building2, question: "Which accounts are moving — and which have gone quiet?",
    blurb: "Which accounts moved in {range} — activity, open roles, and account health." },
  { key: "detail",    label: "Detail",    icon: ServerCog, question: "Full metrics, the placement ledger and per-doctor rows.",
    blurb: "The operational layer for {range}: full metrics, the placement ledger, and per-doctor rows." },
];

/** Segmented view switcher; each tab says what question it answers on hover. */
function ViewTabs({ view, setView }: { view: ReportView; setView: (v: ReportView) => void }) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-0.5 shadow-sm flex-wrap" role="tablist">
      {VIEWS.map(v => {
        const Icon = v.icon;
        const active = view === v.key;
        return (
          <Hint key={v.key} content={v.question} side="bottom">
            <button
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                active ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-slate-400"}`} />
              {v.label}
            </button>
          </Hint>
        );
      })}
    </div>
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

/**
 * Stage totals for the selected period, with a drill-down behind each tile.
 *
 * Every tile counts DISTINCT DOCTORS out of placement_attempts. The old strip
 * led with "Profile sends" from automation_flow_runs, which measured emails
 * leaving the building rather than placements progressing — it's gone, along
 * with the rest of the sends-derived sources.
 */
function KpiStrip({ bundle, prior, word }: { bundle: PlacementReportingBundle; prior: StageTotals; word: string }) {
  const navigate = useNavigate();
  const { attempts, totals, filters } = bundle;

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
    delta: pctChange(totals[t.key], prior[t.key]),
    frontExtra: `vs ${prior[t.key]} the ${word} before`,
    drilldown: (
      <AttemptList
        rows={drilldowns[t.key]}
        onJump={(id) => navigate(`/doctors?tab=profiles&id=${encodeURIComponent(id)}`)}
      />
    ),
    onClickThrough: () => navigate("/processing"),
  })), [drilldowns, totals, prior, word, navigate]);

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
 * Tile definitions. `source` is shown in the card's hint, and names one table
 * for every tile.
 */
const TILES: Array<{
  key: StageKey; label: string; icon: typeof UserCheck; color: string; bg: string;
  meaning: string; source: string; group: "pipeline" | "outcomes";
}> = [
  { key: "shortlisted", label: "Shortlisted", icon: UserCheck,     color: "text-indigo-600", bg: "bg-indigo-50/60",  group: "pipeline",
    meaning: "Doctors shortlisted in the period — from the imported sheet and the Processing page.",
    source:  "placement_attempts.shortlisted_at" },
  { key: "interviewed", label: "Interviews",  icon: CalendarCheck, color: "text-sky-600", bg: "bg-sky-50/60",     group: "pipeline",
    meaning: "Doctors interviewed in the period.",
    source:  "placement_attempts.interviewed_at" },
  { key: "offered",     label: "Offered",     icon: FileSignature, color: "text-amber-600", bg: "bg-amber-50/60",   group: "pipeline",
    meaning: "Doctors offered a role in the period.",
    source:  "placement_attempts.offered_at" },
  { key: "signed",      label: "Signed",      icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50/60", group: "outcomes",
    meaning: "Doctors who signed with a hospital in the period.",
    source:  "placement_attempts.signed_at" },
  { key: "relocated",   label: "Relocated",   icon: MapPin,        color: "text-emerald-700", bg: "bg-emerald-50/80", group: "outcomes",
    meaning: "Doctors who relocated / started in the period (explicit relocation marking, else the confirmed join).",
    source:  "placement_attempts.relocated_at ?? joined_at" },
  { key: "paid",        label: "Paid",        icon: CreditCard,    color: "text-emerald-800", bg: "bg-emerald-100/60", group: "outcomes",
    meaning: "Doctors whose second-payment invoice was marked paid in the period.",
    source:  "placement_attempts.paid_at" },
];

function KpiCluster({ label, tiles, className, innerCols, baseDelay = 0 }: {
  label: string;
  tiles: Array<{
    label: string; value: number; icon: typeof UserCheck; color: string; bg: string;
    drilldown: React.ReactNode; onClickThrough: () => void; meaning: string; source: string;
    delta?: number | null; frontExtra?: string;
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
              frontExtra={t.frontExtra}
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
        Nothing in this period. Mark a stage on the Processing page, or import an updated sheet.
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

/**
 * /my-workspace — the HI team member's home base.
 *
 * Surfaces everything on the signed-in user's plate, ordered so the
 * actionable work sits above the fold:
 *   - Hero strip with greeting + four counters spanning REAL work
 *     (action now / follow-ups due / leads to contact / CVs to chase)
 *   - Leads to contact & follow-ups due (paid leads pinned + flagged)
 *   - Tasks awaiting action (flow runs, grouped by bucket type)
 *   - Queued profile & CV work (staged profiles + CVs to chase)
 *   - Contracts & placements to advance
 *   - My doctors + My vacancies (two-column grid)
 *   - Recent activity timeline (collapsed, at the bottom)
 *
 * Admins land here too if they navigate to it manually — the page falls
 * back to team-wide data so it doubles as a command center.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { useMyWorkspace, type WorkspaceDoctor } from "@/hooks/use-my-workspace";
import { useAuth } from "@/hooks/use-auth";
import { findHiMemberByEmail } from "@/lib/hi-team";
import { groupRunsIntoBuckets } from "@/lib/flow-buckets";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";
import type { FlowRun } from "@/hooks/use-automation-flows";
import { Inbox, UserSquare, Sparkles, ChevronRight, Mail, FileSignature, MapPin, Bell, Workflow, CalendarCheck, ArrowRight } from "lucide-react";
import { useTour, hasSeenTour } from "@/components/OnboardingTour";
import { HI_TOUR_ID, HI_TOUR_STEPS } from "@/lib/hi-onboarding-tour";
import { LeadsToContactCard } from "@/components/workspace/LeadsToContactCard";
import { QueuedProfileCvCard } from "@/components/workspace/QueuedProfileCvCard";
import { ContractsPlacementsCard } from "@/components/workspace/ContractsPlacementsCard";
import { MyVacanciesCard } from "@/components/workspace/MyVacanciesCard";
import { ActivityTimelineCard } from "@/components/workspace/ActivityTimelineCard";
import { relativeAge } from "@/components/workspace/workspace-time";

function greetingFor(d = new Date()): string {
  const h = d.getHours();
  if (h < 5)  return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const FLOW_ICON: Record<FlowKey, typeof Mail> = {
  onboarding:       Mail,
  profile_sent:     Mail,
  shortlist:        Mail,
  interview:        CalendarCheck,
  contract_signing: FileSignature,
  relocation:       MapPin,
  second_payment:   Mail,
};

export default function MyWorkspace() {
  const navigate = useNavigate();
  const tour = useTour();
  const { user } = useAuth();
  const {
    myEmail, scoped, isLoading,
    tasks, doctors, vacancies, events,
    leads, staged, cvChase, contracts, placements,
  } = useMyWorkspace();

  const myName = useMemo(() => {
    if (!user?.email) return null;
    const hi = findHiMemberByEmail(user.email);
    return hi?.name ?? user.email.split("@")[0];
  }, [user?.email]);

  const buckets = useMemo(() => groupRunsIntoBuckets(tasks), [tasks]);
  const action  = buckets.find(b => b.key === "action")?.runs.length ?? 0;

  // Hero counters now span the whole pipeline, not three slices of one
  // table. "Action now" = flow runs waiting on a manual step; the rest
  // come from the new owner-scoped datasets.
  const followUpsDue = leads.filter(l => l.overdue).length;
  const leadsToContact = leads.length;
  const cvsToChase = cvChase.length;

  const openRun = (run: FlowRun) => {
    // Deep-link into Automations with the run id so it auto-opens the
    // detail sheet there (single source of truth for the sheet UI).
    navigate(`/automations?flow=${run.flow_key}&run=${run.id}`);
  };

  // Deep-link a doctor row to that specific record on the Profiles hub.
  // The Profiles tab reads `?q=` and filters to it, so name (or email)
  // lands the user on exactly that doctor instead of a generic list.
  const openDoctor = (d: WorkspaceDoctor) => {
    const q = d.doctor_name ?? "";
    navigate(`/doctors?tab=profiles&q=${encodeURIComponent(q)}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-teal-50 via-white to-white px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-teal-700/70 font-semibold flex items-center gap-1.5">
                <Inbox className="h-3 w-3" /> My Workspace
              </p>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">
                {greetingFor()}, {myName ?? "team"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {scoped
                  ? "Everything on your plate across the doctor pipeline. Click any row to jump in."
                  : "All active work across the team. Use the filters on each page to narrow down."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <HeroStat label="Action now"      value={action}         tone={action > 0 ? "rose" : "default"}        hint="Flow runs assigned to you waiting on a manual step right now (send profile, schedule interview, pick city, etc.)." />
              <HeroStat label="Follow-ups due"  value={followUpsDue}   tone={followUpsDue > 0 ? "amber" : "default"} hint="Leads you own whose follow-up date is now in the past." />
              <HeroStat label="Leads to contact" value={leadsToContact} tone={leadsToContact > 0 ? "teal" : "default"} hint="Uncontacted leads + overdue follow-ups assigned to you (paid leads pinned on top)." />
              <HeroStat label="CVs to chase"    value={cvsToChase}     tone={cvsToChase > 0 ? "amber" : "default"}  hint="CV upload requests you sent that are still pending, plus extractions that failed." />
            </div>
          </div>
          {scoped && !hasSeenTour(HI_TOUR_ID) && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 text-teal-700 shrink-0" />
              <span className="text-[12px] text-teal-900">New here? Take the 3-minute guided tour of the HI module.</span>
              <Button
                size="sm"
                className="h-7 text-[11px] ml-auto"
                onClick={() => tour.start(HI_TOUR_STEPS, { id: HI_TOUR_ID })}
              >
                Start tour
              </Button>
            </div>
          )}
        </div>

        {/* ── Leads to contact & follow-ups due (top of the actionables) ── */}
        <LeadsToContactCard leads={leads} isLoading={isLoading} scoped={scoped} />

        {/* ── Tasks ──────────────────────────────────────────────── */}
        <Card data-tour="workspace-tasks">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-600" />
                  Tasks waiting on you
                </CardTitle>
                <CardDescription className="text-[11px] mt-1">
                  Pipeline rows where you're the bottleneck — pick a city, confirm a shortlist, chase a contract.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/automations")}>
                Open automations <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {isLoading && <CardListSkeleton rows={3} />}
            {!isLoading && buckets.length === 0 && (
              <EmptyState
                icon={Sparkles}
                title="All caught up"
                body={scoped
                  ? "No flow runs are waiting on you right now."
                  : "No active tasks across the team."}
                size="sm"
              />
            )}
            {!isLoading && buckets.map(b => (
              <div key={b.key} className={`rounded-md border ${b.cls}`}>
                <div className="px-3 py-2 flex items-center gap-2 border-b border-current/10">
                  <b.icon className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-medium">{b.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-1">{b.runs.length}</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{b.blurb}</span>
                </div>
                <div className="divide-y divide-current/10 max-h-[280px] overflow-y-auto">
                  {b.runs.slice(0, 10).map(run => (
                    <TaskRow key={run.id} run={run} onOpen={() => openRun(run)} />
                  ))}
                  {b.runs.length > 10 && (
                    <button
                      onClick={() => navigate("/automations")}
                      className="w-full px-3 py-1.5 text-[10px] text-muted-foreground bg-white/30 hover:bg-white/60 text-left transition-colors"
                    >
                      +{b.runs.length - 10} more — open Automations to see all →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Queued profile & CV work ───────────────────────────── */}
        <QueuedProfileCvCard
          staged={staged}
          cvChase={cvChase}
          isLoading={isLoading}
          scoped={scoped}
          myEmail={myEmail}
        />

        {/* ── Contracts & placements to advance ──────────────────── */}
        <ContractsPlacementsCard
          contracts={contracts}
          placements={placements}
          isLoading={isLoading}
          scoped={scoped}
        />

        {/* ── Two-column: doctors + vacancies ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-tour="workspace-grid">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserSquare className="h-4 w-4 text-violet-600" />
                My doctors
              </CardTitle>
              <CardDescription className="text-[11px] mt-1">
                Doctors with active flows assigned to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && <div className="px-4"><CardListSkeleton rows={3} /></div>}
              {!isLoading && doctors.length === 0 && (
                <EmptyState
                  icon={UserSquare}
                  title="No doctors right now"
                  body="When a flow is assigned to you, the doctor will appear here."
                  size="sm"
                />
              )}
              {!isLoading && doctors.length > 0 && (
                <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
                  {doctors.map(d => <DoctorRow key={d.doctor_id} d={d} onOpen={() => openDoctor(d)} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <MyVacanciesCard vacancies={vacancies} isLoading={isLoading} />
        </div>

        {/* ── Recent activity (demoted to the bottom) ────────────── */}
        <ActivityTimelineCard events={events} />
      </div>

    </DashboardLayout>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────

function HeroStat({ label, value, tone, hint }: { label: string; value: number; tone: "default" | "rose" | "amber" | "teal"; hint?: string }) {
  const toneCls =
    tone === "rose"  ? "bg-rose-50 text-rose-700 border-rose-200" :
    tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200" :
    tone === "teal"  ? "bg-teal-50 text-teal-700 border-teal-200" :
                       "bg-white text-slate-700 border-slate-200";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneCls} min-w-[88px]`} title={hint}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-xl font-semibold tabular-nums leading-tight">{value}</div>
    </div>
  );
}

function TaskRow({ run, onOpen }: { run: FlowRun; onOpen: () => void }) {
  const Icon = FLOW_ICON[run.flow_key] ?? Workflow;
  const flow = FLOW_DEFINITIONS[run.flow_key];
  const stage = flow?.stages.find(s => s.key === run.current_stage);
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-3 py-2 hover:bg-white/60 transition-colors flex items-center gap-3"
    >
      <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-900 truncate">{run.doctor_name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {flow?.shortName ?? run.flow_key} · {stage?.label ?? run.current_stage}
          {run.hospital && <> · {run.hospital}</>}
          <> · {relativeAge(run.last_event_at)}</>
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </button>
  );
}

function DoctorRow({ d, onOpen }: { d: WorkspaceDoctor; onOpen: () => void }) {
  const flow = FLOW_DEFINITIONS[d.flow_key as FlowKey];
  return (
    <button
      onClick={onOpen}
      className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
    >
      <UserSquare className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate">{d.doctor_name ?? "(unnamed)"}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {flow?.shortName ?? d.flow_key}
          {d.hospital && <> · {d.hospital}</>}
          {d.last_event_at && <> · {relativeAge(d.last_event_at)}</>}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
    </button>
  );
}

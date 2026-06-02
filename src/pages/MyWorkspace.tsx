/**
 * /my-workspace — the HI team member's home base.
 *
 * Surfaces only what's assigned to the signed-in user:
 *   - Hero strip with greeting + task counts
 *   - Tasks awaiting action (grouped by bucket type)
 *   - My doctors + My vacancies (two-column grid)
 *   - Recent activity timeline (last 7 days)
 *
 * Admins land here too if they navigate to it manually — the page falls
 * back to team-wide data so it doubles as a command center.
 */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { statusClasses } from "@/lib/status-colors";
import { useMyWorkspace, type WorkspaceDoctor, type WorkspaceEvent } from "@/hooks/use-my-workspace";
import { useAuth } from "@/hooks/use-auth";
import { findHiMemberByEmail } from "@/lib/hi-team";
import { groupRunsIntoBuckets } from "@/lib/flow-buckets";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";
import type { FlowRun } from "@/hooks/use-automation-flows";
import { Inbox, ClipboardList, UserSquare, Sparkles, ChevronRight, Mail, FileSignature, MapPin, Bell, Clock, AlertCircle, Workflow, CalendarCheck, ArrowRight } from "lucide-react";
import { useTour, hasSeenTour } from "@/components/OnboardingTour";
import { HI_TOUR_ID, HI_TOUR_STEPS } from "@/lib/hi-onboarding-tour";

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

  // Auto-launch the HI onboarding tour the first time a user lands here.
  // Delay slightly so the sidebar + header are fully painted before the
  // overlay tries to measure their bounding boxes for the spotlight.
  useEffect(() => {
    if (hasSeenTour(HI_TOUR_ID)) return;
    const t = setTimeout(() => tour.start(HI_TOUR_STEPS, { id: HI_TOUR_ID }), 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { user } = useAuth();
  const { myEmail, scoped, isLoading, tasks, doctors, vacancies, events } = useMyWorkspace();

  const myName = useMemo(() => {
    if (!user?.email) return null;
    const hi = findHiMemberByEmail(user.email);
    return hi?.name ?? user.email.split("@")[0];
  }, [user?.email]);

  const buckets = useMemo(() => groupRunsIntoBuckets(tasks), [tasks]);
  const stale   = buckets.find(b => b.key === "stale")?.runs.length ?? 0;
  const action  = buckets.find(b => b.key === "action")?.runs.length ?? 0;
  const totalTasks = tasks.length;

  const openRun = (run: FlowRun) => {
    // Deep-link into Automations with the run id so it auto-opens the
    // detail sheet there (single source of truth for the sheet UI).
    navigate(`/automations?flow=${run.flow_key}&run=${run.id}`);
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
                  ? "Everything assigned to you across the doctor pipeline. Click any row to jump in."
                  : "All active work across the team. Use the filters on each page to narrow down."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <HeroStat label="Tasks" value={totalTasks} tone="default" />
              <HeroStat label="Action now" value={action} tone={action > 0 ? "rose" : "default"} />
              <HeroStat label="Stale 7d+" value={stale} tone={stale > 0 ? "amber" : "default"} />
            </div>
          </div>
        </div>

        {/* ── Tasks ──────────────────────────────────────────────── */}
        <Card>
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
                  ? "Nothing is waiting on you right now. Sit back."
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
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-white/30">
                      +{b.runs.length - 10} more — open the relevant flow tab to see all
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Two-column: doctors + vacancies ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  {doctors.map(d => <DoctorRow key={d.doctor_id} d={d} onOpen={() => navigate("/doctor-profiles")} />)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-orange-600" />
                My vacancies
              </CardTitle>
              <CardDescription className="text-[11px] mt-1">
                Open roles you logged, or hospitals you own.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && <div className="px-4"><CardListSkeleton rows={3} /></div>}
              {!isLoading && vacancies.length === 0 && (
                <EmptyState
                  icon={ClipboardList}
                  title="No open vacancies"
                  body="When a hospital you own has an open role, it'll show up here."
                  size="sm"
                  action={<Button size="sm" variant="outline" onClick={() => navigate("/vacancies")}>Open Vacancies</Button>}
                />
              )}
              {!isLoading && vacancies.length > 0 && (
                <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
                  {vacancies.map(v => (
                    <button
                      key={v.id}
                      onClick={() => navigate("/vacancies")}
                      className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{v.hospital_name} · {v.specialty}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          <Badge variant="outline" className={`text-[9px] uppercase tracking-wider mr-1.5 ${statusClasses(v.priority)}`}>
                            {v.priority}
                          </Badge>
                          opened {relativeAge(v.opened_at)}
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Recent activity ───────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-600" />
              Recent activity (last 7 days)
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Events that touched your runs — emails sent, replies in, notes added.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <EmptyState icon={Clock} title="Quiet week so far" body="No events in the last 7 days." size="sm" />
            ) : (
              <div className="divide-y divide-border/40 max-h-[520px] overflow-y-auto">
                {events.map(e => <ActivityRow key={e.id} e={e} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </DashboardLayout>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────

function HeroStat({ label, value, tone }: { label: string; value: number; tone: "default" | "rose" | "amber" }) {
  const toneCls =
    tone === "rose"  ? "bg-rose-50 text-rose-700 border-rose-200" :
    tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200" :
                       "bg-white text-slate-700 border-slate-200";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneCls} min-w-[88px]`}>
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

function ActivityRow({ e }: { e: WorkspaceEvent }) {
  const flow = e.flow_key ? FLOW_DEFINITIONS[e.flow_key as FlowKey] : null;
  const Icon =
    e.event_type === "email_sent"    ? Mail :
    e.event_type === "email_opened"  ? Mail :
    e.event_type === "completed"     ? Sparkles :
    e.event_type === "reminder_sent" ? Bell :
    e.event_type === "error"         ? AlertCircle :
    Clock;
  return (
    <div className="px-3 py-2.5 flex items-start gap-3">
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-[2px]" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] truncate">
          <span className="font-medium">{e.doctor_name ?? "(doctor)"}</span>
          {flow && <span className="text-muted-foreground"> · {flow.shortName}</span>}
        </div>
        {e.message && <div className="text-[10px] text-muted-foreground line-clamp-2">{e.message}</div>}
        <div className="text-[9px] text-muted-foreground/80 mt-0.5">{relativeAge(e.occurred_at)}</div>
      </div>
    </div>
  );
}

function relativeAge(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

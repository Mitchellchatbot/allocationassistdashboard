import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, Mail, FileSignature, MapPin, ChevronRight, ChevronDown, AlertCircle, ClipboardList, Sparkles, X, CheckCheck, Trash2, CalendarCheck, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { Vacancy } from "@/hooks/use-vacancies";
import { useNotifications, useDismissNotification, useMarkAllNotificationsRead, useDismissAllOfKind, type AppNotification } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";

/**
 * Surface "what does the team need to look at right now?" on the main
 * dashboard. Queries automation_flow_runs for stale or actionable items and
 * groups them into buckets the team can act on with one click.
 *
 * Buckets (ordered most urgent first):
 *   - "Action needed now"  → contracts ready to sign, runs at a manual stage
 *   - "Stale > 7 days"     → active runs whose last_event_at is over a week old
 *   - "Awaiting doctor"    → runs where the doctor is the gate (CV upload, etc.)
 *
 * Each bucket links into the relevant tab/flow so the team can address them
 * without hunting through 7 tabs. Quiet/empty when nothing is pending — won't
 * crowd the dashboard.
 */
export function PendingActionsCard() {
  const navigate = useNavigate();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pending-actions"],
    queryFn: async (): Promise<FlowRun[]> => {
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .eq("status", "active")
        .order("last_event_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: vacancies = [] } = useQuery({
    queryKey: ["pending-actions-vacancies"],
    queryFn: async (): Promise<Vacancy[]> => {
      const { data, error } = await supabase
        .from("vacancies")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vacancy[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const buckets = useMemo(() => groupIntoBuckets(items), [items]);
  const staleVacancies = useMemo(
    () => vacancies.filter(v => (Date.now() - new Date(v.opened_at).getTime()) / 86_400_000 > 3),
    [vacancies],
  );
  const { notifications, unreadCount } = useNotifications();
  const dismiss        = useDismissNotification();
  const markAllRead    = useMarkAllNotificationsRead();
  const dismissAllKind = useDismissAllOfKind();
  const totalPending = buckets.reduce((s, b) => s + b.runs.length, 0)
                     + staleVacancies.length
                     + notifications.length;

  if (isLoading) return null;
  if (totalPending === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 mb-6">
        <CardContent className="py-3.5 px-4 flex items-center gap-2.5 text-[12px] text-emerald-900">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          <strong>All caught up.</strong>
          <span className="text-emerald-700">Nothing needs a click right now. Enjoy the quiet.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" />
              Pending actions
              <Badge variant="outline" className="text-[10px]">{totalPending}</Badge>
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Doctor flows that need a click — stale, blocked, or ready for the next manual step.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {notifications.length > 0 && (
          <NotificationsBucket
            notifications={notifications}
            unreadCount={unreadCount}
            onDismiss={(id) => dismiss.mutate(id)}
            onDismissAllOfKind={(kind) => dismissAllKind.mutate(kind)}
            onMarkAllRead={() => markAllRead.mutate()}
            onJump={(path) => navigate(path)}
          />
        )}
        {buckets.map(bucket => (
          <BucketSection
            key={bucket.key}
            bucket={bucket}
            onJump={(flowKey) => navigate(`/automations?flow=${flowKey}`)}
          />
        ))}
        {staleVacancies.length > 0 && (
          <VacancyBucket
            vacancies={staleVacancies}
            onJump={() => navigate("/vacancies")}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface KindMeta {
  label: string;
  icon:  typeof Sparkles;
  accent: string;       // text color for icon
  bg:     string;       // tinted background for the group header
}

// Centralised metadata for every notification kind tick-scheduler can produce.
// Anything not listed here falls through to a generic "Notification" bucket.
const KIND_META: Record<string, KindMeta> = {
  vacancy_match:        { label: "Vacancy matches",      icon: Sparkles,     accent: "text-violet-600",  bg: "bg-violet-50/60 border-violet-200" },
  interview_followup:   { label: "Interview follow-ups", icon: CalendarCheck, accent: "text-amber-600",  bg: "bg-amber-50/60 border-amber-200" },
  availability_checkin: { label: "Availability check-ins", icon: UserCheck,  accent: "text-sky-600",     bg: "bg-sky-50/60 border-sky-200" },
  signed_not_joined:    { label: "Signed, not joined yet", icon: FileSignature, accent: "text-emerald-600", bg: "bg-emerald-50/60 border-emerald-200" },
};

const GENERIC_META: KindMeta = { label: "Other", icon: Bell, accent: "text-slate-500", bg: "bg-slate-50/60 border-slate-200" };

// Display order — most actionable first.
const KIND_ORDER = ["vacancy_match", "interview_followup", "availability_checkin", "signed_not_joined"];

function NotificationsBucket({ notifications, unreadCount, onDismiss, onDismissAllOfKind, onMarkAllRead, onJump }: {
  notifications:       AppNotification[];
  unreadCount:         number;
  onDismiss:           (id: string) => void;
  onDismissAllOfKind:  (kind: string) => void;
  onMarkAllRead:       () => void;
  onJump:              (path: string) => void;
}) {
  // Group notifications by kind, preserving created_at desc within each.
  const groups = useMemo(() => {
    const byKind = new Map<string, AppNotification[]>();
    for (const n of notifications) {
      const arr = byKind.get(n.kind) ?? [];
      arr.push(n);
      byKind.set(n.kind, arr);
    }
    const keys = Array.from(byKind.keys()).sort((a, b) => {
      const ai = KIND_ORDER.indexOf(a); const bi = KIND_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return keys.map(k => ({ kind: k, items: byKind.get(k)! }));
  }, [notifications]);

  // Everything collapses by default. The panel stays small until the user
  // explicitly opens a group — then it grows to fit, capped by viewport.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="rounded-md border bg-emerald-50/30 border-emerald-200">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-emerald-200/60">
        <Bell className="h-3.5 w-3.5 text-emerald-700" />
        <span className="text-[12px] font-medium">Notifications</span>
        <Badge variant="outline" className="text-[10px] ml-1">{notifications.length}</Badge>
        {unreadCount > 0 && (
          <Badge variant="outline" className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-300">
            {unreadCount} new
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground hidden md:inline">
          · grouped by kind
        </span>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 ml-auto text-[10px] text-emerald-700 hover:bg-emerald-100"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
          </Button>
        )}
      </div>
      <div className="divide-y divide-emerald-200/40 bg-white">
        {groups.map(g => (
          <NotificationGroup
            key={g.kind}
            kind={g.kind}
            items={g.items}
            expanded={expanded.has(g.kind)}
            onToggle={() => toggle(g.kind)}
            onDismiss={onDismiss}
            onDismissAll={() => {
              if (confirm(`Dismiss all ${g.items.length} "${(KIND_META[g.kind] ?? GENERIC_META).label}"?`)) {
                onDismissAllOfKind(g.kind);
              }
            }}
            onJump={onJump}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationGroup({ kind, items, expanded, onToggle, onDismiss, onDismissAll, onJump }: {
  kind:         string;
  items:        AppNotification[];
  expanded:     boolean;
  onToggle:     () => void;
  onDismiss:    (id: string) => void;
  onDismissAll: () => void;
  onJump:       (path: string) => void;
}) {
  const meta = KIND_META[kind] ?? GENERIC_META;
  const Icon = meta.icon;
  const unread = items.filter(n => !n.read_at).length;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center gap-2 text-left border-l-2 transition-colors hover:bg-slate-50 ${meta.bg.replace(/bg-[a-z]+-50\/?\d*/, "")}`}
        style={{ borderLeftColor: "transparent" }}
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown  className="h-3 w-3 text-slate-400 shrink-0" />
          : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.accent}`} />
        <span className="text-[12px] font-medium truncate">{meta.label}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{items.length}</Badge>
        {unread > 0 && (
          <Badge variant="outline" className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-300 shrink-0">
            {unread} new
          </Badge>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDismissAll(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onDismissAll(); } }}
          className="ml-auto inline-flex items-center text-[10px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md cursor-pointer shrink-0"
          title={`Dismiss all ${items.length}`}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </span>
      </button>
      {expanded && (
        kind === "vacancy_match"
          ? <VacancyMatchRollup items={items} onDismiss={onDismiss} onJump={onJump} />
          : (
            <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto bg-white">
              {items.slice(0, 50).map(n => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    className={`px-3 py-2 pl-9 flex items-start gap-3 transition-colors ${isUnread ? "bg-emerald-50/30" : ""} hover:bg-slate-50`}
                  >
                    <button
                      onClick={() => n.link_path && onJump(n.link_path)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12px] truncate ${isUnread ? "font-medium text-slate-900" : "text-slate-700"}`}>
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-[10px] text-muted-foreground line-clamp-2">{n.body}</div>
                        )}
                        <div className="text-[9px] text-muted-foreground/80 mt-0.5">{relativeAge(n.created_at)}</div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                      onClick={() => onDismiss(n.id)}
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
              {items.length > 50 && (
                <div className="px-3 pl-9 py-1.5 text-[10px] text-muted-foreground">
                  +{items.length - 50} older — click "Clear" to dismiss them in bulk
                </div>
              )}
            </div>
          )
      )}
    </div>
  );
}

/** vacancy_match notifications get rolled up by the vacancy they're about
 *  so "500 New match · MNGHA Taif" collapses into a handful of "X matches
 *  for Y" rows. The recruiter cares about "this vacancy has new matches",
 *  not about each (doctor × vacancy) pair individually. Expand a row to see
 *  the doctor names underneath. */
function VacancyMatchRollup({ items, onDismiss, onJump }: {
  items: AppNotification[];
  onDismiss: (id: string) => void;
  onJump: (path: string) => void;
}) {
  // Bucket by related_vacancy_id; for any that's missing, fall back to the
  // notification title (which is "New match · <hospital>") so they still
  // group sensibly.
  const rollups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; specialty: string | null; items: AppNotification[]; latest: string }>();
    for (const n of items) {
      const key = n.related_vacancy_id ?? `t:${n.title}`;
      const specialty = extractMatchSpecialty(n.body);
      const existing = map.get(key);
      if (existing) {
        existing.items.push(n);
        if (n.created_at > existing.latest) existing.latest = n.created_at;
      } else {
        map.set(key, {
          key,
          title:     n.title.replace(/^New match\s*·\s*/i, "").trim() || n.title,
          specialty,
          items:     [n],
          latest:    n.created_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.latest < b.latest ? 1 : -1));
  }, [items]);

  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto bg-white">
      {rollups.map(r => {
        const unread = r.items.filter(n => !n.read_at).length;
        const isOpen = openKey === r.key;
        return (
          <div key={r.key}>
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : r.key)}
              className="w-full pl-9 pr-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50"
              aria-expanded={isOpen}
            >
              {isOpen
                ? <ChevronDown  className="h-3 w-3 text-slate-400 shrink-0" />
                : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-slate-900 truncate">
                  {r.items.length} match{r.items.length === 1 ? "" : "es"} for
                  {r.specialty ? <> <span className="text-violet-700">{r.specialty}</span> ·</> : null}
                  {" "}{r.title}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Latest {relativeAge(r.latest)}{unread > 0 && <> · <span className="text-emerald-700 font-medium">{unread} new</span></>}
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{r.items.length}</Badge>
            </button>
            {isOpen && (
              <div className="bg-slate-50/60 divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                {r.items.slice(0, 30).map(n => {
                  const isUnread = !n.read_at;
                  const doctor = extractMatchDoctor(n.body) ?? "(unknown doctor)";
                  return (
                    <div
                      key={n.id}
                      className={`pl-14 pr-3 py-1.5 flex items-center gap-2 ${isUnread ? "bg-white" : "bg-transparent"}`}
                    >
                      <button
                        onClick={() => n.link_path && onJump(n.link_path)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className={`text-[11px] ${isUnread ? "text-slate-900 font-medium" : "text-slate-600"}`}>
                          {doctor}
                        </span>
                        <span className="text-[9px] text-muted-foreground ml-1.5">{relativeAge(n.created_at)}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                        onClick={() => onDismiss(n.id)}
                        title="Dismiss"
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  );
                })}
                {r.items.length > 30 && (
                  <div className="pl-14 pr-3 py-1.5 text-[10px] text-muted-foreground">
                    +{r.items.length - 30} more — use the group's Clear to dismiss in bulk
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pull "{specialty} at {hospital}" out of the notification body. The body
 *  is generated by tick-scheduler in the form:
 *    "{name} ({doc-spec}) matches {VAC SPECIALTY} at {hospital}."
 *  We extract the VAC specialty since that's what the rollup is about. */
function extractMatchSpecialty(body: string | null): string | null {
  if (!body) return null;
  const m = body.match(/\bmatches\s+(.+?)\s+at\s+/i);
  return m ? m[1].trim() : null;
}
function extractMatchDoctor(body: string | null): string | null {
  if (!body) return null;
  const m = body.match(/^([^(]+)\s*\(/);
  return m ? m[1].trim() : null;
}

function VacancyBucket({ vacancies, onJump }: { vacancies: Vacancy[]; onJump: () => void }) {
  return (
    <div className="rounded-md border bg-violet-50/40 border-violet-200">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-current/10">
        <ClipboardList className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">Vacancies needing follow-up</span>
        <Badge variant="outline" className="text-[10px] ml-1">{vacancies.length}</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">Opened over 3d ago</span>
      </div>
      <div className="divide-y divide-current/10 max-h-[200px] overflow-y-auto">
        {vacancies.slice(0, 10).map(v => {
          const daysOpen = Math.floor((Date.now() - new Date(v.opened_at).getTime()) / 86_400_000);
          return (
            <button
              key={v.id}
              onClick={onJump}
              className="w-full text-left px-3 py-2 hover:bg-white/40 transition-colors flex items-center gap-3"
            >
              <ClipboardList className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-slate-900 truncate">{v.hospital_name} · {v.specialty}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {v.priority} priority · {daysOpen}d open
                  {v.opened_by && <> · opened by {v.opened_by}</>}
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            </button>
          );
        })}
        {vacancies.length > 10 && (
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-white/20">
            +{vacancies.length - 10} more — open the Vacancies page to see all
          </div>
        )}
      </div>
    </div>
  );
}

interface Bucket {
  key:     string;
  label:   string;
  icon:    React.ComponentType<{ className?: string }>;
  cls:     string;        // background tint
  blurb:   string;
  runs:    FlowRun[];
}

function groupIntoBuckets(items: FlowRun[]): Bucket[] {
  const now = Date.now();
  const stale: FlowRun[]   = [];
  const action: FlowRun[]  = [];
  const waiting: FlowRun[] = [];

  for (const r of items) {
    const ageDays = (now - new Date(r.last_event_at).getTime()) / 86_400_000;

    // Runs at a manual-action stage that the team is the bottleneck on:
    //   - profile_sent at awaiting_response → ready to mark shortlisted/declined
    //   - relocation at select_city_guide   → pick a city
    //   - contract_signing at awaiting_view or awaiting_signature past 3d → chase
    //   - any active flow where current_stage is an email kind that hasn't been sent (no email_sent event)
    if (r.flow_key === "relocation" && r.current_stage === "select_city_guide") {
      action.push(r);
      continue;
    }
    if (r.flow_key === "contract_signing" && (r.current_stage === "awaiting_view" || r.current_stage === "awaiting_signature") && ageDays > 3) {
      action.push(r);
      continue;
    }

    if (ageDays > 7) {
      stale.push(r);
      continue;
    }

    // Profile sent awaiting hospital reply — they're WAITING but worth surfacing
    if (r.flow_key === "profile_sent" && r.current_stage === "awaiting_response") {
      waiting.push(r);
      continue;
    }
  }

  return [
    { key: "action",  label: "Needs action now",        icon: AlertCircle, cls: "bg-rose-50/40 border-rose-200",   blurb: "Pick a city / chase a contract", runs: action  },
    { key: "stale",   label: "Stale (no activity 7d+)", icon: Clock,       cls: "bg-amber-50/40 border-amber-200", blurb: "Nothing's happened in a week",   runs: stale   },
    { key: "waiting", label: "Awaiting hospital reply", icon: Mail,        cls: "bg-blue-50/40 border-blue-200",   blurb: "Profile sent, no response yet",  runs: waiting },
  ].filter(b => b.runs.length > 0);
}

function BucketSection({ bucket, onJump }: { bucket: Bucket; onJump: (flowKey: FlowKey) => void }) {
  const Icon = bucket.icon;
  return (
    <div className={`rounded-md border ${bucket.cls}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-current/10">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">{bucket.label}</span>
        <Badge variant="outline" className="text-[10px] ml-1">{bucket.runs.length}</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">{bucket.blurb}</span>
      </div>
      <div className="divide-y divide-current/10 max-h-[200px] overflow-y-auto">
        {bucket.runs.slice(0, 10).map(run => {
          const flow = FLOW_DEFINITIONS[run.flow_key];
          const stage = flow.stages.find(s => s.key === run.current_stage);
          return (
            <button
              key={run.id}
              onClick={() => onJump(run.flow_key)}
              className="w-full text-left px-3 py-2 hover:bg-white/40 transition-colors flex items-center gap-3"
            >
              <FlowIcon flowKey={run.flow_key} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-slate-900 truncate">{run.doctor_name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {flow.shortName} · {stage?.label ?? run.current_stage}
                  {run.hospital && <> · {run.hospital}</>}
                  <> · {relativeAge(run.last_event_at)}</>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            </button>
          );
        })}
        {bucket.runs.length > 10 && (
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-white/20">
            +{bucket.runs.length - 10} more — open the {FLOW_DEFINITIONS[bucket.runs[0].flow_key].shortName} tab to see all
          </div>
        )}
      </div>
    </div>
  );
}

function FlowIcon({ flowKey }: { flowKey: FlowKey }) {
  const map: Record<FlowKey, React.ComponentType<{ className?: string }>> = {
    onboarding:       Mail,
    profile_sent:     Mail,
    shortlist:        Mail,
    interview:        Mail,
    contract_signing: FileSignature,
    relocation:       MapPin,
    second_payment:   Mail,
  };
  const Icon = map[flowKey] ?? Mail;
  return <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />;
}

function relativeAge(iso: string): string {
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

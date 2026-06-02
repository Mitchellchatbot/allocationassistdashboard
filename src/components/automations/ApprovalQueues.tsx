/**
 * Approval queues — single-action MVP.
 *
 * Surfaces every active flow run currently sitting at a manual-action
 * stage, grouped by what the team needs to do. Clicking a row sets the
 * `run` URL param, which causes the parent Automations page to open the
 * existing RunDetailSheet for that run.
 *
 * Queues are predicates over (flow_key, current_stage, status). When
 * adding a new manual stage to a flow, add the queue here too.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { Inbox, ChevronDown, ChevronRight, Mail, MapPin, FileSignature, ClipboardList, CalendarCheck, AlarmClock, User, Filter } from "lucide-react";
import { useAutomationFlowRuns, type FlowRun } from "@/hooks/use-automation-flows";
import { useAuth } from "@/hooks/use-auth";
import { findHiMemberByEmail, HI_TEAM_MEMBERS } from "@/lib/hi-team";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";

interface QueueDef {
  key:        string;
  title:      string;
  blurb:      string;
  icon:       typeof Mail;
  accentBg:   string;        // header background tint
  match:      (r: FlowRun) => boolean;
}

const QUEUE_DEFS: QueueDef[] = [
  {
    key:   "profile-awaiting-reply",
    title: "Profiles awaiting hospital reply",
    blurb: "Profile sent — chase if quiet > 3 days",
    icon:  Mail,
    accentBg: "bg-blue-50/50 border-blue-200",
    match: r => r.flow_key === "profile_sent" && r.current_stage === "awaiting_response" && r.status === "active",
  },
  {
    key:   "cities-to-pick",
    title: "Cities waiting to pick",
    blurb: "Doctor signed — choose a city to send the right relocation guide",
    icon:  MapPin,
    accentBg: "bg-violet-50/50 border-violet-200",
    match: r => r.flow_key === "relocation" && r.current_stage === "select_city_guide" && r.status === "active",
  },
  {
    key:   "contracts-pending",
    title: "Contracts pending signature",
    blurb: "BoldSign envelope sent — chase if stuck > 3 days",
    icon:  FileSignature,
    accentBg: "bg-rose-50/50 border-rose-200",
    match: r => r.flow_key === "contract_signing"
              && (r.current_stage === "awaiting_view" || r.current_stage === "awaiting_signature")
              && r.status === "active",
  },
  {
    key:   "forms-overdue",
    title: "Onboarding forms outstanding",
    blurb: "Welcome email sent — doctor hasn't completed the form yet",
    icon:  AlarmClock,
    accentBg: "bg-amber-50/50 border-amber-200",
    match: r => r.flow_key === "onboarding"
              && (r.current_stage === "wait_for_form" || r.current_stage === "reminder_form")
              && r.status === "active",
  },
  {
    key:   "interviews-pending",
    title: "Interviews scheduled — chase 72h post-interview",
    blurb: "Interview window open — spec says nudge the hospital at 72h",
    icon:  CalendarCheck,
    accentBg: "bg-emerald-50/50 border-emerald-200",
    match: r => r.flow_key === "interview" && r.current_stage === "interview_complete" && r.status === "active",
  },
];

export function ApprovalQueues({ onSelectRun }: { onSelectRun: (runId: string) => void }) {
  const { user, role } = useAuth();
  const myEmail = (user?.email ?? "").toLowerCase();
  const runsQ = useAutomationFlowRuns();
  const runs = runsQ.data ?? [];

  // Filters — assignee default depends on role: HI members default to "mine".
  const [assignee, setAssignee] = useState<"mine" | "all" | string>(
    role === "hi_member" ? "mine" : "all"
  );
  const [flowFilter, setFlowFilter] = useState<FlowKey | "all">("all");

  const filtered = useMemo(() => {
    return runs.filter(r => {
      if (flowFilter !== "all" && r.flow_key !== flowFilter) return false;
      if (assignee === "all") return true;
      if (assignee === "mine") {
        return (r.assigned_to ?? "").toLowerCase() === myEmail;
      }
      return (r.assigned_to ?? "").toLowerCase() === assignee.toLowerCase();
    });
  }, [runs, assignee, flowFilter, myEmail]);

  const queues = useMemo(() => {
    return QUEUE_DEFS.map(q => ({ ...q, runs: filtered.filter(q.match) }));
  }, [filtered]);

  const totalAcrossQueues = queues.reduce((s, q) => s + q.runs.length, 0);

  return (
    <div className="space-y-4">
      {/* ── Filters ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Filter className="h-3 w-3" /> Showing
          </div>

          {/* Assignee toggle */}
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setAssignee("mine")}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${assignee === "mine" ? "bg-teal-100 text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >Mine</button>
            <button
              type="button"
              onClick={() => setAssignee("all")}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${assignee === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >All team</button>
            {HI_TEAM_MEMBERS.map(m => (
              <button
                key={m.email}
                type="button"
                onClick={() => setAssignee(m.email)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${assignee === m.email ? "bg-teal-100 text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >{m.name.split(" ")[0]}</button>
            ))}
          </div>

          {/* Flow filter */}
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFlowFilter("all")}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${flowFilter === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >All flows</button>
            {(["profile_sent", "relocation", "contract_signing", "onboarding", "interview"] as FlowKey[]).map(fk => (
              <button
                key={fk}
                type="button"
                onClick={() => setFlowFilter(fk)}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${flowFilter === fk ? "bg-teal-100 text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >{FLOW_DEFINITIONS[fk].shortName}</button>
            ))}
          </div>

          <Badge variant="outline" className="ml-auto text-[10px]">
            {totalAcrossQueues} total
          </Badge>
        </CardContent>
      </Card>

      {/* ── Queues ──────────────────────────────────────────── */}
      {runsQ.isLoading && <CardListSkeleton rows={4} />}
      {!runsQ.isLoading && totalAcrossQueues === 0 && (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Inbox}
              title="No approvals waiting"
              body={assignee === "mine"
                ? "Nothing assigned to you needs a click right now. Switch the filter to All team to see what else is pending."
                : "The team has no pending approvals across all queues. Nice."}
            />
          </CardContent>
        </Card>
      )}
      {!runsQ.isLoading && queues.map(q => (
        <QueueSection key={q.key} queue={q} onSelectRun={onSelectRun} />
      ))}
    </div>
  );
}

function QueueSection({ queue, onSelectRun }: { queue: QueueDef & { runs: FlowRun[] }; onSelectRun: (id: string) => void }) {
  const [open, setOpen] = useState(queue.runs.length > 0);
  if (queue.runs.length === 0) return null;
  const Icon = queue.icon;
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${queue.accentBg}`}
        aria-expanded={open}
      >
        {open
          ? <ChevronDown  className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
        <Icon className="h-4 w-4 text-slate-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <CardTitle className="text-[13px]">{queue.title}</CardTitle>
          <CardDescription className="text-[11px]">{queue.blurb}</CardDescription>
        </div>
        <Badge variant="outline" className="bg-white text-[10px]">{queue.runs.length}</Badge>
      </button>
      {open && (
        <CardContent className="p-0">
          <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
            {queue.runs.map(r => (
              <button
                key={r.id}
                onClick={() => onSelectRun(r.id)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{r.doctor_name}</div>
                  <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                    {r.hospital && <span>{r.hospital}</span>}
                    {r.hospital && <span>·</span>}
                    <span>{relativeAge(r.last_event_at)}</span>
                    {r.assigned_to && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          {findHiMemberByEmail(r.assigned_to)?.name.split(" ")[0] ?? r.assigned_to.split("@")[0]}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
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

// Silence unused export from import — Checkbox kept in deps for future bulk
// actions phase but not used yet in the single-action MVP.
void Checkbox;
void Button;

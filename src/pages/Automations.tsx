import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AnimatedTabsList, AnimatedTabContent, AnimatedTabPanel, type AnimatedTabItem } from "@/components/AnimatedTabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutomationFlowDiagram } from "@/components/AutomationFlowDiagram";
import {
  FLOW_DEFINITIONS, FLOW_ORDER, getStageIndex,
  type FlowDefinition, type FlowKey, type FlowStage,
} from "@/lib/automation-flows";
import {
  useAutomationFlowRuns, useFlowRunEvents, useFlowConfigs,
  useUpdateFlowConfig, useAddRunNote,
  type FlowRun, type StageOverride,
} from "@/hooks/use-automation-flows";
import {
  Workflow, Mail, AlertTriangle, Clock, ChevronRight, Settings, Save, StickyNote,
  Hospital as HospitalIcon, Send, Zap, FileSignature, RefreshCw, Inbox, CalendarCheck,
  Sparkles, X as XIcon, CheckCircle2, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { HospitalsTab } from "@/components/automations/HospitalsTab";
import { EmailTemplatesTab } from "@/components/automations/EmailTemplatesTab";
import { ApprovalQueues } from "@/components/automations/ApprovalQueues";
import { ReassignButton } from "@/components/automations/ReassignButton";
import { SendProfileDialog } from "@/components/automations/SendProfileDialog";
import { TriggerFlowDialog } from "@/components/automations/TriggerFlowDialog";
import { ClassifyReplyDialog } from "@/components/automations/ClassifyReplyDialog";
import { lazy, Suspense } from "react";
// Lazy-load the Contract Builder so opening the Sheet doesn't bloat the
// Automations bundle. Only fetched when the user clicks "Send contract".
const ContractsEmbedded = lazy(() => import("./Contracts"));

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusBadge(status: FlowRun["status"]) {
  const map: Record<FlowRun["status"], string> = {
    active:    "bg-teal-100 text-teal-800 border-teal-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    paused:    "bg-amber-100 text-amber-800 border-amber-200",
    failed:    "bg-rose-100 text-rose-800 border-rose-200",
  };
  return <Badge variant="outline" className={`${map[status]} text-[10px] uppercase tracking-wider`}>{status}</Badge>;
}

type TabKey = FlowKey | "settings" | "hospitals" | "templates" | "queues";

export default function Automations() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Default tab is profile_sent now that Onboarding is hidden (Ammar
  // 2026-06-03: Sales already sends the intake form from Zoho when a
  // lead converts to Doctor on Board; our duplicate is removed).
  const initialFlow = (searchParams.get("flow") as TabKey | null) ?? "profile_sent";
  const initialRunId = searchParams.get("run");
  const [activeFlow, setActiveFlow] = useState<TabKey>(initialFlow);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);

  // Sync url param ↔ open run so deep-links from /my-workspace land on
  // the right detail sheet and the URL stays shareable.
  useEffect(() => {
    const urlRunId = searchParams.get("run");
    if (urlRunId !== selectedRunId) setSelectedRunId(urlRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  useEffect(() => {
    const urlRunId = searchParams.get("run");
    if (selectedRunId && selectedRunId !== urlRunId) {
      const next = new URLSearchParams(searchParams);
      next.set("run", selectedRunId);
      setSearchParams(next, { replace: true });
    } else if (!selectedRunId && urlRunId) {
      const next = new URLSearchParams(searchParams);
      next.delete("run");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId]);
  const [sendProfileOpen, setSendProfileOpen] = useState(false);
  const [triggerFlow, setTriggerFlow] = useState<FlowKey | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [tickRunning, setTickRunning] = useState(false);
  const queryClient = useQueryClient();

  const runsQ    = useAutomationFlowRuns();
  const configsQ = useFlowConfigs();

  const runs = runsQ.data ?? [];
  const runsByFlow = useMemo(() => {
    const m: Record<string, FlowRun[]> = {};
    for (const r of runs) {
      (m[r.flow_key] ??= []).push(r);
    }
    return m;
  }, [runs]);

  const selectedRun = useMemo(
    () => runs.find(r => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const stats = useMemo(() => {
    const totals = { active: 0, completed: 0, paused: 0, failed: 0 };
    for (const r of runs) totals[r.status]++;
    return totals;
  }, [runs]);

  // Manually invoke the tick-scheduler edge function. Same code path pg_cron
  // runs every 5 min — exposed here so the team can test time-gated stages
  // (form reminders, second-payment cadence) without waiting on the cron.
  const runSchedulerNow = async () => {
    setTickRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("tick-scheduler", { body: {} });
      if (error) throw error;
      const s = (data as { summary?: { sent: number; skipped: number; errors: number; inspected: number } })?.summary;
      if (s) {
        const parts = [
          `${s.inspected} run${s.inspected === 1 ? "" : "s"} inspected`,
          s.sent    ? `${s.sent} sent`       : null,
          s.errors  ? `${s.errors} errored`  : null,
        ].filter(Boolean).join(" · ");
        if (s.sent === 0 && s.errors === 0) {
          toast.success(`Scheduler tick · nothing due (${s.inspected} inspected)`);
        } else if (s.errors > 0) {
          toast.warning(`Scheduler tick · ${parts}`);
        } else {
          toast.success(`Scheduler tick · ${parts}`);
        }
      } else {
        toast.success("Scheduler tick complete");
      }
      queryClient.invalidateQueries({ queryKey: ["automation-flow-runs"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Scheduler tick failed: ${msg}`);
    } finally {
      setTickRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Workflow className="h-6 w-6 text-teal-600" />
              Automations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hospital Introduction Department — Phase 1 email flows. Tracks every doctor currently in flight and their current stage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runSchedulerNow}
              disabled={tickRunning}
              title="Advance any time-gated runs that are now due. Same job pg_cron fires every 5 min."
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${tickRunning ? "animate-spin" : ""}`} />
              {tickRunning ? "Running…" : "Run scheduler"}
            </Button>
            <KpiPill label="Active"    value={stats.active}    tone="teal" />
            <KpiPill label="Completed" value={stats.completed} tone="emerald" />
            <KpiPill label="Paused"    value={stats.paused}    tone="amber" />
            <KpiPill label="Failed"    value={stats.failed}    tone="rose" />
          </div>
        </div>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 flex items-start gap-2 text-[12px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-[2px]" />
            <div>
              <strong>Build status:</strong> UI shell is live. The sender engine (Zoho triggers + email service) connects once Saif sends the 95 hospital templates,
              relocation guides, and master process doc. Until then, runs are seeded for demo purposes — no real emails are sent.
            </div>
          </CardContent>
        </Card>

        {(() => {
          const flowItems: AnimatedTabItem[] = FLOW_ORDER.map(key => ({
            value: key,
            label: FLOW_DEFINITIONS[key].shortName,
            count: runsByFlow[key]?.length ?? 0,
          }));
          const adminItems: AnimatedTabItem[] = [
            { value: "queues",    label: <><Inbox        className="h-3.5 w-3.5" /> Queues</> },
            { value: "hospitals", label: <><HospitalIcon className="h-3.5 w-3.5" /> Hospitals</> },
            { value: "templates", label: <><Mail         className="h-3.5 w-3.5" /> Templates</> },
            { value: "settings",  label: <><Settings     className="h-3.5 w-3.5" /> Default Flow Editor</> },
          ];
          return (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div data-tour="automations-flows">
                  <AnimatedTabsList
                    items={flowItems}
                    value={activeFlow}
                    onChange={v => setActiveFlow(v as TabKey)}
                    groupId="automation-flows"
                  />
                </div>
                <div data-tour="automations-admin">
                  <AnimatedTabsList
                    items={adminItems}
                    value={activeFlow}
                    onChange={v => setActiveFlow(v as TabKey)}
                    groupId="automation-admin"
                  />
                </div>
              </div>

              <AnimatedTabContent active={activeFlow}>
                {FLOW_ORDER.map(key => (
                  <AnimatedTabPanel key={key} value={key} active={activeFlow}>
                    <FlowTab
                      flow={FLOW_DEFINITIONS[key]}
                      runs={runsByFlow[key] ?? []}
                      onSelectRun={setSelectedRunId}
                      onSendProfile={key === "profile_sent" ? () => setSendProfileOpen(true) : undefined}
                      onSendContract={key === "contract_signing" ? () => setContractOpen(true) : undefined}
                      onTriggerFlow={
                        // 'onboarding' intentionally absent — Sales sends
                        // the intake email from Zoho now; we don't trigger
                        // a duplicate from here (Ammar 2026-06-03).
                        key === "shortlist" ||
                        key === "interview" || key === "second_payment"
                          ? () => setTriggerFlow(key)
                          : undefined
                      }
                    />
                  </AnimatedTabPanel>
                ))}
                <AnimatedTabPanel value="queues" active={activeFlow}>
                  <ApprovalQueues onSelectRun={setSelectedRunId} />
                </AnimatedTabPanel>
                <AnimatedTabPanel value="hospitals" active={activeFlow}>
                  <HospitalsTab />
                </AnimatedTabPanel>
                <AnimatedTabPanel value="templates" active={activeFlow}>
                  <EmailTemplatesTab />
                </AnimatedTabPanel>
                <AnimatedTabPanel value="settings" active={activeFlow}>
                  <DefaultFlowEditor
                    flows={FLOW_ORDER.map(k => FLOW_DEFINITIONS[k])}
                    configs={configsQ.data ?? []}
                  />
                </AnimatedTabPanel>
              </AnimatedTabContent>
            </>
          );
        })()}
      </div>

      <RunDetailSheet
        run={selectedRun}
        open={!!selectedRunId}
        onClose={() => setSelectedRunId(null)}
      />

      <SendProfileDialog
        open={sendProfileOpen}
        onClose={() => setSendProfileOpen(false)}
      />

      <TriggerFlowDialog
        open={!!triggerFlow}
        flowKey={triggerFlow}
        onClose={() => setTriggerFlow(null)}
      />

      {/* Contract Builder opens inline as a side Sheet so the team doesn't lose
          their place in the Automations workflow. The page itself is lazy-loaded
          so it only ships when actually opened. On send, the boldsign-send
          edge function records a `contract_signing` flow run; when the doctor
          signs, the boldsign-webhook completes that run AND auto-creates a
          Relocation run — so this Sheet is the final manual step in the chain. */}
      <Sheet open={contractOpen} onOpenChange={setContractOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[1100px] overflow-y-auto p-6">
          <SheetHeader className="pb-4 border-b mb-4">
            <SheetTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-teal-600" />
              Send Contract
            </SheetTitle>
            <div className="text-[11px] text-muted-foreground">
              Once the doctor signs via BoldSign, the Relocation flow auto-fires automatically.
            </div>
          </SheetHeader>
          <Suspense fallback={<div className="py-12 text-center text-[12px] text-muted-foreground">Loading Contract Builder…</div>}>
            {/* TEST recipient — every send from this Sheet routes to your inbox
                instead of the actual doctor. Drop this prop (or pass null)
                when ready to send to real doctors. The standalone /contracts
                page has no override and uses each lead's real email. */}
            <ContractsEmbedded embedded testRecipient="shaheerkhosa6@gmail.com" />
          </Suspense>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}

function KpiPill({ label, value, tone }: { label: string; value: number; tone: "teal" | "emerald" | "amber" | "rose" }) {
  const colors: Record<typeof tone, string> = {
    teal:    "bg-teal-50 text-teal-700 border-teal-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <div className={`rounded-md border px-3 py-1.5 ${colors[tone]}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-semibold leading-tight">{value}</div>
    </div>
  );
}

const TRIGGER_BUTTON_LABEL: Partial<Record<FlowKey, string>> = {
  onboarding:     "Mark first payment received",
  shortlist:      "Mark shortlisted",
  interview:      "Mark interview confirmed",
  second_payment: "Set joining date",
};

function FlowTab({ flow, runs, onSelectRun, onSendProfile, onSendContract, onTriggerFlow }: {
  flow: FlowDefinition;
  runs: FlowRun[];
  onSelectRun: (id: string) => void;
  onSendProfile?:  () => void;
  onSendContract?: () => void;
  onTriggerFlow?:  () => void;
}) {
  const triggerLabel = TRIGGER_BUTTON_LABEL[flow.key];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{flow.name}</CardTitle>
              <CardDescription className="mt-1">{flow.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onSendProfile && (
                <Button size="sm" onClick={onSendProfile}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Send profile
                </Button>
              )}
              {onSendContract && (
                <Button size="sm" onClick={onSendContract}>
                  <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Send contract
                </Button>
              )}
              {onTriggerFlow && triggerLabel && (
                <Button size="sm" onClick={onTriggerFlow}>
                  <Zap className="h-3.5 w-3.5 mr-1.5" /> {triggerLabel}
                </Button>
              )}
              <Badge variant="outline" className="text-[10px]">
                {flow.stages.length} stages
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-slate-50/50 p-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1 px-1">Default flow</div>
            <AutomationFlowDiagram flow={flow} currentStage="__none__" />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
              People currently in flow ({runs.length})
            </div>
            {runs.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 px-6 text-center">
                <div className="text-sm font-medium text-slate-600 mb-1">No active runs</div>
                <div className="text-[12px] text-muted-foreground max-w-[420px] mx-auto">
                  {onSendProfile  && "Click \"Send profile\" above to introduce a doctor to a hospital."}
                  {onTriggerFlow  && triggerLabel && `Click "${triggerLabel}" above to start a run for a specific doctor.`}
                  {!onSendProfile && !onTriggerFlow && "Runs appear here once they're triggered by another flow or an external event (e.g. BoldSign webhook)."}
                </div>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Doctor</TableHead>
                      <TableHead className="text-[11px]">Current Stage</TableHead>
                      <TableHead className="text-[11px]">Hospital</TableHead>
                      <TableHead className="text-[11px]">Status</TableHead>
                      <TableHead className="text-[11px]">Last Event</TableHead>
                      <TableHead className="text-[11px] w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map(run => {
                      const stageIdx = getStageIndex(flow.key, run.current_stage);
                      const stage    = flow.stages[stageIdx];
                      return (
                        <TableRow
                          key={run.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => onSelectRun(run.id)}
                        >
                          <TableCell>
                            <div className="font-medium text-[13px]">{run.doctor_name}</div>
                            <div className="text-[11px] text-muted-foreground">{run.doctor_email ?? run.doctor_phone ?? "—"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground">{stageIdx + 1}/{flow.stages.length}</span>
                              <span className="text-[12px]">{stage?.label ?? run.current_stage}</span>
                            </div>
                            <div className="mt-1 flex h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="bg-teal-500"
                                style={{ width: `${Math.max(4, ((stageIdx + 1) / flow.stages.length) * 100)}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-[12px]">{run.hospital ?? "—"}</TableCell>
                          <TableCell>{statusBadge(run.status)}</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />{relativeTime(run.last_event_at)}
                          </TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 text-slate-400" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Flow Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-[12px]">
          <Block label="Trigger" value={flow.triggerCopy} />
          <Block label="Stages"  value={
            <ol className="list-decimal pl-4 space-y-1">
              {flow.stages.map(s => <li key={s.key}>{s.label}</li>)}
            </ol>
          } />
          <Block label="Stops" value="Doctor reaches the terminal stage or a team member manually pauses / completes the run." />
        </CardContent>
      </Card>
    </div>
  );
}

function Block({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-[12px] text-slate-800">{value}</div>
    </div>
  );
}

function RunDetailSheet({ run, open, onClose }: { run: FlowRun | null; open: boolean; onClose: () => void }) {
  // IMPORTANT: All hooks MUST be called before any early return — React
  // requires the same hook order on every render, and the early return for
  // `!run || !flow` would skip them when run is null on first mount, then
  // call them on the next render → "different number of hooks" crash.
  const eventsQ = useFlowRunEvents(run?.id ?? null);
  const flow    = run ? FLOW_DEFINITIONS[run.flow_key] : null;
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [sending,  setSending]  = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [pickedCity, setPickedCity] = useState<string>("");
  const [sendingCity, setSendingCity] = useState(false);
  const addNote = useAddRunNote();
  const qc = useQueryClient();

  // Default the side panel to the doctor's current stage when the sheet opens.
  const focusedStage = selectedStage ?? run?.current_stage ?? null;
  const focusedStageDef: FlowStage | null = useMemo(() => {
    if (!flow || !focusedStage) return null;
    return flow.stages.find(s => s.key === focusedStage) ?? null;
  }, [flow, focusedStage]);

  const eventsForFocused = useMemo(
    () => (eventsQ.data ?? []).filter(e => e.stage_key === focusedStage),
    [eventsQ.data, focusedStage],
  );

  // Re-seed pickedCity whenever the selected run changes, so opening a
  // different run's drawer picks up its metadata.city (if any).
  useEffect(() => {
    if (!run) return;
    const md = (run.metadata ?? {}) as Record<string, unknown>;
    setPickedCity((md.city as string | undefined) ?? "");
  }, [run?.id]);

  if (!run || !flow) return null;

  // "Send now" is available when the current stage is an email/reminder
  // kind. Hides itself once an email_sent event already exists for this
  // stage (so users don't accidentally double-send).
  const currentStageDef = flow.stages.find(s => s.key === run.current_stage);
  const isSendable = currentStageDef && (currentStageDef.kind === "email" || currentStageDef.kind === "reminder");
  const alreadySent = (eventsQ.data ?? []).some(e => e.stage_key === run.current_stage && e.event_type === "email_sent");

  // "Classify reply" is offered for Profile Sent runs waiting on hospital
  // response. Lets the team paste the hospital's reply and have Claude
  // auto-advance the flow (shortlisted → fires Shortlist email automatically).
  const showClassifyReply = run.flow_key === "profile_sent" && run.status === "active";

  // Relocation runs land at `select_city_guide` waiting for someone to pick
  // the right city-specific guide. In production the city should be derived
  // from the hospital, but if hospital isn't known (e.g. Contract Builder
  // didn't capture it), the team picks here.
  const showCityPicker = run.flow_key === "relocation" && run.current_stage === "select_city_guide" && run.status === "active";

  const handleSendCityGuide = async () => {
    if (!pickedCity.trim() || sendingCity) return;
    setSendingCity(true);
    try {
      // 1. Update metadata + advance the stage
      const newMetadata = { ...(run.metadata as Record<string, unknown>), city: pickedCity.trim() };
      const { error: updateErr } = await supabase
        .from("automation_flow_runs")
        .update({
          current_stage: "send_relocation_email",
          last_event_at: new Date().toISOString(),
          metadata:      newMetadata,
        })
        .eq("id", run.id);
      if (updateErr) throw updateErr;

      // Add a note event for the audit trail
      await supabase.from("automation_flow_events").insert({
        run_id:     run.id,
        stage_key:  "select_city_guide",
        event_type: "completed",
        message:    `City picked: ${pickedCity.trim()}. Advancing to send the relocation guide.`,
      });

      // 2. Invoke send-flow-email — now reads metadata.city and renders the
      //    guide with that city. Auto-advances to send_attestation_email after.
      const { data, error: sendErr } = await supabase.functions.invoke("send-flow-email", {
        body: { run_id: run.id },
      });
      if (sendErr) throw sendErr;
      const resp = data as { ok: boolean; error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Send failed");

      toast.success(`Relocation guide for ${pickedCity.trim()} sent`);
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", run.id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send guide";
      toast.error(msg);
    } finally {
      setSendingCity(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !focusedStage) return;
    await addNote.mutateAsync({ run_id: run.id, stage_key: focusedStage, message: noteText.trim() });
    setNoteText("");
    toast.success("Note added");
  };

  const handleSendNow = async (opts: { force?: boolean } = {}) => {
    if (!run || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-flow-email", {
        body: { run_id: run.id, force: opts.force ?? false },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; error?: string; to?: string; subject?: string; completed?: boolean; already_sent?: boolean };
      if (!resp.ok) {
        if (resp.already_sent) {
          // The function blocked because email_sent already exists. Show a
          // confirm with the option to override.
          if (window.confirm("This stage was already emailed. Send again?")) {
            await handleSendNow({ force: true });
            return;
          }
          toast.info("No email sent — already delivered for this stage.");
          return;
        }
        throw new Error(resp.error ?? "Send failed");
      }
      toast.success(
        resp.completed
          ? `Sent "${resp.subject}" — flow complete`
          : `Sent "${resp.subject}" to ${resp.to}`,
      );
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", run.id] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[920px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-teal-600" />
                {run.doctor_name}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mt-1">
                <span>{flow.name}</span>
                <span>·</span>
                <span>{run.doctor_email ?? run.doctor_phone ?? "no contact"}</span>
                {run.hospital && <><span>·</span><span>{run.hospital}</span></>}
                <span>·</span>
                {statusBadge(run.status)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ReassignButton runId={run.id} currentAssignee={run.assigned_to} />
              {/* Track placement — deep-links to Reports → Placements
                  with this doctor's editor pre-opened. Useful when a
                  hospital reply confirms an offer or a join date; the
                  team can log the milestone without losing context. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.location.href = `/reports?placement=${encodeURIComponent(run.doctor_id ?? "")}`;
                }}
                title="Jump to Placements with this doctor's milestones open"
              >
                <Briefcase className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                Track placement
              </Button>
              {showClassifyReply && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setClassifyOpen(true)}
                  title="Paste the hospital's reply — Claude classifies it and advances the flow automatically"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-600" />
                  Hospital replied?
                </Button>
              )}
              {isSendable && (
                <Button
                  size="sm"
                  onClick={() => handleSendNow()}
                  disabled={sending}
                  variant={alreadySent ? "outline" : "default"}
                  title={alreadySent ? "An email has already been sent for this stage. Click to send again." : `Send "${currentStageDef?.label}" email now`}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {sending ? "Sending..." : alreadySent ? "Resend email" : "Send now"}
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {showCityPicker && (
          <div className="rounded-md border-2 border-amber-200 bg-amber-50/50 p-4 mt-4">
            <div className="flex items-start gap-2 mb-3">
              <span className="text-amber-600 leading-none mt-[2px]">📍</span>
              <div className="text-[12px] text-amber-900 leading-relaxed">
                <strong>Pick the relocation city.</strong> The doctor signed their offer — to send the right city-specific guide, we need to know where they're relocating. In production this auto-fills from the hospital; manually picking here while we wire that.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pickedCity}
                onChange={e => setPickedCity(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px]"
              >
                <option value="">Pick a city...</option>
                <option value="Dubai">Dubai</option>
                <option value="Abu Dhabi">Abu Dhabi</option>
                <option value="Sharjah">Sharjah</option>
                <option value="Ras Al Khaimah">Ras Al Khaimah (RAK)</option>
                <option value="Ajman">Ajman</option>
                <option value="Fujairah">Fujairah</option>
                <option value="Umm Al Quwain">Umm Al Quwain</option>
                <option value="Al Ain">Al Ain</option>
                <option value="Riyadh">Riyadh</option>
                <option value="Jeddah">Jeddah</option>
                <option value="Dammam">Dammam</option>
                <option value="Doha">Doha (Qatar)</option>
                <option value="Manama">Manama (Bahrain)</option>
                <option value="Kuwait City">Kuwait City</option>
                <option value="Muscat">Muscat (Oman)</option>
              </select>
              <Button
                size="sm"
                onClick={handleSendCityGuide}
                disabled={!pickedCity.trim() || sendingCity}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sendingCity ? "Sending..." : "Send guide"}
              </Button>
            </div>
          </div>
        )}

        {/* Interview-time coordinator. Shown on profile_sent runs where
            the hospital reply classifier extracted proposed times. The
            team picks one, the system creates the Interview run pre-
            filled with the chosen slot and fires the tips email. */}
        <InterviewTimePicker run={run} />

        {/* Shortlist suggestion. Shown on profile_sent runs where the
            classifier thinks the hospital expressed interest. Ammar
            2026-06-03: hospitals rarely write 'shortlisted' explicitly,
            so the system never auto-advances anymore — it only suggests,
            and the team manually confirms here. */}
        <ShortlistSuggestion run={run} />

        {showClassifyReply && (
          <ClassifyReplyDialog
            open={classifyOpen}
            onClose={() => setClassifyOpen(false)}
            runId={run.id}
            doctorName={run.doctor_name}
            hospitalName={run.hospital}
          />
        )}

        <div className="py-4 space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Flow Diagram</div>
            <AutomationFlowDiagram
              flow={flow}
              currentStage={run.current_stage}
              events={eventsQ.data}
              selectedStage={focusedStage}
              onSelectStage={setSelectedStage}
            />
            <div className="mt-2 text-[10px] text-muted-foreground italic">
              Click any stage to see notes + events. The currently active stage has a teal glow.
            </div>
          </div>

          {focusedStageDef && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <focusedStageDef.icon className="h-4 w-4 text-slate-600" />
                    {focusedStageDef.label}
                  </CardTitle>
                  <CardDescription className="text-[11px] capitalize">{focusedStageDef.kind}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-[12px]">
                  <div className="text-slate-700 leading-relaxed">{focusedStageDef.description}</div>
                  {focusedStageDef.defaultSubject && (
                    <Block label="Default subject" value={
                      <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{focusedStageDef.defaultSubject}</code>
                    } />
                  )}
                  {focusedStageDef.defaultDelayDays !== undefined && (
                    <Block label="Default delay" value={`${focusedStageDef.defaultDelayDays} day${focusedStageDef.defaultDelayDays === 1 ? "" : "s"} after previous stage`} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-slate-600" />
                    Notes &amp; Events
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    {eventsForFocused.length} event{eventsForFocused.length === 1 ? "" : "s"} on this stage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                    {eventsForFocused.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground italic">No events on this stage yet.</div>
                    ) : eventsForFocused.map(e => (
                      <div key={e.id} className="rounded border bg-slate-50/50 p-2">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="uppercase tracking-wider">{e.event_type.replace(/_/g, " ")}</span>
                          <span>{relativeTime(e.occurred_at)}</span>
                        </div>
                        {e.message && <div className="text-[12px] text-slate-800 mt-1">{e.message}</div>}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t">
                    <Label htmlFor="note" className="text-[11px]">Add a note</Label>
                    <Textarea
                      id="note"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="e.g. doctor confirmed receipt by WhatsApp"
                      className="text-[12px] min-h-[60px]"
                    />
                    <Button size="sm" disabled={!noteText.trim() || addNote.isPending} onClick={handleAddNote} className="w-full">
                      {addNote.isPending ? "Adding..." : "Add note"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Full Timeline</CardTitle>
              <CardDescription className="text-[11px]">All events across every stage for this run.</CardDescription>
            </CardHeader>
            <CardContent>
              {(eventsQ.data ?? []).length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic py-2">
                  No events yet. Events appear here when the sender executes a stage or a team member adds a note.
                </div>
              ) : (
                <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
                  {(eventsQ.data ?? []).map(e => {
                    const stage = flow.stages.find(s => s.key === e.stage_key);
                    return (
                      <li key={e.id} className="ml-4 relative">
                        <div className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-teal-500 ring-2 ring-white" />
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {stage?.label ?? e.stage_key} · {e.event_type.replace(/_/g, " ")} · {relativeTime(e.occurred_at)}
                        </div>
                        {e.message && <div className="text-[12px] text-slate-800 mt-0.5">{e.message}</div>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Default Flow Editor ──────────────────────────────────────────────────────

function DefaultFlowEditor({ flows, configs }: { flows: FlowDefinition[]; configs: { flow_key: FlowKey; enabled: boolean; stage_overrides: Record<string, StageOverride> }[] }) {
  const configByKey = useMemo(() => {
    const m = new Map<FlowKey, { enabled: boolean; overrides: Record<string, StageOverride> }>();
    for (const c of configs) m.set(c.flow_key, { enabled: c.enabled, overrides: c.stage_overrides ?? {} });
    return m;
  }, [configs]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3 px-4 text-[12px] text-slate-700">
          Edit subject lines, delay days, and on/off state per stage. Changes apply to every new run of that flow.
          Already-running flows continue with the values they started with.
        </CardContent>
      </Card>
      {flows.map(flow => (
        <FlowConfigCard
          key={flow.key}
          flow={flow}
          enabled={configByKey.get(flow.key)?.enabled ?? true}
          overrides={configByKey.get(flow.key)?.overrides ?? {}}
        />
      ))}
    </div>
  );
}

function FlowConfigCard({ flow, enabled, overrides }: { flow: FlowDefinition; enabled: boolean; overrides: Record<string, StageOverride> }) {
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [localOverrides, setLocalOverrides] = useState<Record<string, StageOverride>>(overrides);
  const update = useUpdateFlowConfig();

  const dirty =
    localEnabled !== enabled ||
    JSON.stringify(localOverrides) !== JSON.stringify(overrides);

  const setOverride = (stageKey: string, patch: StageOverride) => {
    setLocalOverrides(prev => ({ ...prev, [stageKey]: { ...prev[stageKey], ...patch } }));
  };

  const handleSave = async () => {
    await update.mutateAsync({ flow_key: flow.key, enabled: localEnabled, stage_overrides: localOverrides });
    toast.success(`Saved ${flow.name}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm">{flow.name}</CardTitle>
            <CardDescription className="text-[11px] mt-1">{flow.summary}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor={`enabled-${flow.key}`} className="text-[12px]">Flow enabled</Label>
              <Switch
                id={`enabled-${flow.key}`}
                checked={localEnabled}
                onCheckedChange={setLocalEnabled}
              />
            </div>
            <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {flow.stages.filter(s => s.kind === "email" || s.kind === "reminder" || s.kind === "wait").map(stage => {
          const ov = localOverrides[stage.key] ?? {};
          return (
            <div key={stage.key} className="rounded-md border p-3 bg-slate-50/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <stage.icon className="h-3.5 w-3.5 text-slate-600" />
                  <span className="text-[12px] font-medium">{stage.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stage.kind}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`stage-en-${flow.key}-${stage.key}`} className="text-[11px] text-muted-foreground">Step enabled</Label>
                  <Switch
                    id={`stage-en-${flow.key}-${stage.key}`}
                    checked={ov.enabled ?? true}
                    onCheckedChange={v => setOverride(stage.key, { enabled: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(stage.kind === "email" || stage.kind === "reminder") && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Email subject</Label>
                    <Input
                      className="mt-1 text-[12px]"
                      placeholder={stage.defaultSubject ?? ""}
                      value={ov.subject ?? ""}
                      onChange={e => setOverride(stage.key, { subject: e.target.value })}
                    />
                  </div>
                )}
                {stage.defaultDelayDays !== undefined && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Delay (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      className="mt-1 text-[12px]"
                      placeholder={String(stage.defaultDelayDays)}
                      value={ov.delayDays ?? ""}
                      onChange={e => setOverride(stage.key, { delayDays: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </div>
                )}
                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Internal note for this step</Label>
                  <Textarea
                    className="mt-1 text-[12px] min-h-[44px]"
                    placeholder="Optional — e.g. 'use updated phrasing per Saif, May 27'"
                    value={ov.notes ?? ""}
                    onChange={e => setOverride(stage.key, { notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

interface ProposedTime { iso: string; label: string; format: "in_person" | "video" | "phone" | "unknown" }

/** Coordinator panel that surfaces interview times the hospital proposed
 *  in their reply (extracted by classify-hospital-reply). The team picks
 *  one — the system creates an `interview` run pre-filled with that slot
 *  + the format, then fires the tips/confirmation email to the doctor.
 *
 *  Hidden when the run has no `proposed_interview_times` metadata.
 *  Re-renders the picker if a NEW reply arrives with revised times. */
function InterviewTimePicker({ run }: { run: FlowRun }) {
  const md = (run.metadata as Record<string, unknown>) ?? {};
  const proposed = (md.proposed_interview_times as ProposedTime[] | undefined) ?? [];
  const [pickedIso, setPickedIso] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();

  if (proposed.length === 0) return null;

  const handleConfirm = async (slot: ProposedTime) => {
    setConfirming(true);
    setPickedIso(slot.iso);
    try {
      const nowIso = new Date().toISOString();

      // Mark the profile_sent run completed (introduction succeeded).
      await supabase.from("automation_flow_runs").update({
        current_stage: "introduction_complete",
        status:        "completed",
        completed_at:  nowIso,
        last_event_at: nowIso,
        metadata:      { ...md, picked_interview_time: slot.iso, picked_interview_label: slot.label },
      }).eq("id", run.id);

      // Create the Interview run pre-filled with the picked slot.
      const { data: interviewRun, error: createErr } = await supabase
        .from("automation_flow_runs")
        .insert({
          flow_key:      "interview",
          doctor_id:     run.doctor_id,
          doctor_name:   run.doctor_name,
          doctor_email:  run.doctor_email,
          doctor_phone:  run.doctor_phone,
          hospital:      run.hospital,
          current_stage: "send_interview_email",
          status:        "active",
          metadata: {
            triggered_via:        "hospital_proposed_time_picker",
            source_profile_run:   run.id,
            interview_datetime:   slot.label,
            interview_iso:        slot.iso,
            interview_format:     slot.format === "unknown" ? "" : slot.format,
          },
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      if (!interviewRun) throw new Error("Interview run insert returned no row");

      await supabase.from("automation_flow_events").insert([
        { run_id: run.id, stage_key: "awaiting_response", event_type: "completed",
          message: `Interview time confirmed: ${slot.label}. Created interview run + queued tips email.` },
        { run_id: interviewRun.id, stage_key: "trigger_interview_confirmed", event_type: "entered",
          message: `Auto-triggered: ${run.hospital ?? "hospital"} proposed ${slot.label}, team confirmed.` },
        { run_id: interviewRun.id, stage_key: "send_interview_email", event_type: "entered",
          message: "Queued for sending." },
      ]);

      // Fire the tips + confirmation email to the doctor.
      const { error: sendErr } = await supabase.functions.invoke("send-flow-email", {
        body: { run_id: interviewRun.id },
      });
      if (sendErr) throw sendErr;

      toast.success(`Interview locked for ${slot.label}. Tips + confirmation sent to ${run.doctor_name}.`);
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", run.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm time");
      setPickedIso(null);
    } finally {
      setConfirming(false);
    }
  };

  const formatLabel = (s: ProposedTime) => {
    try {
      const d = new Date(s.iso);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        });
      }
    } catch { /* fall through */ }
    return s.label;
  };

  return (
    <div className="rounded-md border-2 border-violet-200 bg-violet-50/40 p-4 mt-4">
      <div className="flex items-start gap-2 mb-3">
        <CalendarCheck className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
        <div className="text-[12px] text-violet-900 leading-relaxed">
          <strong>{run.hospital ?? "Hospital"} proposed {proposed.length} interview time{proposed.length === 1 ? "" : "s"}.</strong>
          {" "}Pick one and we'll send the tips + confirmation email to <strong>{run.doctor_name}</strong>. The Interview flow auto-fires with the chosen slot.
        </div>
      </div>
      <div className="space-y-1.5">
        {proposed.map((slot, i) => {
          const isPicked = pickedIso === slot.iso;
          const isDisabled = confirming && !isPicked;
          return (
            <button
              key={`${slot.iso}-${i}`}
              onClick={() => handleConfirm(slot)}
              disabled={confirming}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-colors ${
                isPicked
                  ? "border-violet-400 bg-violet-100"
                  : isDisabled
                    ? "border-slate-200 bg-white opacity-50"
                    : "border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50"
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-slate-900">{formatLabel(slot)}</div>
                {slot.label !== formatLabel(slot) && (
                  <div className="text-[10px] text-muted-foreground italic">From reply: "{slot.label}"</div>
                )}
              </div>
              {slot.format !== "unknown" && (
                <Badge variant="outline" className="text-[9px] bg-white">{slot.format.replace("_", " ")}</Badge>
              )}
              {isPicked && confirming && <span className="text-[10px] text-violet-700 italic">confirming…</span>}
              {!confirming && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * ShortlistSuggestion — surfaces a yellow card on profile_sent runs
 * where the hospital reply classifier flagged the reply as "looks
 * interested". Ammar 2026-06-03 spec: the system does NOT auto-advance
 * (hospitals rarely write 'shortlisted' clearly, and shortlist confirms
 * usually happen by phone). The team confirms here, which:
 *   1. Completes the profile_sent run
 *   2. Creates the shortlist run
 *   3. Fires the shortlist confirmation email to the doctor
 * "Dismiss" just clears the flag — the run keeps awaiting_response.
 * ──────────────────────────────────────────────────────────────────── */
function ShortlistSuggestion({ run }: { run: FlowRun }) {
  const md = (run.metadata as Record<string, unknown>) ?? {};
  const suggested = md.shortlist_suggested === true;
  const summary   = (md.shortlist_suggestion_text as string | undefined) ?? "";
  const [working, setWorking] = useState(false);
  const qc = useQueryClient();

  if (!suggested) return null;

  const handleConfirm = async () => {
    setWorking(true);
    try {
      const nowIso = new Date().toISOString();

      await supabase.from("automation_flow_runs").update({
        current_stage: "introduction_complete",
        status:        "completed",
        completed_at:  nowIso,
        last_event_at: nowIso,
        metadata: { ...md, shortlist_confirmed_at: nowIso },
      }).eq("id", run.id);

      const { data: shortlistRun, error: createErr } = await supabase
        .from("automation_flow_runs")
        .insert({
          flow_key:      "shortlist",
          doctor_id:     run.doctor_id,
          doctor_name:   run.doctor_name,
          doctor_email:  run.doctor_email,
          doctor_phone:  run.doctor_phone,
          hospital:      run.hospital,
          current_stage: "send_shortlist_email",
          status:        "active",
          metadata: {
            triggered_via:           "shortlist_suggestion_confirm",
            source_profile_sent_run: run.id,
          },
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      if (!shortlistRun) throw new Error("Shortlist run insert returned no row");

      await supabase.from("automation_flow_events").insert([
        { run_id: run.id, stage_key: "awaiting_response", event_type: "completed",
          message: `Team confirmed shortlist for ${run.hospital ?? "hospital"}. Created shortlist run + queued confirmation email.` },
        { run_id: shortlistRun.id, stage_key: "trigger_shortlist_confirmed", event_type: "entered",
          message: `Team-confirmed shortlist from ${run.hospital ?? "hospital"} (suggestion accepted).` },
        { run_id: shortlistRun.id, stage_key: "send_shortlist_email", event_type: "entered",
          message: "Queued for sending." },
      ]);

      const { error: sendErr } = await supabase.functions.invoke("send-flow-email", {
        body: { run_id: shortlistRun.id },
      });
      if (sendErr) throw sendErr;

      toast.success(`Shortlist locked for ${run.hospital}. Confirmation email sent to ${run.doctor_name}.`);
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", run.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm shortlist");
    } finally {
      setWorking(false);
    }
  };

  const handleDismiss = async () => {
    setWorking(true);
    try {
      const cleared = { ...md };
      delete cleared.shortlist_suggested;
      delete cleared.shortlist_suggested_at;
      delete cleared.shortlist_suggested_by;
      delete cleared.shortlist_suggestion_text;
      delete cleared.shortlist_reply_id;

      await supabase.from("automation_flow_runs").update({
        metadata: { ...cleared, shortlist_suggestion_dismissed_at: new Date().toISOString() },
      }).eq("id", run.id);

      await supabase.from("automation_flow_events").insert({
        run_id: run.id, stage_key: "awaiting_response", event_type: "note",
        message: "Team dismissed the shortlist suggestion (hospital reply did not actually confirm shortlist).",
      });

      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", run.id] });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-md border-2 border-amber-200 bg-amber-50/50 p-4 mt-4">
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-[12px] text-amber-900 leading-relaxed">
          <strong>{run.hospital ?? "Hospital"} looks interested in {run.doctor_name ?? "this doctor"}.</strong>
          {summary && <span className="block mt-1 italic text-amber-800/90">"{summary}"</span>}
          <span className="block mt-1.5 text-amber-800/90">
            Hospitals usually confirm shortlists by phone, so we don't advance automatically. Confirm only if you've actually been told this doctor is shortlisted.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleConfirm} disabled={working} className="bg-amber-600 hover:bg-amber-700">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark shortlisted
        </Button>
        <Button size="sm" variant="outline" onClick={handleDismiss} disabled={working}>
          <XIcon className="h-3.5 w-3.5 mr-1" /> Not shortlisted
        </Button>
      </div>
    </div>
  );
}

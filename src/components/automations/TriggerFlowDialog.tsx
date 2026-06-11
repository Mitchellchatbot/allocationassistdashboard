import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Zap, ChevronRight, Hospital as HospitalIcon, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DoctorPicker, type DoctorOption } from "./DoctorPicker";
import { useHospitals } from "@/hooks/use-hospitals";
import { useAuth } from "@/hooks/use-auth";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";

// Which earlier flow's runs feed this flow's "in pipeline" doctor list, and
// which statuses on the predecessor count as "eligible". Some predecessors
// auto-complete quickly (shortlist is a 3-stage flow that finishes seconds
// after triggering), so we have to include `completed` for those — otherwise
// the picker is always empty for the next trigger.
const PIPELINE_PREDECESSOR: Partial<Record<FlowKey, { flow: FlowKey; statuses: string[] }>> = {
  // Doctors whose profile we sent and we're waiting on the hospital reply.
  shortlist:      { flow: "profile_sent", statuses: ["active"] },
  // Doctors who got the shortlist email — flow completes immediately so
  // they sit in `completed` state until interview is confirmed.
  interview:      { flow: "shortlist",    statuses: ["completed", "active"] },
  // Doctors who completed the interview — pool for "offer extended" trigger.
  contract_signing: { flow: "interview", statuses: ["completed", "active"] },
  // Doctors who finished relocation prep — waiting on joining date.
  second_payment: { flow: "relocation",   statuses: ["completed", "active"] },
};

interface PipelineRun {
  id:             string;
  doctor_id:      string;
  doctor_name:    string;
  doctor_email:   string | null;
  doctor_phone:   string | null;
  hospital:       string | null;
  current_stage:  string;
  last_event_at:  string;
  metadata:       Record<string, unknown>;
}

interface Props {
  open:    boolean;
  flowKey: FlowKey | null;
  onClose: () => void;
}

/** Manual-trigger entrypoint for the 4 flows that don't have an external
 *  trigger source wired yet (Onboarding, Shortlist, Interview, Second Payment).
 *  Picks a doctor + flow-specific inputs → inserts a run + initial events.
 *  Real triggers (Zoho webhook on payment confirm, BoldSign on offer-sign,
 *  finance-team button, etc.) replace this for the corresponding flow as they
 *  come online. */
export function TriggerFlowDialog({ open, flowKey, onClose }: Props) {
  const [doctor, setDoctor] = useState<DoctorOption | null>(null);

  // Flow-specific inputs
  const [hospitalId,    setHospitalId]    = useState<string>("");
  const [interviewDt,   setInterviewDt]   = useState<string>("");
  const [interviewFmt,  setInterviewFmt]  = useState<string>("Microsoft Teams");
  const [interviewLink, setInterviewLink] = useState<string>("");
  const [joiningDate,   setJoiningDate]   = useState<string>("");
  const [paymentLink,   setPaymentLink]   = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [note,          setNote]          = useState<string>("");
  const [submitting,    setSubmitting]    = useState(false);

  const { data: hospitals = [] } = useHospitals();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Toggle: did the user click through to the unconstrained "all doctors"
  // search, or are they still on the default "in-pipeline" view?
  const [showSearchAll, setShowSearchAll] = useState(false);

  // Reset on open / flow change.
  useEffect(() => {
    if (!open) return;
    setDoctor(null);
    setHospitalId("");
    setInterviewDt("");
    setInterviewFmt("Microsoft Teams");
    setInterviewLink("");
    setJoiningDate("");
    setNote("");
    setShowSearchAll(false);
  }, [open, flowKey]);

  // Fetch doctors currently in the predecessor flow — they're the ones who
  // should be eligible for this trigger. e.g. for "Mark Shortlist Confirmed",
  // we only want doctors who have an active profile_sent run.
  const predConfig = flowKey ? PIPELINE_PREDECESSOR[flowKey] : undefined;
  const predFlow = predConfig?.flow;
  const { data: pipelineRuns = [] } = useQuery({
    queryKey: ["pipeline-runs", predFlow, predConfig?.statuses?.join(","), open],
    enabled: !!predConfig && open,
    queryFn: async (): Promise<PipelineRun[]> => {
      if (!predConfig) return [];
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("id, doctor_id, doctor_name, doctor_email, doctor_phone, hospital, current_stage, last_event_at, metadata")
        .eq("flow_key", predConfig.flow)
        .in("status", predConfig.statuses)
        .order("last_event_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PipelineRun[];
    },
  });

  const flow = flowKey ? FLOW_DEFINITIONS[flowKey] : null;

  // Per-flow config — what extra inputs are required, what stage to land on,
  // what the trigger event message says, and any metadata to persist.
  // `autoSend` controls whether the trigger should immediately fire the
  // first email via send-flow-email. False for second_payment because that
  // flow's first email fires 15 days post-join, not at trigger time — the
  // scheduler picks it up later.
  const flowConfig = useMemo(() => {
    if (!flowKey) return null;
    switch (flowKey) {
      case "onboarding": return {
        title:        "Mark First Payment Received",
        description: "Triggers the onboarding flow (qualification form + document upload request). Use this when finance confirms a doctor's first payment.",
        needsHospital:    false,
        needsInterview:   false,
        needsJoiningDate: false,
        triggerStage:     "trigger_first_payment",
        nextStage:        "send_onboarding_email",
        autoSend:         true,
        triggerEventMessage: (d: DoctorOption) => `First payment confirmed for ${d.name}. Onboarding flow started.`,
        confirmButtonLabel:  "Mark received & send email",
      };
      case "shortlist": return {
        title:        "Mark Shortlist Confirmed",
        description: "Triggers the shortlist confirmation flow. Use this when a hospital confirms a doctor is on their shortlist.",
        needsHospital:    true,
        needsInterview:   false,
        needsJoiningDate: false,
        triggerStage:     "trigger_shortlist_confirmed",
        nextStage:        "send_shortlist_email",
        autoSend:         true,
        triggerEventMessage: (d: DoctorOption, hospName?: string) => `${hospName ?? "Hospital"} shortlisted ${d.name}.`,
        confirmButtonLabel:  "Mark shortlisted & send email",
      };
      case "interview": return {
        title:        "Mark Interview Confirmed",
        description: "Triggers the interview tips + confirmation flow. Use this once a date/time is locked in with the hospital.",
        needsHospital:    true,
        needsInterview:   true,
        needsJoiningDate: false,
        triggerStage:     "trigger_interview_confirmed",
        nextStage:        "send_interview_email",
        autoSend:         true,
        triggerEventMessage: (d: DoctorOption, hospName?: string) => `Interview confirmed for ${d.name}${hospName ? ` with ${hospName}` : ""}.`,
        confirmButtonLabel:  "Confirm & send tips",
      };
      case "contract_signing": return {
        title:        "Mark Offer Extended",
        description: "Triggers the contract check-in loop. Use this when the hospital has sent the offer letter to the doctor. HI doesn't send the contract — the hospital does. We email both sides to acknowledge + chase the doctor for confirmation of signature.",
        needsHospital:    true,
        needsInterview:   false,
        needsJoiningDate: false,
        triggerStage:     "trigger_offer_extended",
        nextStage:        "checkin_doctor",
        autoSend:         true,
        triggerEventMessage: (d: DoctorOption, hospName?: string) => `Offer extended by ${hospName ?? "hospital"} to ${d.name}. HI now checking in on signature.`,
        confirmButtonLabel:  "Log offer & send check-ins",
      };
      case "second_payment": return {
        title:        "Set Joining Date",
        description: "Schedules the second-payment invoice flow. Invoice fires automatically 15 days after the joining date.",
        needsHospital:    false,
        needsInterview:   false,
        needsJoiningDate: true,
        triggerStage:     "trigger_15_days",
        // We park the run at the trigger stage; the scheduler advances it to
        // `send_invoice` once the joining_date + 15 days has elapsed.
        nextStage:        "trigger_15_days",
        // No auto-send — the invoice fires 15 days after the joining date, not now.
        autoSend:         false,
        triggerEventMessage: (d: DoctorOption, _h?: string, joining?: string) =>
          `Joining date set for ${d.name}: ${joining}. Invoice will fire 15 days later.`,
        confirmButtonLabel:  "Schedule invoice",
      };
      default: return null;
    }
  }, [flowKey]);

  if (!flow || !flowConfig || !flowKey) return null;

  const selectedHospital = hospitals.find(h => h.id === hospitalId);
  const canSubmit =
    !!doctor &&
    (!flowConfig.needsHospital    || !!hospitalId) &&
    (!flowConfig.needsInterview   || !!interviewDt) &&
    (!flowConfig.needsJoiningDate || !!joiningDate);

  const handleConfirm = async () => {
    if (!doctor || !flowKey || !flowConfig) return;
    setSubmitting(true);
    try {
      // Duplicate-run guard. If this doctor already has an active run in this
      // flow, ask before creating a second one. Prevents accidental duplicate
      // sends when the team triggers the same doctor twice without checking
      // the flow tab first.
      const { data: existingRuns } = await supabase
        .from("automation_flow_runs")
        .select("id, current_stage, started_at")
        .eq("flow_key", flowKey)
        .eq("doctor_id", doctor.id)
        .eq("status", "active")
        .limit(1);
      if (existingRuns && existingRuns.length > 0) {
        const proceed = window.confirm(
          `${doctor.name} already has an active ${flow.name} run (currently at "${existingRuns[0].current_stage}"). Trigger another anyway?`,
        );
        if (!proceed) {
          setSubmitting(false);
          return;
        }
      }

      const metadata: Record<string, unknown> = {
        triggered_via: "manual_trigger_dialog",
        custom_note:   note || null,
      };
      if (selectedHospital) {
        metadata.hospital_id    = selectedHospital.id;
        metadata.hospital_email = selectedHospital.primary_recruiter_email;
      }
      if (flowConfig.needsInterview) {
        // Format the datetime-local value into a readable string for the
        // email — "Friday, May 23, 2026 at 10:20 PM" beats "2026-05-23T22:20".
        metadata.interview_datetime = formatInterviewDatetime(interviewDt);
        metadata.interview_format   = interviewFmt;
        if (interviewLink.trim()) metadata.interview_link = interviewLink.trim();
      }
      if (flowConfig.needsJoiningDate) {
        metadata.joining_date = joiningDate;
        // Scheduler reads this to decide when to advance to send_invoice.
        const fire = new Date(joiningDate);
        fire.setDate(fire.getDate() + 15);
        metadata.invoice_fires_at = fire.toISOString();
        // Optional invoice details the invoice/reminder emails render. Amount
        // defaults to AED 10,500 + due date is auto-computed in send-flow-email.
        if (paymentLink.trim())   metadata.payment_link   = paymentLink.trim();
        if (invoiceNumber.trim()) metadata.invoice_number = invoiceNumber.trim();
      }

      const { data: runRow, error: runErr } = await supabase
        .from("automation_flow_runs")
        .insert({
          flow_key:      flowKey,
          doctor_id:     doctor.id,
          doctor_name:   doctor.name,
          doctor_email:  doctor.email,
          doctor_phone:  doctor.phone,
          hospital:      selectedHospital?.name ?? null,
          current_stage: flowConfig.nextStage,
          status:        "active",
          created_by:    user?.email ?? null,
          metadata,
        })
        .select("id")
        .single();
      if (runErr) throw runErr;
      if (!runRow) throw new Error("No run row returned");

      const events: Array<{ run_id: string; stage_key: string; event_type: string; message: string; payload?: Record<string, unknown> }> = [
        {
          run_id:     runRow.id,
          stage_key:  flowConfig.triggerStage,
          event_type: "entered",
          message:    flowConfig.triggerEventMessage(doctor, selectedHospital?.name, joiningDate),
        },
      ];
      // For flows whose trigger immediately advances to a send stage, queue
      // the "entered" event on the send stage too — mirrors what the sender
      // will see when it picks up the run.
      if (flowConfig.nextStage !== flowConfig.triggerStage) {
        events.push({
          run_id:     runRow.id,
          stage_key:  flowConfig.nextStage,
          event_type: "entered",
          message:    "Queued for sending.",
        });
      }
      if (note) {
        events.push({
          run_id:     runRow.id,
          stage_key:  flowConfig.nextStage,
          event_type: "note",
          message:    note,
        });
      }
      const { error: evErr } = await supabase.from("automation_flow_events").insert(events);
      if (evErr) throw evErr;

      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });

      // ── Auto-send the flow's first email if applicable ───────────────────
      // For email-stage flows (onboarding/shortlist/interview), trigger →
      // email should feel like one action, not two. second_payment skips
      // this because its first email fires 15 days later via the scheduler.
      if (flowConfig.autoSend) {
        try {
          const { data: sendResp, error: sendErr } = await supabase.functions.invoke("send-flow-email", {
            body: { run_id: runRow.id },
          });
          if (sendErr) throw sendErr;
          const r = sendResp as { ok: boolean; error?: string; to?: string };
          if (!r?.ok) throw new Error(r?.error ?? "Send failed");
          toast.success(`${flow.name} triggered — email sent to ${r.to}`);
        } catch (sendErr) {
          // Run was created successfully; only the send failed. Surface
          // distinctly so the user knows the trigger landed and can retry
          // the send manually from the run drawer.
          const msg = sendErr instanceof Error ? sendErr.message : "Send failed";
          toast.error(`Run created but email send failed: ${msg}`);
        }
      } else {
        toast.success(`${flow.name} scheduled for ${doctor.name}`);
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to trigger flow";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-teal-600" /> {flowConfig.title}
          </DialogTitle>
          <DialogDescription className="text-[12px]">{flowConfig.description}</DialogDescription>
        </DialogHeader>

        {!doctor && predFlow && !showSearchAll && (
          <PipelinePicker
            flowKey={flowKey}
            predFlow={predFlow}
            runs={pipelineRuns}
            onPick={(run) => {
              setDoctor({
                id:         run.doctor_id,
                name:       run.doctor_name,
                email:      run.doctor_email,
                phone:      run.doctor_phone,
                speciality: null,
                source:     run.doctor_id.startsWith("dob:") ? "dob" : "lead",
              });
              // Auto-fill hospital from the predecessor run — the whole point
              // of the pipeline picker. Try metadata.hospital_id first; fall
              // back to matching by hospital name.
              const md = (run.metadata ?? {}) as Record<string, unknown>;
              const idFromMeta = md.hospital_id as string | undefined;
              if (idFromMeta) {
                setHospitalId(idFromMeta);
              } else if (run.hospital) {
                const match = hospitals.find(h => h.name === run.hospital);
                if (match) setHospitalId(match.id);
              }
            }}
            onSearchAll={() => setShowSearchAll(true)}
          />
        )}

        {!doctor && (!predFlow || showSearchAll) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {predFlow ? "All doctors" : "1. Pick doctor"}
              </Label>
              {predFlow && (
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setShowSearchAll(false)}>
                  <ChevronLeft className="h-3 w-3 mr-1" /> Back to pipeline
                </Button>
              )}
            </div>
            <DoctorPicker onPick={setDoctor} />
          </div>
        )}

        {doctor && (
          <div className="space-y-3">
            <div className="rounded-md border bg-slate-50/50 p-2.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Doctor</div>
                <div className="text-[13px] font-medium">{doctor.name}</div>
                <div className="text-[11px] text-muted-foreground">{doctor.speciality ?? "—"} · {doctor.email ?? doctor.phone ?? "no contact"}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDoctor(null)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Change
              </Button>
            </div>

            {flowConfig.needsHospital && (
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hospital</Label>
                <Select value={hospitalId} onValueChange={setHospitalId}>
                  <SelectTrigger className="mt-1 text-[12px]">
                    <SelectValue placeholder="Select hospital..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {hospitals.map(h => (
                      <SelectItem key={h.id} value={h.id} className="text-[12px]">
                        {h.name}{h.city ? ` · ${h.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {flowConfig.needsInterview && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Interview date / time</Label>
                    <Input
                      type="datetime-local"
                      value={interviewDt}
                      onChange={e => setInterviewDt(e.target.value)}
                      className="mt-1 text-[12px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</Label>
                    <Select value={interviewFmt} onValueChange={setInterviewFmt}>
                      <SelectTrigger className="mt-1 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Microsoft Teams" className="text-[12px]">Microsoft Teams</SelectItem>
                        <SelectItem value="Zoom"            className="text-[12px]">Zoom</SelectItem>
                        <SelectItem value="Google Meet"     className="text-[12px]">Google Meet</SelectItem>
                        <SelectItem value="WhatsApp Video"  className="text-[12px]">WhatsApp Video</SelectItem>
                        <SelectItem value="In Person"       className="text-[12px]">In Person</SelectItem>
                        <SelectItem value="Phone"           className="text-[12px]">Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Meeting link — hidden for in-person interviews where it doesn't apply. */}
                {interviewFmt !== "In Person" && interviewFmt !== "Phone" && (
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Meeting link
                      <span className="ml-1 text-slate-400 normal-case tracking-normal">— paste the Teams / Zoom / Meet link the hospital sent</span>
                    </Label>
                    <Input
                      type="url"
                      value={interviewLink}
                      onChange={e => setInterviewLink(e.target.value)}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      className="mt-1 text-[12px]"
                    />
                  </div>
                )}
              </>
            )}

            {flowConfig.needsJoiningDate && (
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Joining date</Label>
                <Input
                  type="date"
                  value={joiningDate}
                  onChange={e => setJoiningDate(e.target.value)}
                  className="mt-1 text-[12px]"
                />
                {joiningDate && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Invoice will fire on <strong>{new Date(new Date(joiningDate).setDate(new Date(joiningDate).getDate() + 15)).toLocaleDateString()}</strong> (joining date + 15 days).
                  </div>
                )}
              </div>
            )}

            {flowConfig.needsJoiningDate && (
              <>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Payment link (optional)</Label>
                  <Input
                    value={paymentLink}
                    onChange={e => setPaymentLink(e.target.value)}
                    placeholder="https://… where the doctor pays"
                    className="mt-1 text-[12px]"
                  />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Invoice number (optional)</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. AA-2026-0042"
                    className="mt-1 text-[12px]"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground -mt-1">
                  These appear on the invoice email. Amount is fixed at <strong>AED 10,500</strong>; due date is the joining date + 45 days. Leave blank to add later.
                </div>
              </>
            )}

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Internal note (optional)</Label>
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                className="mt-1 text-[12px] min-h-[60px]"
                placeholder="Context for the timeline — e.g. 'confirmed by Sarah in finance via WhatsApp'"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!canSubmit || submitting}>
                {submitting ? "Triggering..." : flowConfig.confirmButtonLabel}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Primary picker for triggers with a meaningful predecessor flow. Lists
 * doctors currently in the predecessor flow as clickable cards with their
 * hospital already attached, so the team isn't asked to re-pick info we
 * already know. Includes an explicit escape hatch to search all 30k+
 * doctors when needed (e.g. starting from this stage manually because the
 * predecessor flow happened outside the system).
 */
function PipelinePicker({ flowKey, predFlow, runs, onPick, onSearchAll }: {
  flowKey: FlowKey | null;
  predFlow: FlowKey;
  runs: PipelineRun[];
  onPick: (run: PipelineRun) => void;
  onSearchAll: () => void;
}) {
  const headerLabel = useMemo(() => {
    switch (flowKey) {
      case "shortlist":      return "Doctors awaiting hospital response";
      case "interview":      return "Shortlisted doctors awaiting interview confirmation";
      case "second_payment": return "Doctors who completed relocation";
      default:               return "Doctors in pipeline";
    }
  }, [flowKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {headerLabel}
          <span className="ml-1.5 text-slate-500 font-normal">· {runs.length}</span>
        </Label>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-md border border-dashed py-8 text-center text-[12px] text-muted-foreground">
          No doctors currently in the {FLOW_DEFINITIONS[predFlow].shortName.toLowerCase()} stage.
          <br />
          <button
            type="button"
            onClick={onSearchAll}
            className="mt-2 text-teal-600 hover:underline text-[12px]"
          >
            Search all doctors instead →
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-md border max-h-[360px] overflow-y-auto divide-y">
            {runs.map(run => (
              <button
                key={run.id}
                onClick={() => onPick(run)}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-slate-900 truncate">{run.doctor_name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {run.hospital && (
                      <span className="inline-flex items-center gap-1">
                        <HospitalIcon className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{run.hospital}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {relativeAge(run.last_event_at)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSearchAll}
            className="w-full text-[11px] text-muted-foreground hover:text-teal-600 hover:underline flex items-center justify-center gap-1.5 py-1"
          >
            <Search className="h-3 w-3" />
            Or search all doctors (advanced)
          </button>
        </>
      )}
    </div>
  );
}

/** Turn a `<input type="datetime-local">` value like "2026-05-23T22:20" into a
 *  human-readable string like "Saturday, May 23, 2026 at 10:20 PM" before
 *  storing it on the run. Cleaner display in the email + the dashboard. */
function formatInterviewDatetime(localDt: string): string {
  if (!localDt) return "";
  const d = new Date(localDt);
  if (isNaN(d.getTime())) return localDt;
  const datePart = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} at ${timePart}`;
}

function relativeAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Send, X, Eye, ChevronLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useHospitals, type Hospital } from "@/hooks/use-hospitals";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { useDoctorProfile, profileToTokens, calcCompletion } from "@/hooks/use-doctor-profiles";
import { useZohoData, type ZohoDoctorOnBoard, type ZohoLead } from "@/hooks/use-zoho-data";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open:    boolean;
  onClose: () => void;
}

type Step = "pick-doctor" | "pick-hospitals" | "preview-confirm";

interface DoctorOption {
  id:         string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  speciality: string | null;
  source:     "dob" | "lead";
}

/**
 * Triggers Flow 2 (Profile Sent to Hospital). Three steps:
 *   1. Pick a doctor (from Doctors on Board or Leads)
 *   2. Pick one or more hospitals (BCC for multi-hospital sends)
 *   3. Preview rendered templates → confirm → insert run + events
 *
 * No real email is sent yet — confirm only inserts an `automation_flow_runs`
 * row + initial events. The sender edge function (TBD) consumes those when it
 * comes online.
 */
export function SendProfileDialog({ open, onClose }: Props) {
  const [step,            setStep]            = useState<Step>("pick-doctor");
  const [selectedDoctor,  setSelectedDoctor]  = useState<DoctorOption | null>(null);
  const [selectedIds,     setSelectedIds]     = useState<string[]>([]);
  const [customMessage,   setCustomMessage]   = useState("");
  const [submitting,      setSubmitting]      = useState(false);

  const qc = useQueryClient();
  const { data: zoho, isLoading: zohoLoading } = useZohoData();
  const { data: hospitals = [] } = useHospitals();
  const { data: templates = [] } = useEmailTemplates();
  const { user } = useAuth();

  // Reset whenever the dialog re-opens.
  useEffect(() => {
    if (open) {
      setStep("pick-doctor");
      setSelectedDoctor(null);
      setSelectedIds([]);
      setCustomMessage("");
    }
  }, [open]);

  // Phase 4 — hide signed + unavailable doctors from the send list. Spec:
  // "Signed status removes from public website (not eligible to be sent in
  // future profile batches)" + unavailable doctors are paused.
  const lifecycleMap = useDoctorLifecycleMap();
  const doctorOptions: DoctorOption[] = useMemo(() => {
    const opts: DoctorOption[] = [];
    const z = zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[]; rawLeads?: ZohoLead[] } | undefined;
    const eligible = (prefixedId: string): boolean => {
      const lc = lifecycleMap[prefixedId];
      if (!lc) return true;
      return lc.eligible_for_sending !== false;
    };
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `dob:${d.id}`;
      if (!eligible(id)) continue;
      opts.push({ id, name, email: d.Email, phone: d.Phone ?? d.Mobile, speciality: d.Specialty, source: "dob" });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `lead:${l.id}`;
      if (!eligible(id)) continue;
      opts.push({ id, name, email: l.Email, phone: l.Phone ?? l.Mobile, speciality: l.Specialty ?? l.Specialty_New, source: "lead" });
    }
    return opts;
  }, [zoho, lifecycleMap]);

  const selectedHospitals = useMemo(
    () => hospitals.filter(h => selectedIds.includes(h.id)),
    [hospitals, selectedIds],
  );

  const hospitalTemplate = templates.find(t => t.key === "profile_sent_hospital");
  const doctorTemplate   = templates.find(t => t.key === "profile_sent_doctor");

  const handleConfirm = async () => {
    if (!selectedDoctor || selectedHospitals.length === 0) return;
    setSubmitting(true);
    try {
      // One run per hospital — keeps Flow 2 timeline focused per relationship,
      // matches how Saif's team thinks about "Doctor X sent to Hospital Y".
      // For multi-hospital sends we group all runs under a shared batch_id
      // in metadata so the BCC nature is queryable later.
      const batchId = crypto.randomUUID();
      for (const h of selectedHospitals) {
        const { data: runRow, error: runErr } = await supabase
          .from("automation_flow_runs")
          .insert({
            flow_key:      "profile_sent",
            doctor_id:     selectedDoctor.id,
            doctor_name:   selectedDoctor.name,
            doctor_email:  selectedDoctor.email,
            doctor_phone:  selectedDoctor.phone,
            hospital:      h.name,
            current_stage: "email_hospital",
            status:        "active",
            created_by:    user?.email ?? null,
            metadata: {
              batch_id:           batchId,
              hospital_id:        h.id,
              hospital_email:     h.primary_recruiter_email,
              bcc:                selectedHospitals.length > 1,
              total_in_batch:     selectedHospitals.length,
              custom_message:     customMessage || null,
              doctor_speciality:  selectedDoctor.speciality,
              triggered_via:      "send_profile_dialog",
            },
          })
          .select("id")
          .single();
        if (runErr) throw runErr;
        if (!runRow) continue;
        const runId = runRow.id;

        // Seed the trigger + the two outgoing-email events.
        // Marked `event_type='entered'` rather than `email_sent` until the
        // real sender confirms delivery — the sender will append a follow-up
        // event when it actually ships.
        await supabase.from("automation_flow_events").insert([
          {
            run_id:     runId,
            stage_key:  "trigger_send_clicked",
            event_type: "entered",
            message:    `Send requested for ${selectedDoctor.name} → ${h.name}${selectedHospitals.length > 1 ? ` (BCC batch of ${selectedHospitals.length})` : ""}.`,
            payload:    { batch_id: batchId, hospital_id: h.id },
          },
          {
            run_id:     runId,
            stage_key:  "email_hospital",
            event_type: "entered",
            message:    `Queued for sending. Template: ${h.template_key ?? "profile_sent_hospital"}.`,
            payload:    { template_key: h.template_key ?? "profile_sent_hospital", recipient: h.primary_recruiter_email },
          },
        ]);
      }

      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });

      // ── Auto-send hospital emails for every run we just created ──────────
      // Without this, runs sit at email_hospital with no `email_sent` event
      // until the user manually clicks Send now on each row — bad UX for
      // a batch send. Send-flow-email also fires the doctor-notification
      // email automatically once the hospital send advances the stage.
      let sent = 0, failed = 0;
      const lastFailMsg: { msg: string | null } = { msg: null };
      // Refetch the runs we just created so we have their IDs in order. The
      // `batchId` shared across all of them lets us pick out just this batch.
      const { data: createdRuns } = await supabase
        .from("automation_flow_runs")
        .select("id")
        .filter("metadata->>batch_id", "eq", batchId);
      for (const r of createdRuns ?? []) {
        try {
          const { data: sendResp, error: sendErr } = await supabase.functions.invoke("send-flow-email", {
            body: { run_id: r.id },
          });
          if (sendErr) throw sendErr;
          const resp = sendResp as { ok: boolean; error?: string };
          if (!resp?.ok) throw new Error(resp?.error ?? "Send failed");
          sent++;
        } catch (e) {
          failed++;
          lastFailMsg.msg = e instanceof Error ? e.message : "unknown";
        }
      }

      if (failed === 0) {
        toast.success(
          selectedHospitals.length === 1
            ? `Sent ${selectedDoctor.name} → ${selectedHospitals[0].name}`
            : `Sent ${selectedDoctor.name} → ${selectedHospitals.length} hospitals (BCC)`,
        );
      } else if (sent === 0) {
        toast.error(`All sends failed: ${lastFailMsg.msg}`);
      } else {
        toast.warning(`Sent ${sent} of ${sent + failed}. Last failure: ${lastFailMsg.msg}`);
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to queue send";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-teal-600" /> Send Profile to Hospital
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Triggers Flow 2. Picks a doctor, selects hospital(s), and queues the introduction emails.
            Multi-hospital sends BCC every hospital — they don't see each other.
          </DialogDescription>
        </DialogHeader>

        <Stepper step={step} />

        {step === "pick-doctor" && (
          <DoctorPicker
            options={doctorOptions}
            isLoading={zohoLoading}
            onPick={(d) => { setSelectedDoctor(d); setStep("pick-hospitals"); }}
          />
        )}

        {step === "pick-hospitals" && selectedDoctor && (
          <HospitalPicker
            doctor={selectedDoctor}
            hospitals={hospitals}
            selectedIds={selectedIds}
            onToggle={(id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            onContinue={() => setStep("preview-confirm")}
            onBack={() => setStep("pick-doctor")}
            customMessage={customMessage}
            setCustomMessage={setCustomMessage}
          />
        )}

        {step === "preview-confirm" && selectedDoctor && (
          <PreviewConfirm
            doctor={selectedDoctor}
            hospitals={selectedHospitals}
            customMessage={customMessage}
            hospitalSubject={hospitalTemplate?.subject ?? "Candidate introduction — {{doctor_name}}"}
            hospitalBody={hospitalTemplate?.body_text ?? ""}
            doctorSubject={doctorTemplate?.subject ?? "Your profile has been sent to {{hospital_name}}"}
            doctorBody={doctorTemplate?.body_text ?? ""}
            onBack={() => setStep("pick-hospitals")}
            onConfirm={handleConfirm}
            submitting={submitting}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "pick-doctor",     label: "1. Doctor" },
    { key: "pick-hospitals",  label: "2. Hospitals" },
    { key: "preview-confirm", label: "3. Preview & confirm" },
  ];
  const currentIdx = steps.findIndex(s => s.key === step);
  return (
    <div className="flex items-center gap-2 text-[11px] py-1">
      {steps.map((s, i) => (
        <span key={s.key} className={
          i === currentIdx ? "font-medium text-teal-700" :
          i <  currentIdx ? "text-emerald-600" : "text-muted-foreground"
        }>
          {s.label}{i < steps.length - 1 && " →"}
        </span>
      ))}
    </div>
  );
}

function DoctorPicker({ options, isLoading, onPick }: {
  options: DoctorOption[]; isLoading: boolean; onPick: (d: DoctorOption) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options.slice(0, 50);
    return options.filter(o =>
      o.name.toLowerCase().includes(term) ||
      o.email?.toLowerCase().includes(term) ||
      o.speciality?.toLowerCase().includes(term),
    ).slice(0, 100);
  }, [options, q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={isLoading ? "Loading doctors..." : "Search by name, email, or speciality..."}
          className="pl-7 text-[12px]"
        />
      </div>
      <div className="rounded-md border max-h-[420px] overflow-y-auto divide-y">
        {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No doctors match.</div>
        )}
        {filtered.map(d => (
          <button
            key={d.id}
            onClick={() => onPick(d)}
            className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium truncate">{d.name}</span>
                <Badge variant="outline" className="text-[9px] uppercase">{d.source === "dob" ? "Doctor on Board" : "Lead"}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {d.speciality ?? "—"} · {d.email ?? d.phone ?? "no contact"}
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 text-slate-400 rotate-180" />
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">
        Showing {filtered.length} of {options.length}. Refine search to narrow.
      </div>
    </div>
  );
}

function HospitalPicker({
  doctor, hospitals, selectedIds, onToggle, onContinue, onBack, customMessage, setCustomMessage,
}: {
  doctor: DoctorOption;
  hospitals: Hospital[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  customMessage: string;
  setCustomMessage: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return hospitals;
    return hospitals.filter(h =>
      h.name.toLowerCase().includes(term) ||
      h.city?.toLowerCase().includes(term) ||
      h.country?.toLowerCase().includes(term),
    );
  }, [hospitals, q]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-slate-50/50 p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sending profile of</div>
        <div className="text-[13px] font-medium">{doctor.name}</div>
        <div className="text-[11px] text-muted-foreground">{doctor.speciality ?? "—"} · {doctor.email ?? doctor.phone ?? "no contact"}</div>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter hospitals..." className="pl-7 text-[12px]" />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{selectedIds.length} selected</span>
        {selectedIds.length > 1 && <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200">BCC mode</Badge>}
      </div>
      <div className="rounded-md border max-h-[280px] overflow-y-auto divide-y">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No hospitals match.</div>
        )}
        {filtered.map(h => {
          const checked = selectedIds.includes(h.id);
          return (
            <label key={h.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(h.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{h.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[h.city, h.country, h.primary_recruiter_email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Optional custom message</Label>
        <Textarea
          value={customMessage}
          onChange={e => setCustomMessage(e.target.value)}
          className="mt-1 text-[12px] min-h-[60px]"
          placeholder="Anything to add to the introduction — context, urgency, etc."
        />
      </div>
      <DialogFooter className="pt-1">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
        <Button onClick={onContinue} disabled={selectedIds.length === 0}>
          Continue to preview →
        </Button>
      </DialogFooter>
    </div>
  );
}

function PreviewConfirm({
  doctor, hospitals, customMessage, hospitalSubject, hospitalBody, doctorSubject, doctorBody,
  onBack, onConfirm, submitting,
}: {
  doctor: DoctorOption;
  hospitals: Hospital[];
  customMessage: string;
  hospitalSubject: string;
  hospitalBody: string;
  doctorSubject: string;
  doctorBody: string;
  onBack: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  // Pull the doctor's saved profile so the preview renders with REAL field
  // values (years experience, license, etc.) instead of leaving `{{token}}`
  // placeholders. Missing profile → render with empty strings + show a warning.
  const { data: profile } = useDoctorProfile(doctor.id);
  const profileCompletion = profile ? calcCompletion(profile) : 0;
  const sampleHospital = hospitals[0];

  const vars: Record<string, string> = {
    ...profileToTokens(profile),
    doctor_name:        doctor.name,
    doctor_email:       doctor.email ?? "",
    doctor_phone:       doctor.phone ?? "",
    doctor_speciality:  doctor.speciality ?? "",
    hospital_name:      sampleHospital?.name ?? "",
    hospital_contact_name: sampleHospital?.primary_contact_name ?? "",
    profile_link:       `https://aa.example/profiles/${doctor.id}`,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-slate-50/50 p-3 text-[12px] space-y-1">
        <div><strong>{doctor.name}</strong> → {hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}</div>
        <div className="text-[11px] text-muted-foreground">
          One run per hospital will be created in Flow 2. Hospital + doctor emails fire automatically on confirm.
        </div>
      </div>

      {profileCompletion < 100 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
          <div>
            <strong>{doctor.name}'s profile is {profileCompletion}% complete.</strong> Missing fields will render as <code>{`{{token}}`}</code> in the hospital email. Fill the profile in <strong>Doctor Profiles</strong> for a polished send.
          </div>
        </div>
      )}

      <PreviewBlock
        label={`To hospital · ${hospitals.length === 1 ? hospitals[0].primary_recruiter_email ?? "(no recruiter email)" : `${hospitals.length} recipients (BCC)`}`}
        subject={renderTemplate(hospitalSubject, vars)}
        body={renderTemplate(hospitalBody, vars) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : "")}
      />

      <PreviewBlock
        label={`To doctor · ${doctor.email ?? "(no email)"}`}
        subject={renderTemplate(doctorSubject, vars)}
        body={renderTemplate(doctorBody, vars)}
      />

      {hospitals.some(h => !h.primary_recruiter_email) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <strong>Warning:</strong> {hospitals.filter(h => !h.primary_recruiter_email).length} of the selected hospitals don't have a recruiter email on file. Those runs will be queued but won't send until the email is added in the Hospitals tab.
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? "Queueing..." : <><Send className="h-3.5 w-3.5 mr-1.5" /> Queue {hospitals.length} send{hospitals.length === 1 ? "" : "s"}</>}
        </Button>
      </DialogFooter>
    </div>
  );
}

function PreviewBlock({ label, subject, body }: { label: string; subject: string; body: string }) {
  return (
    <div className="rounded-md border">
      <div className="px-3 py-1.5 border-b bg-slate-50/50 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Eye className="h-3 w-3" /> {label}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
          <div className="text-[12px] font-medium">{subject}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Body</div>
          <pre className="text-[11px] whitespace-pre-wrap font-mono text-slate-700 bg-slate-50/40 p-2 rounded border max-h-[160px] overflow-y-auto">
            {body || "(no body — set in the Email Templates tab)"}
          </pre>
        </div>
      </div>
    </div>
  );
}

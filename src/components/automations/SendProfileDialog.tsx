import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Send, X, Eye, ChevronLeft, AlertTriangle, Mail, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { useAuth } from "@/hooks/use-auth";
import { AA_SENDERS, findSenderByEmail } from "@/lib/hi-team";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { useHospitals, type Hospital } from "@/hooks/use-hospitals";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { useDoctorProfile, profileToTokens, calcCompletion } from "@/hooks/use-doctor-profiles";
import { useWpCandidateByDoctorId, wpCandidateToTokens } from "@/hooks/use-wp-candidates";
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
  // Dispatcher-chosen BCC list. Empty array = no BCC; null = use the
  // function's default behaviour (auto-BCC the sender on personal
  // routing). Defaulted from the current user so their own outbound
  // copy lands in their inbox unless they actively change it.
  const [bccList,         setBccList]         = useState<string[]>([]);

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
      // Default the BCC list to the current user if they're a known
      // sender — most common case is "I'm sending, BCC me on my own
      // outbound". The Preview step exposes the dropdown for changes.
      const me = findSenderByEmail(user?.email ?? null);
      setBccList(me ? [me.email] : []);
    }
  }, [open, user?.email]);

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
      opts.push({ id, name, email: d.Email, phone: d.Phone ?? d.Mobile, speciality: d.Specialty_New ?? d.Speciality, source: "dob" });
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
              // Dispatcher-picked BCC list — read by send-flow-email
              // and applied verbatim to the outbound. Empty array =
              // BCC no-one.
              bcc_override:       bccList,
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
            hospitalBody={hospitalTemplate?.body_html ?? hospitalTemplate?.body_text ?? ""}
            doctorSubject={doctorTemplate?.subject ?? "Your profile has been sent to {{hospital_name}}"}
            doctorBody={doctorTemplate?.body_html ?? doctorTemplate?.body_text ?? ""}
            onBack={() => setStep("pick-hospitals")}
            onConfirm={handleConfirm}
            submitting={submitting}
            bccList={bccList}
            setBccList={setBccList}
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
  onBack, onConfirm, submitting, bccList, setBccList,
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
  bccList: string[];
  setBccList: (next: string[]) => void;
}) {
  // Who'll be on the From line — derived from the current user, which
  // matches what send-flow-email does at send time (looks up
  // assigned_to in its SENDERS registry). Falls back to the generic
  // team address when the current user isn't in the verified roster.
  const { user } = useAuth();
  const sender   = findSenderByEmail(user?.email ?? null);
  const senderLine = sender
    ? `${sender.name} <${sender.email}>`
    : "Allocation Assist Team <hello@allocationassist.com>";

  // Pull the doctor's profile data for the preview. WP candidates are
  // now the source of truth — if the doctor is linked to a WP record
  // we use that; for any field WP doesn't have set, we fall back to
  // the legacy doctor_profiles row so historical data still renders.
  const { data: wpCandidate } = useWpCandidateByDoctorId(doctor.id);
  const { data: profile }     = useDoctorProfile(doctor.id);
  const wpTokens     = wpCandidateToTokens(wpCandidate);
  const legacyTokens = profileToTokens(profile);
  const mergedProfileTokens: Record<string, string> = { ...legacyTokens };
  for (const [k, v] of Object.entries(wpTokens)) {
    if (v) mergedProfileTokens[k] = v;                // WP wins when populated
    else if (!(k in mergedProfileTokens)) mergedProfileTokens[k] = "";
  }
  // Completion %: prefer WP candidate filled-fields ratio; fall back to
  // the legacy profile's completion if no WP record exists.
  const profileCompletion = wpCandidate
    ? Math.round(
        ([
          wpCandidate.job_title, wpCandidate.area_of_interest, wpCandidate.country_of_training,
          wpCandidate.years_experience, wpCandidate.nationality, wpCandidate.family_status,
          wpCandidate.license_status, wpCandidate.expected_salary, wpCandidate.notice_period,
        ].filter(v => v != null && v !== "").length / 9) * 100
      )
    : profile ? calcCompletion(profile) : 0;
  const sampleHospital = hospitals[0];

  // Strip any redundant "Dr." prefix so templates that hard-code "Hi Dr.
  // {{doctor_name}}" don't render "Hi Dr. Dr. Louise Denjean". Prefer
  // the WP candidate's full_name when present (it's the canonical
  // record); fall back to the Zoho-derived name otherwise.
  const rawName = (wpCandidate?.full_name && wpCandidate.full_name.trim()) || doctor.name;
  const cleanedDoctorName = rawName.replace(/^\s*Dr\.?\s+/i, "");
  const vars: Record<string, string> = {
    ...mergedProfileTokens,
    doctor_name:        cleanedDoctorName,
    doctor_email:       doctor.email ?? "",
    doctor_phone:       doctor.phone ?? "",
    doctor_speciality:  doctor.speciality ?? "",
    hospital_name:      sampleHospital?.name ?? "",
    hospital_contact_name: sampleHospital?.primary_contact_name ?? "Team",
    // city / country come from the hospital record so the doctor email's
    // "Working Opportunity in {{city}}" line resolves in the preview.
    city:               sampleHospital?.city ?? "",
    country:            sampleHospital?.country ?? "",
    // Preview-only URL — the real link is minted at send time by
    // send-flow-email (shared_profile token, ${APP_ORIGIN}/shared-profile/<token>).
    // Use the production app origin here so the preview reads like
    // what hospitals actually receive, not 'aa.example'.
    profile_link:       `https://care-assist.io/shared-profile/${doctor.id}`,
    // The {{signature}} token is injected by send-flow-email at send time;
    // for the preview we render the same Allocation Assist branded block
    // inline so the doctor-side preview shows it too.
    signature:          PREVIEW_SIGNATURE_HTML,
    signature_text:     PREVIEW_SIGNATURE_TEXT,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-slate-50/50 p-3 text-[12px] space-y-1">
        <div><strong>{doctor.name}</strong> → {hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}</div>
        <div className="text-[11px] text-muted-foreground">
          One run per hospital will be created in Flow 2. Hospital + doctor emails fire automatically on confirm.
        </div>
        <div className="text-[11px] text-muted-foreground pt-1 border-t border-slate-200/70 mt-1.5 space-y-1.5">
          <div>Sending as: <span className="font-medium text-slate-700">{senderLine}</span></div>

          {/* BCC picker — choose any combination of the AA sender
              roster. Defaulted to the current user so their own
              outbound copy lands in their inbox; tick others to
              loop them in on this send. */}
          <BccPicker selected={bccList} onChange={setBccList} />

          {sender ? (
            <div className="text-[10.5px] text-emerald-700">
              Hospital replies will land in <span className="font-mono">{sender.email}</span>. BCC{bccList.length ? `: ${bccList.join(", ")}` : ": none"}.
            </div>
          ) : (
            <div className="text-[10.5px] text-amber-700">
              Current user isn't in the verified sender roster, so the generic team address is used and replies route through the dashboard parser. BCC{bccList.length ? `: ${bccList.join(", ")}` : ": none"}.
            </div>
          )}
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

// Preview-side mirror of the server's signatureHtml() in
// supabase/functions/send-flow-email/index.ts. Kept in sync so the
// dashboard preview shows the same Cambria-serif signature + logo
// block the recipient will see, rather than a literal `{{signature}}`
// token. When the server-side signature changes, update both.
const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const PREVIEW_SERIF    = `Cambria, Georgia, 'Times New Roman', serif`;
const PREVIEW_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SERIF};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SERIF};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SERIF};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SERIF};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SERIF};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr>
    <td style="padding:0;">
      <img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist" width="64" height="64" style="display:block;border:0;outline:none;max-width:64px;width:64px;height:auto;" />
    </td>
  </tr>
</table>
<p style="color:#14b8a6;font-weight:700;font-size:16px;margin:6px 0 0;letter-spacing:-0.2px;font-family:${PREVIEW_SERIF};">Allocation Assist</p>
<p style="color:#94a3b8;font-size:11px;margin:2px 0 0;letter-spacing:0.4px;font-family:${PREVIEW_SERIF};">The source of workforce</p>`;
const PREVIEW_SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com

Allocation Assist
The source of workforce
`;

/** True when the string is recognisably HTML (has at least one tag). The
 *  preview block flips into iframe-render mode for these so we don't
 *  show raw `<p>` tags in monospace. */
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

function PreviewBlock({ label, subject, body }: { label: string; subject: string; body: string }) {
  const isHtml = looksLikeHtml(body);
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
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Body</div>
          {isHtml
            ? <HtmlPreview html={body} />
            : <pre className="text-[11px] whitespace-pre-wrap font-mono text-slate-700 bg-slate-50/40 p-2 rounded border max-h-[160px] overflow-y-auto">
                {body || "(no body — set in the Email Templates tab)"}
              </pre>}
        </div>
      </div>
    </div>
  );
}

/** Renders the templated body as the actual styled HTML the recipient
 *  will see. Sandboxed in an iframe so the email's inline styles don't
 *  fight with Tailwind, and any stray scripts (admin-controlled but
 *  still — defense in depth) can't touch the parent page. */
function HtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(280);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const full = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <style>
        body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#1a2332; margin:0; padding:16px; font-size:14px; line-height:1.55; background:#ffffff; }
        a { color:#1d4ed8; }
        table { border-collapse: collapse; }
        img { max-width: 100%; height: auto; }
      </style>
    </head><body>${html}</body></html>`;
    doc.open();
    doc.write(full);
    doc.close();
    // Resize iframe to fit the email content, capped so a long invoice
    // letter doesn't push the modal off-screen.
    const measure = () => {
      const h = doc.body?.scrollHeight ?? 280;
      setHeight(Math.min(Math.max(h + 8, 140), 480));
    };
    measure();
    const t = setTimeout(measure, 80);   // re-measure after fonts/images
    return () => clearTimeout(t);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Email preview"
      sandbox="allow-same-origin"
      style={{ width: "100%", height, border: "1px solid hsl(var(--border))", borderRadius: 6, background: "#fff" }}
    />
  );
}

/** Multi-select dropdown for BCC. Choose any combination of the AA
 *  sender roster (Rodaina / Mohamed / Sohaila / Ishak / Ammar). The
 *  trigger label flips between 'BCC nobody' / 'BCC just me' / 'BCC X'
 *  / 'BCC X+1 others' depending on selection, so the closed state
 *  reads at a glance without needing to open the popover. */
function BccPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const selectedSet = new Set(selected.map(e => e.toLowerCase()));

  const toggle = (email: string) => {
    const lc = email.toLowerCase();
    if (selectedSet.has(lc)) {
      onChange(selected.filter(e => e.toLowerCase() !== lc));
    } else {
      onChange([...selected, email]);
    }
  };

  const summary = (() => {
    if (selected.length === 0) return "BCC: nobody";
    if (selected.length === 1) {
      const m = AA_SENDERS.find(s => s.email.toLowerCase() === selected[0].toLowerCase());
      return `BCC: ${m?.name ?? selected[0]}`;
    }
    const first = AA_SENDERS.find(s => s.email.toLowerCase() === selected[0].toLowerCase());
    return `BCC: ${first?.name ?? selected[0]} +${selected.length - 1}`;
  })();

  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5 text-[10.5px] h-6 px-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">
        <Mail className="h-3 w-3" />
        <span>{summary}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 pb-1.5">
          Loop colleagues in on this send
        </div>
        <div className="space-y-0.5">
          {AA_SENDERS.map(s => {
            const checked = selectedSet.has(s.email.toLowerCase());
            return (
              <label
                key={s.email}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(s.email)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-[12px] text-slate-800 flex-1">{s.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{s.email.split("@")[0]}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1.5 text-[10.5px] text-slate-500 hover:text-slate-700 px-1.5"
          >
            Clear all
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

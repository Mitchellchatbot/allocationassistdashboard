/**
 * Hospital Introduction Department — Phase 1 automation flow definitions.
 *
 * Source: meeting with Saif Ullah, May 20 2026. Six flows replace manual
 * weekend/holiday email sending and standardise communication touchpoints.
 *
 * Each flow is a linear sequence of stages. The Automations page renders
 * these as an n8n-style horizontal diagram per doctor, with the doctor's
 * `current_stage` highlighted. Editable per-stage overrides (subject line,
 * delay days, on/off) live in `automation_flow_configs.stage_overrides`.
 *
 * Stage keys are stable across releases — DB rows reference them. Adding a
 * new stage is fine; renaming an existing key requires a migration.
 */
import {
  UserPlus, FileCheck, Upload, Hospital, Mail, BellRing, CheckCircle2,
  CalendarCheck, Send, FileSignature, MapPin, FileText, CreditCard,
  AlarmClock, RefreshCw, ClipboardCheck, Eye, type LucideIcon,
} from "lucide-react";

export type FlowKey =
  | "onboarding"
  | "profile_sent"
  | "shortlist"
  | "interview"
  | "contract_signing"
  | "relocation"
  | "second_payment";

export type StageKind = "trigger" | "email" | "wait" | "reminder" | "terminal";

export interface FlowStage {
  key:          string;          // stable identifier persisted to DB
  label:        string;          // human label for the diagram node
  kind:         StageKind;
  icon:         LucideIcon;
  description:  string;          // shown in the side panel when this stage is selected
  defaultDelayDays?: number;     // for `wait` / `reminder` stages — how long after the previous stage
  defaultSubject?:  string;      // for `email` / `reminder` stages — editable in the default-flow editor
}

export interface FlowDefinition {
  key:         FlowKey;
  name:        string;
  /** Short label used in the tab pill. Long `name` is reserved for headers,
   *  drawer titles, and the Settings editor. The pill bar would overflow if
   *  each tab carried the full name. */
  shortName:   string;
  /** One-line summary shown on the flow tab. */
  summary:     string;
  /** Full prose description shown above the diagram. */
  description: string;
  /** What kicks the flow off — narrative copy for the trigger card. */
  triggerCopy: string;
  stages:      FlowStage[];
}

// ── Flow 1: New Doctor Onboarding ────────────────────────────────────────────
const onboarding: FlowDefinition = {
  key: "onboarding",
  name: "New Doctor Onboarding",
  shortName: "Onboarding",
  summary: "First payment confirmed → qualification form + document upload request",
  description:
    "Triggered automatically when the finance team marks a doctor's first payment as confirmed. " +
    "The doctor receives a single onboarding email with the qualification form and a document upload link. " +
    "Replaces the manual send currently handled by the Hospital Introduction team — eliminates weekend / public-holiday delays.",
  triggerCopy: "Finance team marks first payment as received in the dashboard",
  stages: [
    { key: "trigger_first_payment", label: "First Payment Confirmed", kind: "trigger", icon: CreditCard,
      description: "Finance flips the lead's payment status. The flow is enqueued immediately, regardless of weekend/holiday." },
    { key: "send_onboarding_email", label: "Send Onboarding Email", kind: "email", icon: Mail,
      defaultSubject: "Welcome to Allocation Assist — next steps to get you placed",
      description: "Single email with qualification form + secure document upload link. Sent within 5 minutes of trigger." },
    { key: "wait_for_form", label: "Wait for Form Completion", kind: "wait", icon: AlarmClock, defaultDelayDays: 3,
      description: "If the doctor hasn't completed the form in 3 days, a reminder fires." },
    { key: "reminder_form", label: "Form Reminder", kind: "reminder", icon: BellRing, defaultDelayDays: 3,
      defaultSubject: "Quick reminder — your qualification form is waiting",
      description: "First reminder. If still incomplete after another 4 days, the run flags an exception for manual follow-up." },
    { key: "form_received", label: "Form & Documents Received", kind: "terminal", icon: FileCheck,
      description: "Doctor has submitted both the qualification form and required documents. Onboarding flow complete." },
  ],
};

// ── Flow 2: Profile Sent to Hospital ─────────────────────────────────────────
const profileSent: FlowDefinition = {
  key: "profile_sent",
  name: "Profile Sent to Hospital",
  shortName: "Profile Sent",
  summary: "Team clicks 'send' → BCC the hospital(s) + notify the doctor",
  description:
    "Triggered when a team member confirms and sends a doctor profile from the dashboard. " +
    "The system emails the selected hospital(s) using BCC for multi-hospital sends and the hospital-specific template " +
    "(95 templates, one per hospital). Simultaneously notifies the doctor that they've been introduced to that hospital.",
  triggerCopy: "Team member confirms and clicks 'Send' on a doctor profile",
  stages: [
    { key: "trigger_send_clicked", label: "Send Clicked", kind: "trigger", icon: Send,
      description: "Team member selects doctor + hospital(s) and confirms the send." },
    { key: "email_hospital", label: "Email Hospital(s)", kind: "email", icon: Hospital,
      defaultSubject: "Candidate introduction — [Doctor Name], [Speciality]",
      description: "Uses the hospital-specific template (one of 95). Multi-hospital sends go BCC so recipients can't see each other." },
    { key: "email_doctor", label: "Notify Doctor", kind: "email", icon: Mail,
      defaultSubject: "Your profile has been sent to [Hospital Name]",
      description: "Doctor receives a separate notification confirming which hospital(s) they were introduced to." },
    { key: "awaiting_response", label: "Awaiting Hospital Response", kind: "wait", icon: AlarmClock, defaultDelayDays: 7,
      description: "Window for the hospital to respond. After 7 days the run is flagged for the team to chase." },
    { key: "introduction_complete", label: "Introduction Complete", kind: "terminal", icon: CheckCircle2,
      description: "Either the hospital responded (advances to Shortlist flow) or the team manually closed the run." },
  ],
};

// ── Flow 3: Shortlist Confirmation ───────────────────────────────────────────
const shortlist: FlowDefinition = {
  key: "shortlist",
  name: "Shortlist Confirmation",
  shortName: "Shortlist",
  summary: "Hospital shortlists the doctor → confirmation email to the doctor",
  description:
    "Triggered when a hospital confirms a doctor is on their shortlist. The doctor receives an immediate confirmation " +
    "email so they know to expect an interview invitation.",
  triggerCopy: "Hospital confirms shortlist (logged in dashboard by team member)",
  stages: [
    { key: "trigger_shortlist_confirmed", label: "Shortlist Confirmed", kind: "trigger", icon: CheckCircle2,
      description: "Team logs the hospital's shortlist confirmation against the doctor's record." },
    { key: "send_shortlist_email", label: "Send Shortlist Email", kind: "email", icon: Mail,
      defaultSubject: "Great news — you've been shortlisted by [Hospital Name]",
      description: "Doctor receives confirmation of shortlist + a heads-up that an interview invite may follow." },
    { key: "shortlist_complete", label: "Awaiting Interview Schedule", kind: "terminal", icon: CalendarCheck,
      description: "Flow complete. Next touchpoint is the Interview flow once an interview is scheduled." },
  ],
};

// ── Flow 4: Interview Tips + Confirmation ───────────────────────────────────
const interview: FlowDefinition = {
  key: "interview",
  name: "Interview Tips + Confirmation",
  shortName: "Interview",
  summary: "Team marks interview confirmed → tips + confirmation to the doctor",
  description:
    "Triggered when the team marks an interview as confirmed. The doctor receives the interview confirmation " +
    "plus the existing 'interview tips' template Saif's team currently sends by hand.",
  triggerCopy: "Team marks interview as confirmed (date/time logged)",
  stages: [
    { key: "trigger_interview_confirmed", label: "Interview Confirmed", kind: "trigger", icon: CalendarCheck,
      description: "Interview scheduled and confirmed by both sides; team logs it in the dashboard." },
    { key: "send_interview_email", label: "Send Tips + Confirmation", kind: "email", icon: Mail,
      defaultSubject: "Your interview with [Hospital Name] — confirmation + tips",
      description: "Combined email: confirmation details (date/time/format) + interview tips template from Saif." },
    { key: "interview_complete", label: "Interview Window", kind: "terminal", icon: CheckCircle2,
      description: "Email sent. Run completes; next touchpoints are Offer / Relocation flows." },
  ],
};

// ── Flow 5: Contract Signing ────────────────────────────────────────────────
// Bridges Interview → Relocation. The Contract Builder + BoldSign integration
// already handles the actual envelope creation and webhook on signing; this
// flow makes those events visible in the Automations timeline. When the
// boldsign-webhook eventually writes here, signed contracts will auto-trigger
// the Relocation flow.
const contractSigning: FlowDefinition = {
  key: "contract_signing",
  name: "Contract Signing",
  shortName: "Contract",
  summary: "Hospital extends offer → BoldSign envelope → doctor signs",
  description:
    "Triggered when the hospital confirms they want to offer the doctor. The team generates the Service Agreement in the Contract Builder; " +
    "BoldSign emails it to the doctor for signature. When signed, the doctor's Lead_Status flips to Closed Won in Zoho, a Doctors on Board " +
    "contact is created, and the Relocation flow fires automatically.",
  triggerCopy: "Hospital confirms they want to offer the doctor — team clicks 'Send contract' which opens the Contract Builder.",
  stages: [
    { key: "trigger_offer_extended", label: "Offer Extended",     kind: "trigger", icon: ClipboardCheck,
      description: "Hospital has agreed to offer the doctor. The team initiates the contract send from the Contract Builder." },
    { key: "send_contract",          label: "Send Contract",      kind: "email",   icon: FileSignature,
      description: "Service Agreement generated in the Contract Builder. BoldSign creates the envelope and emails the doctor." },
    { key: "awaiting_view",          label: "Awaiting Doctor View", kind: "wait", icon: Eye, defaultDelayDays: 2,
      description: "Envelope delivered but the doctor hasn't opened it yet. BoldSign sends an automatic reminder after 2 days." },
    { key: "awaiting_signature",     label: "Awaiting Signature", kind: "wait",    icon: AlarmClock, defaultDelayDays: 3,
      description: "Doctor opened the envelope but hasn't signed yet. BoldSign reminds every 3 days until signed, declined, or expired." },
    { key: "contract_signed",        label: "Contract Signed",    kind: "terminal", icon: CheckCircle2,
      description: "Doctor signed. Zoho updates automatically; Relocation flow auto-fires from the BoldSign webhook." },
  ],
};

// ── Flow 6: Relocation Guide + Attestation ──────────────────────────────────
const relocation: FlowDefinition = {
  key: "relocation",
  name: "Relocation Guide + Attestation",
  shortName: "Relocation",
  summary: "Doctor signs offer → city-specific relocation guide + attestation info",
  description:
    "Triggered when a doctor signs an offer. The system picks the right relocation guide for the hospital's city " +
    "(10 variants: Dubai, Abu Dhabi, Sharjah, RAK, Riyadh, Jeddah, Qatar etc.) and sends it together with " +
    "the attestation information email.",
  triggerCopy: "Doctor signs offer in BoldSign (or status manually flipped to 'Signed')",
  stages: [
    { key: "trigger_offer_signed", label: "Offer Signed", kind: "trigger", icon: FileSignature,
      description: "BoldSign webhook flips the doctor's status to Signed, or a team member sets it manually." },
    { key: "select_city_guide", label: "Pick City Guide", kind: "wait", icon: MapPin,
      description: "System resolves the hospital's city → selects the matching relocation guide (one of ~10)." },
    { key: "send_relocation_email", label: "Send Relocation Guide", kind: "email", icon: Mail,
      defaultSubject: "Your relocation guide for [City]",
      description: "City-specific relocation guide + cost-of-living overview." },
    { key: "send_attestation_email", label: "Send Attestation Info", kind: "email", icon: FileText,
      defaultSubject: "Document attestation — what you need before you arrive",
      description: "Country-specific attestation requirements (which documents need MOFA / consulate stamps)." },
    { key: "relocation_complete", label: "Relocation Pack Sent", kind: "terminal", icon: CheckCircle2,
      description: "Flow complete. Next touchpoint is the Second Payment flow, 15 days after joining date." },
  ],
};

// ── Flow 6: Second Payment Invoice ──────────────────────────────────────────
const secondPayment: FlowDefinition = {
  key: "second_payment",
  name: "Second Payment Invoice",
  shortName: "Payment",
  summary: "15 days post-join → invoice → escalating reminders until paid",
  description:
    "Triggered 15 days after the doctor's confirmed joining date. The system sends the second-payment invoice with a payment " +
    "link, then escalates reminders: at 25 working days, the day before due date, and weekly after the due date until paid.",
  triggerCopy: "15 days after the joining date logged against the doctor's record",
  stages: [
    { key: "trigger_15_days", label: "15 Days Post-Join", kind: "trigger", icon: AlarmClock,
      description: "Joining date + 15 calendar days. Flow enqueued automatically." },
    { key: "send_invoice", label: "Send Invoice + Payment Link", kind: "email", icon: CreditCard,
      defaultSubject: "Second payment — invoice attached",
      description: "Primary invoice email with a payment link. Marks the start of the reminder ladder." },
    { key: "reminder_25_working", label: "Reminder · 25 Working Days", kind: "reminder", icon: BellRing, defaultDelayDays: 25,
      defaultSubject: "Friendly reminder — second payment invoice",
      description: "25 working days after the initial invoice (excludes weekends). Fires only if not yet paid." },
    { key: "reminder_day_before", label: "Reminder · Day Before Due", kind: "reminder", icon: BellRing, defaultDelayDays: 1,
      defaultSubject: "Your invoice is due tomorrow",
      description: "24 hours before the due date. Last touch in the friendly tier." },
    { key: "reminder_weekly", label: "Weekly Reminders (Post-Due)", kind: "reminder", icon: RefreshCw, defaultDelayDays: 7,
      defaultSubject: "Outstanding invoice — please action",
      description: "Repeating weekly until the invoice is marked paid. Escalates copy tone after the third send." },
    { key: "payment_received", label: "Payment Received", kind: "terminal", icon: CheckCircle2,
      description: "Finance marks the invoice paid; the run completes and all pending reminders are cancelled." },
  ],
};

export const FLOW_DEFINITIONS: Record<FlowKey, FlowDefinition> = {
  onboarding,
  profile_sent:     profileSent,
  shortlist,
  interview,
  contract_signing: contractSigning,
  relocation,
  second_payment:   secondPayment,
};

export const FLOW_ORDER: FlowKey[] = [
  "onboarding",
  "profile_sent",
  "shortlist",
  "interview",
  "contract_signing",
  "relocation",
  "second_payment",
];

export function getFlow(key: string): FlowDefinition | null {
  return (FLOW_DEFINITIONS as Record<string, FlowDefinition | undefined>)[key] ?? null;
}

export function getStageIndex(flowKey: FlowKey, stageKey: string): number {
  const f = FLOW_DEFINITIONS[flowKey];
  if (!f) return -1;
  return f.stages.findIndex(s => s.key === stageKey);
}

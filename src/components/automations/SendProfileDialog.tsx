import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Send, X, Eye, ChevronLeft, AlertTriangle, Mail, ChevronDown, Camera, Image as ImageIcon, FileText } from "lucide-react";
import { captureAndUploadCard } from "@/lib/card-screenshot";
import { buildProfileCardHtml } from "@/lib/profile-card-html";
import { buildDoctorProfileHtml, PROFILE_IMAGE_WIDTH } from "@/lib/doctor-profile-image";
import { toast } from "sonner";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { useAuth } from "@/hooks/use-auth";
import { AA_SENDERS, findSenderByEmail } from "@/lib/hi-team";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { useHospitals, useUpdateHospital, type Hospital } from "@/hooks/use-hospitals";
import { useHospitalContacts, resolveRecipient, resolveAllRecipients, type HospitalContact } from "@/hooks/use-hospital-contacts";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { useDoctorProfile, useDoctorProfiles, profileToTokens, calcCompletion, type DoctorProfile } from "@/hooks/use-doctor-profiles";
import { useWpCandidateForDoctor, usePublishedWpCandidates, useWpCandidates, wpCandidateToTokens, normalizePhone, type WpCandidate } from "@/hooks/use-wp-candidates";
import { useZohoData, type ZohoDoctorOnBoard, type ZohoLead } from "@/hooks/use-zoho-data";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { humanizePlaceholders, stripPlaceholderPills } from "@/lib/humanize-placeholders";
import { EmailPreviewStudioLayout, type StudioEmail } from "@/components/EmailPreviewStudio";
import { EmailFrame } from "@/components/EmailFrame";
import { wrapBodyForSend } from "@/lib/email-preview";
import { type EmailAttachment } from "@/lib/email-attachments";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import { CvStudioDialog } from "@/components/cv/CvStudioDialog";
import { TemplatePicker } from "@/components/automations/TemplatePicker";
import { CcBccPicker, isEmail } from "@/components/automations/CcBccPicker";
import { detectUnfilledVars, describeUnfilled } from "@/lib/email-validation";
import { useScheduleProfileSend } from "@/hooks/use-scheduled-profile-sends";
import { GulfClock, composeLocalDateTime, localToGulfParts, localDateInDays } from "@/components/GulfClock";
import { Clock, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

// Persisted per-recruiter template preference (Amir #3 "save as my default").
const HOSPITAL_DEFAULT_KEY = "profile_sent_hospital";
const DOCTOR_DEFAULT_KEY   = "profile_sent_doctor";
function loadDefaultTemplate(which: "hospital" | "doctor"): string {
  try {
    const v = localStorage.getItem(`aa.profileSend.default.${which}`);
    if (v) return v;
  } catch { /* ignore */ }
  return which === "hospital" ? HOSPITAL_DEFAULT_KEY : DOCTOR_DEFAULT_KEY;
}
function saveDefaultTemplate(which: "hospital" | "doctor", key: string): void {
  try { localStorage.setItem(`aa.profileSend.default.${which}`, key); } catch { /* ignore */ }
}

interface Props {
  open:    boolean;
  onClose: () => void;
  /** Pre-fill the flow (e.g. from a vacancy's matched-doctor mail button): jump
   *  straight to the send preview for this doctor → this hospital. Matched by
   *  prefixed doctor id (falls back to email) and hospital id (falls back to
   *  name). */
  initial?: {
    doctorId?:      string;
    doctorEmail?:   string | null;
    hospitalId?:    string | null;
    hospitalName?:  string | null;
  } | null;
}

export interface SendProfileInitial {
  doctorId?:      string;
  doctorEmail?:   string | null;
  hospitalId?:    string | null;
  hospitalName?:  string | null;
}

type Step = "pick-doctor" | "pick-hospitals" | "preview-confirm";

interface DoctorOption {
  id:         string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  speciality: string | null;
  /** Country of specialty training — Zoho has it on the DOB/lead record, so we
   *  can fill {{doctor_country_training}} even when the WP profile doesn't. */
  country_training?: string | null;
  source:     "dob" | "lead" | "wp";
}

// ── Profile completion (shared by the picker filter + the preview warning) ──
// WP candidate is the source of truth; these are the 9 fields the preview
// counts. Mirrors the inline ratio that used to live only in PreviewConfirm.
const WP_COMPLETION_FIELDS: (keyof WpCandidate)[] = [
  "job_title", "area_of_interest", "country_of_training", "years_experience",
  "nationality", "family_status", "license_status", "expected_salary", "notice_period",
];
function wpCandidateCompletion(c: WpCandidate): number {
  const filled = WP_COMPLETION_FIELDS.filter(f => { const v = c[f]; return v != null && v !== ""; }).length;
  return Math.round((filled / WP_COMPLETION_FIELDS.length) * 100);
}
/** Normalise a name for matching — drops title prefixes + collapses spaces.
 *  Mirrors the matcher inside useWpCandidateForDoctor so the picker filter
 *  resolves the same WP record the preview would. */
function normName(n: string | null | undefined): string {
  return (n ?? "").toLowerCase().replace(/^(dr|doctor|prof|mr|mrs|ms|miss)\.?\s+/i, "").replace(/\s+/g, " ").trim();
}

// ── Send-fidelity wrapper ───────────────────────────────────────────────────
// wrapBodyForSend (the exact server send shell — FONT_IMPORT + Garamond
// container) now lives in src/lib/email-preview.ts, so every preview surface
// AND the send path share one source of truth kept in sync with the edge fns.
// Imported above.

interface SendOverrides { subject_override?: string; html_override?: string }

// Amir is offered as a CC quick-add (visible to the recipient) per request; the
// AA sender roster (AA_SENDERS) is offered as BCC quick-adds. Both feed the
// free-form CcBccPicker on the preview step.
const CC_AMIR_EMAIL = "amir@allocationassist.com";
// Generic company From address — Allocation Assist is a referral agency, so this
// is the default sender for profile sends. Registered in send-flow-email's
// SENDERS map as the "Allocation Assist Team" persona.
const AA_TEAM_EMAIL = "hello@allocationassist.com";

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
/**
 * Public shell. Renders only the Dialog trigger/frame; the data-fetching body
 * (six data hooks + the heavy completionIndex/doctorOptions indexes) is an
 * inner component mounted ONLY while the dialog is open, so nothing fetches
 * while closed. Once open, behaviour is identical to before the split.
 */
export function SendProfileDialog({ open, onClose, initial }: Props) {
  // The body owns its own modal frame so the preview step can swap the compact
  // picker dialog for the full 90×90 EmailPreviewStudio. Mounted only while
  // open (nothing fetches while closed).
  return open ? <SendProfileDialogBody onClose={onClose} initial={initial ?? null} /> : null;
}

function SendProfileDialogBody({ onClose, initial }: { onClose: () => void; initial: SendProfileInitial | null }) {
  const [step,            setStep]            = useState<Step>("pick-doctor");
  const [selectedDoctor,  setSelectedDoctor]  = useState<DoctorOption | null>(null);
  const [selectedIds,     setSelectedIds]     = useState<string[]>([]);
  const [customMessage,   setCustomMessage]   = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  // Dispatcher-chosen BCC list. Empty array = no BCC; null = use the
  // function's default behaviour (auto-BCC the sender on personal
  // routing). Defaulted from the current user so their own outbound
  // copy lands in their inbox unless they actively change it.
  const [ccList,          setCcList]          = useState<string[]>([]);
  const [bccList,         setBccList]         = useState<string[]>([]);
  // Manual per-hospital recipient override (hospitalId → chosen contact email)
  // for THIS send only — overrides the hospital's primary/cycle routing.
  const [recipientOverrides, setRecipientOverrides] = useState<Record<string, string>>({});
  // When set, the doctor CARD ships as a flat inline image (a screenshot) in
  // the hospital email instead of the {{doctor_card_html}} block. One image per
  // doctor → applies to every hospital in a BCC batch. Captured on demand from
  // the preview via the "Download & attach card screenshot" button.
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  // Per-send template keys (Amir #3). Persisted preference re-loads on open.
  const [hospitalTemplateKey, setHospitalTemplateKey] = useState<string>(() => loadDefaultTemplate("hospital"));
  const [doctorTemplateKey,   setDoctorTemplateKey]   = useState<string>(() => loadDefaultTemplate("doctor"));

  const qc = useQueryClient();
  const { data: zoho, isLoading: zohoLoading } = useZohoData();
  const { data: hospitals = [] } = useHospitals();
  const { data: templates = [] } = useEmailTemplates();
  const { user } = useAuth();
  const hospitalContacts = useHospitalContacts();
  const updateHospital = useUpdateHospital();
  const scheduleProfileSend = useScheduleProfileSend();
  const navigate = useNavigate();

  // Reset the wizard ONCE on open. The body only mounts while open, so
  // "on open" == "on mount". This must NOT depend on the user — auth resolves a
  // tick after mount (user?.email goes undefined → real), and re-running this
  // would reset step/selectedDoctor and wipe out a vacancy pre-fill that already
  // jumped to the preview (the "flash then back to zero" bug).
  useEffect(() => {
    setStep("pick-doctor");
    setSelectedDoctor(null);
    setSelectedIds([]);
    setCustomMessage("");
    setHospitalTemplateKey(loadDefaultTemplate("hospital"));
    setDoctorTemplateKey(loadDefaultTemplate("doctor"));
    setCardImageUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default the BCC to the current user (known sender) — "I'm sending, BCC me".
  // Tracks the user separately so it can settle when auth loads WITHOUT touching
  // the wizard navigation. The Preview step's picker overrides it.
  useEffect(() => {
    const me = findSenderByEmail(user?.email ?? null);
    setBccList(me ? [me.email] : []);
    setCcList([]);
  }, [user?.email]);

  // Phase 4 — hide signed + unavailable doctors from the send list. Spec:
  // "Signed status removes from public website (not eligible to be sent in
  // future profile batches)" + unavailable doctors are paused.
  const lifecycleMap = useDoctorLifecycleMap();
  // Completion sources — used to drop 0%-complete doctors from the picker
  // (a blank profile would render literal {{token}}s to the hospital).
  const { data: wpPool = [], isLoading: wpLoading } = usePublishedWpCandidates();     // published — the selectable WP-candidate list
  const { data: allWpPool = [] } = useWpCandidates();                                 // full — so drafts count for completion + fill
  const { data: allProfiles = [], isLoading: profilesLoading } = useDoctorProfiles();
  const completionReady = !wpLoading && !profilesLoading;

  // Index the WP pool + legacy profiles once so per-doctor completion is a
  // few map lookups, not an O(doctors × candidates) scan on every render.
  const completionIndex = useMemo(() => {
    const byDoctorId = new Map<string, WpCandidate>();
    const byWpId     = new Map<number, WpCandidate>();
    const byPhone    = new Map<string, WpCandidate>();
    const byEmail    = new Map<string, WpCandidate>();
    const byName     = new Map<string, WpCandidate[]>();
    for (const c of allWpPool) {
      if (c.doctor_id) byDoctorId.set(c.doctor_id, c);
      byWpId.set(c.id, c);
      const ph = normalizePhone(c.phone); if (ph && !byPhone.has(ph)) byPhone.set(ph, c);
      const em = (c.email ?? "").toLowerCase().trim(); if (em && !byEmail.has(em)) byEmail.set(em, c);
      const nm = normName(c.full_name); if (nm) (byName.get(nm) ?? byName.set(nm, []).get(nm)!).push(c);
    }
    const profileById = new Map<string, DoctorProfile>();
    for (const p of allProfiles) profileById.set(p.doctor_id, p);
    return { byDoctorId, byWpId, byPhone, byEmail, byName, profileById };
  }, [allWpPool, allProfiles]);

  // Same resolution priority as useWpCandidateForDoctor: id → wp:id → phone
  // → email → unique name. Returns 0 when nothing's on file.
  const completionFor = useCallback((o: DoctorOption): number => {
    const idx = completionIndex;
    let hit = idx.byDoctorId.get(o.id);
    if (!hit && o.id.startsWith("wp:")) { const n = Number(o.id.slice(3)); if (Number.isFinite(n)) hit = idx.byWpId.get(n); }
    if (!hit && o.phone) { const k = normalizePhone(o.phone); if (k) hit = idx.byPhone.get(k); }
    if (!hit && o.email) { const e = o.email.toLowerCase().trim(); if (e) hit = idx.byEmail.get(e); }
    if (!hit && o.name) { const nm = normName(o.name); const ms = nm ? idx.byName.get(nm) : undefined; if (ms && ms.length === 1) hit = ms[0]; }
    if (hit) return wpCandidateCompletion(hit);
    return calcCompletion(idx.profileById.get(o.id));
  }, [completionIndex]);

  const doctorOptions: DoctorOption[] = useMemo(() => {
    const opts: DoctorOption[] = [];
    const z = zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[]; rawLeads?: ZohoLead[] } | undefined;
    const eligible = (prefixedId: string): boolean => {
      const lc = lifecycleMap[prefixedId];
      if (!lc) return true;
      return lc.eligible_for_sending !== false;
    };
    const seenEmails = new Set<string>();
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `dob:${d.id}`;
      if (!eligible(id)) continue;
      opts.push({ id, name, email: d.Email, phone: d.Phone ?? d.Mobile, speciality: d.Specialty_New ?? d.Speciality, country_training: d.Country_of_Specialty_training, source: "dob" });
      if (d.Email) seenEmails.add(d.Email.trim().toLowerCase());
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `lead:${l.id}`;
      if (!eligible(id)) continue;
      opts.push({ id, name, email: l.Email, phone: l.Phone ?? l.Mobile, speciality: l.Specialty ?? l.Specialty_New, country_training: l.Country_of_Specialty_training, source: "lead" });
      if (l.Email) seenEmails.add(l.Email.trim().toLowerCase());
    }
    // WP PUBLISHED candidates (the same spine the vacancy matcher uses) — so a
    // WP-only doctor sent straight from a vacancy is selectable here too and the
    // pre-fill can jump to the preview. `wp:<id>` matches the matcher's ids and
    // completionFor()/PreviewConfirm both already resolve wp: entries. Deduped by
    // email against Zoho so a doctor on both lists appears once.
    for (const c of wpPool) {
      const email = (c.email ?? "").trim().toLowerCase();
      if (email && seenEmails.has(email)) continue;
      const name = (c.full_name ?? "").trim();
      if (!name && !email) continue;
      const id = `wp:${c.id}`;
      if (!eligible(id)) continue;
      opts.push({ id, name: name || email, email: c.email, phone: c.phone, speciality: c.specialty, source: "wp" });
      if (email) seenEmails.add(email);
    }
    // Drop doctors with a 0%-complete profile — sending them would leak
    // literal {{token}}s to the hospital. Only filter once completion data
    // has loaded, so the list isn't transiently emptied on first paint.
    if (!completionReady) return opts;
    return opts.filter(o => completionFor(o) > 0);
  }, [zoho, wpPool, lifecycleMap, completionReady, completionFor]);

  const selectedHospitals = useMemo(
    () => hospitals.filter(h => selectedIds.includes(h.id)),
    [hospitals, selectedIds],
  );

  // Pre-fill (vacancy mail button): once the doctor list is loaded, select the
  // doctor + hospital and jump straight to the send preview. Runs after the
  // reset effect (doctorOptions load async), so it wins.
  const [initialApplied, setInitialApplied] = useState(false);
  useEffect(() => { setInitialApplied(false); }, [initial?.doctorId, initial?.doctorEmail, initial?.hospitalId, initial?.hospitalName]);
  useEffect(() => {
    if (initialApplied || !initial || !(initial.doctorId || initial.doctorEmail)) return;
    // Wait for BOTH doctor pools (Zoho + WP published) to finish loading before
    // deciding — otherwise, if Zoho arrives first, a WP-only doctor isn't in the
    // list yet and we'd wrongly give up (and never retry once initialApplied).
    if (zohoLoading || wpLoading || doctorOptions.length === 0) return;
    const doc =
      (initial.doctorId    ? doctorOptions.find(d => d.id === initial.doctorId) : undefined) ??
      (initial.doctorEmail ? doctorOptions.find(d => d.email?.toLowerCase() === initial.doctorEmail!.toLowerCase()) : undefined);
    if (!doc) { setInitialApplied(true); return; } // not eligible → leave on step 1
    setSelectedDoctor(doc);
    const h =
      (initial.hospitalId   ? hospitals.find(x => x.id === initial.hospitalId) : undefined) ??
      (initial.hospitalName ? hospitals.find(x => x.name.trim().toLowerCase() === initial.hospitalName!.trim().toLowerCase()) : undefined);
    if (h) { setSelectedIds([h.id]); setStep("preview-confirm"); }
    else setStep("pick-hospitals");
    setInitialApplied(true);
  }, [initial, initialApplied, doctorOptions, hospitals, zohoLoading, wpLoading]);

  // While a vacancy-launched send is still resolving its pre-filled doctor +
  // hospital (doctorOptions load async), show a loading panel instead of the
  // step-1 picker — otherwise the picker flashes for a frame before we jump to
  // the preview (Hasan: "the autofilled emails … flashes before going into the
  // selector"). Safety timeout forces us out of limbo if the roster never loads.
  const resolvingInitial = !!initial && !!(initial.doctorId || initial.doctorEmail) && !initialApplied;
  useEffect(() => {
    if (!resolvingInitial) return;
    const t = setTimeout(() => setInitialApplied(true), 5000);
    return () => clearTimeout(t);
  }, [resolvingInitial]);

  // Per-send template selection (Amir #3). Defaults to the flow's two
  // hardcoded templates; the team can pick ANY template per send. The picked
  // doctor "working opportunity" template is the headline ask.
  const hospitalTemplate = templates.find(t => t.key === hospitalTemplateKey)
    ?? templates.find(t => t.key === "profile_sent_hospital");
  const doctorTemplate   = templates.find(t => t.key === doctorTemplateKey)
    ?? templates.find(t => t.key === "profile_sent_doctor");

  // ── Live-placeholder preview for the doctor/hospital picker steps ──────────
  // The right pane always shows the two templates; unfilled tokens render as
  // placeholder pills and fill in as a doctor / hospital is chosen. We pull the
  // selected doctor's profile (WP draft-or-published + legacy) here too, so the
  // picker steps show the SAME filled-in details as the final preview — not just
  // pills until step 3 (Amir: "the info is there, it doesn't show up in steps 1/2").
  const [wizardTab, setWizardTab] = useState<string>("hospital");
  const wizardWp = useWpCandidateForDoctor(selectedDoctor, { includeDrafts: true });
  const { data: wizardProfile } = useDoctorProfile(selectedDoctor?.id ?? null);
  const wizardProfileTokens = useMemo(() => {
    const wpTokens = wpCandidateToTokens(wizardWp);
    const merged: Record<string, string> = { ...profileToTokens(wizardProfile) };
    for (const [k, v] of Object.entries(wpTokens)) { if (v) merged[k] = v; else if (!(k in merged)) merged[k] = ""; }
    return merged;
  }, [wizardWp, wizardProfile]);
  const previewVars = useMemo(() => {
    const v: Record<string, string> = {
      ...wizardProfileTokens,
      signature: PREVIEW_SIGNATURE_HTML, signature_text: PREVIEW_SIGNATURE_TEXT, logo_header: "",
    };
    if (selectedDoctor) {
      v.doctor_name       = selectedDoctor.name.replace(/^\s*Dr\.?\s+/i, "");
      v.doctor_email      = selectedDoctor.email ?? "";
      v.doctor_phone      = selectedDoctor.phone ?? "";
      v.doctor_speciality = selectedDoctor.speciality ?? "";
      v.doctor_country_training = wizardProfileTokens.doctor_country_training || selectedDoctor.country_training || "";
      v.profile_link      = `https://allocationassist.com/shared-profile/${selectedDoctor.id}`;
    }
    const h = selectedHospitals[0];
    if (h) {
      v.hospital_name         = h.name;
      v.hospital_contact_name = (h.greet_with_contact_name && h.primary_contact_name?.trim()) ? h.primary_contact_name : h.name;
      v.city                  = h.city ?? "";
      v.country               = h.country ?? "";
    }
    v.doctor_card_html      = previewDoctorCardHtml(v);
    v.doctor_row_table_html = previewDoctorRowTableHtml(v);
    v.doctor_card_image_url = "";
    v.hospital_image        = hospitalImageHtml(h?.image_url, h?.name);
    return v;
  }, [selectedDoctor, selectedHospitals, wizardProfileTokens]);

  const wizardEmails: StudioEmail[] = useMemo(() => {
    const hSubj = renderTemplate(hospitalTemplate?.subject ?? "Candidate introduction — {{doctor_name}}", previewVars);
    const hHtml = wrapBodyForSend(renderTemplate(hospitalTemplate?.body_html ?? hospitalTemplate?.body_text ?? "", previewVars) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : ""));
    const dSubj = renderTemplate(doctorTemplate?.subject ?? "Your profile has been sent to {{hospital_name}}", previewVars);
    const dHtml = wrapBodyForSend(renderTemplate(doctorTemplate?.body_html ?? doctorTemplate?.body_text ?? "", previewVars));
    const pane = (subject: string, html: string) => (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
          <div className="truncate text-[14px] font-semibold text-slate-900">
            {subject ? <span dangerouslySetInnerHTML={{ __html: humanizePlaceholders(subject) }} /> : <span className="italic text-slate-400">No subject</span>}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">Preview · not sent</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          <EmailFrame html={humanizePlaceholders(html)} />
        </div>
      </div>
    );
    return [
      { key: "hospital", label: "Hospital intro", subLabel: selectedHospitals[0]?.name ?? "pick a hospital", preview: pane(hSubj, hHtml) },
      { key: "doctor",   label: "Doctor email",   subLabel: selectedDoctor?.email ?? "pick a doctor",        preview: pane(dSubj, dHtml) },
    ];
  }, [hospitalTemplate, doctorTemplate, previewVars, customMessage, selectedHospitals, selectedDoctor]);

  const handleConfirm = async (
    stageOverrides?: Record<string, SendOverrides>,
    attachments?: { hospital?: EmailAttachment[]; doctor?: EmailAttachment[] },
    templateKeys?: { hospital: string; doctor: string },
    schedule?: { date: string; time: string },
    recipients?: { doctorEmail?: string },
    sender?: { assignedTo: string | null },
  ) => {
    // Explicit sender pick from the dialog. When set it's written to each run's
    // assigned_to so send-flow-email's pickSender uses it as the From line;
    // null → leave assigned_to unset so the hospital-owner trigger decides.
    const senderAssignedTo = sender?.assignedTo ?? null;
    const hospitalAttach = attachments?.hospital ?? [];
    const doctorAttach   = attachments?.doctor ?? [];
    if (!selectedDoctor || selectedHospitals.length === 0) return;
    // Retyped doctor recipient (single-hospital only) wins over the doctor's own
    // email for the "working opportunity" heads-up. Falls back to their profile
    // email when not overridden.
    const doctorEmailToUse = (recipients?.doctorEmail ?? "").trim() || selectedDoctor.email;
    // Edits only apply to a single-hospital send — the preview (and so the
    // edited HTML) is rendered for one hospital, and the override would bake
    // that hospital's tokens into every BCC run. The preview UI already
    // disables editing for multi-hospital, but guard here too.
    const effectiveStageOverrides =
      selectedHospitals.length === 1 && stageOverrides && Object.keys(stageOverrides).length
        ? stageOverrides : undefined;
    const templateOverridesPayload = templateKeys && (templateKeys.hospital !== HOSPITAL_DEFAULT_KEY || templateKeys.doctor !== DOCTOR_DEFAULT_KEY)
      ? {
          ...(templateKeys.hospital !== HOSPITAL_DEFAULT_KEY ? { email_hospital: templateKeys.hospital } : {}),
          ...(templateKeys.doctor   !== DOCTOR_DEFAULT_KEY   ? { email_doctor:   templateKeys.doctor }   : {}),
        }
      : null;

    // ── Schedule-for-later branch (Amir #5) ─────────────────────────────────
    // Instead of creating runs + sending now, stash everything the send needs
    // in a scheduled_profile_sends row. A deployed scheduler expands it later;
    // the Scheduled queue lets the team Send now / Reschedule / Cancel.
    if (schedule?.date) {
      // Guard against a cleared/half-typed slot — localToGulfParts + Intl.format
      // below throw on an Invalid Date. The buttons already disable on this, so
      // this is just belt-and-suspenders.
      if (Number.isNaN(composeLocalDateTime(schedule.date, schedule.time || "09:00").getTime())) {
        toast.error("Pick a valid date and time to schedule.");
        return;
      }
      setSubmitting(true);
      try {
        // The team picks the slot in THEIR local time; the scheduler fires on
        // Gulf-time wall clock, so convert here while preserving the absolute
        // moment. A PST 11pm pick becomes the right next-day Dubai time.
        const gulf = localToGulfParts(schedule.date, schedule.time || "09:00");
        const localLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
          .format(composeLocalDateTime(schedule.date, schedule.time || "09:00"));
        await scheduleProfileSend.mutateAsync({
          doctor_id:         selectedDoctor.id,
          doctor_name:       selectedDoctor.name,
          doctor_email:      doctorEmailToUse,
          doctor_phone:      selectedDoctor.phone,
          doctor_speciality: selectedDoctor.speciality,
          hospital_ids:      selectedHospitals.map(h => h.id),
          custom_message:    customMessage || null,
          bcc_override:      bccList,
          cc_override:       ccList.length ? ccList : null,
          assigned_to:       senderAssignedTo,
          stage_overrides:   effectiveStageOverrides ?? null,
          template_overrides: templateOverridesPayload,
          attachments:        hospitalAttach.map(a => ({ filename: a.filename, path: a.path })),
          attachments_doctor: doctorAttach.map(a => ({ filename: a.filename, path: a.path })),
          scheduled_for:     gulf.date,
          scheduled_at_time: gulf.time,
          timezone:          "Asia/Dubai",
        });
        toast.success(`Scheduled for ${localLabel} (your time) — ${selectedDoctor.name} → ${selectedHospitals.length} hospital${selectedHospitals.length === 1 ? "" : "s"}`, {
          action: { label: "View queue", onClick: () => navigate("/batches") },
        });
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not schedule");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      // One run per hospital — keeps Flow 2 timeline focused per relationship,
      // matches how Saif's team thinks about "Doctor X sent to Hospital Y".
      // For multi-hospital sends we group all runs under a shared batch_id
      // in metadata so the BCC nature is queryable later.
      const batchId = crypto.randomUUID();
      // Cycle-mode cursor advances, applied after the runs are created so the
      // next send to each hospital rotates to its next contact.
      const cursorAdvances: { id: string; name: string; next: number }[] = [];
      for (const h of selectedHospitals) {
        // Resolve THIS send's recipient from the hospital's Zoho contacts +
        // routing mode (primary vs cycle), honouring a manual override. Falls
        // back to the hospital row's primary_recruiter_email if nothing matched.
        const contactsForH = hospitalContacts.forHospital(h.name);
        const resolved = resolveRecipient(contactsForH, h);
        const overrideEmail = recipientOverrides[h.id];
        const overrideContact = overrideEmail
          ? contactsForH.find(c => c.email?.toLowerCase() === overrideEmail.toLowerCase())
          : undefined;
        // 'all' mode (no manual override) → every eligible contact in the To
        // field, comma-joined; send-flow-email splits it into the To array.
        const isAllMode = !overrideEmail && (h.contact_mode ?? "primary") === "all";
        const allEmails = isAllMode ? resolveAllRecipients(contactsForH, h) : [];
        const recipientEmail = isAllMode
          ? (allEmails.join(", ") || h.primary_recruiter_email || null)
          : (overrideEmail ?? resolved.contact?.email ?? h.primary_recruiter_email ?? null);
        // Going to everyone → greet with the hospital name (leave contact name
        // blank), since no single contact owns the email.
        const recipientName  = isAllMode
          ? ""
          : (overrideContact?.name ?? resolved.contact?.name ?? h.primary_contact_name ?? "").trim();
        // Only advance the cursor when we actually used the cycle rotation
        // (no override, cycle mode, real matched contacts).
        if (!overrideEmail && (h.contact_mode ?? "primary") === "cycle" && !resolved.fromHospitalRow && resolved.nextCursor !== (h.cycle_cursor ?? 0)) {
          cursorAdvances.push({ id: h.id, name: h.name, next: resolved.nextCursor });
        }
        const { data: runRow, error: runErr } = await supabase
          .from("automation_flow_runs")
          .insert({
            flow_key:      "profile_sent",
            doctor_id:     selectedDoctor.id,
            doctor_name:   selectedDoctor.name,
            doctor_email:  doctorEmailToUse,
            doctor_phone:  selectedDoctor.phone,
            hospital:      h.name,
            current_stage: "email_hospital",
            status:        "active",
            created_by:    user?.email ?? null,
            // Explicit sender pick → stamp assigned_to so pickSender uses it as
            // the From line. Omit when "auto" so the assign_run_from_hospital_owner
            // trigger stamps each hospital's own owner (unchanged behaviour).
            ...(senderAssignedTo ? { assigned_to: senderAssignedTo } : {}),
            metadata: {
              batch_id:           batchId,
              hospital_id:        h.id,
              hospital_email:     recipientEmail,
              // The chosen contact's name → direct addressing (send-flow-email
              // greets this person when hospitals.greet_with_contact_name is on).
              ...(recipientName ? { hospital_contact_name: recipientName } : {}),
              bcc:                selectedHospitals.length > 1,
              total_in_batch:     selectedHospitals.length,
              custom_message:     customMessage || null,
              doctor_speciality:  selectedDoctor.speciality,
              triggered_via:      "send_profile_dialog",
              // Dispatcher-picked recipients. The roster is BCC'd; Amir (if
              // picked) is CC'd. send-flow-email reads bcc_override / cc_override.
              bcc_override:       bccList,
              ...(ccList.length ? { cc_override: ccList } : {}),
              // Per-stage edits from the preview (email_hospital / email_doctor).
              // send-flow-email reads stage_overrides[<stage>] when each email
              // fires — including the doctor heads-up that auto-continues
              // server-side — and ships that edited version verbatim.
              ...(effectiveStageOverrides ? { stage_overrides: effectiveStageOverrides } : {}),
              // CVs / logbooks attached in the preview — PER EMAIL. Same files
              // for every hospital in a BCC batch. send-flow-email reads
              // `attachments` on the hospital stage and `attachments_doctor` on
              // the doctor stage. Store the minimal Resend shape.
              ...(hospitalAttach.length
                ? { attachments: hospitalAttach.map(a => ({ filename: a.filename, path: a.path })) }
                : {}),
              ...(doctorAttach.length
                ? { attachments_doctor: doctorAttach.map(a => ({ filename: a.filename, path: a.path })) }
                : {}),
              // Per-send template pick (Amir #3). send-flow-email reads
              // template_overrides[<stage>] and renders that template server-side
              // with each hospital's own tokens — so a picked template works even
              // for a multi-hospital BCC batch. For single-hospital sends the
              // editable-preview override (stage_overrides above) also carries it,
              // so it works pre-deploy too.
              ...((templateKeys && (templateKeys.hospital !== HOSPITAL_DEFAULT_KEY || templateKeys.doctor !== DOCTOR_DEFAULT_KEY))
                ? { template_overrides: {
                    ...(templateKeys.hospital !== HOSPITAL_DEFAULT_KEY ? { email_hospital: templateKeys.hospital } : {}),
                    ...(templateKeys.doctor   !== DOCTOR_DEFAULT_KEY   ? { email_doctor:   templateKeys.doctor }   : {}),
                  } }
                : {}),
              // Card-as-image (Hasan): a captured screenshot of the doctor card,
              // rendered inline in the hospital email in place of the HTML card
              // so it looks identical in every client. Same image for every
              // hospital in the batch (the card is doctor-specific).
              ...(cardImageUrl ? { doctor_card_image_url: cardImageUrl } : {}),
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
            payload:    { template_key: h.template_key ?? "profile_sent_hospital", recipient: recipientEmail },
          },
        ]);
      }

      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });

      // Advance each cycle-mode hospital's cursor so the NEXT send rotates to
      // its next contact. Non-fatal — a failure just repeats a contact.
      for (const adv of cursorAdvances) {
        try { await updateHospital.mutateAsync({ id: adv.id, name: adv.name, cycle_cursor: adv.next }); }
        catch { /* ignore — rotation retries next time */ }
      }

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
            // Edits ride along in the run's metadata.stage_overrides (set above),
            // so both the hospital email and the auto-continued doctor email
            // pick up their own edited version.
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

  // The preview step is its own full-screen studio modal (90×90, controls
  // left / email right). Render it directly — not inside the compact picker
  // dialog — so it owns the whole viewport.
  // One persistent modal frame for the whole flow — the inner content swaps per
  // step, so stepping between pick-doctor → pick-hospitals → preview never
  // re-animates the overlay. The 30% green rail carries the wizard (pickers,
  // then the preview controls); the right pane always shows the templates.
  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 h-[92vh] w-[93vw] -translate-x-1/2 -translate-y-1/2 bg-transparent outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
        >
          <DialogPrimitive.Title className="sr-only">Send Profile to Hospital</DialogPrimitive.Title>
          {resolvingInitial ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing the introduction…
              </div>
            </div>
          ) : step === "preview-confirm" && selectedDoctor ? (
            <PreviewConfirm
              onClose={onClose}
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
              ccList={ccList}
              setCcList={setCcList}
              bccList={bccList}
              setBccList={setBccList}
              templates={templates}
              hospitalTemplateKey={hospitalTemplateKey}
              setHospitalTemplateKey={setHospitalTemplateKey}
              doctorTemplateKey={doctorTemplateKey}
              setDoctorTemplateKey={setDoctorTemplateKey}
              onSaveDefault={saveDefaultTemplate}
              hospitalContacts={hospitalContacts}
              recipientOverrides={recipientOverrides}
              onOverrideRecipient={(id, email) => setRecipientOverrides(prev => {
                const next = { ...prev };
                if (email) next[id] = email; else delete next[id];
                return next;
              })}
              cardImageUrl={cardImageUrl}
              onSetCardImage={setCardImageUrl}
              onRemoveHospital={(id) => setSelectedIds(prev => prev.filter(x => x !== id))}
            />
          ) : (
            <EmailPreviewStudioLayout
              title="Send Profile to Hospital"
              subtitle={step === "pick-doctor"
                ? "Step 1 · Choose a doctor"
                : `Step 2 · ${selectedDoctor?.name ?? "doctor"} → choose hospital(s)`}
              onClose={onClose}
              emails={wizardEmails}
              activeKey={wizardTab}
              onActiveKeyChange={setWizardTab}
              mountActiveOnly
              railFill
              headerExtra={
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <Stepper step={step} />
                  <div className="min-h-0 flex-1">
                    {step === "pick-doctor" ? (
                      <DoctorPicker
                        options={doctorOptions}
                        isLoading={zohoLoading || !completionReady}
                        onPick={(d) => { setSelectedDoctor(d); setStep("pick-hospitals"); }}
                      />
                    ) : selectedDoctor ? (
                      <HospitalPicker
                        doctor={selectedDoctor}
                        hospitals={hospitals}
                        selectedIds={selectedIds}
                        onToggle={(id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        onSetSelected={setSelectedIds}
                        customMessage={customMessage}
                        setCustomMessage={setCustomMessage}
                      />
                    ) : null}
                  </div>
                </div>
              }
              footer={step === "pick-hospitals" ? (
                <>
                  <Button variant="outline" onClick={() => setStep("pick-doctor")} className="mr-auto">
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                  </Button>
                  <Button onClick={() => setStep("preview-confirm")} disabled={selectedIds.length === 0}>
                    Continue to preview →
                  </Button>
                </>
              ) : undefined}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
    <div className="flex items-center gap-1.5 text-[11px]">
      {steps.map((s, i) => (
        <span key={s.key} className={
          i === currentIdx ? "font-semibold text-sidebar-foreground" :
          i <  currentIdx ? "text-emerald-300" : "text-sidebar-foreground/45"
        }>
          {s.label}{i < steps.length - 1 && <span className="text-sidebar-foreground/30"> → </span>}
        </span>
      ))}
    </div>
  );
}

function DoctorPicker({ options, isLoading, onPick }: {
  options: DoctorOption[]; isLoading: boolean; onPick: (d: DoctorOption) => void;
}) {
  const [q, setQ] = useState("");
  // Defer only the filter term: the <Input> stays controlled by the raw `q`
  // (instant typing), while the options.filter runs against the deferred value
  // so a large list stays responsive. Final filtered options/order are
  // identical — the deferred value settles to `q` once React catches up.
  const deferredQ = useDeferredValue(q);
  const filtered = useMemo(() => {
    const term = deferredQ.trim().toLowerCase();
    if (!term) return options.slice(0, 50);
    return options.filter(o =>
      o.name.toLowerCase().includes(term) ||
      o.email?.toLowerCase().includes(term) ||
      o.speciality?.toLowerCase().includes(term),
    ).slice(0, 100);
  }, [options, deferredQ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="relative shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={isLoading ? "Loading doctors..." : "Search by name, email, or speciality..."}
          className="pl-7 text-[12px] bg-white text-slate-800"
        />
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-sidebar-border/40 bg-white overflow-y-auto divide-y aa-scrollbar-hide">
        {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No doctors match.</div>
        )}
        {filtered.map(d => (
          <button
            key={d.id}
            onClick={() => onPick(d)}
            className="group w-full text-left px-3 py-2 hover:bg-teal-50/60 transition-colors flex items-center gap-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{d.name || "—"}</span>
                <span className={`shrink-0 rounded px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide ${d.source === "dob" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                  {d.source === "dob" ? "DoB" : "Lead"}
                </span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {d.speciality ?? "—"}{(d.email ?? d.phone) ? ` · ${d.email ?? d.phone}` : ""}
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300 rotate-180 group-hover:text-teal-500 transition-colors" />
          </button>
        ))}
      </div>
      <div className="shrink-0 text-[10px] text-sidebar-foreground/60">
        Showing {filtered.length} of {options.length}. Refine search to narrow.
      </div>
    </div>
  );
}

function HospitalPicker({
  doctor, hospitals, selectedIds, onToggle, onSetSelected, customMessage, setCustomMessage,
}: {
  doctor: DoctorOption;
  hospitals: Hospital[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSetSelected: (ids: string[]) => void;
  customMessage: string;
  setCustomMessage: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [city, setCity] = useState("all");
  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const h of hospitals) { const c = h.country?.trim(); if (c) s.add(c); }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [hospitals]);
  // Cities/emirates scoped to the selected country, so "UAE → Dubai/Abu Dhabi…".
  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const h of hospitals) {
      if (country !== "all" && (h.country ?? "").trim().toLowerCase() !== country.toLowerCase()) continue;
      const c = h.city?.trim(); if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [hospitals, country]);
  // A city no longer in the (country-scoped) list falls back to "all".
  const effCity = city !== "all" && cities.some(c => c.toLowerCase() === city.toLowerCase()) ? city : "all";
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return hospitals.filter(h => {
      if (country !== "all" && (h.country ?? "").trim().toLowerCase() !== country.toLowerCase()) return false;
      if (effCity !== "all" && (h.city ?? "").trim().toLowerCase() !== effCity.toLowerCase()) return false;
      if (!term) return true;
      return h.name.toLowerCase().includes(term) ||
        h.city?.toLowerCase().includes(term) ||
        h.country?.toLowerCase().includes(term);
    });
  }, [hospitals, q, country, effCity]);

  // "Select all" acts on whatever's currently filtered (so a search narrows it).
  const allFilteredSelected = filtered.length > 0 && filtered.every(h => selectedIds.includes(h.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      const drop = new Set(filtered.map(h => h.id));
      onSetSelected(selectedIds.filter(id => !drop.has(id)));
    } else {
      onSetSelected([...new Set([...selectedIds, ...filtered.map(h => h.id)])]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="shrink-0 rounded-lg border border-sidebar-border/40 bg-white/95 p-2.5 shadow-sm">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sending profile of</div>
        <div className="text-[13px] font-medium text-slate-800">{doctor.name}</div>
        <div className="text-[11px] text-muted-foreground">{doctor.speciality ?? "—"} · {doctor.email ?? doctor.phone ?? "no contact"}</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter hospitals..." className="pl-7 text-[12px] bg-white text-slate-800" />
        </div>
        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          title="Show only hospitals in this country"
          className="shrink-0 rounded-md border border-input bg-white text-slate-800 text-[12px] px-2 h-9 max-w-[140px]"
        >
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {cities.length > 0 && (
          <select
            value={effCity}
            onChange={e => setCity(e.target.value)}
            title="Show only hospitals in this city / emirate"
            className="shrink-0 rounded-md border border-input bg-white text-slate-800 text-[12px] px-2 h-9 max-w-[140px]"
          >
            <option value="all">All cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-sidebar-border/50 bg-white/10 px-2 py-1 text-[11px] font-medium text-sidebar-foreground/85 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40"
          >
            {allFilteredSelected ? "Deselect all" : `Select all${q ? " (filtered)" : ""}`}
            {!allFilteredSelected && <span className="text-sidebar-foreground/55">· {filtered.length}</span>}
          </button>
          <span className="text-sidebar-foreground/70">{selectedIds.length} selected</span>
        </div>
        {selectedIds.length > 1 && <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200">BCC mode</Badge>}
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-sidebar-border/40 bg-white overflow-y-auto divide-y aa-scrollbar-hide">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No hospitals match.</div>
        )}
        {filtered.map(h => {
          const checked = selectedIds.includes(h.id);
          return (
            <label key={h.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(h.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate text-slate-800">{h.name?.trim() || "Unnamed hospital"}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[h.city, h.country, h.primary_recruiter_email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="shrink-0">
        <Label className="text-[10px] uppercase tracking-wider text-sidebar-foreground/70">Optional custom message</Label>
        <Textarea
          value={customMessage}
          onChange={e => setCustomMessage(e.target.value)}
          className="mt-1 text-[12px] min-h-[52px] bg-white text-slate-800"
          placeholder="Anything to add to the introduction — context, urgency, etc."
        />
      </div>
    </div>
  );
}

/** Per-hospital recipient line on the send screen: shows the auto-picked
 *  contact (from the hospital's primary/cycle setting) and lets the sender
 *  override it for THIS send. Hidden when no hospital has matched contacts. */
function HospitalRecipientsOverride({ hospitals, contacts, overrides, onOverride }: {
  hospitals: Hospital[];
  contacts: { forHospital: (name: string) => HospitalContact[] };
  overrides: Record<string, string>;
  onOverride: (hospitalId: string, email: string | null) => void;
}) {
  const rows = hospitals.map(h => {
    const hc = contacts.forHospital(h.name);
    const resolved = resolveRecipient(hc, h).contact;
    const override = overrides[h.id];
    const chosen = override ? hc.find(c => c.email?.toLowerCase() === override.toLowerCase()) ?? resolved : resolved;
    return { h, hc, resolved, override, chosen };
  });
  if (!rows.some(r => r.hc.length > 0)) return null;

  return (
    <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-3 space-y-2 shadow-sm text-slate-700">
      <div className="text-[11px] font-medium text-teal-700 flex items-center gap-1.5 flex-wrap">
        <Mail className="h-3.5 w-3.5" /> Hospital recipient{rows.length > 1 ? "s" : ""}
        <span className="text-[10px] font-normal text-muted-foreground">— auto-picked by each hospital's setting; override here for this send only</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ h, hc, resolved, override }) => (
          <div key={h.id} className="flex min-w-0 items-center gap-2 text-[11px]">
            <span className="w-24 shrink-0 truncate font-medium text-slate-700" title={h.name}>{h.name}</span>
            {hc.length === 0 ? (
              <span className="min-w-0 flex-1 truncate text-muted-foreground italic">{h.primary_recruiter_email ?? "no recipient"}</span>
            ) : (
              <>
                <select
                  value={override ?? "__auto__"}
                  onChange={e => onOverride(h.id, e.target.value === "__auto__" ? null : e.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-white px-1.5 text-[11px] text-slate-800"
                >
                  <option value="__auto__">
                    {h.contact_mode === "all"
                      ? `Auto (all ${resolveAllRecipients(hc, h).length}) → ${resolveAllRecipients(hc, h).join(", ") || "—"}`
                      : `Auto (${h.contact_mode === "cycle" ? "cycle" : "primary"}) → ${resolved?.name || resolved?.email || "—"}`}
                  </option>
                  {hc.filter(c => c.email).map(c => (
                    <option key={c.id} value={c.email!}>
                      {c.name || c.email}{c.title ? ` · ${c.title}` : ""}{c.isPrimary ? " · Primary" : ""}
                    </option>
                  ))}
                </select>
                {override && <span className="shrink-0 text-[9px] font-medium text-amber-600">overridden</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Use profile card image" — rasterises the candidate profile card (the
 * View-full-profile look, empty fields dropped) to a flat PNG via html2canvas,
 * uploads it to the public email-card-images bucket, and reports the URL up so
 * the hospital email renders that image ABOVE the data table (both are shown)
 * ({{#doctor_card_image_url}} section). Once captured, shows a thumbnail with
 * Re-capture / Undo. No auto-download (the Save-As dialog was unwanted).
 */
function CardScreenshotControl({
  cardHtml, cardImageUrl, onSetCardImage, autoBusy = false, captureWidth,
}: {
  cardHtml: string;
  cardImageUrl: string | null;
  onSetCardImage: (url: string | null) => void;
  /** The parent is auto-attaching the card (single-doctor sends) — show a
   *  quiet "attaching…" state instead of the manual button. */
  autoBusy?: boolean;
  /** Capture width — the 3:2 profile card is wider than the legacy card. */
  captureWidth?: number;
}) {
  const [busy, setBusy] = useState(false);
  const capture = async () => {
    setBusy(true);
    try {
      const url = await captureAndUploadCard(cardHtml, { width: captureWidth });
      onSetCardImage(url);
      toast.success("Profile card attached — it'll appear above the data table in the email.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the profile image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-attaching (single-doctor send) — quiet status, no button to press.
  if (autoBusy && !cardImageUrl) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>Attaching the profile card image…</span>
      </div>
    );
  }

  if (cardImageUrl) {
    return (
      // Left-aligned + width-capped so it never stretches to the full dialog
      // (where the right edge could be clipped by overflow-x-hidden). min-w-0
      // children truncate instead of pushing the row wide.
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 max-w-[520px] min-w-0">
        <img
          src={cardImageUrl}
          alt="Doctor card screenshot"
          className="h-9 w-16 shrink-0 rounded border border-emerald-200 object-cover object-top"
        />
        <div className="min-w-0 flex-1 text-[11px] leading-tight">
          <div className="flex items-center gap-1 font-medium text-emerald-800">
            <ImageIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Profile card shown above the table</span>
          </div>
          <div className="truncate text-emerald-700/80">Clean card, empty fields dropped · pixel-perfect in any client.</div>
        </div>
        <button type="button" onClick={capture} disabled={busy} className="shrink-0 text-[10px] font-medium text-emerald-700 hover:underline disabled:opacity-50">
          {busy ? "…" : "Re-capture"}
        </button>
        <button type="button" onClick={() => { onSetCardImage(null); toast.message("Reverted — the card will send as HTML."); }} className="shrink-0 text-[10px] text-slate-500 hover:underline">
          Undo
        </button>
      </div>
    );
  }

  return (
    // Auto-width, left-aligned button (NOT w-full): a full-width bar's centered
    // label ran off into the dialog's clipped right edge. inline-flex keeps it
    // compact and tidy under the "Hospital intro email" label.
    <button
      type="button"
      onClick={capture}
      disabled={busy}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-60"
      title="Render the candidate profile card as a clean image (empty fields dropped) and show it above the data table"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Camera className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{busy ? "Building image…" : "Use profile card as image"}</span>
    </button>
  );
}

/**
 * "Generate branded CV" — build the doctor's Allocation-Assist-branded CV from
 * their CV on file (form-response upload), view + edit it, and attach the PDF to
 * this email. Falls back to manual upload inside the dialog when there's no CV
 * on file. Reuses the same studio as the Doctors → Convert CV tab.
 */
function CvStudioControl({ doctor, onAttach }: { doctor: WpCandidate | null; onAttach: (att: EmailAttachment) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
        title="Build the doctor's branded CV from their CV on file, edit it, and attach it to this email"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Generate &amp; attach branded CV</span>
      </button>
      <CvStudioDialog
        open={open}
        onOpenChange={setOpen}
        doctor={doctor}
        cvSourceUrl={doctor?.cv_url}
        onAttach={onAttach}
      />
    </>
  );
}

function PreviewConfirm({
  doctor, hospitals, customMessage, hospitalSubject, hospitalBody, doctorSubject, doctorBody,
  onBack, onClose, onConfirm, submitting, ccList, setCcList, bccList, setBccList,
  templates, hospitalTemplateKey, setHospitalTemplateKey, doctorTemplateKey, setDoctorTemplateKey, onSaveDefault,
  hospitalContacts, recipientOverrides, onOverrideRecipient,
  cardImageUrl, onSetCardImage, onRemoveHospital,
}: {
  doctor: DoctorOption;
  hospitals: Hospital[];
  customMessage: string;
  hospitalSubject: string;
  hospitalBody: string;
  doctorSubject: string;
  doctorBody: string;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (stageOverrides?: Record<string, SendOverrides>, attachments?: { hospital?: EmailAttachment[]; doctor?: EmailAttachment[] }, templateKeys?: { hospital: string; doctor: string }, schedule?: { date: string; time: string }, recipients?: { doctorEmail?: string }, sender?: { assignedTo: string | null }) => void;
  submitting: boolean;
  ccList: string[];
  setCcList: (next: string[]) => void;
  bccList: string[];
  setBccList: (next: string[]) => void;
  templates: import("@/hooks/use-email-templates").EmailTemplate[];
  hospitalTemplateKey: string;
  setHospitalTemplateKey: (k: string) => void;
  doctorTemplateKey: string;
  setDoctorTemplateKey: (k: string) => void;
  onSaveDefault: (which: "hospital" | "doctor", key: string) => void;
  hospitalContacts: { forHospital: (name: string) => HospitalContact[] };
  recipientOverrides: Record<string, string>;
  onOverrideRecipient: (hospitalId: string, email: string | null) => void;
  cardImageUrl: string | null;
  onSetCardImage: (url: string | null) => void;
  onRemoveHospital: (id: string) => void;
}) {
  // Editing is offered for single-hospital sends only — the preview (and the
  // edited HTML) is rendered for one hospital, so reusing it across a BCC
  // batch would bake the wrong hospital's tokens into the others.
  const isSingle = hospitals.length === 1;
  // Per-stage overrides captured from the editable previews (null = unedited).
  const [hospitalOv, setHospitalOv] = useState<SendOverrides | null>(null);
  const [doctorOv,   setDoctorOv]   = useState<SendOverrides | null>(null);
  // Editable recipient for the doctor "working opportunity" email — empty means
  // "send to the doctor's own email" (Mitchell: a field to change where the
  // doctor email is sent). Only editable on single-hospital sends.
  const [doctorEmailOv, setDoctorEmailOv] = useState("");
  // CVs / logbooks to attach — PER EMAIL, so the dispatcher controls exactly
  // which file rides which email. Uploaded to the public email-attachments
  // bucket on pick; the URLs ride along in run metadata (attachments =
  // hospital email, attachments_doctor = doctor email).
  const [hospitalAttachments, setHospitalAttachments] = useState<EmailAttachment[]>([]);
  const [doctorAttachments, setDoctorAttachments]     = useState<EmailAttachment[]>([]);
  // Send now vs schedule for later (Amir #5).
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [schedDate, setSchedDate] = useState<string>(() => localDateInDays(1));
  const [schedTime, setSchedTime] = useState<string>("09:00");
  // Who's on the From line. Allocation Assist is a referral agency — it isn't
  // tied to the hospital — so the DEFAULT sender is the generic company address,
  // "Allocation Assist Team <hello@allocationassist.com>", not a per-hospital
  // "owner". A dispatcher can still pick a specific team member. The chosen email
  // is written to the run's assigned_to; send-flow-email's pickSender turns it
  // into the From line + signature (hello@ is registered there as the AA-team
  // sender, so it resolves to the same label shown here).
  const { user } = useAuth();
  const [senderOverride, setSenderOverride] = useState<string>(AA_TEAM_EMAIL);
  const describeSender = (email: string): string => {
    const s = findSenderByEmail(email);
    return s ? `${s.name} <${s.email}>` : "Allocation Assist Team <hello@allocationassist.com>";
  };
  const senderLine = describeSender(senderOverride);
  // The roster member when a specific person is picked (drives the "replies land
  // in X" note); null for the generic Allocation Assist Team default.
  const sender = findSenderByEmail(senderOverride);
  const senderAssignedTo = senderOverride;

  // Pull the doctor's profile data for the preview. WP candidates are
  // now the source of truth — if the doctor is linked to a WP record
  // we use that; for any field WP doesn't have set, we fall back to
  // the legacy doctor_profiles row so historical data still renders.
  const wpCandidate           = useWpCandidateForDoctor(doctor, { includeDrafts: true });
  const { data: profile }     = useDoctorProfile(doctor.id);
  const mergedProfileTokens: Record<string, string> = useMemo(() => {
    const wpTokens     = wpCandidateToTokens(wpCandidate);
    const legacyTokens = profileToTokens(profile);
    const merged: Record<string, string> = { ...legacyTokens };
    for (const [k, v] of Object.entries(wpTokens)) {
      if (v) merged[k] = v;                // WP wins when populated
      else if (!(k in merged)) merged[k] = "";
    }
    return merged;
  }, [wpCandidate, profile]);
  // Completion %: prefer WP candidate filled-fields ratio; fall back to
  // the legacy profile's completion if no WP record exists. Same helper the
  // picker uses to drop 0%-complete doctors, so the two always agree.
  const profileCompletion = wpCandidate
    ? wpCandidateCompletion(wpCandidate)
    : profile ? calcCompletion(profile) : 0;
  // Which hospital's version of the email to preview (multi-hospital sends give
  // each hospital its own greeting/recipient). Defaults to the first; follows
  // removals so it never points at a dropped hospital.
  const [previewHospitalId, setPreviewHospitalId] = useState<string | null>(hospitals[0]?.id ?? null);
  useEffect(() => {
    if (!hospitals.some(h => h.id === previewHospitalId)) setPreviewHospitalId(hospitals[0]?.id ?? null);
  }, [hospitals, previewHospitalId]);
  const sampleHospital = hospitals.find(h => h.id === previewHospitalId) ?? hospitals[0];

  const vars: Record<string, string> = useMemo(() => {
    // Strip any redundant "Dr." prefix so templates that hard-code "Hi Dr.
    // {{doctor_name}}" don't render "Hi Dr. Dr. Louise Denjean". Prefer
    // the WP candidate's full_name when present (it's the canonical
    // record); fall back to the Zoho-derived name otherwise.
    const rawName = (wpCandidate?.full_name && wpCandidate.full_name.trim()) || doctor.name;
    const cleanedDoctorName = rawName.replace(/^\s*Dr\.?\s+/i, "");
    const v: Record<string, string> = {
      ...mergedProfileTokens,
      doctor_name:        cleanedDoctorName,
      doctor_email:       doctor.email ?? "",
      doctor_phone:       doctor.phone ?? "",
      doctor_speciality:  doctor.speciality ?? "",
      // Country of training: WP/legacy profile wins; else fall back to Zoho's
      // Country_of_Specialty_training so this field still fills for DOB-only doctors.
      doctor_country_training: (mergedProfileTokens.doctor_country_training || doctor.country_training || ""),
      hospital_name:      sampleHospital?.name ?? "",
      // Greeting name honours the per-hospital toggle so the preview matches what
      // send-flow-email will render (contact person when ON + on file, else name).
      hospital_contact_name: (sampleHospital?.greet_with_contact_name && sampleHospital?.primary_contact_name?.trim())
        ? sampleHospital.primary_contact_name
        : (sampleHospital?.name ?? "Team"),
      // city / country come from the hospital record so the doctor email's
      // "Working Opportunity in {{city}}" line resolves in the preview.
      city:               sampleHospital?.city ?? "",
      country:            sampleHospital?.country ?? "",
      // Preview-only URL — the real link is minted at send time by
      // send-flow-email (shared_profile token, ${APP_ORIGIN}/shared-profile/<token>).
      // Use the production app origin here so the preview reads like
      // what hospitals actually receive, not 'aa.example'.
      profile_link:       `https://allocationassist.com/shared-profile/${doctor.id}`,
      // The {{signature}} token is injected by send-flow-email at send time;
      // for the preview we render the same Allocation Assist branded block
      // inline so the doctor-side preview shows it too.
      signature:          PREVIEW_SIGNATURE_HTML,
      signature_text:     PREVIEW_SIGNATURE_TEXT,
    };
    // Build the card + data-table tokens the same way send-flow-email does, so
    // this preview matches the actual send (otherwise they'd show as literal
    // {{doctor_card_html}} / {{doctor_row_table_html}}).
    v.doctor_card_html      = previewDoctorCardHtml(v);
    v.doctor_row_table_html = previewDoctorRowTableHtml(v);
    v.hospital_image        = hospitalImageHtml(sampleHospital?.image_url, sampleHospital?.name);
    // Captured profile-card image URL. The hospital template swaps its data
    // table for this <img> via {{#/^doctor_card_image_url}} when it's set, so
    // the preview reflects exactly what the hospital receives.
    v.doctor_card_image_url = cardImageUrl ?? "";
    return v;
  }, [mergedProfileTokens, doctor, sampleHospital, cardImageUrl]);

  // Auto-attach the profile-card image for SINGLE-doctor sends — the team asked
  // for it to happen automatically instead of a button press. Fires once, once
  // the doctor's profile data has loaded (so the card isn't blank). If it fails,
  // the manual "Use profile card as image" button reappears as a fallback.
  const autoCardTried = useRef(false);
  const [autoCardBusy, setAutoCardBusy] = useState(false);
  const profileLoaded = !!(mergedProfileTokens.doctor_bio || mergedProfileTokens.doctor_title || mergedProfileTokens.doctor_specialty || wpCandidate);
  // The doctor profile IMAGE that ships in the to-hospital email. When the
  // doctor has a WordPress record, use the rich 3:2 landscape profile card;
  // fall back to the old compact card for doctors with no WP profile.
  const profileCardHtml  = wpCandidate ? buildDoctorProfileHtml(wpCandidate) : buildProfileCardHtml(vars);
  const profileCardWidth = wpCandidate ? PROFILE_IMAGE_WIDTH : undefined;
  useEffect(() => {
    if (!isSingle || cardImageUrl || autoCardTried.current || !profileLoaded) return;
    autoCardTried.current = true;
    setAutoCardBusy(true);
    captureAndUploadCard(profileCardHtml, { width: profileCardWidth })
      .then(url => onSetCardImage(url))
      .catch(e => console.warn("[SendProfile] profile card image failed:", e))   // manual button stays available
      .finally(() => setAutoCardBusy(false));
    // vars intentionally omitted from deps — we snapshot it at first-load; adding
    // it would re-fire on every token change. profileLoaded gates the timing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSingle, cardImageUrl, profileLoaded]);

  // The exact emails the team sees. Bodies are wrapped in the same font shell
  // send-flow-email uses, so edits shipped verbatim render like a normal send.
  const renderedHospitalSubject = useMemo(() => renderTemplate(hospitalSubject, vars), [hospitalSubject, vars]);
  const renderedHospitalBody    = useMemo(() => renderTemplate(hospitalBody, vars) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : ""), [hospitalBody, vars, customMessage]);
  const hospitalHtml            = useMemo(() => wrapBodyForSend(renderedHospitalBody), [renderedHospitalBody]);
  const hospitalRecipient       = isSingle ? (hospitals[0].primary_recruiter_email ?? "(no recruiter email)") : `preview: ${sampleHospital?.name ?? "hospital"} · ${hospitals.length} hospitals`;

  const renderedDoctorSubject   = useMemo(() => renderTemplate(doctorSubject, vars), [doctorSubject, vars]);
  const doctorHtml              = useMemo(() => wrapBodyForSend(renderTemplate(doctorBody, vars)), [doctorBody, vars]);

  const anyEdited = !!hospitalOv || !!doctorOv;

  // Draft-template guard: a template whose copy still starts with PLACEHOLDER
  // must not be emailed to a real hospital/doctor. Picking it ships via
  // stage_overrides, which BYPASSES send-flow-email's own placeholder guard, so
  // we block here. Editing the email inline (sets an override) clears the flag,
  // so the team can still send an edited version of a draft template.
  const isPlaceholder = (key: string) =>
    (templates.find(t => t.key === key)?.body_text ?? "").trim().toUpperCase().startsWith("PLACEHOLDER");
  const hospitalDraft = !hospitalOv && isPlaceholder(hospitalTemplateKey);
  const doctorDraft   = !doctorOv   && isPlaceholder(doctorTemplateKey);
  const anyDraft = hospitalDraft || doctorDraft;

  // Unfilled-variable guard: any {{token}} that would render BLANK (e.g. {{city}}
  // when the hospital has no city on file) blocks the send and is explained
  // below — unless the team edited that email inline (override), in which case
  // they've taken control of the copy. Skipped for multi-hospital BCC (per-
  // hospital tokens vary; the render happens server-side per hospital).
  const unfilledIssues = useMemo(() => {
    if (!isSingle) return [];
    const tokens = new Set<string>();
    if (!hospitalOv) for (const t of detectUnfilledVars(`${hospitalSubject}\n${hospitalBody}`, vars)) tokens.add(t);
    if (!doctorOv)   for (const t of detectUnfilledVars(`${doctorSubject}\n${doctorBody}`, vars)) tokens.add(t);
    return describeUnfilled([...tokens]);
  }, [isSingle, hospitalOv, doctorOv, hospitalSubject, hospitalBody, doctorSubject, doctorBody, vars]);
  const hasUnfilled = unfilledIssues.length > 0;

  // Single submit path shared by the footer button and the contextual
  // "Schedule" button inside the schedule card — so the schedule action is
  // reachable right where the team picks the time, not only at the far bottom.
  const submit = () => {
    if (hasUnfilled) {
      toast.error("Some variables are still empty — fill them (or edit the email) before sending.");
      return;
    }
    // Guard the editable recipient fields — a typo'd address would send into the
    // void. Empty doctor override = keep the doctor's own email.
    const doctorEmailTrimmed = doctorEmailOv.trim();
    if (doctorEmailTrimmed && !isEmail(doctorEmailTrimmed)) {
      toast.error("The doctor's email (To) doesn't look like a valid address.");
      return;
    }
    if (isSingle) {
      const hospTo = (recipientOverrides[hospitals[0].id] ?? "").trim();
      if (hospTo && !isEmail(hospTo)) {
        toast.error("The hospital's email (To) doesn't look like a valid address.");
        return;
      }
    }
    // A non-default template pick ships as a stage override too (the rendered
    // template), so single-hospital sends honour the pick with no deploy.
    // Manual edits (hospitalOv/doctorOv) take precedence. Multi-hospital relies
    // on metadata.template_overrides (per-hospital server render).
    const hospitalOverride = hospitalOv
      ?? (isSingle && hospitalTemplateKey !== "profile_sent_hospital"
            ? { subject_override: renderedHospitalSubject, html_override: hospitalHtml } : null);
    const doctorOverride = doctorOv
      ?? (isSingle && doctorTemplateKey !== "profile_sent_doctor"
            ? { subject_override: renderedDoctorSubject, html_override: doctorHtml } : null);
    const stageOverrides: Record<string, SendOverrides> = {
      ...(hospitalOverride ? { email_hospital: hospitalOverride } : {}),
      ...(doctorOverride   ? { email_doctor:   doctorOverride }   : {}),
    };
    onConfirm(
      Object.keys(stageOverrides).length ? stageOverrides : undefined,
      {
        hospital: hospitalAttachments.length ? hospitalAttachments : undefined,
        doctor:   doctorAttachments.length   ? doctorAttachments   : undefined,
      },
      { hospital: hospitalTemplateKey, doctor: doctorTemplateKey },
      sendMode === "later" ? { date: schedDate, time: schedTime } : undefined,
      doctorEmailTrimmed ? { doctorEmail: doctorEmailTrimmed } : undefined,
      { assignedTo: senderAssignedTo },
    );
  };
  // Human-readable local label of the chosen slot, for the schedule button.
  // A cleared/half-typed date or time yields an Invalid Date — Intl.format()
  // THROWS on that, which would crash the whole dialog mid-render, so guard it
  // and gate the schedule action on a valid moment.
  const schedWhen = composeLocalDateTime(schedDate, schedTime);
  const schedValid = !Number.isNaN(schedWhen.getTime());
  const schedLocalLabel = schedValid
    ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(schedWhen)
    : "the selected time";

  // ── Left-rail GLOBAL controls (routing, BCC, send-mode, warnings) ──────────
  const headerExtra = (
    <div className="space-y-3">
      {hospitals.length > 1 && (
        <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-2.5 shadow-sm space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-teal-700">
            <Mail className="h-3.5 w-3.5" /> {hospitals.length} hospitals — click one to preview, ✕ to remove
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {hospitals.map(h => (
              <div
                key={h.id}
                onClick={() => setPreviewHospitalId(h.id)}
                className={`group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${previewHospitalId === h.id ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${previewHospitalId === h.id ? "bg-teal-500" : "bg-slate-300"}`} />
                <span className="flex-1 truncate" title={h.name}>{h.name}</span>
                {previewHospitalId === h.id && <Eye className="h-3 w-3 shrink-0 text-teal-600" />}
                <button
                  type="button"
                  title={`Remove ${h.name} from this send`}
                  className="shrink-0 text-slate-300 hover:text-rose-600"
                  onClick={(e) => { e.stopPropagation(); onRemoveHospital(h.id); }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <HospitalRecipientsOverride
        hospitals={hospitals}
        contacts={hospitalContacts}
        overrides={recipientOverrides}
        onOverride={onOverrideRecipient}
      />
      <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-3 text-[12px] space-y-1 shadow-sm text-slate-700">
        <div><strong>{doctor.name}</strong> → {hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}</div>
        <div className="text-[11px] text-muted-foreground">
          One run per hospital will be created in Flow 2. Hospital + doctor emails fire automatically on confirm.
        </div>
        <div className="text-[11px] text-muted-foreground pt-1 border-t border-slate-200/70 mt-1.5 space-y-1.5">
          {/* Sender picker — the From line the recipient sees. Defaults to the
              generic Allocation Assist Team address; pick a person to send as
              them instead. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>Sending as:</span>
            <select
              value={senderOverride}
              onChange={(e) => setSenderOverride(e.target.value)}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 max-w-full"
            >
              <option value={AA_TEAM_EMAIL}>Allocation Assist Team &lt;{AA_TEAM_EMAIL}&gt;</option>
              {AA_SENDERS.map(s => (
                <option key={s.email} value={s.email}>{s.name} &lt;{s.email}&gt;</option>
              ))}
            </select>
          </div>
          <div className="text-[10.5px] text-slate-500">
            Goes out as <span className="font-medium text-slate-700">{senderLine}</span>
          </div>

          {/* CC + BCC — free-form on every send; AA team offered as BCC quick-adds
              and Amir as a CC quick-add. Defaults to BCC'ing the sender. */}
          <CcBccPicker
            cc={ccList}
            bcc={bccList}
            onCcChange={setCcList}
            onBccChange={setBccList}
            bccRoster={AA_SENDERS.map(s => ({ name: s.name, email: s.email }))}
            ccRoster={[{ name: "Amir", email: CC_AMIR_EMAIL }]}
          />

          {sender ? (
            <div className="text-[10.5px] text-emerald-700">
              Replies land in <span className="font-mono">{sender.email}</span>.
            </div>
          ) : (
            <div className="text-[10.5px] text-slate-500">
              Sends from the company address; replies land in <span className="font-mono">{AA_TEAM_EMAIL}</span>. Pick a team member above to send as a specific person.
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

      <div className="text-[10.5px] text-sidebar-foreground/65 px-0.5">
        {!isSingle
          ? "Editing is available when sending to a single hospital (a shared edit can't be reused across a BCC batch)."
          : anyEdited
            ? <span className="text-emerald-300 font-medium">You've edited {hospitalOv && doctorOv ? "both emails" : hospitalOv ? "the hospital email" : "the doctor email"} — your version sends instead of the template.</span>
            : "Click into either email to tweak the wording before it sends."}
      </div>

      {/* Schedule details — only when "Schedule for later" is picked in the
          footer action; the now-vs-later choice itself lives in the footer. */}
      {sendMode === "later" && (
        <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-2.5 space-y-2 shadow-sm text-slate-700">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-teal-700"><Clock className="h-3.5 w-3.5" /> Schedule this send</div>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</span><Input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className="h-8 text-[12px] w-[150px] bg-white text-slate-800" /></div>
            <div className="space-y-1"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Time (your local time)</span><Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="h-8 text-[12px] w-[120px] bg-white text-slate-800" /></div>
            <div className="pb-1.5">{schedValid ? <GulfClock when={schedWhen} /> : <span className="text-[10px] text-rose-600">Enter a valid date &amp; time</span>}</div>
          </div>
          <p className="text-[10px] text-teal-700">Lands in the scheduled queue and sends automatically at the time you picked (your local time, checked every ~5 min). Manage it any time under <strong>Batches → Scheduled profile sends</strong>.</p>
        </div>
      )}

      {hospitals.some(h => !h.primary_recruiter_email) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <strong>Warning:</strong> {hospitals.filter(h => !h.primary_recruiter_email).length} of the selected hospitals don't have a recruiter email on file. Those runs will be queued but won't send until the email is added in the Hospitals tab.
        </div>
      )}

      {anyDraft && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-900 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
          <div>
            The <strong>{hospitalDraft && doctorDraft ? "hospital and doctor templates" : hospitalDraft ? "hospital template" : "doctor template"}</strong> still {hospitalDraft && doctorDraft ? "contain" : "contains"} placeholder copy (<code>PLACEHOLDER…</code>). Pick a finished template, or click into the email to edit the wording before sending.
          </div>
        </div>
      )}

      {hasUnfilled && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            <div>
              <strong>Can't send yet — {unfilledIssues.length} variable{unfilledIssues.length === 1 ? "" : "s"} {unfilledIssues.length === 1 ? "is" : "are"} empty</strong> and would leave a blank in the email. Fill {unfilledIssues.length === 1 ? "it" : "them"} on the record (or edit the email copy), then it sends.
            </div>
          </div>
          <ul className="space-y-1 pl-1">
            {unfilledIssues.map(i => (
              <li key={i.token} className="flex flex-wrap items-baseline gap-x-1.5">
                <code className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">{`{{${i.token}}}`}</code>
                <span>— {i.reason}{i.where ? <> · <span className="text-amber-700">fix in {i.where}</span></> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // ── The two emails: switcher label + left-rail controls + right-pane preview.
  const emails: StudioEmail[] = [
    {
      key: "hospital",
      label: "Hospital intro",
      subLabel: hospitalRecipient,
      controls: (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <TemplatePicker templates={templates} value={hospitalTemplateKey} onChange={setHospitalTemplateKey} defaultKey="profile_sent_hospital" renderVars={vars} label="Hospital intro email template" flowFilter="profile_sent" audience="hospital" />
            </div>
            {hospitalTemplateKey !== "profile_sent_hospital" && (
              <button type="button" onClick={() => { onSaveDefault("hospital", hospitalTemplateKey); toast.success("Saved as your default hospital template"); }} className="text-[10px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline whitespace-nowrap mt-4">Save as my default</button>
            )}
          </div>
          {/* Profile-as-image: render the candidate profile card (View-full-profile
              look, empty fields dropped) to a flat PNG and show it ABOVE the data
              table (both render), so the hospital sees a clean, pixel-perfect card
              plus the full detail table. */}
          <CardScreenshotControl
            cardHtml={profileCardHtml}
            captureWidth={profileCardWidth}
            cardImageUrl={cardImageUrl}
            onSetCardImage={onSetCardImage}
            autoBusy={autoCardBusy}
          />
          <CvStudioControl
            doctor={wpCandidate}
            onAttach={(att) => setHospitalAttachments(prev => [...prev, att])}
          />
          <AttachmentsPicker
            attachments={hospitalAttachments}
            onChange={setHospitalAttachments}
            disabled={submitting}
            hint="ride on THIS hospital email — CV, logbook, etc."
          />
        </div>
      ),
      preview: autoCardBusy ? (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 bg-white text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
          <span className="text-[12px]">Preparing the profile card image…</span>
        </div>
      ) : (
        <EditableEmailSection
          label={`To hospital · ${hospitalRecipient}`}
          subject={renderedHospitalSubject}
          html={hospitalHtml}
          from={senderLine}
          to={isSingle ? (recipientOverrides[hospitals[0].id] ?? hospitals[0].primary_recruiter_email ?? "") : undefined}
          onToChange={isSingle ? (v) => onOverrideRecipient(hospitals[0].id, v.trim() ? v.trim() : null) : undefined}
          cc={ccList}
          bcc={bccList}
          editable={isSingle}
          onChange={setHospitalOv}
          plainBody={renderedHospitalBody}
          attachments={hospitalAttachments}
          onAttachmentsChange={setHospitalAttachments}
          templatePicker={
            <TemplatePicker
              templates={templates}
              value={hospitalTemplateKey}
              onChange={setHospitalTemplateKey}
              defaultKey="profile_sent_hospital"
              renderVars={vars}
              label="Hospital intro email template"
              flowFilter="profile_sent"
              audience="hospital"
              contentClassName="z-[200]"
            />
          }
        />
      ),
    },
    {
      key: "doctor",
      label: "Doctor email",
      subLabel: doctor.email ?? "(no email)",
      controls: (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <TemplatePicker templates={templates} value={doctorTemplateKey} onChange={setDoctorTemplateKey} defaultKey="profile_sent_doctor" renderVars={vars} label="Doctor 'working opportunity' email template" flowFilter="profile_sent" audience="doctor" />
            </div>
            {doctorTemplateKey !== "profile_sent_doctor" && (
              <button type="button" onClick={() => { onSaveDefault("doctor", doctorTemplateKey); toast.success("Saved as your default doctor template"); }} className="text-[10px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline whitespace-nowrap mt-4">Save as my default</button>
            )}
          </div>
          <AttachmentsPicker
            attachments={doctorAttachments}
            onChange={setDoctorAttachments}
            disabled={submitting}
            hint="ride on THIS doctor email — usually none"
          />
        </div>
      ),
      preview: (
        <EditableEmailSection
          label={`To doctor · ${doctorEmailOv || doctor.email || "(no email)"}`}
          subject={renderedDoctorSubject}
          html={doctorHtml}
          from={senderLine}
          to={isSingle ? (doctorEmailOv || doctor.email || "") : (doctor.email ?? undefined)}
          onToChange={isSingle ? setDoctorEmailOv : undefined}
          cc={ccList}
          bcc={bccList}
          editable={isSingle}
          onChange={setDoctorOv}
          plainBody={renderTemplate(doctorBody, vars)}
          attachments={doctorAttachments}
          onAttachmentsChange={setDoctorAttachments}
          // Same picker as the left rail, forwarded into the full-screen editor
          // so the doctor template can be swapped from full screen too. Popover
          // raised above the full-screen overlay via contentClassName.
          templatePicker={
            <TemplatePicker
              templates={templates}
              value={doctorTemplateKey}
              onChange={setDoctorTemplateKey}
              defaultKey="profile_sent_doctor"
              renderVars={vars}
              label="Doctor 'working opportunity' email template"
              flowFilter="profile_sent"
              audience="doctor"
              contentClassName="z-[200]"
            />
          }
        />
      ),
    },
  ];

  // The now-vs-schedule choice IS the send action (no separate Queue button):
  // in the default state, "Schedule for later" flips to scheduling mode
  // (revealing the date/time card) and "Send now" fires immediately; once
  // scheduling, the primary becomes "Schedule N sends" with a way back.
  const sendCount = `${hospitals.length} send${hospitals.length === 1 ? "" : "s"}`;
  // Icon-only actions: clock = schedule, paper-plane = send now.
  const footer = sendMode === "later" ? (
    <>
      <Button variant="outline" onClick={onBack} disabled={submitting} className="mr-auto">
        <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setSendMode("now")} disabled={submitting} className="text-slate-600 hover:text-slate-800" title={`Send now instead · ${sendCount}`}>
        <Send className="h-4 w-4" />
      </Button>
      <Button size="icon" onClick={submit} disabled={submitting || anyDraft || hasUnfilled || !schedValid}
        title={anyDraft ? "Pick a finished template or edit the copy first." : hasUnfilled ? "Fill the blank variables below (or edit the email) before scheduling." : !schedValid ? "Enter a valid date and time first." : `Schedule ${sendCount}`}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onBack} disabled={submitting} className="mr-auto">
        <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
      </Button>
      <Button variant="outline" size="icon" onClick={() => setSendMode("later")} disabled={submitting} title="Schedule for later">
        <Clock className="h-4 w-4" />
      </Button>
      <Button size="icon" onClick={submit} disabled={submitting || anyDraft || hasUnfilled}
        title={anyDraft ? "Pick a finished template or edit the copy first — the selected template still has placeholder text." : hasUnfilled ? "Fill the blank variables below (or edit the email) before sending." : `Send now · ${sendCount}`}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </>
  );

  return (
    <EmailPreviewStudioLayout
      onClose={onClose}
      title="Send Profile to Hospital"
      subtitle={`${doctor.name} → ${hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}`}
      emails={emails}
      headerExtra={headerExtra}
      footer={footer}
    />
  );
}

// Preview-side mirror of the server's signatureHtml() in
// supabase/functions/send-flow-email/index.ts. Kept in sync so the
// dashboard preview shows the same sans-serif signature + logo
// block the recipient will see, rather than a literal `{{signature}}`
// token. When the server-side signature changes, update both.
const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
// Mirrors the server's FONT_STACK (Garamond) + bumped sizes so the preview
// reads exactly like the sent email. Keep in sync with send-flow-email.
const PREVIEW_FONT    = `Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif`;
const PREVIEW_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_FONT};font-size:16px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:16px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_FONT};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:16px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_FONT};">The Allocation Assist team</p>
<p style="color:#475569;font-size:15px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_FONT};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:15px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_FONT};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr>
    <td style="padding:0;">
      <img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" />
    </td>
  </tr>
</table>`;
const PREVIEW_SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com

`;

function escPreview(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Strip HTML to plain text — WP's Area of Interest field often holds Google-Docs
 *  paste markup. Mirrors htmlToText() in send-flow-email. The caller escPreview()s
 *  the result. */
function htmlToTextPreview(s: string): string {
  if (!s) return "";
  let t = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  t = t
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'").replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—").replace(/&ndash;/gi, "–").replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_m, n) => { const c = parseInt(n, 10); return c ? String.fromCharCode(c) : ""; });
  return t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Preview-side mirror of send-flow-email's doctorCardHtml() — the WordPress-
 *  style profile card (teal photo sidebar + bio panel + highlight facts +
 *  buttons), in the website's Poppins font. Keep in sync with the server. */
const PREVIEW_CARD_FONT = `'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
function previewDoctorCardHtml(v: Record<string, string>): string {
  const name      = (v.doctor_name  || "Candidate").trim();
  const title     = (v.doctor_title || "").trim();
  const specialty = (v.doctor_specialty || "").trim();
  const phone     = (v.doctor_phone || "").trim();
  const email     = (v.doctor_email || "").trim();
  const photo     = (v.doctor_photo_url || "").trim();
  const bioRaw    = (v.doctor_bio || v.doctor_area_of_interest || "").trim();
  const bio       = bioRaw ? escPreview(htmlToTextPreview(bioRaw)).replace(/\r?\n+/g, "<br>") : "";

  const photoImg = photo
    ? `<img src="${escPreview(photo)}" alt="${escPreview(name)}" width="112" height="112" style="display:block;margin:0 auto 14px;width:112px;height:112px;border-radius:50%;border:3px solid rgba(255,255,255,0.9);object-fit:cover;" />`
    : "";
  const sectorPill = specialty ? `<div style="display:inline-block;margin-top:10px;background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 13px;font-size:12px;color:#ffffff;">${escPreview(specialty)}</div>` : "";
  const contactBlock = (phone || email) ? `
          <div style="border-top:1px solid rgba(255,255,255,0.28);margin-top:16px;padding-top:13px;text-align:left;">
            ${phone ? `<div style="font-size:12px;margin-bottom:7px;color:#ffffff;"><span style="opacity:0.85;">&#9742;</span> ${escPreview(phone)}</div>` : ""}
            ${email ? `<div style="font-size:12px;word-break:break-all;color:#ffffff;"><span style="opacity:0.85;">&#9993;</span> ${escPreview(email)}</div>` : ""}
          </div>` : "";

  const facts: Array<[string, string]> = [
    ["Subspecialty",         v.doctor_subspecialty],
    ["Title / rank",         v.doctor_rank && v.doctor_rank !== title ? v.doctor_rank : ""],
    ["Country of training",  v.doctor_country_training],
    ["Years of experience",  v.doctor_years_experience],
    ["Current location",     v.doctor_current_location],
    ["Targeted locations",   v.doctor_targeted_locations],
    ["Nationality",          v.doctor_nationality],
    ["Age",                  v.doctor_age],
    ["Date of birth",        v.doctor_dob],
    ["Marital status",       v.doctor_marital_status],
    ["Family status",        v.doctor_family_status && v.doctor_family_status !== v.doctor_marital_status ? v.doctor_family_status : ""],
    ["Languages",            v.doctor_languages],
    ["English level",        v.doctor_english_level],
    ["UAE license",          v.doctor_license],
    ["License types",        v.doctor_license_types && v.doctor_license_types !== v.doctor_license ? v.doctor_license_types : ""],
    ["Salary expectation",   v.doctor_salary_expectation || "Market Range"],
    ["Notice period",        v.doctor_notice_period],
  ];
  const ICON_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/icons`;
  const FACT_ICON: Record<string, string> = {
    "Subspecialty": "activity", "Title / rank": "badge", "Country of training": "graduation-cap",
    "Years of experience": "calendar-days", "Current location": "map-pin", "Targeted locations": "target",
    "Nationality": "globe", "Age": "id-card", "Date of birth": "calendar", "Marital status": "heart",
    "Family status": "users", "Languages": "languages", "English level": "book-open",
    "UAE license": "award", "License types": "badge-check", "Salary expectation": "banknote",
    "Notice period": "clipboard-check",
  };
  const factTiles = facts
    .filter(([, val]) => val && val.trim() && val.trim() !== "—")
    .map(([label, val]) => `
              <td width="33%" valign="top" style="padding:14px 16px 14px 0;font-family:${PREVIEW_CARD_FONT};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="52" valign="top">
                    <div style="width:44px;height:44px;border-radius:50%;background:#f1f5f9;text-align:center;line-height:44px;">
                      <img src="${ICON_BASE}/${FACT_ICON[label] ?? "badge"}.png" width="22" height="22" alt="" style="vertical-align:middle;border:0;" />
                    </div>
                  </td>
                  <td valign="top" style="padding-left:12px;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;font-weight:600;">${escPreview(label)}</div>
                    <div style="font-size:14px;color:#1a2332;font-weight:500;margin-top:2px;">${escPreview(val.trim())}</div>
                  </td>
                </tr></table>
              </td>`);
  const factTileRows: string[] = [];
  for (let i = 0; i < factTiles.length; i += 3) factTileRows.push(`<tr>${factTiles[i]}${factTiles[i + 1] ?? '<td width="33%"></td>'}${factTiles[i + 2] ?? '<td width="33%"></td>'}</tr>`);
  const factsBlock = factTileRows.length
    ? `<tr><td colspan="2" style="background:#f8fafc;border-top:1px solid #eef2f7;padding:10px 26px 18px;font-family:${PREVIEW_CARD_FONT};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody>${factTileRows.join("")}</tbody></table>
      </td></tr>`
    : "";

  const bioBlock = bio
    ? `<div style="font-size:16px;font-weight:700;color:#0f766e;margin-bottom:10px;">Specific areas of interests within the specialization</div>
          <div style="font-size:15px;color:#334155;line-height:1.6;">${bio}</div>`
    : `<div style="font-size:16px;font-weight:700;color:#0f766e;">${escPreview(title || specialty || name)}</div>`;

  const buttons: string[] = [];
  const profileUrl = (v.profile_url || v.profile_link || v.doctor_wp_link || "").trim();
  if (profileUrl) buttons.push(`<a href="${escPreview(profileUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px;">View full profile &rarr;</a>`);
  const cvUrl = (v.doctor_cv_url || "").trim();
  if (cvUrl) buttons.push(`<a href="${escPreview(cvUrl)}" style="display:inline-block;color:#0f766e;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border:1px solid #0f766e;border-radius:8px;">View CV</a>`);
  const buttonsHtml = buttons.length ? `<div style="margin:14px 0 6px;font-family:${PREVIEW_CARD_FONT};">${buttons.join(`<span style="display:inline-block;width:10px;"></span>`)}</div>` : "";

  return `
<div style="font-family:${PREVIEW_CARD_FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:1040px;margin:20px 0 0;font-family:${PREVIEW_CARD_FONT};">
  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;border:1px solid #d1f0ec;border-radius:14px;overflow:hidden;background:#ffffff;">
      <tr>
        <td width="240" valign="top" bgcolor="#0f766e" style="width:240px;font-family:${PREVIEW_CARD_FONT};background:#0f766e;background:linear-gradient(160deg,#0f766e,#14b8a6);padding:26px 20px;text-align:center;color:#ffffff;">
          ${photoImg}
          <div style="font-size:19px;font-weight:700;line-height:1.3;color:#ffffff;">${escPreview(name)}</div>
          ${title ? `<div style="font-size:13px;opacity:0.92;margin-top:4px;color:#ffffff;">${escPreview(title)}</div>` : ""}
          ${sectorPill}
          ${contactBlock}
        </td>
        <td valign="top" style="padding:24px 26px;background:#ffffff;font-family:${PREVIEW_CARD_FONT};">
          ${bioBlock}
        </td>
      </tr>
      ${factsBlock}
    </table>
  </td></tr>
</table>
${buttonsHtml}
</div>`;
}

/** Preview-side mirror of send-flow-email's doctorRowTableHtml() — the full
 *  data row under the card, minus Area of Interest. Keep in sync. */
// Hospital photo <img> for the working-opportunity preview — mirrors the
// {{hospital_image}} token send-flow-email builds from the hospital's image_url.
function hospitalImageHtml(url: string | null | undefined, name: string | null | undefined): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<img src="${esc(u)}" alt="${esc(name ?? "Hospital")}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`;
}

// Mirrors send-flow-email's doctorRowTableHtml — the wide "Available Doctor
// Format" table with the GREEN (teal) header, wrapped in an overflow-x:auto box
// so it scrolls sideways. Kept 1:1 with the server so the preview matches the
// delivered email.
function previewDoctorRowTableHtml(v: Record<string, string>): string {
  const cols: Array<[string, string]> = [
    ["#", "1"],
    ["Name", v.doctor_name || ""],
    ["Title and Specialty as per the UAE license", v.doctor_title || ""],
    ["Area of Interest", v.doctor_area_of_interest || ""],
    ["Country Of Training", v.doctor_country_training || ""],
    ["Years of Experience", v.doctor_years_experience || ""],
    ["Nationality", v.doctor_nationality || ""],
    ["Age", v.doctor_age || ""],
    ["Marital Status", v.doctor_marital_status || ""],
    ["Family Status", v.doctor_family_status || ""],
    ["UAE license type / Status", v.doctor_license || ""],
    ["Salary Expectation", v.doctor_salary_expectation || "Market Range"],
    ["Notice Period", v.doctor_notice_period || ""],
    ["Mobile", v.doctor_phone || ""],
    ["Email", v.doctor_email || ""],
  ];
  const th = cols.map(([h]) => `<th style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;background:#0f766e;color:#ffffff;font-size:13px;font-weight:600;white-space:nowrap;">${escPreview(h)}</th>`).join("");
  const td = cols.map(([, val]) => `<td style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;font-size:14px;color:#1a2332;vertical-align:top;">${escPreview(val)}</td>`).join("");
  return `
<div style="overflow-x:auto;margin:18px 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #cbd5e1;">
    <thead><tr>${th}</tr></thead>
    <tbody><tr>${td}</tr></tbody>
  </table>
</div>`;
}

/** True when the string is recognisably HTML (has at least one tag). The
 *  preview block flips into iframe-render mode for these so we don't
 *  show raw `<p>` tags in monospace. */
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

/** One email in the preview step. When `editable`, shows the WYSIWYG
 *  EditableEmailPreview + Edit/Reset controls and reports the team's edits up
 *  via onChange (null = unedited). When not (multi-hospital BCC), falls back to
 *  the compact read-only PreviewBlock. Used for both the hospital and the
 *  doctor email so either can be edited before sending. */
function EditableEmailSection({
  label, subject, html, plainBody, from, to, onToChange, cc, bcc, editable, onChange,
  attachments, onAttachmentsChange, templatePicker,
}: {
  label:     string;
  subject:   string;   // pristine rendered subject
  html:      string;   // pristine wrapped HTML (what ships if unedited)
  plainBody: string;   // pristine body for the read-only fallback
  from?:     string;
  to?:       string;
  /** When set (and editable), the To becomes an editable field — retype the
   *  recipient address before sending. */
  onToChange?: (v: string) => void;
  /** Extra recipients echoed in the preview header so they're visibly
   *  confirmed (the BCC-not-reflected fix). */
  cc?:       string[];
  bcc?:      string[];
  editable:  boolean;
  onChange:  (ov: SendOverrides | null) => void;
  attachments?:        EmailAttachment[];
  onAttachmentsChange?: (next: EmailAttachment[]) => void;
  /** Optional template picker forwarded to the full-screen editor (doctor
   *  email only) so the template can be swapped from full screen too. */
  templatePicker?:     React.ReactNode;
}) {
  // Show unfilled {{tokens}} as friendly placeholder pills in the preview, but
  // report clean {{tokens}} back up so the SENT email is byte-identical — the
  // pills never leave the display (stripPlaceholderPills is the exact reverse).
  const displayHtml = useMemo(() => humanizePlaceholders(html), [html]);
  const [subj, setSubj] = useState(subject);
  const [body, setBody] = useState(displayHtml);
  const [tick, setTick] = useState(0);

  // Re-seed from the pristine render when it changes (profile data finished
  // loading, hospital changed). Settles before the user interacts, so it won't
  // clobber a real edit. Runs only when the actual string changes.
  useEffect(() => {
    setSubj(subject);
    setBody(displayHtml);
    setTick(t => t + 1);
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, displayHtml]);

  const report = (s: string, b: string) => {
    const cleanB = stripPlaceholderPills(b);
    onChange((s !== subject || cleanB !== html) ? { subject_override: s, html_override: cleanB } : null);
  };
  const edited = subj !== subject || body !== displayHtml;

  if (!editable) {
    return <PreviewBlock label={label} subject={subject} body={plainBody} />;
  }

  // Fills the studio's white right island flat (its own body scrolls).
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="px-3 py-1.5 border-b bg-slate-50/50 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
        <Eye className="h-3 w-3 shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <EditableEmailPreview
        subject={subj}
        html={displayHtml}
        onSubjectChange={(v) => { setSubj(v); report(v, body); }}
        onHtmlChange={(v) => { setBody(v); report(subj, v); }}
        resetKey={tick}
        edited={edited}
        onReset={() => { setSubj(subject); setBody(displayHtml); setTick(t => t + 1); onChange(null); }}
        from={from}
        to={to}
        onToChange={onToChange}
        cc={cc}
        bcc={bcc}
        text={plainBody}
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
        templatePicker={templatePicker}
        className="border-0 rounded-none flex-1 min-h-0"
      />
    </div>
  );
}

function PreviewBlock({ label, subject, body }: { label: string; subject: string; body: string }) {
  const isHtml = looksLikeHtml(body);
  // Flat — fills the studio's white right island (multi-hospital BCC read-only).
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white text-slate-800">
      <div className="px-3 py-1.5 border-b bg-slate-50/50 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
        <Eye className="h-3 w-3" /> {label}
      </div>
      <div className="p-3 space-y-2 min-h-0 flex-1 overflow-y-auto">
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
  return (
    <EmailFrame
      html={humanizePlaceholders(html)}
      minHeight={140}
      maxHeight={480}
      style={{ border: "1px solid hsl(var(--border))", borderRadius: 6 }}
    />
  );
}


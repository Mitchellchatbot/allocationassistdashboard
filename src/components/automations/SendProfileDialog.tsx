import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Send, Eye, ChevronLeft, AlertTriangle, ChevronDown, Copy, Check } from "lucide-react";
import { captureAndUploadCard } from "@/lib/card-screenshot";
import { buildProfileCardHtml } from "@/lib/profile-card-html";
import { buildDoctorProfileHtml, PROFILE_IMAGE_WIDTH } from "@/lib/doctor-profile-image";
import { toast } from "sonner";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { useAuth } from "@/hooks/use-auth";
import { AA_SENDERS, findSenderByEmail } from "@/lib/hi-team";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { useHospitals, useUpdateHospital, isHospitalPaused, hospitalAllowsSpecialty, type Hospital } from "@/hooks/use-hospitals";
import { useHospitalContacts, resolveRecipient, resolveAllRecipients, type HospitalContact } from "@/hooks/use-hospital-contacts";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { useDoctorProfile, useDoctorProfiles, profileToTokens, calcCompletion, type DoctorProfile } from "@/hooks/use-doctor-profiles";
import { useWpCandidateForDoctor, usePublishedWpCandidates, useWpCandidates, wpCandidateToTokens, normalizePhone, type WpCandidate } from "@/hooks/use-wp-candidates";
import { useZohoData, type ZohoDoctorOnBoard, type ZohoLead } from "@/hooks/use-zoho-data";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { humanizePlaceholders, stripPlaceholderPills, blankUnfilledTokens, STRUCTURAL } from "@/lib/humanize-placeholders";
import { EmailPreviewStudioLayout, type StudioEmail } from "@/components/EmailPreviewStudio";
import { ProfileSubTabs } from "@/components/ProfileSubTabs";
import { MailModeBanner } from "@/components/MailModeBanner";
import { EmailFrame } from "@/components/EmailFrame";
import { wrapBodyForSend } from "@/lib/email-preview";
import { buildWorkingOpBody, buildWorkingOpSubject, type WorkingOpHospital } from "@/lib/doctor-working-op";
import { type EmailAttachment } from "@/lib/email-attachments";
import { normCountry, countryFilterOptions, canonicalCountryLabel } from "@/lib/normalize-country";
import { resolveHospitalRegion } from "@/lib/hospital-region";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import { CardScreenshotControl, CvStudioControl } from "@/components/automations/ProfileCardControls";
import { HospitalRecipientsPanel } from "@/components/automations/HospitalRecipientsPanel";
import { TemplatePicker } from "@/components/automations/TemplatePicker";
import { CcBccPicker, isEmail, makeHospitalFlag } from "@/components/automations/CcBccPicker";
import { detectUnfilledVars, describeUnfilled } from "@/lib/email-validation";
import { useScheduleProfileSend } from "@/hooks/use-scheduled-profile-sends";
import { GulfClock, composeLocalDateTime, localToGulfParts, localDateInDays } from "@/components/GulfClock";
import { Clock, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

// Persisted per-recruiter template preference (Amir #3 "save as my default").
const HOSPITAL_DEFAULT_KEY = "profile_sent_hospital";
const DOCTOR_DEFAULT_KEY   = "profile_sent_doctor";
// Stable empty-array reference so the per-doctor attachment default doesn't churn
// the AttachmentsPicker props on every render.
const EMPTY_ATTACHMENTS: EmailAttachment[] = [];

// Key for a per-(doctor, hospital) hospital-intro edit. Each hospital's intro
// email is edited independently (its greeting names that hospital), so a
// hand-edit is stored against the doctor+hospital pair, never fanned across all.
const pairKey = (doctorId: string, hospitalId: string) => `${doctorId}::${hospitalId}`;

// Map a hospital → the WorkingOpHospital the consolidated doctor email groups by.
// Country/city are normalised + backfilled so the location grouping doesn't
// split: a hospital's own country wins (canonicalised so "KSA" ≡ "Saudi Arabia"),
// else the region resolver infers it from the name (so a hospital with a blank
// country doesn't fall into the "In these locations:" catch-all). Used for BOTH
// the preview and the stamped send-metadata so they render identically.
function toWorkingOpHospital(h: {
  name: string; city?: string | null; country?: string | null; image_url?: string | null; website?: string | null;
}): WorkingOpHospital {
  const reg = resolveHospitalRegion(h.name);
  return {
    name:      h.name,
    city:      (h.city?.trim() || reg.city || null),
    country:   (canonicalCountryLabel(h.country) || reg.country || null),
    image_url: h.image_url ?? null,
    link:      h.website ?? null,
  };
}
// Drop doctors with no files from a per-doctor attachment map; returns undefined
// when nobody attached anything (buildRuns treats that as "no attachments").
function pruneEmptyAttachments(
  byDoctor: Record<string, EmailAttachment[]>,
): Record<string, EmailAttachment[]> | undefined {
  const out: Record<string, EmailAttachment[]> = {};
  for (const [id, files] of Object.entries(byDoctor)) {
    if (files && files.length) out[id] = files;
  }
  return Object.keys(out).length ? out : undefined;
}
// Build a DISPLAY-only var map: drop empty non-structural values so renderTemplate
// leaves those tokens as {{token}} → humanizePlaceholders shows a red "empty field"
// pill in the preview. The SENT copy is either server-rendered (multi-hospital) or
// run through blankUnfilledTokens (single-hospital picks / hand-edits), so a raw
// {{token}} never reaches a recipient. Structural tokens are kept (filled at send).
function displayVarsOf(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v === "" && !STRUCTURAL.has(k)) continue;
    out[k] = v;
  }
  return out;
}
// Turn a RENDERED (hand-edited) email back into a {{token}} template by swapping
// THIS pair's concrete values for their tokens — so the same wording can be
// re-rendered for a DIFFERENT doctor/hospital WITHOUT carrying the first one's
// details over (that's the "clone edit to all, don't garble" button). Longest
// values first (so "Dr. Feras Ali" is swapped before "Feras"), and values under
// 4 chars are skipped so a stray "UAE"/"Oman" in prose isn't mangled. The big
// raw-HTML tokens (doctor_card_html, doctor_row_table_html, hospital_image) are
// unique blocks, so swapping them cleanly re-cards each email for its own doctor.
// The first "Hello …!" / "Hello …," greeting line — used to keep each pair's own
// greeting when cloning a body edit across pairs.
const GREETING_RE = /Hello[\s\S]{0,140}?[!,]/i;
function retokenizeEmail(html: string, vars: Record<string, string | number | null | undefined>): string {
  const entries = Object.entries(vars)
    .map(([k, v]) => [k, typeof v === "string" ? v : (v == null ? "" : String(v))] as const)
    .filter(([, v]) => v.trim().length >= 4)
    .sort((a, b) => b[1].length - a[1].length);
  let out = html;
  for (const [token, value] of entries) {
    if (out.includes(value)) out = out.split(value).join(`{{${token}}}`);
  }
  return out;
}
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
  // MULTI-doctor: 1..N doctors per send, each gets their own personalized
  // email(s). Single-doctor (the common case + vacancy pre-fill) is just N=1 and
  // behaves byte-for-byte as before. `selectedDoctors` is derived from the ids so
  // it always tracks the loaded roster.
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
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
  // the hospital email instead of the {{doctor_card_html}} block. One image PER
  // DOCTOR → applies to every hospital that doctor is sent to. Captured on demand
  // (or auto) from the preview. Keyed by doctor.id so each doctor has their own.
  const [cardImageByDoctor, setCardImageByDoctor] = useState<Record<string, string | null>>({});
  const setCardImageForDoctor = useCallback((doctorId: string, url: string | null) => {
    setCardImageByDoctor(prev => ({ ...prev, [doctorId]: url }));
  }, []);
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
  // would reset step/selectedDoctorIds and wipe out a vacancy pre-fill that already
  // jumped to the preview (the "flash then back to zero" bug).
  useEffect(() => {
    setStep("pick-doctor");
    setSelectedDoctorIds([]);
    setSelectedIds([]);
    setCustomMessage("");
    setHospitalTemplateKey(loadDefaultTemplate("hospital"));
    setDoctorTemplateKey(loadDefaultTemplate("doctor"));
    setCardImageByDoctor({});
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

  // Resolve a doctor to their WP candidate the SAME way useWpCandidateForDoctor
  // does (id → wp:id → phone → email → unique name), but off the already-loaded
  // completionIndex — no per-doctor hook. This is the single resolver shared by
  // completionFor (picker filter) AND sendDataByDoctor (preview token merge), so
  // the two can never disagree about which record a doctor maps to.
  const resolveWpCandidate = useCallback((o: DoctorOption): WpCandidate | undefined => {
    const idx = completionIndex;
    let hit = idx.byDoctorId.get(o.id);
    if (!hit && o.id.startsWith("wp:")) { const n = Number(o.id.slice(3)); if (Number.isFinite(n)) hit = idx.byWpId.get(n); }
    if (!hit && o.phone) { const k = normalizePhone(o.phone); if (k) hit = idx.byPhone.get(k); }
    if (!hit && o.email) { const e = o.email.toLowerCase().trim(); if (e) hit = idx.byEmail.get(e); }
    if (!hit && o.name) { const nm = normName(o.name); const ms = nm ? idx.byName.get(nm) : undefined; if (ms && ms.length === 1) hit = ms[0]; }
    return hit;
  }, [completionIndex]);

  // Same resolution priority as useWpCandidateForDoctor: id → wp:id → phone
  // → email → unique name. Returns 0 when nothing's on file.
  const completionFor = useCallback((o: DoctorOption): number => {
    const hit = resolveWpCandidate(o);
    if (hit) return wpCandidateCompletion(hit);
    return calcCompletion(completionIndex.profileById.get(o.id));
  }, [resolveWpCandidate, completionIndex]);

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

  // The chosen doctors, in roster order. Derived from the ids so a doctor that
  // drops out of the roster (e.g. becomes ineligible) silently drops here too.
  const selectedDoctors = useMemo(
    () => doctorOptions.filter(d => selectedDoctorIds.includes(d.id)),
    [doctorOptions, selectedDoctorIds],
  );
  // First selected doctor — drives the step-1/2 live-placeholder preview (a
  // single doctor there is enough; the per-doctor previews live in step 3).
  const firstDoctor = selectedDoctors[0] ?? null;

  // Per-doctor send data resolved OFF the already-loaded indexes (no per-doctor
  // hooks — those can't be called in a loop for N doctors). Mirrors exactly what
  // PreviewConfirm used to compute for the single doctor: the WP candidate +
  // wpCandidateToTokens merged over profileToTokens (WP wins when populated).
  const sendDataByDoctor = useMemo(() => {
    const m = new Map<string, { wpCandidate: WpCandidate | null; mergedProfileTokens: Record<string, string>; completion: number }>();
    for (const doc of selectedDoctors) {
      const wpCandidate = resolveWpCandidate(doc) ?? null;
      const profile = completionIndex.profileById.get(doc.id) ?? null;
      const wpTokens     = wpCandidateToTokens(wpCandidate);
      const legacyTokens = profileToTokens(profile);
      const merged: Record<string, string> = { ...legacyTokens };
      for (const [k, v] of Object.entries(wpTokens)) {
        if (v) merged[k] = v;                // WP wins when populated
        else if (!(k in merged)) merged[k] = "";
      }
      const completion = wpCandidate ? wpCandidateCompletion(wpCandidate) : (profile ? calcCompletion(profile) : 0);
      m.set(doc.id, { wpCandidate, mergedProfileTokens: merged, completion });
    }
    return m;
  }, [selectedDoctors, resolveWpCandidate, completionIndex]);

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
    setSelectedDoctorIds([doc.id]);
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
  const wizardWp = useWpCandidateForDoctor(firstDoctor, { includeDrafts: true });
  const { data: wizardProfile } = useDoctorProfile(firstDoctor?.id ?? null);
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
    if (firstDoctor) {
      v.doctor_name       = firstDoctor.name.replace(/^\s*Dr\.?\s+/i, "");
      v.doctor_email      = firstDoctor.email ?? "";
      v.doctor_phone      = firstDoctor.phone ?? "";
      v.doctor_speciality = firstDoctor.speciality ?? "";
      v.doctor_country_training = wizardProfileTokens.doctor_country_training || firstDoctor.country_training || "";
      v.profile_link      = `https://allocationassist.com/shared-profile/${firstDoctor.id}`;
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
  }, [firstDoctor, selectedHospitals, wizardProfileTokens]);

  const wizardEmails: StudioEmail[] = useMemo(() => {
    const hSubj = renderTemplate(hospitalTemplate?.subject ?? "Candidate introduction — {{doctor_name}}", previewVars);
    const hHtml = wrapBodyForSend(renderTemplate(hospitalTemplate?.body_html ?? hospitalTemplate?.body_text ?? "", previewVars) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : ""));
    const dSubj = renderTemplate(doctorTemplate?.subject ?? "Your profile has been sent to {{hospital_name}}", previewVars);
    const dHtml = wrapBodyForSend(renderTemplate(doctorTemplate?.body_html ?? doctorTemplate?.body_text ?? "", previewVars));
    const pane = (subject: string, html: string) => (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
          <div className="truncate text-[14px] font-semibold text-slate-900">
            {subject ? <span dangerouslySetInnerHTML={{ __html: humanizePlaceholders(subject, { flagUnfilled: true }) }} /> : <span className="italic text-slate-400">No subject</span>}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">Preview · not sent</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          <EmailFrame html={humanizePlaceholders(html, { flagUnfilled: true })} />
        </div>
      </div>
    );
    return [
      { key: "hospital", label: "Hospital intro", subLabel: selectedHospitals[0]?.name ?? "pick a hospital", preview: pane(hSubj, hHtml) },
      { key: "doctor",   label: "Doctor email",   subLabel: firstDoctor?.email ?? "pick a doctor",           preview: pane(dSubj, dHtml) },
    ];
  }, [hospitalTemplate, doctorTemplate, previewVars, customMessage, selectedHospitals, firstDoctor]);

  const handleConfirm = async (
    // Per-doctor edit state keyed by doctor.id: per-hospital hand-edited hospital
    // intros (hospitalOverrides) + the doctor-email override + a retyped doctor
    // "To". Card images ride separately in cardImageByDoctor (body state) so
    // handleConfirm reads them directly. Everything else (opts) is GLOBAL.
    perDoctor: Record<string, { hospitalOverrides?: Record<string, SendOverrides>; doctorOverride?: SendOverrides; doctorEmail?: string }>,
    opts: {
      // PER-DOCTOR attachments, keyed by doctor.id (hospital leg + doctor leg).
      attachments?: { hospital?: Record<string, EmailAttachment[]>; doctor?: Record<string, EmailAttachment[]> };
      templateKeys?: { hospital: string; doctor: string };
      schedule?:    { date: string; time: string };
      sender?:      { assignedTo: string | null };
      // Feature 3: per-HOSPITAL greeting (hospitalId → mode); absent key = "auto".
      greeting?:    Record<string, "auto" | "contact" | "team">;
      // Feature 1: Combined (one consolidated doctor email per doctor) vs
      // Individual (one doctor email per doctor per hospital). Multi-hospital only.
      combineDoctorEmails?: boolean;
    } = {},
  ) => {
    const { attachments, templateKeys, schedule, sender, greeting, combineDoctorEmails } = opts;
    // Explicit sender pick from the dialog. When set it's written to each run's
    // assigned_to so send-flow-email's pickSender uses it as the From line;
    // null → leave assigned_to unset so the hospital-owner trigger decides.
    const senderAssignedTo = sender?.assignedTo ?? null;
    // Per-HOSPITAL greeting override (hospitalId → mode); "auto" keeps each
    // hospital's stored greet_with_contact_name flag. Empty = all auto.
    const greetModeByHospital = greeting ?? {};
    // Hospital-leg attachments are keyed by pairKey(doctorId, hospitalId) so a
    // file rides ONLY its exact (doctor × hospital) combo; doctor-leg attachments
    // stay per doctor.id (one working-op email per doctor).
    const hospAttByPair  = attachments?.hospital ?? {};
    const docAttByDoctor = attachments?.doctor ?? {};
    if (selectedDoctors.length === 0 || selectedHospitals.length === 0) return;
    const templateOverridesPayload = templateKeys && (templateKeys.hospital !== HOSPITAL_DEFAULT_KEY || templateKeys.doctor !== DOCTOR_DEFAULT_KEY)
      ? {
          ...(templateKeys.hospital !== HOSPITAL_DEFAULT_KEY ? { email_hospital: templateKeys.hospital } : {}),
          ...(templateKeys.doctor   !== DOCTOR_DEFAULT_KEY   ? { email_doctor:   templateKeys.doctor }   : {}),
        }
      : null;
    // Resolve THIS doctor's send data from the per-doctor edit map + body state.
    // Retyped doctor recipient (single-hospital only) wins over the doctor's own
    // email; hand-edited body (stageOverrides) is a SHARED copy across that
    // doctor's hospitals. Card image is the doctor's captured card, if any.
    const dataFor = (doctor: DoctorOption) => {
      const pd = perDoctor[doctor.id] ?? {};
      return {
        doctorEmailToUse: (pd.doctorEmail ?? "").trim() || doctor.email,
        // email_hospital override per hospitalId; email_doctor override per doctor.
        hospitalOverrides: pd.hospitalOverrides ?? {},
        doctorOverride:    pd.doctorOverride,
        cardImageUrl: cardImageByDoctor[doctor.id] ?? null,
        // Hospital-leg files are resolved per (doctor × hospital) at each run
        // below, not here — only the doctor-leg list is doctor-wide.
        doctorAttach:   docAttByDoctor[doctor.id] ?? [],
      };
    };
    // Build the stage_overrides object for ONE (doctor, hospital) run — its own
    // hospital-intro edit + the doctor-email edit.
    const stageOverridesFor = (
      d: { hospitalOverrides: Record<string, SendOverrides>; doctorOverride?: SendOverrides },
      hospitalId: string,
    ): Record<string, SendOverrides> => ({
      ...(d.hospitalOverrides[hospitalId] ? { email_hospital: d.hospitalOverrides[hospitalId] } : {}),
      ...(d.doctorOverride ? { email_doctor: d.doctorOverride } : {}),
    });

    // ── Schedule-for-later branch (Amir #5) ─────────────────────────────────
    // Instead of creating runs + sending now, stash everything the send needs
    // in a scheduled_profile_sends row — ONE per doctor. A deployed scheduler
    // expands each later; the Scheduled queue lets the team Send now / Reschedule.
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
        // One scheduled row per doctor (each row supports hospital_ids[] +
        // per-doctor stage_overrides / doctor_email). Global fields repeat per row.
        for (const doctor of selectedDoctors) {
          const { doctorEmailToUse, hospitalOverrides, doctorOverride, doctorAttach } = dataFor(doctor);
          // A scheduled row is ONE per doctor across all its hospitals, so it can
          // carry a single hospital-attachment list. Use this doctor's first
          // hospital's combo (exact for a single-hospital schedule; multi-hospital
          // schedules can't store per-hospital files, so the first combo's ride).
          const hospitalAttach = hospAttByPair[pairKey(doctor.id, selectedHospitals[0].id)] ?? [];
          // A scheduled row carries ONE stage_overrides for all its hospital_ids.
          // Single-hospital can include that hospital's intro edit; multi-hospital
          // keeps only the doctor-email edit (each hospital is server-rendered
          // per-hospital at fire time, so per-hospital intro edits aren't stored).
          const scheduledStage = selectedHospitals.length === 1
            ? stageOverridesFor({ hospitalOverrides, doctorOverride }, selectedHospitals[0].id)
            : (doctorOverride ? { email_doctor: doctorOverride } : {});
          await scheduleProfileSend.mutateAsync({
            doctor_id:         doctor.id,
            doctor_name:       doctor.name,
            doctor_email:      doctorEmailToUse,
            doctor_phone:      doctor.phone,
            doctor_speciality: doctor.speciality,
            hospital_ids:      selectedHospitals.map(h => h.id),
            custom_message:    customMessage || null,
            bcc_override:      bccList,
            cc_override:       ccList.length ? ccList : null,
            assigned_to:       senderAssignedTo,
            stage_overrides:   Object.keys(scheduledStage).length ? scheduledStage : null,
            template_overrides: templateOverridesPayload,
            attachments:        hospitalAttach.map(a => ({ filename: a.filename, path: a.path })),
            attachments_doctor: doctorAttach.map(a => ({ filename: a.filename, path: a.path })),
            scheduled_for:     gulf.date,
            scheduled_at_time: gulf.time,
            timezone:          "Asia/Dubai",
          });
        }
        const nD = selectedDoctors.length, nH = selectedHospitals.length;
        toast.success(
          nD === 1
            ? `Scheduled for ${localLabel} (your time) — ${selectedDoctors[0].name} → ${nH} hospital${nH === 1 ? "" : "s"}`
            : `Scheduled for ${localLabel} (your time) — ${nD} doctors × ${nH} hospital${nH === 1 ? "" : "s"}`,
          { action: { label: "View queue", onClick: () => navigate("/batches") } },
        );
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
      // ── Per-hospital routing, resolved ONCE (doctor-independent) ──────────
      // Recipient / override / all-mode / cursor decisions depend only on the
      // hospital, so compute them before the doctor loop. Advancing a cycle-mode
      // cursor inside the doctor loop would over-rotate it N times (a real bug) —
      // so cursorAdvances is collected here once and applied once at the end.
      const cursorAdvances: { id: string; name: string; next: number }[] = [];
      const routingByHospital = new Map<string, { recipientEmail: string | null; recipientName: string; runCc: string[] }>();
      for (const h of selectedHospitals) {
        // Resolve THIS hospital's recipient from its Zoho contacts + routing mode
        // (primary vs cycle), honouring a manual override. Falls back to the
        // hospital row's primary_recruiter_email if nothing matched.
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
        // Going to everyone (or multiple manual recipients) → greet with the
        // hospital name (blank contact name), since no single contact owns it.
        const overrideIsMulti = !!overrideEmail && /[,;]/.test(overrideEmail);
        const recipientName  = (isAllMode || overrideIsMulti)
          ? ""
          : (overrideContact?.name ?? resolved.contact?.name ?? h.primary_contact_name ?? "").trim();
        // Auto-CC (send-state): the hospital's configured cc_emails ride the send.
        const runCc = [...new Set([...ccList, ...(h.cc_emails ?? [])].map(e => e.trim()).filter(Boolean))];
        // Only advance the cursor when we actually used the cycle rotation
        // (no override, cycle mode, real matched contacts). Once per hospital.
        if (!overrideEmail && (h.contact_mode ?? "primary") === "cycle" && !resolved.fromHospitalRow && resolved.nextCursor !== (h.cycle_cursor ?? 0)) {
          cursorAdvances.push({ id: h.id, name: h.name, next: resolved.nextCursor });
        }
        routingByHospital.set(h.id, { recipientEmail, recipientName, runCc });
      }

      // Multi-hospital singular send → ONE consolidated doctor "working
      // opportunity" email PER DOCTOR listing every hospital (send-flow-email
      // builds it from batch_hospitals via the shared composer). Mark exactly one
      // run per doctor (their first) as the doctor-email sender.
      const isMultiHospital = selectedHospitals.length > 1;
      const batchHospitalsMeta = selectedHospitals.map(toWorkingOpHospital);
      // Feature 1: only consolidate when the user kept "Combined" AND it's a
      // multi-hospital send. Individual mode (or single-hospital) → no
      // consolidation, so each run auto-continues to its own doctor email.
      const consolidate = (combineDoctorEmails ?? true) && isMultiHospital;

      // Collect the ids the inserts return, flattened across the whole
      // doctor × hospital matrix — so we send exactly the runs we created.
      const createdRunIds: string[] = [];

      // ── Send matrix: for each doctor, one run per hospital ────────────────
      for (const doctor of selectedDoctors) {
        // One batch_id per DOCTOR — groups that doctor's hospital runs so the
        // BCC/consolidated nature stays queryable per doctor.
        const batchId = crypto.randomUUID();
        const { doctorEmailToUse, hospitalOverrides, doctorOverride, cardImageUrl, doctorAttach } = dataFor(doctor);
        for (const [hIndex, h] of selectedHospitals.entries()) {
          const routing = routingByHospital.get(h.id)!;
          const { recipientEmail, recipientName, runCc } = routing;
          // Hospital-leg files for THIS exact (doctor × hospital) combo only.
          const hospitalAttach = hospAttByPair[pairKey(doctor.id, h.id)] ?? [];
          // This run's stage_overrides = THIS hospital's intro edit + the doctor edit.
          const runStageOverrides = stageOverridesFor({ hospitalOverrides, doctorOverride }, h.id);
          const { data: runRow, error: runErr } = await supabase
            .from("automation_flow_runs")
            .insert({
              flow_key:      "profile_sent",
              doctor_id:     doctor.id,
              doctor_name:   doctor.name,
              doctor_email:  doctorEmailToUse,
              doctor_phone:  doctor.phone,
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
                doctor_speciality:  doctor.speciality,
                triggered_via:      "send_profile_dialog",
                // Dispatcher-picked recipients. The roster is BCC'd; Amir (if
                // picked) is CC'd. send-flow-email reads bcc_override / cc_override.
                bcc_override:       bccList,
                ...(runCc.length ? { cc_override: runCc } : {}),
                // Per-stage edits from the preview. email_hospital is THIS
                // hospital's own intro edit (each hospital edited independently);
                // email_doctor is the doctor-email edit. send-flow-email reads
                // stage_overrides[<stage>] when each email fires and ships that
                // edited version verbatim.
                ...(Object.keys(runStageOverrides).length ? { stage_overrides: runStageOverrides } : {}),
                // CVs / logbooks attached in the preview. The hospital-leg files
                // are for THIS exact (doctor × hospital) combo only — they never
                // ride the doctor's other hospitals or another doctor. The
                // doctor-leg files are per doctor. send-flow-email reads
                // `attachments` on the hospital stage and `attachments_doctor` on
                // the doctor stage.
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
                // so it looks identical in every client. This doctor's own image,
                // same for every hospital they're sent to.
                ...(cardImageUrl ? { doctor_card_image_url: cardImageUrl } : {}),
                // Feature 1: consolidated doctor email only in Combined +
                // multi-hospital mode. `send_doctor_email` true on exactly one run
                // per doctor (their first) so only it auto-continues to the doctor
                // leg; `batch_hospitals` is the full list it renders. Individual
                // mode OR single-hospital stamps NEITHER → every run auto-continues
                // to its own per-hospital doctor email (incl. doctor_template_key).
                ...(consolidate
                  ? { send_doctor_email: hIndex === 0, batch_hospitals: batchHospitalsMeta }
                  : {}),
                // Feature 3: per-hospital greeting choice — send-flow-email honours
                // greet_mode over the hospital's stored greet_with_contact_name flag.
                ...((greetModeByHospital[h.id] ?? "auto") !== "auto" ? { greet_mode: greetModeByHospital[h.id] } : {}),
              },
            })
            .select("id")
            .single();
          if (runErr) throw runErr;
          if (!runRow) continue;
          const runId = runRow.id;
          createdRunIds.push(runId);

          // Seed the trigger + the two outgoing-email events.
          // Marked `event_type='entered'` rather than `email_sent` until the
          // real sender confirms delivery — the sender will append a follow-up
          // event when it actually ships.
          await supabase.from("automation_flow_events").insert([
            {
              run_id:     runId,
              stage_key:  "trigger_send_clicked",
              event_type: "entered",
              message:    `Send requested for ${doctor.name} → ${h.name}${selectedHospitals.length > 1 ? ` (BCC batch of ${selectedHospitals.length})` : ""}.`,
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
      }

      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });

      // Advance each cycle-mode hospital's cursor ONCE so the NEXT send rotates
      // to its next contact. Non-fatal — a failure just repeats a contact.
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
      // Send exactly the runs we created, using the ids the inserts returned
      // (no refetch — that could skip a not-yet-visible row). A small concurrency
      // pool keeps a large matrix from being N serial round-trips while
      // staying under Resend's rate limit. One pool over the flattened list.
      const POOL = 4;
      for (let i = 0; i < createdRunIds.length; i += POOL) {
        const slice = createdRunIds.slice(i, i + POOL);
        const results = await Promise.all(slice.map(async (id) => {
          try {
            const { data: sendResp, error: sendErr } = await supabase.functions.invoke("send-flow-email", { body: { run_id: id } });
            if (sendErr) throw sendErr;
            const resp = sendResp as { ok: boolean; error?: string };
            if (!resp?.ok) throw new Error(resp?.error ?? "Send failed");
            return true;
          } catch (e) { lastFailMsg.msg = e instanceof Error ? e.message : "unknown"; return false; }
        }));
        for (const okr of results) okr ? sent++ : failed++;
      }

      const nD = selectedDoctors.length, nH = selectedHospitals.length;
      if (failed === 0) {
        toast.success(
          nD === 1 && nH === 1
            ? `Sent ${selectedDoctors[0].name} → ${selectedHospitals[0].name}`
            : nD === 1
              ? `Sent ${selectedDoctors[0].name} → ${nH} hospitals (BCC)`
              : `Sent ${nD} doctors × ${nH} hospital${nH === 1 ? "" : "s"} (${sent} email${sent === 1 ? "" : "s"})`,
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
          ) : step === "preview-confirm" && selectedDoctors.length > 0 ? (
            <PreviewConfirm
              onClose={onClose}
              doctors={selectedDoctors}
              sendDataByDoctor={sendDataByDoctor}
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
              cardImageByDoctor={cardImageByDoctor}
              onSetCardImage={setCardImageForDoctor}
              onRemoveHospital={(id) => setSelectedIds(prev => prev.filter(x => x !== id))}
              hospitalPool={hospitals}
              onAddHospital={(id) => setSelectedIds(prev => prev.includes(id) ? prev : [...prev, id])}
            />
          ) : (
            <EmailPreviewStudioLayout
              title="Send Profile to Hospital"
              subtitle={step === "pick-doctor"
                ? "Step 1 · Choose doctor(s)"
                : `Step 2 · ${firstDoctor?.name ?? "doctor"}${selectedDoctors.length > 1 ? ` +${selectedDoctors.length - 1} more` : ""} → choose hospital(s)`}
              onClose={onClose}
              emails={wizardEmails}
              activeKey={wizardTab}
              onActiveKeyChange={setWizardTab}
              mountActiveOnly
              railFill
              headerExtra={
                <div className="flex h-full min-h-0 flex-col gap-2">
                  {step === "pick-hospitals" && <MailModeBanner liveCount={selectedHospitals.length} liveWhat="hospital" />}
                  <Stepper step={step} />
                  <div className="min-h-0 flex-1">
                    {step === "pick-doctor" ? (
                      <DoctorPicker
                        options={doctorOptions}
                        isLoading={zohoLoading || !completionReady}
                        selectedIds={selectedDoctorIds}
                        onToggle={(id) => setSelectedDoctorIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        onSetSelected={setSelectedDoctorIds}
                      />
                    ) : selectedDoctors.length > 0 ? (
                      <HospitalPicker
                        doctors={selectedDoctors}
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
              footer={step === "pick-doctor" ? (
                <Button onClick={() => setStep("pick-hospitals")} disabled={selectedDoctorIds.length === 0} className="ml-auto">
                  Continue to hospitals →
                </Button>
              ) : step === "pick-hospitals" ? (
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

function DoctorPicker({ options, isLoading, selectedIds, onToggle, onSetSelected }: {
  options: DoctorOption[];
  isLoading: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSetSelected: (ids: string[]) => void;
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

  // "Select all" acts on whatever's currently filtered (so a search narrows it),
  // mirroring the HospitalPicker's multi-select pattern.
  const allFilteredSelected = filtered.length > 0 && filtered.every(d => selectedIds.includes(d.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      const drop = new Set(filtered.map(d => d.id));
      onSetSelected(selectedIds.filter(id => !drop.has(id)));
    } else {
      onSetSelected([...new Set([...selectedIds, ...filtered.map(d => d.id)])]);
    }
  };

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
        {selectedIds.length > 1 && <Badge variant="outline" className="text-[10px] bg-teal-50 border-teal-200">{selectedIds.length} doctors</Badge>}
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-sidebar-border/40 bg-white overflow-y-auto divide-y aa-scrollbar-hide">
        {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-muted-foreground text-center">No doctors match.</div>
        )}
        {filtered.map(d => {
          const checked = selectedIds.includes(d.id);
          return (
            <label key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-teal-50/60 cursor-pointer transition-colors">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(d.id)} />
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
            </label>
          );
        })}
      </div>
      <div className="shrink-0 text-[10px] text-sidebar-foreground/60">
        Showing {filtered.length} of {options.length}. Each doctor gets their own personalized email(s).
      </div>
    </div>
  );
}

function HospitalPicker({
  doctors, hospitals, selectedIds, onToggle, onSetSelected, customMessage, setCustomMessage,
}: {
  doctors: DoctorOption[];
  hospitals: Hospital[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSetSelected: (ids: string[]) => void;
  customMessage: string;
  setCustomMessage: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  // Country filter only — the city/emirate filter was removed (send flows scope
  // by country). Options collapse alias variants (KSA≡Saudi Arabia, UAE≡United
  // Arab Emirates…) via the shared normaliser, so the dropdown value is a
  // canonical key and matching is alias-tolerant.
  const [country, setCountry] = useState("all");
  const countries = useMemo(() => countryFilterOptions(hospitals.map(h => h.country)), [hospitals]);
  // Distinct specialties across the chosen doctors — a hospital is offered when
  // it accepts ANY of them (don't hide a hospital that's valid for at least one
  // doctor in a mixed-specialty batch). One doctor → the same single-doctor rule.
  const specialties = useMemo(() => [...new Set(doctors.map(d => d.speciality))], [doctors]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return hospitals.filter(h => {
      // Send-state system: never offer a paused ("don't send") hospital, or one
      // whose specialty rules exclude every chosen doctor's specialty.
      if (isHospitalPaused(h)) return false;
      if (!specialties.some(s => hospitalAllowsSpecialty(h, s))) return false;
      if (country !== "all" && normCountry(h.country) !== country) return false;
      if (!term) return true;
      return h.name.toLowerCase().includes(term) ||
        h.city?.toLowerCase().includes(term) ||
        h.country?.toLowerCase().includes(term);
    });
  }, [hospitals, q, country, specialties]);

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
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Sending profile{doctors.length === 1 ? " of" : `s of ${doctors.length} doctors`}
        </div>
        {doctors.length === 1 ? (
          <>
            <div className="text-[13px] font-medium text-slate-800">{doctors[0].name}</div>
            <div className="text-[11px] text-muted-foreground">{doctors[0].speciality ?? "—"} · {doctors[0].email ?? doctors[0].phone ?? "no contact"}</div>
          </>
        ) : (
          <div className="text-[12px] font-medium text-slate-800 leading-snug">
            {doctors.map(d => d.name).join(", ")}
          </div>
        )}
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
          {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
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

// HospitalRecipientsOverride replaced by the shared <HospitalRecipientsPanel>
// (imported at the top) so the singular + batch previews edit recipients
// identically — plus a country filter and add-a-hospital.

// CardScreenshotControl + CvStudioControl now live in ./ProfileCardControls so
// the batch preview shares the exact same controls (imported at the top).

/** Per-doctor resolved send data (WP candidate + merged tokens + completion). */
type DoctorSendData = { wpCandidate: WpCandidate | null; mergedProfileTokens: Record<string, string>; completion: number };
/** Per-doctor edit payload delivered to handleConfirm. */
type PerDoctorSend = {
  // email_hospital override keyed PER hospitalId — each hospital's intro email is
  // edited independently (its greeting names that hospital), so an edit is
  // stamped only onto that hospital's run, never fanned across all.
  hospitalOverrides?: Record<string, SendOverrides>;
  // email_doctor override (the single-hospital doctor email; the multi-hospital
  // consolidated email is read-only so it has none). Per doctor.
  doctorOverride?: SendOverrides;
  doctorEmail?: string;
};

function PreviewConfirm({
  doctors, sendDataByDoctor, hospitals, customMessage, hospitalSubject, hospitalBody, doctorSubject, doctorBody,
  onBack, onClose, onConfirm, submitting, ccList, setCcList, bccList, setBccList,
  templates, hospitalTemplateKey, setHospitalTemplateKey, doctorTemplateKey, setDoctorTemplateKey, onSaveDefault,
  hospitalContacts, recipientOverrides, onOverrideRecipient,
  cardImageByDoctor, onSetCardImage, onRemoveHospital, hospitalPool, onAddHospital,
}: {
  /** 1..N doctors — each gets their own personalized email(s), previewed under a
   *  per-doctor sub-tab. N=1 is the single-doctor common case (unchanged UI). */
  doctors: DoctorOption[];
  sendDataByDoctor: Map<string, DoctorSendData>;
  hospitals: Hospital[];
  /** Full hospital pool — feeds the preview's country filter + add-hospital. */
  hospitalPool: Hospital[];
  onAddHospital: (id: string) => void;
  customMessage: string;
  hospitalSubject: string;
  hospitalBody: string;
  doctorSubject: string;
  doctorBody: string;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (
    perDoctor: Record<string, PerDoctorSend>,
    opts?: {
      // PER-DOCTOR attachments, keyed by doctor.id (hospital leg + doctor leg).
      attachments?: { hospital?: Record<string, EmailAttachment[]>; doctor?: Record<string, EmailAttachment[]> };
      templateKeys?: { hospital: string; doctor: string };
      schedule?:    { date: string; time: string };
      sender?:      { assignedTo: string | null };
      greeting?:    Record<string, "auto" | "contact" | "team">;
      combineDoctorEmails?: boolean;
    },
  ) => void;
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
  /** Card image PER DOCTOR (keyed by doctor.id) — the doctor's captured card. */
  cardImageByDoctor: Record<string, string | null>;
  onSetCardImage: (doctorId: string, url: string | null) => void;
  onRemoveHospital: (id: string) => void;
}) {
  // Editing is offered for single-hospital sends only — the preview (and the
  // edited HTML) is rendered for one hospital, so reusing it across a BCC
  // batch would bake the wrong hospital's tokens into the others. Evaluated per
  // doctor pane below.
  const isSingle = hospitals.length === 1;
  const multiDoctor = doctors.length > 1;
  // Which doctor's sub-tab is active (shared by the Hospital + Doctor top-tabs
  // so switching top-tab keeps you on the same doctor). No tab bar renders for a
  // single doctor, so the view is unchanged there.
  const [activeDoctorIdx, setActiveDoctorIdx] = useState(0);
  const activeDoctor = doctors[Math.min(activeDoctorIdx, doctors.length - 1)] ?? doctors[0];
  // Per-DOCTOR edit state (keyed by doctor.id): hand-edited bodies + a retyped
  // doctor "To". null/absent = unedited. Each doctor pane owns its own entry.
  // Hospital-intro edits are keyed PER (doctor, hospital) — each hospital's intro
  // is edited independently. Doctor-email edits stay per doctor (one email/doctor).
  const [hospitalOvByPair, setHospitalOvByPair] = useState<Record<string, SendOverrides | null>>({});
  const [doctorOvByDoctor,   setDoctorOvByDoctor]   = useState<Record<string, SendOverrides | null>>({});
  // Bumped by "clone this edit to all" so every hospital pane re-seeds from its
  // freshly-cloned override (see EditableEmailSection.seedSignal).
  const [cloneTick, setCloneTick] = useState(0);
  const [doctorEmailOvByDoctor, setDoctorEmailOvByDoctor] = useState<Record<string, string>>({});
  // CVs / logbooks to attach. DOCTOR-leg files stay PER DOCTOR (one working-op
  // email per doctor). HOSPITAL-leg files are PER (doctor × hospital): each
  // hospital email is its own send, so a file attached to one combo must NOT ride
  // that doctor's OTHER hospitals (Aramco×Dr X ≠ Canadian×Dr X). Keyed by
  // pairKey(doctorId, hospitalId); the active-pair accessors live below (they
  // need the hospital sub-tab index defined later).
  const [hospitalAttByPair, setHospitalAttByPair] = useState<Record<string, EmailAttachment[]>>({});
  const [doctorAttByDoctor, setDoctorAttByDoctor] = useState<Record<string, EmailAttachment[]>>({});
  const doctorAttachments = doctorAttByDoctor[activeDoctor?.id ?? ""] ?? EMPTY_ATTACHMENTS;
  const setDoctorAttachments = (next: EmailAttachment[] | ((prev: EmailAttachment[]) => EmailAttachment[])) => {
    const id = activeDoctor?.id;
    if (!id) return;
    setDoctorAttByDoctor(prev => ({ ...prev, [id]: typeof next === "function" ? next(prev[id] ?? []) : next }));
  };
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

  // Which hospital's version of the email to preview (multi-hospital sends give
  // each hospital its own greeting/recipient). Defaults to the first; follows
  // removals so it never points at a dropped hospital.
  const [previewHospitalId, setPreviewHospitalId] = useState<string | null>(hospitals[0]?.id ?? null);
  // Feature 3: per-HOSPITAL greeting override (hospitalId → mode); absent key =
  // "auto" (keep the hospital's stored setting). "contact" greets the named
  // recipient, "team" greets the hospital team. Selected per row in the panel.
  const [greetModeByHospital, setGreetModeByHospital] = useState<Record<string, "auto" | "contact" | "team">>({});
  // Feature 1: Combined (one consolidated doctor email per doctor, listing all
  // hospitals) vs Individual (one doctor email per doctor per hospital). Only
  // meaningful for multi-hospital sends; the toggle is hidden when single.
  const [combineDoctorEmails, setCombineDoctorEmails] = useState(true);
  // Feature 2: which hospital's per-hospital doctor email shows in Individual mode.
  const [doctorPreviewHospIdx, setDoctorPreviewHospIdx] = useState(0);
  // Which hospital's intro email is showing on the Hospital-intro tab (its own
  // hospital sub-tab row, so every hospital's intro is editable individually).
  const [hospIntroHospIdx, setHospIntroHospIdx] = useState(0);
  useEffect(() => {
    if (!hospitals.some(h => h.id === previewHospitalId)) setPreviewHospitalId(hospitals[0]?.id ?? null);
  }, [hospitals, previewHospitalId]);
  const sampleHospital = hospitals.find(h => h.id === previewHospitalId) ?? hospitals[0];

  // Hospital-leg attachments belong to the ACTIVE (doctor × hospital) pair: the
  // doctor sub-tab in view and the hospital sub-tab open on the Hospital-intro tab
  // (single-hospital → that one hospital). Editing the picker only touches this
  // combo, so a file never fans onto the doctor's other hospitals.
  const activeHospIntroHosp = hospitals[Math.min(hospIntroHospIdx, Math.max(0, hospitals.length - 1))] ?? hospitals[0];
  const activeHospPairKey = (activeDoctor && activeHospIntroHosp) ? pairKey(activeDoctor.id, activeHospIntroHosp.id) : "";
  const hospitalAttachments = (activeHospPairKey && hospitalAttByPair[activeHospPairKey]) ? hospitalAttByPair[activeHospPairKey] : EMPTY_ATTACHMENTS;
  const setHospitalAttachments = (next: EmailAttachment[] | ((prev: EmailAttachment[]) => EmailAttachment[])) => {
    if (!activeHospPairKey) return;
    setHospitalAttByPair(prev => ({ ...prev, [activeHospPairKey]: typeof next === "function" ? next(prev[activeHospPairKey] ?? []) : next }));
  };
  // Propagate the active combo's files to EVERY hospital for THIS doctor only —
  // never touches another doctor, even at the same hospital. Flags the doctor as
  // just-copied (transient) so the button can confirm it happened, plus a toast.
  const [attCopiedDoctorId, setAttCopiedDoctorId] = useState<string | null>(null);
  const copyHospitalAttToDoctorHospitals = () => {
    if (!activeDoctor || !activeHospPairKey) return;
    const src = hospitalAttByPair[activeHospPairKey] ?? [];
    setHospitalAttByPair(prev => {
      const n = { ...prev };
      for (const h of hospitals) n[pairKey(activeDoctor.id, h.id)] = src;
      return n;
    });
    const docId = activeDoctor.id, docName = activeDoctor.name, nH = hospitals.length;
    setAttCopiedDoctorId(docId);
    window.setTimeout(() => setAttCopiedDoctorId(cur => (cur === docId ? null : cur)), 2200);
    toast.success(src.length
      ? `${src.length} file${src.length === 1 ? "" : "s"} now on all ${nH} hospitals for ${docName}`
      : `Cleared files on all ${nH} hospitals for ${docName}`);
  };

  // Resolve the greeting NAME for a hospital EXACTLY as the send does (buildRuns):
  // the manually-picked contact → the routing-resolved primary → the hospital's
  // stored primary_contact_name. Empty for 'all'/multi recipients (greet the team).
  // The preview used only primary_contact_name (usually blank), so "Name" fell back
  // to the hospital name — now it names whoever the email is actually addressed to.
  const resolveGreetName = (hosp: Hospital): string => {
    const contactsForH = hospitalContacts.forHospital(hosp.name);
    const resolved = resolveRecipient(contactsForH, hosp);
    const overrideEmail = recipientOverrides[hosp.id];
    const overrideContact = overrideEmail
      ? contactsForH.find(c => c.email?.toLowerCase() === overrideEmail.toLowerCase())
      : undefined;
    const isAllMode = !overrideEmail && (hosp.contact_mode ?? "primary") === "all";
    const overrideIsMulti = !!overrideEmail && /[,;]/.test(overrideEmail);
    if (isAllMode || overrideIsMulti) return "";
    return (overrideContact?.name ?? resolved.contact?.name ?? hosp.primary_contact_name ?? "").trim();
  };
  // Pure per-doctor token builder — the old single-doctor `vars` memo, now a
  // function of the doctor. Same shape as send-flow-email so the preview matches
  // the actual send. Reads the doctor's already-resolved WP/legacy tokens.
  const varsFor = (doctor: DoctorOption, hosp: Hospital | undefined, cardImageUrl: string | null): Record<string, string> => {
    const data = sendDataByDoctor.get(doctor.id);
    const wpCandidate = data?.wpCandidate ?? null;
    const mergedProfileTokens = data?.mergedProfileTokens ?? {};
    // Strip any redundant "Dr." prefix so templates that hard-code "Hi Dr.
    // {{doctor_name}}" don't render "Hi Dr. Dr. Louise Denjean". Prefer the WP
    // candidate's full_name when present; fall back to the Zoho-derived name.
    const rawName = (wpCandidate?.full_name && wpCandidate.full_name.trim()) || doctor.name;
    const cleanedDoctorName = rawName.replace(/^\s*Dr\.?\s+/i, "");
    const v: Record<string, string> = {
      ...mergedProfileTokens,
      doctor_name:        cleanedDoctorName,
      doctor_email:       doctor.email ?? "",
      doctor_phone:       doctor.phone ?? "",
      doctor_speciality:  doctor.speciality ?? "",
      doctor_country_training: (mergedProfileTokens.doctor_country_training || doctor.country_training || ""),
      hospital_name:      hosp?.name ?? "",
      hospital_contact_name: (() => {
        // Feature 3: this hospital's own greeting mode drives the greeting.
        // Return the CONTACT name, or "" when greeting the team — the template's
        // inverted section turns "" into "<hospital> team", so a named person is
        // "Hello Annette!" (no trailing "team") and the generic case stays
        // "Hello <hospital> team!".
        const gm = hosp ? (greetModeByHospital[hosp.id] ?? "auto") : "auto";
        const useName = gm === "contact" || (gm === "auto" && hosp?.greet_with_contact_name);
        return (hosp && useName) ? resolveGreetName(hosp) : "";
      })(),
      city:               hosp?.city ?? "",
      country:            hosp?.country ?? "",
      profile_link:       `https://allocationassist.com/shared-profile/${doctor.id}`,
      signature:          PREVIEW_SIGNATURE_HTML,
      signature_text:     PREVIEW_SIGNATURE_TEXT,
    };
    v.doctor_card_html      = previewDoctorCardHtml(v);
    v.doctor_row_table_html = previewDoctorRowTableHtml(v);
    v.hospital_image        = hospitalImageHtml(hosp?.image_url, hosp?.name);
    v.doctor_card_image_url = cardImageUrl ?? "";
    return v;
  };

  // The exact emails the team sees, built ONCE PER DOCTOR (no hooks in a loop).
  // Bodies are wrapped in the same font shell send-flow-email uses, so edits
  // shipped verbatim render like a normal send.
  const renderByDoctor = useMemo(() => {
    const m = new Map<string, {
      vars: Record<string, string>;
      rHospSubj: string; rHospBody: string; hHtml: string;
      rDocSubj: string; dHtml: string; dBody: string;
      wpCandidate: WpCandidate | null;
      profileCardHtml: string; profileCardWidth: number | undefined;
    }>();
    for (const doc of doctors) {
      const wpCandidate = sendDataByDoctor.get(doc.id)?.wpCandidate ?? null;
      const vars = varsFor(doc, sampleHospital, cardImageByDoctor[doc.id] ?? null);
      // Bodies render with display vars (empties → red {{token}} pills); subjects
      // keep full vars so the subject line never shows a stray pill.
      const dispVars = displayVarsOf(vars);
      const rHospSubj = renderTemplate(hospitalSubject, vars);
      const rHospBody = renderTemplate(hospitalBody, dispVars) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : "");
      const hHtml = wrapBodyForSend(rHospBody);
      const rDocSubj = renderTemplate(doctorSubject, vars);
      const dBody = renderTemplate(doctorBody, dispVars);
      const dHtml = wrapBodyForSend(dBody);
      // The doctor profile IMAGE that ships in the to-hospital email — rich 3:2
      // WordPress card when linked, else the compact fallback card.
      const profileCardHtml  = wpCandidate ? buildDoctorProfileHtml(wpCandidate) : buildProfileCardHtml(vars);
      const profileCardWidth = wpCandidate ? PROFILE_IMAGE_WIDTH : undefined;
      m.set(doc.id, { vars, rHospSubj, rHospBody, hHtml, rDocSubj, dHtml, dBody, wpCandidate, profileCardHtml, profileCardWidth });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, sendDataByDoctor, sampleHospital, cardImageByDoctor, greetModeByHospital, customMessage, hospitalSubject, hospitalBody, doctorSubject, doctorBody]);

  const activeRender = renderByDoctor.get(activeDoctor.id);
  const hospitalRecipient = isSingle ? (hospitals[0].primary_recruiter_email ?? "(no recruiter email)") : `preview: ${sampleHospital?.name ?? "hospital"} · ${hospitals.length} hospitals`;

  // Render the HOSPITAL-intro email for one (doctor, hospital) pair — so every
  // hospital's intro can be previewed AND edited individually (its own greeting/
  // tokens), not just the sample hospital. Mirrors renderDoctorEmail.
  const renderHospitalEmail = (doc: DoctorOption, hosp: Hospital) => {
    const vars = varsFor(doc, hosp, cardImageByDoctor[doc.id] ?? null);
    const plainBody = renderTemplate(hospitalBody, displayVarsOf(vars)) + (customMessage ? `\n\n--- Custom note ---\n${customMessage}` : "");
    return { subject: renderTemplate(hospitalSubject, vars), hHtml: wrapBodyForSend(plainBody), plainBody, vars };
  };

  // Auto-attach the profile-card image PER DOCTOR for EVERY send (single- AND
  // multi-hospital) so the pixel-perfect flat image always ships in place of the
  // HTML card. Runs sequentially — one html2canvas capture at a time — so a batch
  // of doctors doesn't fire a burst. Fires once per doctor, once that doctor's
  // profile data has loaded. Manual "Use profile card" button stays as fallback.
  const autoCardTried = useRef<Set<string>>(new Set());
  const [autoCardBusyId, setAutoCardBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (autoCardBusyId) return;
    for (const doc of doctors) {
      if (autoCardTried.current.has(doc.id) || cardImageByDoctor[doc.id]) continue;
      const data = sendDataByDoctor.get(doc.id);
      const tokens = data?.mergedProfileTokens ?? {};
      const loaded = !!(tokens.doctor_bio || tokens.doctor_title || tokens.doctor_specialty || data?.wpCandidate);
      if (!loaded) continue;
      autoCardTried.current.add(doc.id);
      setAutoCardBusyId(doc.id);
      const r = renderByDoctor.get(doc.id);
      captureAndUploadCard(r?.profileCardHtml ?? "", { width: r?.profileCardWidth })
        .then(url => onSetCardImage(doc.id, url))
        .catch(e => console.warn("[SendProfile] profile card image failed:", e))   // manual button stays available
        .finally(() => setAutoCardBusyId(null));
      break;   // one capture at a time — the effect re-runs for the next doctor
    }
    // renderByDoctor intentionally omitted — we read it at fire time; the gating
    // deps below drive re-runs without re-firing on every token change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCardBusyId, doctors, cardImageByDoctor, sendDataByDoctor]);

  const anyHospitalEdited = Object.values(hospitalOvByPair).some(Boolean);
  const anyDoctorEdited   = doctors.some(d => doctorOvByDoctor[d.id]);
  const anyEdited = anyHospitalEdited || anyDoctorEdited;

  // Draft-template guard: a template whose copy still starts with PLACEHOLDER
  // must not be emailed to a real hospital/doctor. Picking it ships via
  // stage_overrides, which BYPASSES send-flow-email's own placeholder guard, so
  // we block here. Editing the email inline (sets an override) clears the flag,
  // so the team can still send an edited version of a draft template — a draft
  // still blocks while ANY doctor has left that leg unedited.
  const isPlaceholder = (key: string) =>
    (templates.find(t => t.key === key)?.body_text ?? "").trim().toUpperCase().startsWith("PLACEHOLDER");
  const hospitalDraft = isPlaceholder(hospitalTemplateKey) && doctors.some(d => hospitals.some(h => !hospitalOvByPair[pairKey(d.id, h.id)]));
  const doctorDraft   = isPlaceholder(doctorTemplateKey)   && doctors.some(d => !doctorOvByDoctor[d.id]);
  const anyDraft = hospitalDraft || doctorDraft;

  // Unfilled-variable guard: any {{token}} that would render BLANK (e.g. {{city}}
  // when the hospital has no city on file) blocks the send and is explained
  // below — unless the team edited that email inline (override). Skipped for
  // multi-hospital BCC (per-hospital tokens vary; render happens server-side).
  // Checked across EVERY doctor pane.
  const unfilledIssues = useMemo(() => {
    if (!isSingle) return [];
    const tokens = new Set<string>();
    for (const doc of doctors) {
      const r = renderByDoctor.get(doc.id);
      if (!r) continue;
      // Single-hospital only (guarded above), so there's exactly one pair/doctor.
      if (!hospitalOvByPair[pairKey(doc.id, hospitals[0].id)]) for (const t of detectUnfilledVars(`${hospitalSubject}\n${hospitalBody}`, r.vars)) tokens.add(t);
      if (!doctorOvByDoctor[doc.id])   for (const t of detectUnfilledVars(`${doctorSubject}\n${doctorBody}`, r.vars)) tokens.add(t);
    }
    return describeUnfilled([...tokens]);
  }, [isSingle, doctors, hospitals, renderByDoctor, hospitalOvByPair, doctorOvByDoctor, hospitalSubject, hospitalBody, doctorSubject, doctorBody]);
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
    // void. Empty doctor override = keep the doctor's own email. Per doctor.
    for (const doc of doctors) {
      const t = (doctorEmailOvByDoctor[doc.id] ?? "").trim();
      if (t && !isEmail(t)) {
        toast.error(`${doc.name}'s email (To) doesn't look like a valid address.`);
        return;
      }
    }
    if (isSingle) {
      const hospTo = (recipientOverrides[hospitals[0].id] ?? "").trim();
      if (hospTo && !isEmail(hospTo)) {
        toast.error("The hospital's email (To) doesn't look like a valid address.");
        return;
      }
    }
    // Each hospital's intro email is edited/overridden INDIVIDUALLY (its greeting
    // names that hospital), so hospital overrides are collected PER hospital and
    // stamped only onto that hospital's run — never fanned across all (the "every
    // email said AlRajhi" bug). A non-default template pick still ships as a
    // rendered stage override per hospital so the pick sends with no deploy;
    // manual edits win. The doctor email override stays per doctor.
    const templatePicked = hospitalTemplateKey !== "profile_sent_hospital";
    const perDoctor: Record<string, PerDoctorSend> = {};
    for (const doc of doctors) {
      const r = renderByDoctor.get(doc.id);
      const dOv = doctorOvByDoctor[doc.id] ?? null;
      const dEmail = (doctorEmailOvByDoctor[doc.id] ?? "").trim();

      const hospitalOverrides: Record<string, SendOverrides> = {};
      for (const h of hospitals) {
        const hOv = hospitalOvByPair[pairKey(doc.id, h.id)] ?? null;
        // A hand-edit always ships as this hospital's stage override. A non-default
        // template PICK client-renders here only for a single-hospital send; for
        // multi-hospital it flows via metadata.template_overrides (server render,
        // which resolves every token per hospital), so we don't bake it here.
        const picked = (isSingle && templatePicked)
          ? (() => { const rr = renderHospitalEmail(doc, h); return { subject_override: rr.subject, html_override: blankUnfilledTokens(rr.hHtml) }; })()
          : null;
        const eff = hOv ?? picked;
        if (eff) hospitalOverrides[h.id] = eff;
      }

      const doctorOverride = dOv
        ?? (isSingle && doctorTemplateKey !== "profile_sent_doctor" && r
              ? { subject_override: r.rDocSubj, html_override: blankUnfilledTokens(r.dHtml) } : null);

      perDoctor[doc.id] = {
        ...(Object.keys(hospitalOverrides).length ? { hospitalOverrides } : {}),
        ...(doctorOverride ? { doctorOverride } : {}),
        ...(dEmail ? { doctorEmail: dEmail } : {}),
      };
    }
    onConfirm(perDoctor, {
      // Attachment maps: hospital keyed by pairKey(doctorId, hospitalId) so each
      // (doctor × hospital) combo carries only its own files; doctor keyed by
      // doctor.id. Drop empty slots (buildRuns treats absent as "no files").
      attachments: {
        hospital: pruneEmptyAttachments(hospitalAttByPair),
        doctor:   pruneEmptyAttachments(doctorAttByDoctor),
      },
      templateKeys: { hospital: hospitalTemplateKey, doctor: doctorTemplateKey },
      schedule: sendMode === "later" ? { date: schedDate, time: schedTime } : undefined,
      sender: { assignedTo: senderAssignedTo },
      greeting: greetModeByHospital,
      combineDoctorEmails,
    });
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
      <HospitalRecipientsPanel
        selected={hospitals}
        pool={hospitalPool}
        contacts={hospitalContacts}
        contactOverrides={Object.fromEntries(
          Object.entries(recipientOverrides).map(([id, s]) => [id, String(s).split(/[,;]+/).map(x => x.trim()).filter(Boolean)]),
        )}
        onContactOverride={(id, emails) => onOverrideRecipient(id, emails && emails.length ? emails.join(", ") : null)}
        onRemoveHospital={onRemoveHospital}
        onAddHospital={onAddHospital}
        specialty={activeDoctor.speciality}
        activeHospitalId={previewHospitalId}
        onSelectHospital={setPreviewHospitalId}
        greetMode={greetModeByHospital}
        onGreetMode={(id, mode) => setGreetModeByHospital(prev => ({ ...prev, [id]: mode }))}
      />
      {!isSingle && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5 text-[11px] text-teal-900">
          {combineDoctorEmails
            ? (multiDoctor
                ? <>Each of the <strong>{doctors.length} doctors</strong> gets <strong>one</strong> consolidated “Working opportunity” email listing all {hospitals.length} hospitals (grouped by city, with photos) — not one per hospital. Switch to <strong>Individual</strong> on the Doctor-email tab to send one email per hospital instead.</>
                : <><strong>{doctors[0].name.replace(/^\s*Dr\.?\s+/i, "")}</strong> gets <strong>one</strong> consolidated “Working opportunity” email listing all {hospitals.length} hospitals (grouped by city, with photos) — not one per hospital. Switch to <strong>Individual</strong> on the Doctor-email tab to send one email per hospital instead.</>)
            : (multiDoctor
                ? <>Each of the <strong>{doctors.length} doctors</strong> gets <strong>one doctor email per hospital</strong> ({doctors.length * hospitals.length} doctor emails total) — the per-hospital template, not the consolidated list. Switch to <strong>Combined</strong> for one email per doctor.</>
                : <><strong>{doctors[0].name.replace(/^\s*Dr\.?\s+/i, "")}</strong> gets <strong>one doctor email per hospital</strong> ({hospitals.length} doctor emails) — the per-hospital template, not the consolidated list. Switch to <strong>Combined</strong> for one email listing all hospitals.</>)}
        </div>
      )}
      <MailModeBanner liveCount={hospitals.length} liveWhat="hospital" />
      <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-3 text-[12px] space-y-1 shadow-sm text-slate-700">
        <div>
          <strong>{multiDoctor ? `${doctors.length} doctors` : doctors[0].name}</strong> → {hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {(() => {
            const hosp = doctors.length * hospitals.length;
            const consolidate = (combineDoctorEmails ?? true) && hospitals.length > 1;
            const doc = consolidate ? doctors.length : doctors.length * hospitals.length;
            return (
              <>On confirm, fires <strong className="text-slate-700">{hosp} hospital email{hosp === 1 ? "" : "s"}</strong> + <strong className="text-slate-700">{doc} doctor email{doc === 1 ? "" : "s"}</strong> <span className="text-slate-400">({hosp + doc} total)</span> automatically.</>
            );
          })()}
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
            flagHospital={makeHospitalFlag(hospitals)}
          />

          {/* Auto-CC preview: each hospital's OWN saved cc_emails ride ITS email
              (send-flow-email stamps them on top of the CC typed above). Read-only
              so the dispatcher can SEE who else is copied. Grouped by hospital
              since each hospital's email carries its own list. Dropped in test
              mode — live sends only. */}
          {(() => {
            const withCc = hospitals
              .map(h => ({ name: h.name, ccs: [...new Set((h.cc_emails ?? []).map(e => e.trim()).filter(isEmail))] }))
              .filter(h => h.ccs.length);
            if (!withCc.length) return null;
            return (
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Also auto-CC'd — from each hospital's saved contacts</div>
                {withCc.map(h => (
                  <div key={h.name} className="text-[10.5px] leading-snug text-slate-600">
                    <span className="font-medium text-slate-700">{h.name}:</span>{" "}
                    {h.ccs.map((e, i) => <span key={e}>{i ? ", " : ""}<span className="font-mono">{e}</span></span>)}
                  </div>
                ))}
                <div className="text-[10px] text-slate-400">Rides each hospital's own email on live sends (dropped in test mode).</div>
              </div>
            );
          })()}

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

      {(() => {
        // Per-doctor completion warning. Single doctor keeps the exact original
        // copy; multi lists every doctor whose profile is under 100%.
        const incomplete = doctors
          .map(d => ({ d, pct: sendDataByDoctor.get(d.id)?.completion ?? 0 }))
          .filter(x => x.pct < 100);
        if (incomplete.length === 0) return null;
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            <div>
              {incomplete.length === 1
                ? <><strong>{incomplete[0].d.name}'s profile is {incomplete[0].pct}% complete.</strong> Missing fields will render as <code>{`{{token}}`}</code> in the hospital email. Fill the profile in <strong>Doctor Profiles</strong> for a polished send.</>
                : <><strong>{incomplete.length} doctors have incomplete profiles</strong> ({incomplete.map(x => `${x.d.name.replace(/^\s*Dr\.?\s+/i, "")} ${x.pct}%`).join(", ")}). Missing fields render as <code>{`{{token}}`}</code>. Fill them in <strong>Doctor Profiles</strong> for a polished send.</>}
            </div>
          </div>
        );
      })()}

      <div className="text-[10.5px] text-sidebar-foreground/65 px-0.5">
        {anyEdited
          ? <span className="text-emerald-300 font-medium">
              You've edited {anyHospitalEdited && anyDoctorEdited ? "both emails" : anyHospitalEdited ? "the hospital email" : "the doctor email"}{multiDoctor ? " (per doctor)" : ""} — your version sends instead of the template.
            </span>
          : isSingle
            ? `Click into either email to tweak the wording before it sends.${multiDoctor ? " Edits are per doctor." : ""}`
            : `Each of the ${hospitals.length} hospitals gets its own personalised intro email — use the hospital tabs to preview and edit each one individually. The doctor gets one consolidated working-opportunity email.`}
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

  // ── Per-doctor pane builders. Kept mounted via ProfileSubTabs so an
  //    in-progress edit survives switching between doctors' sub-tabs. Single
  //    doctor renders the pane directly (no sub-tab bar) — unchanged view. ────
  // The editable hospital-intro email for ONE (doctor, hospital) pair. Its edit
  // is stored against the doctor+hospital pair, so editing AlRajhi's intro never
  // touches Amana's. Recipient (To) is per-hospital too.
  // Clone the ACTIVE hospital email's hand-edit to every OTHER (doctor × hospital)
  // pair — re-rendered per pair so each keeps its OWN doctor & hospital details.
  // Turns the edited email back into a token template (retokenizeEmail) using the
  // source pair's values, then renders it for each other pair with THAT pair's
  // values. The source keeps its exact edit. Bumps cloneTick so every pane's
  // editor re-seeds to show the result.
  const cloneHospitalEditToAll = (srcDoc: DoctorOption, srcHosp: Hospital) => {
    const srcKey = pairKey(srcDoc.id, srcHosp.id);
    const ov = hospitalOvByPair[srcKey];
    if (!ov?.html_override) return;
    const srcVars = varsFor(srcDoc, srcHosp, cardImageByDoctor[srcDoc.id] ?? null);
    const srcBase = renderHospitalEmail(srcDoc, srcHosp);
    const tmplHtml = retokenizeEmail(ov.html_override, srcVars);
    const editedSubj = (ov.subject_override ?? "").trim();
    const tmplSubj = editedSubj && editedSubj !== srcBase.subject ? retokenizeEmail(editedSubj, srcVars) : null;
    let count = 0;
    setHospitalOvByPair(prev => {
      const next = { ...prev };
      for (const d of doctors) for (const h of hospitals) {
        const k = pairKey(d.id, h.id);
        if (k === srcKey) continue;   // the source keeps its exact edit
        const v = varsFor(d, h, cardImageByDoctor[d.id] ?? null);
        const base = renderHospitalEmail(d, h);
        let html = renderTemplate(tmplHtml, v, { html: true });
        // Keep THIS pair's own greeting — retokenising flattens the conditional
        // "Hello {{#contact}}…{{^contact}}{{hospital}} team{{/}}!", so a target
        // with no named contact would otherwise render "Hello !". Swap the first
        // greeting line for the pair's pristine one.
        const ownGreeting = base.hHtml.match(GREETING_RE)?.[0];
        if (ownGreeting) html = html.replace(GREETING_RE, ownGreeting);
        next[k] = { subject_override: tmplSubj ? renderTemplate(tmplSubj, v) : base.subject, html_override: blankUnfilledTokens(html) };
        count++;
      }
      return next;
    });
    setCloneTick(t => t + 1);
    toast.success(count
      ? `Wording applied to ${count} other email${count === 1 ? "" : "s"} — each keeps its own doctor & hospital details.`
      : "No other emails to update.");
  };
  const hospitalPaneForHospital = (doc: DoctorOption, hosp: Hospital) => {
    const rr = renderHospitalEmail(doc, hosp);
    const key = pairKey(doc.id, hosp.id);
    const recip = recipientOverrides[hosp.id] ?? hosp.primary_recruiter_email ?? "";
    const ov = hospitalOvByPair[key];
    const multi = doctors.length * hospitals.length > 1;
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        {ov?.html_override && multi && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5">
            <span className="text-[11px] leading-snug text-amber-800">
              You edited this email. Apply the same wording to the other {doctors.length * hospitals.length - 1} email{doctors.length * hospitals.length - 1 === 1 ? "" : "s"}? Each keeps its own doctor &amp; hospital details.
            </span>
            <Button type="button" size="sm"
              className="h-7 shrink-0 bg-amber-600 text-[11px] text-white hover:bg-amber-700"
              onClick={() => cloneHospitalEditToAll(doc, hosp)}>
              <Copy className="mr-1.5 h-3 w-3" /> Apply to all
            </Button>
          </div>
        )}
      <EditableEmailSection
        label={`To hospital · ${hosp.name}${recip ? ` · ${recip}` : ""}`}
        subject={rr.subject}
        html={rr.hHtml}
        seedOverride={ov?.html_override ? { subject: ov.subject_override, html: ov.html_override } : null}
        seedSignal={cloneTick}
        from={senderLine}
        to={recip || undefined}
        onToChange={(v) => onOverrideRecipient(hosp.id, v.trim() ? v.trim() : null)}
        cc={ccList}
        bcc={bccList}
        editable
        onChange={(ov) => setHospitalOvByPair(prev => ({ ...prev, [key]: ov }))}
        plainBody={rr.plainBody}
        attachments={hospitalAttByPair[key] ?? EMPTY_ATTACHMENTS}
        onAttachmentsChange={(next) => setHospitalAttByPair(prev => ({ ...prev, [key]: next }))}
        templatePicker={
          <TemplatePicker
            templates={templates}
            value={hospitalTemplateKey}
            onChange={setHospitalTemplateKey}
            defaultKey="profile_sent_hospital"
            renderVars={rr.vars}
            label="Hospital intro email template"
            flowFilter="profile_sent"
            audience="hospital"
            contentClassName="z-[200]"
          />
        }
      />
      </div>
    );
  };
  const hospitalPane = (doc: DoctorOption) => {
    // While THIS doctor's card is auto-capturing, show the spinner (the profile
    // card image ships in the hospital email, so wait for it before previewing).
    if (autoCardBusyId === doc.id) {
      return (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 bg-white text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
          <span className="text-[12px]">Preparing the profile card image…</span>
        </div>
      );
    }
    // Single hospital → one editable pane. Multi-hospital → a hospital sub-tab
    // row so EVERY hospital's intro is previewed + edited individually.
    if (hospitals.length === 1) return hospitalPaneForHospital(doc, hospitals[0]);
    const idx = Math.min(hospIntroHospIdx, hospitals.length - 1);
    return (
      <ProfileSubTabs
        names={hospitals.map(h => h.name)}
        active={idx}
        onSelect={setHospIntroHospIdx}
        panes={hospitals.map(h => hospitalPaneForHospital(doc, h))}
      />
    );
  };
  const doctorPane = (doc: DoctorOption) => {
    const r = renderByDoctor.get(doc.id);
    if (!r) return null;
    const dEmailOv = doctorEmailOvByDoctor[doc.id] ?? "";
    return (
      <EditableEmailSection
        label={`To doctor · ${dEmailOv || doc.email || "(no email)"}`}
        subject={r.rDocSubj}
        html={r.dHtml}
        from={senderLine}
        to={isSingle ? (dEmailOv || doc.email || "") : (doc.email ?? undefined)}
        onToChange={isSingle ? (v) => setDoctorEmailOvByDoctor(prev => ({ ...prev, [doc.id]: v })) : undefined}
        cc={ccList}
        bcc={bccList}
        editable
        onChange={(ov) => setDoctorOvByDoctor(prev => ({ ...prev, [doc.id]: ov }))}
        plainBody={r.dBody}
        attachments={doctorAttByDoctor[doc.id] ?? EMPTY_ATTACHMENTS}
        onAttachmentsChange={(next) => setDoctorAttByDoctor(prev => ({ ...prev, [doc.id]: next }))}
        // Same picker as the left rail, forwarded into the full-screen editor
        // so the doctor template can be swapped from full screen too. Popover
        // raised above the full-screen overlay via contentClassName.
        templatePicker={
          <TemplatePicker
            templates={templates}
            value={doctorTemplateKey}
            onChange={setDoctorTemplateKey}
            defaultKey="profile_sent_doctor"
            renderVars={r.vars}
            label="Doctor 'working opportunity' email template"
            flowFilter="profile_sent"
            audience="doctor"
            contentClassName="z-[200]"
          />
        }
      />
    );
  };
  // ── Feature 2: multi-hospital doctor-email preview (READ-ONLY). ─────────────
  // Combined → the consolidated "working opportunity" email per doctor, built
  // with the shared buildWorkingOp* composer so it matches what send-flow-email
  // ships. Individual → the per-hospital doctor template, one hospital sub-tab at
  // a time. Single-hospital keeps the editable doctorPane above (unchanged).
  const combinedDoctorPane = (doc: DoctorOption) => {
    const hospWO: WorkingOpHospital[] = hospitals.map(toWorkingOpHospital);
    const subject = buildWorkingOpSubject(hospWO);
    const body = wrapBodyForSend(buildWorkingOpBody(doc.name, hospWO, PREVIEW_SIGNATURE_HTML));
    return <PreviewBlock label={`Consolidated · ${hospitals.length} hospitals`} subject={subject} body={body} />;
  };
  // Render the per-hospital doctor email for one (doctor, hospital) pair — same
  // pipeline renderByDoctor uses, but for the chosen hospital, not only sampleHospital.
  const renderDoctorEmail = (doc: DoctorOption, hosp: Hospital) => {
    const vars = varsFor(doc, hosp, cardImageByDoctor[doc.id] ?? null);
    return {
      subject: renderTemplate(doctorSubject, vars),
      body:    wrapBodyForSend(renderTemplate(doctorBody, vars)),
    };
  };
  const individualDoctorPane = (doc: DoctorOption) => {
    const activeHospIdx = Math.min(doctorPreviewHospIdx, hospitals.length - 1);
    const panes = hospitals.map(h => {
      const { subject, body } = renderDoctorEmail(doc, h);
      return <PreviewBlock key={h.id} label={`To doctor · ${doc.email ?? "(no email)"} · ${h.name}`} subject={subject} body={body} />;
    });
    return (
      <ProfileSubTabs
        names={hospitals.map(h => h.name)}
        active={activeHospIdx}
        onSelect={setDoctorPreviewHospIdx}
        panes={panes}
      />
    );
  };
  const doctorNames = doctors.map(d => d.name);

  // ── The two emails: switcher label + left-rail controls + right-pane preview.
  //    Left-rail card/CV controls follow the ACTIVE doctor's sub-tab.
  const emails: StudioEmail[] = [
    {
      key: "hospital",
      label: "Hospital intro",
      subLabel: hospitalRecipient,
      controls: (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <TemplatePicker templates={templates} value={hospitalTemplateKey} onChange={setHospitalTemplateKey} defaultKey="profile_sent_hospital" renderVars={activeRender?.vars ?? {}} label="Hospital intro email template" flowFilter="profile_sent" audience="hospital" />
            </div>
            {hospitalTemplateKey !== "profile_sent_hospital" && (
              <button type="button" onClick={() => { onSaveDefault("hospital", hospitalTemplateKey); toast.success("Saved as your default hospital template"); }} className="text-[10px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:underline whitespace-nowrap mt-4">Save as my default</button>
            )}
          </div>
          {multiDoctor && (
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Card &amp; CV for <strong className="text-sidebar-foreground/85">{activeDoctor.name}</strong></div>
          )}
          {/* Profile-as-image: render THIS doctor's candidate profile card (View-
              full-profile look, empty fields dropped) to a flat PNG and show it
              ABOVE the data table (both render). Follows the active sub-tab. */}
          <CardScreenshotControl
            cardHtml={activeRender?.profileCardHtml ?? ""}
            captureWidth={activeRender?.profileCardWidth}
            cardImageUrl={cardImageByDoctor[activeDoctor.id] ?? null}
            onSetCardImage={(url) => onSetCardImage(activeDoctor.id, url)}
            autoBusy={autoCardBusyId === activeDoctor.id}
          />
          <CvStudioControl
            doctor={activeRender?.wpCandidate ?? null}
            onAttach={(att) => setHospitalAttachments(prev => [...prev, att])}
          />
          {hospitals.length > 1 && (
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              Files · <strong className="text-sidebar-foreground/85">{activeDoctor.name}</strong> → <strong className="text-sidebar-foreground/85">{activeHospIntroHosp?.name ?? "this hospital"}</strong>
            </div>
          )}
          <AttachmentsPicker
            attachments={hospitalAttachments}
            onChange={setHospitalAttachments}
            disabled={submitting}
            hint={hospitals.length > 1
              ? `ride ONLY on ${activeDoctor.name} → ${activeHospIntroHosp?.name ?? "this hospital"} — not this doctor's other hospitals`
              : "ride on THIS hospital email — CV, logbook, etc."}
          />
          {hospitals.length > 1 && (
            <Button type="button" variant="outline" size="sm"
              className={`h-7 w-full text-[11px] transition-colors ${attCopiedDoctorId === activeDoctor.id
                ? "border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-50 hover:text-teal-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`}
              disabled={submitting}
              onClick={copyHospitalAttToDoctorHospitals}>
              {attCopiedDoctorId === activeDoctor.id
                ? <><Check className="h-3 w-3 mr-1.5" /> Copied to all {hospitals.length} hospitals</>
                : <><Copy className="h-3 w-3 mr-1.5" /> Copy to all hospitals for {activeDoctor.name}</>}
            </Button>
          )}
        </div>
      ),
      preview: multiDoctor
        ? <ProfileSubTabs names={doctorNames} active={activeDoctorIdx} onSelect={setActiveDoctorIdx} panes={doctors.map(hospitalPane)} />
        : hospitalPane(doctors[0]),
    },
    {
      key: "doctor",
      label: "Doctor email",
      subLabel: multiDoctor ? `${doctors.length} doctors` : (doctors[0].email ?? "(no email)"),
      controls: (
        <div className="space-y-2">
          {/* Feature 1: Combined vs Individual — multi-hospital only. */}
          {!isSingle && (
            <div className="rounded-md border border-sidebar-border/40 bg-white/95 p-2 shadow-sm">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Doctor email</div>
              <div className="grid grid-cols-2 gap-1">
                {([["combined", "Combined"], ["individual", "Individual"]] as const).map(([k, l]) => {
                  const on = (k === "combined") === combineDoctorEmails;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCombineDoctorEmails(k === "combined")}
                      className={`rounded-md px-2 py-1 text-[10.5px] font-medium transition ${on ? "bg-teal-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      title={k === "combined" ? "One email per doctor listing all hospitals" : "One email per doctor, per hospital"}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[9.5px] text-slate-500">
                {combineDoctorEmails ? "One consolidated email per doctor, listing all hospitals." : `One email per doctor per hospital (${hospitals.length}).`}
              </div>
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <TemplatePicker templates={templates} value={doctorTemplateKey} onChange={setDoctorTemplateKey} defaultKey="profile_sent_doctor" renderVars={activeRender?.vars ?? {}} label="Doctor 'working opportunity' email template" flowFilter="profile_sent" audience="doctor" />
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
      // Single-hospital keeps the editable doctorPane (unchanged). Multi-hospital
      // shows read-only panes: a doctor row of sub-tabs, each pane the consolidated
      // email (Combined) or a nested hospital row of per-hospital emails (Individual).
      preview: isSingle
        ? (multiDoctor
            ? <ProfileSubTabs names={doctorNames} active={activeDoctorIdx} onSelect={setActiveDoctorIdx} panes={doctors.map(doctorPane)} />
            : doctorPane(doctors[0]))
        : <ProfileSubTabs
            names={doctorNames}
            active={activeDoctorIdx}
            onSelect={setActiveDoctorIdx}
            panes={doctors.map(combineDoctorEmails ? combinedDoctorPane : individualDoctorPane)}
          />,
    },
  ];

  // The now-vs-schedule choice IS the send action (no separate Queue button):
  // in the default state, "Schedule for later" flips to scheduling mode
  // (revealing the date/time card) and "Send now" fires immediately; once
  // scheduling, the primary becomes "Schedule N sends" with a way back.
  const totalSends = doctors.length * hospitals.length;
  const sendCount = `${totalSends} send${totalSends === 1 ? "" : "s"}`;
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
      subtitle={`${multiDoctor ? `${doctors.length} doctors` : doctors[0].name} → ${hospitals.length === 1 ? hospitals[0].name : `${hospitals.length} hospitals (BCC)`}`}
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
<div style="overflow-x:auto;max-width:100%;margin:18px 0;">
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
  attachments, onAttachmentsChange, templatePicker, seedOverride, seedSignal,
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
  /** Programmatic edit to display instead of the pristine render (the "clone
   *  edit to all" button injects one per pair). Applied ONLY when seedSignal
   *  changes — never on every render — so it doesn't fight live typing. */
  seedOverride?: { subject?: string; html: string } | null;
  seedSignal?:   number;
}) {
  // Show unfilled {{tokens}} as friendly placeholder pills in the preview, but
  // report clean {{tokens}} back up so the SENT email is byte-identical — the
  // pills never leave the display (stripPlaceholderPills is the exact reverse).
  const displayHtml = useMemo(() => humanizePlaceholders(html, { flagUnfilled: true }), [html]);
  const [subj, setSubj] = useState(subject);
  const [body, setBody] = useState(displayHtml);
  const [tick, setTick] = useState(0);

  // Re-seed from the pristine render when it changes (profile data finished
  // loading, hospital changed) OR when a seedOverride is injected (clone-to-all,
  // signalled by seedSignal). seedOverride is READ, not a dep, so live typing
  // (which updates the stored override) never re-triggers a re-seed / cursor
  // jump — only a pristine change or an explicit seedSignal bump does.
  useEffect(() => {
    if (seedOverride) {
      // Keep the injected override as the current edit — do NOT onChange(null).
      setSubj(seedOverride.subject ?? subject);
      setBody(humanizePlaceholders(seedOverride.html, { flagUnfilled: true }));
      setTick(t => t + 1);
    } else {
      setSubj(subject);
      setBody(displayHtml);
      setTick(t => t + 1);
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, displayHtml, seedSignal]);

  const report = (s: string, b: string) => {
    const cleanB = stripPlaceholderPills(b);
    // Edit detection compares the token-bearing body (cleanB vs html); the SENT
    // override blanks any still-empty {{token}} so nothing raw ships.
    onChange((s !== subject || cleanB !== html) ? { subject_override: s, html_override: blankUnfilledTokens(cleanB) } : null);
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
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
          <div className="text-[12px] font-medium">{subject}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 shrink-0">Body</div>
          {isHtml
            ? <HtmlPreview html={body} />
            : <pre className="text-[11px] whitespace-pre-wrap font-mono text-slate-700 bg-slate-50/40 p-2 rounded border flex-1 min-h-0 overflow-y-auto">
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
  // Fill the pane's available height (the email scrolls inside the frame) instead
  // of capping at a short box that leaves the panel half-empty. The wrapper's
  // flex-1/min-h-0 gives the frame a definite height to fill.
  return (
    <div className="flex-1 min-h-0">
      <EmailFrame
        html={humanizePlaceholders(html, { flagUnfilled: true })}
        fill
        style={{ border: "1px solid hsl(var(--border))", borderRadius: 6 }}
      />
    </div>
  );
}


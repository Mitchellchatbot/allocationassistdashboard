import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Users, Building2, Loader2, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useHospitals, isHospitalPaused } from "@/hooks/use-hospitals";
import { usePublishedWpCandidates } from "@/hooks/use-wp-candidates";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { TemplatePicker } from "@/components/automations/TemplatePicker";
import { EmailFrame } from "@/components/EmailFrame";
import { findSenderByEmail } from "@/lib/hi-team";

// Branded sign-off shown where {{signature}} sits in the preview (send-flow-email
// mints the real per-sender block with the logo at send time).
const PREVIEW_SIG = `<p style="margin:22px 0 2px;color:#14b8a6;font-weight:700;font-family:Garamond,'EB Garamond',Georgia,serif;">Warmest Regards,</p><p style="margin:0;color:#14b8a6;font-weight:700;font-family:Garamond,'EB Garamond',Georgia,serif;">The Allocation Assist team</p><p style="margin:6px 0 0;color:#475569;font-size:13px;font-family:Garamond,'EB Garamond',Georgia,serif;">Jumeirah Lakes Towers, Dubai, UAE · www.allocationassist.com</p>`;

const HOSPITAL_DEFAULT_KEY = "profile_sent_hospital";
const DOCTOR_DEFAULT_KEY   = "profile_sent_doctor";

/**
 * BulkProfileSendDialog — send MULTIPLE doctors' profiles to MULTIPLE hospitals,
 * ONE email per doctor (every doctor × hospital pair is its own email, never a
 * BCC digest). Pool = published WordPress candidates (the website roster). Each
 * pair becomes a profile_sent run + a send-flow-email invoke, so the sends still
 * flow into Flow 2, Past Sent and the pipeline counts exactly like a single send.
 *
 * Template-only (no per-send body editing — there can be hundreds of pairs); for
 * a hand-edited one-off use the single Send Profile dialog instead.
 */
export function BulkProfileSendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: hospitals = [] } = useHospitals();
  const { data: candidates = [], isLoading: candLoading } = usePublishedWpCandidates();
  const { data: templates = [] } = useEmailTemplates();

  const [docIds,  setDocIds]  = useState<Set<string>>(new Set());
  const [hospIds, setHospIds] = useState<Set<string>>(new Set());
  const [docQuery,  setDocQuery]  = useState("");
  const [hospQuery, setHospQuery] = useState("");
  const [hospCountry, setHospCountry] = useState("all");
  const [hospCity, setHospCity] = useState("all");
  const [hospitalTemplateKey, setHospitalTemplateKey] = useState(HOSPITAL_DEFAULT_KEY);
  const [doctorTemplateKey,   setDoctorTemplateKey]   = useState(DOCTOR_DEFAULT_KEY);
  const [customMessage, setCustomMessage] = useState("");
  const [bccSelf, setBccSelf] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Send shape: "individual" = one email per doctor×hospital (legacy); "combined"
  // = ONE tabular email per hospital listing every selected doctor (like a batch),
  // and each doctor optionally gets one email listing all their hospitals.
  const [mode, setMode] = useState<"individual" | "combined">("combined");
  const [includeDoctorEmail, setIncludeDoctorEmail] = useState(true);
  const [combinedPreview, setCombinedPreview] = useState<{ html: string; subject: string; emailCount: number; doctorCount: number } | null>(null);
  const [loadingCombinedPreview, setLoadingCombinedPreview] = useState(false);

  useEffect(() => {
    if (open) {
      setDocIds(new Set()); setHospIds(new Set());
      setDocQuery(""); setHospQuery("");
      setHospitalTemplateKey(HOSPITAL_DEFAULT_KEY); setDoctorTemplateKey(DOCTOR_DEFAULT_KEY);
      setCustomMessage(""); setBccSelf(true); setProgress(null);
      setMode("combined"); setIncludeDoctorEmail(true); setCombinedPreview(null);
    }
  }, [open]);

  // Doctor pool — published WP candidates with a usable name (so the email
  // renders), newest first. Key by a stable identity that send-flow-email can
  // resolve back to the profile (linked Zoho id when present, else wp:<id>).
  const docPool = useMemo(() => {
    return candidates
      .filter(c => (c.full_name ?? "").trim())
      .map(c => ({
        key:        c.doctor_id ?? `wp:${c.id}`,
        doctor_id:  c.doctor_id ?? null,
        name:       c.full_name ?? "",
        email:      c.email ?? null,
        phone:      c.phone ?? null,
        speciality: c.specialty ?? null,
      }));
  }, [candidates]);

  const docFiltered = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (!q) return docPool;
    return docPool.filter(d => d.name.toLowerCase().includes(q) || (d.speciality ?? "").toLowerCase().includes(q) || (d.email ?? "").toLowerCase().includes(q));
  }, [docPool, docQuery]);

  // Only hospitals with a recruiter email can actually receive a send.
  const hospCountries = useMemo(() => {
    const s = new Set<string>();
    for (const h of hospitals) { const c = h.country?.trim(); if (c) s.add(c); }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [hospitals]);
  // Cities/emirates scoped to the selected country.
  const hospCities = useMemo(() => {
    const s = new Set<string>();
    for (const h of hospitals) {
      if (!h.primary_recruiter_email) continue;
      if (hospCountry !== "all" && (h.country ?? "").trim().toLowerCase() !== hospCountry.toLowerCase()) continue;
      const c = h.city?.trim(); if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [hospitals, hospCountry]);
  const effHospCity = hospCity !== "all" && hospCities.some(c => c.toLowerCase() === hospCity.toLowerCase()) ? hospCity : "all";
  const hospPool = useMemo(() => {
    const q = hospQuery.trim().toLowerCase();
    return hospitals
      .filter(h => h.primary_recruiter_email)
      .filter(h => !isHospitalPaused(h))   // send-state: hide "don't send" hospitals
      .filter(h => hospCountry === "all" || (h.country ?? "").trim().toLowerCase() === hospCountry.toLowerCase())
      .filter(h => effHospCity === "all" || (h.city ?? "").trim().toLowerCase() === effHospCity.toLowerCase())
      .filter(h => !q || h.name.toLowerCase().includes(q) || (h.city ?? "").toLowerCase().includes(q) || (h.country ?? "").toLowerCase().includes(q));
  }, [hospitals, hospQuery, hospCountry, effHospCity]);

  const selectedDocs  = useMemo(() => docPool.filter(d => docIds.has(d.key)), [docPool, docIds]);
  const selectedHosps = useMemo(() => hospitals.filter(h => hospIds.has(h.id)), [hospitals, hospIds]);
  const pairCount = selectedDocs.length * selectedHosps.length;

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const sampleVars = (d: typeof docPool[number]): Record<string, string> => ({
    doctor_name: d.name, doctor_speciality: d.speciality ?? "", hospital_name: selectedHosps[0]?.name ?? "the hospital",
  });

  // Read-only preview of the doctor "working opportunity" email for a SAMPLE
  // pair (first selected doctor × first selected hospital) so the team sees what
  // each doctor receives before firing the bulk send (Sean: "preview section for
  // working opportunity bulk sends"). It's template-only, so this renders the
  // chosen template with that pair's tokens — the same render send-flow-email does.
  const [showPreview, setShowPreview] = useState(false);
  const doctorTpl = useMemo(() => templates.find(t => t.key === doctorTemplateKey), [templates, doctorTemplateKey]);
  const previewDoc  = selectedDocs[0] ?? null;
  const previewHosp = selectedHosps[0] ?? null;
  const previewHtml = useMemo(() => {
    if (!doctorTpl || !previewDoc) return "";
    const vars: Record<string, string> = {
      doctor_name:        previewDoc.name.replace(/^\s*Dr\.?\s+/i, ""),
      doctor_specialty:   previewDoc.speciality ?? "",
      doctor_speciality:  previewDoc.speciality ?? "",
      hospital_name:      previewHosp?.name ?? "the hospital",
      city:               previewHosp?.city ?? "",
      country:            previewHosp?.country ?? "",
      hospital_profile_url: "",
      hospital_description: "",
      logo_header:        "",
      custom_message:     customMessage,
      hospital_image:     previewHosp?.image_url
        ? `<img src="${previewHosp.image_url}" alt="${(previewHosp.name ?? "Hospital").replace(/"/g, "&quot;")}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`
        : "",
      signature:          PREVIEW_SIG,
    };
    const body = renderTemplate(doctorTpl.body_html || doctorTpl.body_text || "", vars, { html: true });
    return `<div style="font-family:Garamond,'EB Garamond',Georgia,'Times New Roman',serif;font-size:17px;color:#1a2332;line-height:1.55;padding:4px 2px;">${body}</div>`;
  }, [doctorTpl, previewDoc, previewHosp, customMessage]);
  const previewSubject = useMemo(
    () => doctorTpl && previewDoc
      ? renderTemplate(doctorTpl.subject || "", { doctor_name: previewDoc.name, hospital_name: previewHosp?.name ?? "", city: previewHosp?.city ?? "", doctor_specialty: previewDoc.speciality ?? "" })
      : "",
    [doctorTpl, previewDoc, previewHosp],
  );

  const send = async () => {
    if (selectedDocs.length === 0 || selectedHosps.length === 0) {
      toast.error("Pick at least one doctor and one hospital.");
      return;
    }
    setSending(true);
    setProgress({ done: 0, total: pairCount });
    const batchId = crypto.randomUUID();
    const me = findSenderByEmail(user?.email ?? null);
    const bcc = bccSelf && me ? [me.email] : [];
    const templateOverrides: Record<string, string> = {};
    if (hospitalTemplateKey !== HOSPITAL_DEFAULT_KEY) templateOverrides.email_hospital = hospitalTemplateKey;
    if (doctorTemplateKey   !== DOCTOR_DEFAULT_KEY)   templateOverrides.email_doctor   = doctorTemplateKey;

    let sent = 0, failed = 0, lastErr = "";
    for (const d of selectedDocs) {
      for (const h of selectedHosps) {
        try {
          const { data: runRow, error: runErr } = await supabase
            .from("automation_flow_runs")
            .insert({
              flow_key:      "profile_sent",
              doctor_id:     d.doctor_id,
              doctor_name:   d.name,
              doctor_email:  d.email,
              doctor_phone:  d.phone,
              hospital:      h.name,
              current_stage: "email_hospital",
              status:        "active",
              created_by:    user?.email ?? null,
              // Send from the generic Allocation Assist Team address (AA is a
              // referral agency, not tied to the hospital) — same default as the
              // Send Profile dialog. Set explicitly so the hospital-owner trigger
              // doesn't stamp a per-hospital "owner" instead.
              assigned_to:   "hello@allocationassist.com",
              metadata: {
                batch_id:          batchId,
                hospital_id:       h.id,
                hospital_email:    h.primary_recruiter_email,
                bcc:               false,            // one email per doctor — never a digest
                doctor_speciality: d.speciality,
                custom_message:    customMessage || null,
                triggered_via:     "bulk_profile_send",
                ...(bcc.length ? { bcc_override: bcc } : {}),
                ...(Object.keys(templateOverrides).length ? { template_overrides: templateOverrides } : {}),
              },
            })
            .select("id")
            .single();
          if (runErr || !runRow) throw new Error(runErr?.message ?? "run insert failed");
          const { data: resp, error: sendErr } = await supabase.functions.invoke("send-flow-email", { body: { run_id: runRow.id } });
          if (sendErr) throw sendErr;
          const r = resp as { ok?: boolean; error?: string };
          if (!r?.ok) throw new Error(r?.error ?? "send failed");
          sent++;
        } catch (e) {
          failed++;
          lastErr = e instanceof Error ? e.message : "unknown";
        }
        setProgress(p => p && ({ ...p, done: p.done + 1 }));
      }
    }
    qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
    setSending(false);
    if (failed === 0) toast.success(`Sent ${sent} email${sent === 1 ? "" : "s"} — ${selectedDocs.length} doctor(s) × ${selectedHosps.length} hospital(s).`);
    else toast.warning(`${sent} sent, ${failed} failed. Last error: ${lastErr}`);
    if (sent > 0) onClose();
  };

  // Emails of the selected hospitals that can actually receive a send.
  const selectedHospEmails = useMemo(
    () => selectedHosps.map(h => h.primary_recruiter_email?.trim()).filter((e): e is string => !!e),
    [selectedHosps],
  );

  // COMBINED: one tabular email per hospital (all doctors in a table) + one
  // "working opportunity" email per doctor listing every hospital — routed
  // through send-batch's ad-hoc mode (no batch row created).
  const sendCombined = async () => {
    if (selectedDocs.length === 0 || selectedHospEmails.length === 0) {
      toast.error("Pick at least one doctor and one hospital (with a recruiter email).");
      return;
    }
    setSending(true);
    const me = findSenderByEmail(user?.email ?? null);
    const bcc = bccSelf && me ? [me.email] : [];
    try {
      const { data, error } = await supabase.functions.invoke("send-batch", { body: {
        adhoc: true,
        doctor_ids: selectedDocs.map(d => d.key),
        recipient_emails_override: selectedHospEmails,
        include_doctor_email: includeDoctorEmail,
        ...(bcc.length ? { bcc_override: bcc } : {}),
      } });
      if (error) throw error;
      const r = data as { ok?: boolean; error?: string; bcc_count?: number; doctor_email_sent?: number; doctor_count?: number };
      if (!r?.ok) throw new Error(r?.error ?? "send failed");
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      toast.success(
        `Sent to ${r.bcc_count ?? selectedHospEmails.length} hospital${(r.bcc_count ?? 0) === 1 ? "" : "s"} — ${selectedDocs.length} doctor${selectedDocs.length === 1 ? "" : "s"} in one table each`
        + (includeDoctorEmail ? `, and ${r.doctor_email_sent ?? 0} doctor email${(r.doctor_email_sent ?? 0) === 1 ? "" : "s"}.` : "."),
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  // Dry-run preview of the combined hospital email (what one hospital receives).
  const loadCombinedPreview = async () => {
    if (selectedDocs.length === 0 || selectedHospEmails.length === 0) return;
    setLoadingCombinedPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-batch", { body: {
        adhoc: true, dry_run: true,
        doctor_ids: selectedDocs.map(d => d.key),
        recipient_emails_override: selectedHospEmails,
        include_doctor_email: includeDoctorEmail,
      } });
      if (error) throw error;
      const r = data as { ok?: boolean; error?: string; preview?: { html: string; subject: string }; email_count?: number; doctor_count?: number };
      if (!r?.ok || !r.preview) throw new Error(r?.error ?? "Preview failed");
      setCombinedPreview({ html: r.preview.html, subject: r.preview.subject, emailCount: r.email_count ?? selectedHospEmails.length, doctorCount: r.doctor_count ?? selectedDocs.length });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoadingCombinedPreview(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="w-[92vw] max-w-[860px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-teal-600" /> Bulk send profiles
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Send multiple doctors to multiple hospitals. Pick a send shape below — for a hand-edited one-off, use the single Send Profile flow instead.
          </DialogDescription>
        </DialogHeader>

        {/* Send shape: combined (one tabular email per hospital) vs individual. */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "combined",   title: "Combined (recommended)", desc: "One email per hospital with every doctor in a table. No spam." },
            { key: "individual", title: "Individual", desc: "One email per doctor × hospital. Legacy — can be a lot of emails." },
          ] as const).map(o => (
            <button key={o.key} type="button" onClick={() => setMode(o.key)}
              className={`rounded-lg border p-2 text-left transition ${mode === o.key ? "border-teal-400 bg-teal-50 ring-1 ring-teal-200" : "border-slate-200 hover:bg-slate-50"}`}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
                <span className={`h-2.5 w-2.5 rounded-full ${mode === o.key ? "bg-teal-500" : "bg-slate-300"}`} />
                {o.title}
              </div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">{o.desc}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Doctors */}
          <Picklist
            icon={<Users className="h-3.5 w-3.5 text-teal-600" />}
            title="Doctors"
            count={selectedDocs.length}
            query={docQuery}
            onQuery={setDocQuery}
            loading={candLoading}
            emptyText="No published doctors match."
            onSelectAll={() => setDocIds(new Set(docFiltered.map(d => d.key)))}
            onClear={() => setDocIds(new Set())}
            items={docFiltered.map(d => ({
              id: d.key,
              checked: docIds.has(d.key),
              onToggle: () => toggle(docIds, d.key, setDocIds),
              primary: d.name,
              secondary: d.speciality ?? d.email ?? "",
            }))}
          />
          {/* Hospitals */}
          <Picklist
            icon={<Building2 className="h-3.5 w-3.5 text-teal-600" />}
            title="Hospitals"
            count={selectedHosps.length}
            query={hospQuery}
            onQuery={setHospQuery}
            headerExtra={
              <div className="flex items-center gap-1.5">
                <select value={hospCountry} onChange={e => setHospCountry(e.target.value)} title="Filter by country"
                  className="shrink-0 rounded-md border border-input bg-white text-slate-800 text-[11px] px-1.5 h-8 max-w-[120px]">
                  <option value="all">All countries</option>
                  {hospCountries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {hospCities.length > 0 && (
                  <select value={effHospCity} onChange={e => setHospCity(e.target.value)} title="Filter by city / emirate"
                    className="shrink-0 rounded-md border border-input bg-white text-slate-800 text-[11px] px-1.5 h-8 max-w-[120px]">
                    <option value="all">All cities</option>
                    {hospCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            }
            emptyText="No hospitals with a recruiter email."
            onSelectAll={() => setHospIds(new Set(hospPool.map(h => h.id)))}
            onClear={() => setHospIds(new Set())}
            items={hospPool.map(h => ({
              id: h.id,
              checked: hospIds.has(h.id),
              onToggle: () => toggle(hospIds, h.id, setHospIds),
              primary: h.name,
              secondary: [h.city, h.country].filter(Boolean).join(", "),
            }))}
          />
        </div>

        {/* Template — only the doctor "working opportunity" email is pickable;
            the hospital intro always uses the standard profile-sent template. */}
        <div>
          <TemplatePicker templates={templates} value={doctorTemplateKey} onChange={setDoctorTemplateKey} defaultKey={DOCTOR_DEFAULT_KEY} renderVars={sampleVars(selectedDocs[0] ?? docPool[0] ?? { key: "", doctor_id: null, name: "Dr. Example", email: null, phone: null, speciality: "Cardiology" })} label="Doctor 'working opportunity' template" flowFilter="profile_sent" />
        </div>

        {mode === "individual" && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom note (optional — added to every hospital email)</span>
            <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} className="text-[12px] min-h-[56px]" placeholder="e.g. These are our latest available cardiologists for your Q3 openings." />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <Checkbox checked={bccSelf} onCheckedChange={(v) => setBccSelf(!!v)} /> BCC me on {mode === "combined" ? "the send" : "every send"}
          </label>
          {mode === "combined" && (
            <label className="flex items-center gap-2 text-[12px] cursor-pointer">
              <Checkbox checked={includeDoctorEmail} onCheckedChange={(v) => setIncludeDoctorEmail(!!v)} />
              Also email each doctor the hospitals they were sent to
            </label>
          )}
        </div>

        {mode === "combined" ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-2 text-[11px] text-teal-900 flex items-start gap-2">
            <Send className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            <span><strong>{selectedHospEmails.length} email{selectedHospEmails.length === 1 ? "" : "s"}</strong> — one per hospital, each with all <strong>{selectedDocs.length}</strong> doctor{selectedDocs.length === 1 ? "" : "s"} in a table{includeDoctorEmail ? `, plus ${selectedDocs.length} doctor email${selectedDocs.length === 1 ? "" : "s"}` : ""}.</span>
          </div>
        ) : pairCount > 40 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            That's <strong>{pairCount} individual emails</strong>. Double-check the doctor and hospital selections before sending.
          </div>
        )}

        {mode === "combined" ? (
          /* Preview the ACTUAL tabular email a hospital receives (send-batch dry run). */
          <div className="rounded-md border bg-white">
            <button
              type="button"
              onClick={() => { if (combinedPreview) setCombinedPreview(null); else void loadCombinedPreview(); }}
              disabled={loadingCombinedPreview || selectedDocs.length === 0 || selectedHospEmails.length === 0}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingCombinedPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" /> : <Eye className="h-3.5 w-3.5 text-teal-600" />}
              {combinedPreview ? "Hide" : "Preview"} the hospital email (with the doctor table)
            </button>
            {combinedPreview && (
              <div className="border-t p-2 bg-slate-50/60">
                <div className="mb-1.5 px-0.5 text-[11px]">
                  <span className="text-slate-400">Subject:</span> <span className="font-medium text-slate-700">{combinedPreview.subject || "—"}</span>
                </div>
                <div className="rounded border border-slate-200 bg-white overflow-hidden">
                  <EmailFrame html={combinedPreview.html} minHeight={200} maxHeight={460} />
                </div>
                <p className="mt-1.5 px-0.5 text-[10px] text-muted-foreground">
                  Each of the {selectedHospEmails.length} hospital{selectedHospEmails.length === 1 ? "" : "s"} gets this exact email (greeted by their own name){includeDoctorEmail ? `; each of the ${combinedPreview.doctorCount} doctors also gets a note listing every hospital` : ""}.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Individual mode — preview the per-doctor working-opportunity email. */
          <div className="rounded-md border bg-white">
            <button
              type="button"
              onClick={() => setShowPreview(s => !s)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Eye className="h-3.5 w-3.5 text-teal-600" />
              {showPreview ? "Hide" : "Preview"} the working-opportunity email
              {previewDoc && previewHosp && (
                <span className="ml-1 font-normal text-slate-400 truncate">· {previewDoc.name} → {previewHosp.name}</span>
              )}
            </button>
            {showPreview && (
              <div className="border-t p-2 bg-slate-50/60">
                {!previewDoc || !previewHosp ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground italic">
                    Pick at least one doctor and one hospital to preview.
                  </div>
                ) : (
                  <>
                    <div className="mb-1.5 px-0.5 text-[11px]">
                      <span className="text-slate-400">Subject:</span> <span className="font-medium text-slate-700">{previewSubject || "—"}</span>
                    </div>
                    <div className="rounded border border-slate-200 bg-white overflow-hidden">
                      <EmailFrame html={previewHtml} minHeight={180} maxHeight={420} />
                    </div>
                    <p className="mt-1.5 px-0.5 text-[10px] text-muted-foreground">
                      Sample render — every selected doctor gets their own copy with their name. The real send mints the branded signature per sender.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          {mode === "combined" ? (
            <Button onClick={sendCombined} disabled={sending || selectedDocs.length === 0 || selectedHospEmails.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
              {sending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
                : <><Send className="h-4 w-4 mr-1.5" /> Send to {selectedHospEmails.length || ""} hospital{selectedHospEmails.length === 1 ? "" : "s"}</>}
            </Button>
          ) : (
            <Button onClick={send} disabled={sending || pairCount === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
              {sending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending {progress ? `${progress.done}/${progress.total}` : ""}…</>
                : <><Send className="h-4 w-4 mr-1.5" /> Send {pairCount || ""} email{pairCount === 1 ? "" : "s"}</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PicklistItem { id: string; checked: boolean; onToggle: () => void; primary: string; secondary: string }
function Picklist({ icon, title, count, query, onQuery, loading, emptyText, items, onSelectAll, onClear, headerExtra }: {
  icon: React.ReactNode; title: string; count: number; query: string; onQuery: (v: string) => void;
  loading?: boolean; emptyText: string; items: PicklistItem[]; onSelectAll: () => void; onClear: () => void;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-white flex flex-col min-h-0">
      <div className="px-2.5 py-1.5 border-b flex items-center gap-1.5">
        {icon}
        <span className="text-[12px] font-medium">{title}</span>
        {count > 0 && <Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">{count} selected</Badge>}
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          <button type="button" onClick={onSelectAll} className="text-teal-700 hover:underline">All</button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={onClear} className="text-slate-500 hover:underline">Clear</button>
        </div>
      </div>
      <div className="p-1.5 border-b flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="h-8 pl-7 text-[12px]" />
        </div>
        {headerExtra}
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground italic">{emptyText}</div>
        ) : items.map(it => (
          <label key={it.id} className="flex items-start gap-2 px-2.5 py-1.5 hover:bg-teal-50/50 cursor-pointer border-b border-slate-50">
            <Checkbox checked={it.checked} onCheckedChange={it.onToggle} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium truncate">{it.primary}</span>
              {it.secondary && <span className="block text-[10px] text-muted-foreground truncate">{it.secondary}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

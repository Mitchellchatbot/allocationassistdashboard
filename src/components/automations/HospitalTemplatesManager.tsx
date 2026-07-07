import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hospital as HospitalIcon, Image as ImageIcon, Search, Save, Eye, RotateCcw, Pencil, Wand2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useHospitals, useUpdateHospital, type Hospital } from "@/hooks/use-hospitals";
import {
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  renderTemplate, type EmailTemplate,
} from "@/hooks/use-email-templates";
import { FLOW_DEFINITIONS, FLOW_ORDER } from "@/lib/automation-flows";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import { EmailPreview } from "@/components/EmailPreview";

// The doctor "working opportunity" email — the one carrying the hospital photo
// ({{hospital_image}}). send-flow-email's email_doctor stage defaults to this and
// falls back to the hospital's own variant (hospitals.doctor_template_key).
const DEFAULT_DOCTOR_KEY = "profile_sent_doctor";
const ownKeyFor = (h: Hospital) => `${DEFAULT_DOCTOR_KEY}__${h.id}`;

// Put the photo just after the greeting when a template lacks the slot.
function withImageSlot(html: string): string {
  if (!html || html.includes("{{hospital_image}}")) return html;
  const i = html.indexOf("</p>");
  return i === -1 ? `{{hospital_image}}\n${html}` : `${html.slice(0, i + 4)}\n{{hospital_image}}${html.slice(i + 4)}`;
}

// Full send signature (logo + website) so the preview matches the real email —
// mirrors send-flow-email's signatureHtml() / EmailTemplatesTab's stand-in.
const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const FULL_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SANS};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SANS};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;"><img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" /></td></tr>
</table>`;
const FULL_SIGNATURE_TEXT = `\n\nWarmest Regards,\nThe Allocation Assist team\n\nJumeirah Lakes Towers, Dubai, UAE\nwww.allocationassist.com\n`;

// Concrete values people type in a draft → the token they become when you press
// "Make template". Sample is used to render the live preview naturally.
const KNOWN_FIELDS: Array<{ token: string; label: string; sample: string }> = [
  { token: "doctor_name",           label: "Doctor name",     sample: "Dr. Heena Sharma" },
  { token: "doctor_speciality",     label: "Specialty",       sample: "Pediatrics" },
  { token: "hospital_name",         label: "Hospital",        sample: "Mediclinic" },
  { token: "hospital_contact_name", label: "Hospital contact", sample: "Hassan" },
  { token: "city",                  label: "City",            sample: "Dubai" },
  { token: "country",               label: "Country",         sample: "UAE" },
];
// Structural tokens inserted at the cursor (not typed as literal text).
const INSERT_TOKENS: Array<{ token: string; label: string }> = [
  { token: "hospital_image",        label: "Hospital photo" },
  { token: "signature",             label: "Signature" },
  { token: "doctor_card_html",      label: "Doctor card" },
  { token: "doctor_row_table_html", label: "Doctor details table" },
];
const stub = (label: string) => `<p style="color:#94a3b8;font-style:italic;">[${label} renders here at send time]</p>`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Dictionaries for "Auto-detect" — recognise obvious values in a draft and
// suggest them as variables (the team still reviews before replacing).
const CITY_LIST = ["Abu Dhabi", "Al Ain", "Al Dhafra", "Dubai", "Sharjah", "Ras Al Khaimah", "Ajman", "Fujairah", "Umm Al Quwain", "Doha", "Riyadh", "Jeddah", "Dammam", "Al Ahsa", "Dhahran", "Khobar", "Mecca", "Medina", "Manama", "Kuwait City", "Muscat"];
const COUNTRY_LIST = ["United Arab Emirates", "Saudi Arabia", "UAE", "KSA", "Qatar", "Oman", "Bahrain", "Kuwait"];
const SPECIALTY_LIST = ["Emergency Medicine", "Family Medicine", "Internal Medicine", "General Surgery", "Plastic Surgery", "Intensive Care", "Neonatology", "Neurosurgery", "Paediatrics", "Pediatrics", "Cardiology", "Neurology", "Orthopaedics", "Orthopedics", "Radiology", "Anaesthesiology", "Anesthesiology", "Dermatology", "Oncology", "Psychiatry", "Obstetrics", "Gynaecology", "Gynecology", "Ophthalmology", "Otolaryngology", "Urology", "Nephrology", "Gastroenterology", "Endocrinology", "Pulmonology", "Pathology", "Haematology", "Hematology", "Rheumatology", "ENT"];

/** Best-effort scan of a draft for obvious concrete values → the token they map
 *  to. Only patterns we can recognise safely: "Dr. <Name>", a known hospital
 *  name, and dictionary GCC city / country / specialty. */
function detectValues(text: string, hospitalNames: string[]): Partial<Record<string, string>> {
  const out: Record<string, string> = {};
  const dr = text.match(/\bDr\.?\s+[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}/);
  if (dr) out.doctor_name = dr[0].replace(/\s+/g, " ").trim();
  const lc = text.toLowerCase();
  let bestHospital = "";
  for (const n of hospitalNames) {
    if (n && n.length > 4 && lc.includes(n.toLowerCase()) && n.length > bestHospital.length) bestHospital = n;
  }
  if (bestHospital) out.hospital_name = bestHospital;
  const firstMatch = (list: string[]) =>
    [...list].sort((a, b) => b.length - a.length).find(x => new RegExp(`\\b${escapeRegExp(x)}\\b`, "i").test(text));
  const city = firstMatch(CITY_LIST);       if (city) out.city = city;
  const country = firstMatch(COUNTRY_LIST);  if (country) out.country = country;
  const spec = firstMatch(SPECIALTY_LIST);   if (spec) out.doctor_speciality = spec;
  return out;
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "template";

/** Profile Sent → per-hospital Working-Opportunity editor + a spacious template
 *  maker. Photo → hospitals.image_url; copy → the hospital's doctor template
 *  (hospitals.doctor_template_key), both used automatically by send-flow-email. */
export function HospitalTemplatesManager() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const { data: templates = [] } = useEmailTemplates();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Hospital | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? hospitals.filter(h =>
          h.name.toLowerCase().includes(q) ||
          h.city?.toLowerCase().includes(q) ||
          h.country?.toLowerCase().includes(q))
      : hospitals;
    return [...base].sort((a, b) => rank(b) - rank(a));
  }, [hospitals, search]);

  function rank(h: Hospital) {
    return (h.image_url ? 2 : 0) + (h.doctor_template_key ? 1 : 0);
  }

  const withPhoto = hospitals.filter(h => h.image_url).length;
  const withCopy  = hospitals.filter(h => h.doctor_template_key).length;
  const hospitalNames = useMemo(() => hospitals.map(h => h.name).filter(Boolean), [hospitals]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-teal-600" /> Hospital Working-Opportunity templates
            </CardTitle>
            <CardDescription className="mt-1 max-w-[720px]">
              Each hospital's photo and "we have an opportunity" email copy — used automatically whenever a
              working-opportunity email goes out about that hospital. Or start a brand-new template: write it normally,
              then let <em>Make template</em> turn the names into variables.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px]">{withPhoto} photo</Badge>
            <Badge variant="outline" className="text-[10px]">{withCopy} copy</Badge>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New template
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hospitals by name, city, country..."
            className="pl-7 text-[12px] h-8"
          />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-[12px] text-muted-foreground">Loading hospitals…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-muted-foreground">No hospitals match.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto pr-1">
            {filtered.map(h => (
              <button
                key={h.id}
                onClick={() => setEditing(h)}
                className="group text-left rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-teal-300 hover:shadow-sm transition-all"
              >
                <div className="relative aspect-[16/10] bg-slate-100">
                  {h.image_url ? (
                    <img src={h.image_url} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-300">
                      <HospitalIcon className="h-7 w-7" />
                    </div>
                  )}
                  <div className="absolute inset-0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow">
                      <Pencil className="h-3 w-3" /> Edit
                    </span>
                  </div>
                  {h.doctor_template_key && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-teal-600 text-white text-[8.5px] font-medium px-1.5 py-0.5 shadow-sm">
                      Custom copy
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-1.5">
                  <div className="text-[11.5px] font-medium text-slate-800 truncate">{h.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {[h.city, h.country].filter(Boolean).join(" · ") || "No location"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {editing && (
        <TemplateStudio mode="hospital" hospital={editing} templates={templates} allHospitalNames={hospitalNames} onClose={() => setEditing(null)} />
      )}
      {creating && (
        <TemplateStudio mode="new" templates={templates} allHospitalNames={hospitalNames} onClose={() => setCreating(false)} />
      )}
    </Card>
  );
}

function TemplateStudio({ mode, hospital, templates, allHospitalNames, onClose }: {
  mode: "hospital" | "new";
  hospital?: Hospital;
  templates: EmailTemplate[];
  allHospitalNames: string[];
  onClose: () => void;
}) {
  const updateH   = useUpdateHospital();
  const createTpl = useCreateEmailTemplate();
  const updateTpl = useUpdateEmailTemplate();
  const deleteTpl = useDeleteEmailTemplate();

  // ── Resolve the base template we're editing ──────────────────────────────
  const ownKey    = hospital ? ownKeyFor(hospital) : "";
  const ownTpl    = hospital ? templates.find(t => t.key === ownKey) ?? null : null;
  const linkedTpl = hospital?.doctor_template_key ? templates.find(t => t.key === hospital.doctor_template_key) ?? null : null;
  const base = mode === "hospital"
    ? (ownTpl ?? linkedTpl ?? templates.find(t => t.key === DEFAULT_DOCTOR_KEY) ?? null)
    : null;
  const editTpl = mode === "hospital" ? (ownTpl ?? (linkedTpl && linkedTpl.key !== DEFAULT_DOCTOR_KEY ? linkedTpl : null)) : null;
  const linked = !!editTpl;

  const seedHtml = mode === "hospital" ? withImageSlot(base?.body_html ?? "") : "";

  // ── State ────────────────────────────────────────────────────────────────
  const [name, setName]         = useState("");
  const [flowKey, setFlowKey]   = useState<string>("profile_sent");
  const [imageUrl, setImageUrl] = useState(hospital?.image_url ?? "");
  const [subject, setSubject]   = useState(base?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(seedHtml);
  const [bodyText, setBodyText] = useState(base?.body_text ?? "");
  const [values, setValues]     = useState<Record<string, string>>(
    hospital ? { hospital_name: hospital.name, city: hospital.city ?? "", country: hospital.country ?? "" } : {},
  );
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving]   = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode !== "hospital") return;
    setSubject(base?.subject ?? "");
    setBodyText(base?.body_text ?? "");
    setBodyHtml(withImageSlot(base?.body_html ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const insertToken = (tok: string) => {
    const el = bodyRef.current;
    const wrapped = `{{${tok}}}`;
    if (!el) { setBodyHtml(h => h + wrapped); return; }
    const start = el.selectionStart ?? bodyHtml.length;
    const end   = el.selectionEnd ?? bodyHtml.length;
    const next  = bodyHtml.slice(0, start) + wrapped + bodyHtml.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => { el.focus(); const p = start + wrapped.length; el.setSelectionRange(p, p); });
  };

  const autoDetect = () => {
    const fullText = `${subject}\n${bodyHtml}\n${bodyText}`;
    const found = detectValues(fullText, allHospitalNames);
    const keys = Object.keys(found);
    if (!keys.length) { toast.info("Couldn't auto-detect anything — type the values in the boxes."); return; }
    setValues(v => {
      const next = { ...v };
      for (const [k, val] of Object.entries(found)) {
        const cur = next[k]?.trim();
        // Fill empty boxes, or replace a prefilled value that isn't actually in
        // the draft (so the swap below will find a real match).
        const curInText = !!cur && new RegExp(escapeRegExp(cur), "i").test(fullText);
        if (!cur || !curInText) next[k] = val!;
      }
      return next;
    });
    toast.success(`Detected ${keys.length}: ${keys.map(k => found[k]).join(", ")}. Review, then Replace.`);
  };

  const makeTemplate = () => {
    let s = subject, h = bodyHtml, t = bodyText, count = 0;
    for (const f of KNOWN_FIELDS) {
      const val = (values[f.token] ?? "").trim();
      if (val.length < 2) continue; // ignore blanks / single chars
      const re = new RegExp(escapeRegExp(val), "gi");
      const tok = `{{${f.token}}}`;
      const rep = (str: string) => str.replace(re, () => { count++; return tok; });
      s = rep(s); h = rep(h); t = rep(t);
    }
    setSubject(s); setBodyHtml(h); setBodyText(t);
    if (count) toast.success(`Replaced ${count} value${count === 1 ? "" : "s"} with variables.`);
    else toast.info("Fill the boxes with the exact words from your draft first.");
  };

  const uploadImg = async (file: File) => {
    setImgBusy(true);
    try { const att = await uploadEmailAttachment(file); setImageUrl(att.path); toast.success("Photo uploaded."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setImgBusy(false); }
  };

  // ── Preview ────────────────────────────────────────────────────────────
  const previewVars: Record<string, string> = {
    ...Object.fromEntries(KNOWN_FIELDS.map(f => [f.token, (values[f.token]?.trim() || f.sample)])),
    signature: FULL_SIGNATURE_HTML,
    signature_text: FULL_SIGNATURE_TEXT,
    hospital_image: imageUrl
      ? `<img src="${imageUrl}" alt="${hospital?.name ?? "Hospital"}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`
      : "",
    doctor_card_html: stub("the doctor profile card"),
    doctor_row_table_html: stub("the doctor details table"),
    doctors_table_html: stub("the multi-doctor table"),
    logo_header: "",
  };
  const previewSubject = renderTemplate(subject, previewVars);
  const previewText    = renderTemplate(bodyText, previewVars);
  const previewHtml    = renderTemplate(
    withImageSlot(bodyHtml || `<pre style="font-family:inherit;white-space:pre-wrap;">${bodyText}</pre>`),
    previewVars, { html: true },
  );

  const dirty = mode === "new"
    ? !!(name.trim() && (subject.trim() || bodyHtml.trim()))
    : imageUrl !== (hospital?.image_url ?? "") || subject !== (base?.subject ?? "") || bodyText !== (base?.body_text ?? "") || bodyHtml !== seedHtml;

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (mode === "new" && !name.trim()) { toast.error("Give the template a name."); return; }
    if (!subject.trim()) { toast.error("Subject is required."); return; }
    setSaving(true);
    try {
      const bodyToSave = withImageSlot(bodyHtml);
      if (mode === "new") {
        let key = `custom_${slugify(name)}`;
        for (let n = 2; templates.some(t => t.key === key); n++) key = `custom_${slugify(name)}_${n}`;
        await createTpl.mutateAsync({
          key, name: name.trim(), flow_key: flowKey,
          subject, body_text: bodyText, body_html: bodyToSave,
          variables: KNOWN_FIELDS.map(f => f.token),
        });
        toast.success(`Created template "${name.trim()}".`);
      } else if (hospital) {
        if (imageUrl !== (hospital.image_url ?? "")) {
          await updateH.mutateAsync({ id: hospital.id, name: hospital.name, image_url: imageUrl || null });
        }
        let key = editTpl?.key ?? "";
        if (editTpl) {
          await updateTpl.mutateAsync({ id: editTpl.id, subject, body_text: bodyText, body_html: bodyToSave });
        } else {
          key = ownKey;
          await createTpl.mutateAsync({
            key, name: `Working Opportunity — ${hospital.name}`, flow_key: "profile_sent",
            subject, body_text: bodyText, body_html: bodyToSave, variables: base?.variables ?? [],
          });
        }
        if (hospital.doctor_template_key !== key) {
          await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: key });
        }
        toast.success(`Saved ${hospital.name}'s working-opportunity template.`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const revertToDefault = async () => {
    if (!hospital) return;
    if (!confirm(`Revert ${hospital.name} to the generic working-opportunity copy? Its custom photo stays; its custom wording is unlinked.`)) return;
    setSaving(true);
    try {
      await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: null });
      if (ownTpl) await deleteTpl.mutateAsync(ownTpl.id);
      toast.success(`${hospital.name} now uses the generic copy.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "new" ? "New template" : hospital!.name;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[1120px] max-h-[94vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            {mode === "new" ? <Wand2 className="h-4 w-4 text-teal-600" /> : <HospitalIcon className="h-4 w-4 text-teal-600" />}
            {title}
            <span className="text-[11px] font-normal text-muted-foreground">· Working-Opportunity email</span>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {mode === "new"
              ? "Write the email with real names, fill the boxes below with the exact words you used, then press Make template to turn them into reusable variables."
              : linked
                ? "Editing this hospital's own template — used automatically on every working-opportunity send about it."
                : "This hospital uses the generic email. Saving creates a dedicated copy just for it."}
          </DialogDescription>
        </DialogHeader>

        {/* Mobile tab switch */}
        <div className="flex lg:hidden gap-1 px-6 pt-3">
          {(["edit", "preview"] as const).map(t => (
            <button key={t} onClick={() => setMobileTab(t)}
              className={`px-3 py-1 text-[11px] rounded-md border ${mobileTab === t ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>
              {t === "edit" ? "Write" : "Preview"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* ── Left: write ──────────────────────────────────────────── */}
          <div className={`${mobileTab === "preview" ? "hidden lg:block" : ""} p-6 space-y-4 lg:border-r`}>
            {mode === "new" && (
              <div className="grid grid-cols-[1fr_180px] gap-3">
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Template name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Working Opportunity — Cleveland Clinic" className="mt-1 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Type</Label>
                  <Select value={flowKey} onValueChange={setFlowKey}>
                    <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FLOW_ORDER.map(fk => (
                        <SelectItem key={fk} value={fk} className="text-[12px]">{FLOW_DEFINITIONS[fk].name}</SelectItem>
                      ))}
                      <SelectItem value="onboarding" className="text-[12px]">{FLOW_DEFINITIONS.onboarding?.name ?? "Onboarding"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {mode === "hospital" && (
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hospital photo</Label>
                <div className="flex items-center gap-2">
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Paste an image URL, or upload →" className="h-9 text-[12px] flex-1" />
                  <label className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] cursor-pointer hover:bg-slate-50 ${imgBusy ? "opacity-60 pointer-events-none" : ""}`}>
                    {imgBusy ? "Uploading…" : "Upload"}
                    <input type="file" accept="image/png,image/jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); e.currentTarget.value = ""; }} />
                  </label>
                </div>
                {imageUrl.trim() && (
                  <div className="flex items-center gap-2 pt-1">
                    <img src={imageUrl} alt={hospital?.name} className="h-16 w-28 rounded object-cover border border-slate-200" />
                    <button type="button" onClick={() => setImageUrl("")} className="text-[11px] text-rose-600 hover:underline">Remove photo</button>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</Label>
                <span className={`text-[10px] ${subject.length > 70 ? "text-rose-600 font-medium" : subject.length > 55 ? "text-amber-600" : "text-muted-foreground"}`}>{subject.length} chars</span>
              </div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 text-[12px]" placeholder="We have an opportunity for you" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email body</Label>
                <div className="flex flex-wrap gap-1 justify-end">
                  {INSERT_TOKENS.map(t => (
                    <button key={t.token} type="button" onClick={() => insertToken(t.token)}
                      title={`Insert {{${t.token}}}`}
                      className="text-[10px] rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600 hover:border-teal-300 hover:text-teal-700">
                      + {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                ref={bodyRef}
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                className="text-[12.5px] min-h-[360px] font-mono leading-relaxed"
                placeholder={"Hi Dr. Heena Sharma!\n\nWe have an opportunity with Mediclinic in Dubai and we highly recommend your profile.\n\n(Write it naturally with real names — Make template turns them into variables.)"}
              />
            </div>

            {/* Make template — values → variables */}
            <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-teal-900 flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Make template
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-teal-800 hover:bg-teal-100" onClick={autoDetect} title="Scan the draft and fill the boxes automatically">
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Auto-detect
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-teal-300 text-teal-800 hover:bg-teal-100" onClick={makeTemplate}>
                    Replace with variables
                  </Button>
                </div>
              </div>
              <p className="text-[10.5px] text-teal-900/70">
                <strong>Auto-detect</strong> finds obvious values (Dr. names, known hospitals, GCC cities/specialties) — or type the
                exact words yourself. Then <strong>Replace</strong> swaps every match for its variable (e.g.
                <code className="bg-white/70 px-1 rounded mx-0.5">Heena Sharma</code>→<code className="bg-white/70 px-1 rounded mx-0.5">{`{{doctor_name}}`}</code>).
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {KNOWN_FIELDS.map(f => (
                  <div key={f.token} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 w-20 shrink-0">{f.label}</span>
                    <Input
                      value={values[f.token] ?? ""}
                      onChange={e => setValues(v => ({ ...v, [f.token]: e.target.value }))}
                      placeholder={f.sample}
                      className="h-7 text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Plain-text fallback (optional)</Label>
              <Textarea value={bodyText} onChange={e => setBodyText(e.target.value)} className="mt-1 text-[12px] min-h-[100px] font-mono" placeholder="Same message without formatting…" />
            </div>
          </div>

          {/* ── Right: live preview ─────────────────────────────────── */}
          <div className={`${mobileTab === "edit" ? "hidden lg:block" : ""} p-6 bg-slate-50/50`}>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
              <Eye className="h-3.5 w-3.5" /> Live preview
            </Label>
            <EmailPreview
              subject={previewSubject}
              html={previewHtml}
              text={previewText}
              from={mode === "hospital" ? "Opportunities <opportunities@allocationassist.com>" : "Allocation Assist <hello@allocationassist.com>"}
              to={mode === "hospital" ? "[doctor]" : "[recipient]"}
              templateKey={editTpl?.key ?? (mode === "hospital" ? DEFAULT_DOCTOR_KEY : "new template")}
              banner={<>Preview with sample values — real sends use live data.</>}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between px-6 py-4 border-t">
          <div>
            {mode === "hospital" && linked && (
              <Button variant="ghost" onClick={revertToDefault} disabled={saving} className="text-rose-600 hover:text-rose-700">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Revert to generic copy
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !dirty}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : mode === "new" ? "Create template" : "Save template"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

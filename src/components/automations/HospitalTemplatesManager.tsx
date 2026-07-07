import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Hospital as HospitalIcon, Image as ImageIcon, Search, Save, Eye, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useHospitals, useUpdateHospital, type Hospital } from "@/hooks/use-hospitals";
import {
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  renderTemplate, type EmailTemplate,
} from "@/hooks/use-email-templates";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import { EmailPreview } from "@/components/EmailPreview";

// The stage-default hospital working-opportunity template every hospital falls
// back to (mirrors send-flow-email's route.template_key for `email_hospital`).
const DEFAULT_HOSPITAL_KEY = "profile_sent_hospital";
// A hospital's OWN copy lives at this key and is referenced by hospitals.template_key.
// Keyed by id so two same-named hospitals never collide.
const ownKeyFor = (h: Hospital) => `${DEFAULT_HOSPITAL_KEY}__${h.id}`;

// Sample values so the preview reads like a real send instead of {{tokens}}.
// The RAW-HTML tokens (card/table/signature) get italic stand-ins — the real
// ones are minted by send-flow-email at send time.
const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const PREVIEW_SIGNATURE_HTML = `
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:20px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>`;
const stub = (label: string) => `<p style="color:#94a3b8;font-style:italic;">[${label} renders here at send time]</p>`;

/** Manager surfaced on the Profile Sent page: give any hospital its own
 *  Working-Opportunity photo + email copy. Editing clones the shared default
 *  into a per-hospital template (keyed by id) and points the hospital at it, so
 *  every profile send to that hospital uses its own version — the shared
 *  default and other hospitals are untouched. */
export function HospitalTemplatesManager() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const { data: templates = [] } = useEmailTemplates();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Hospital | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? hospitals.filter(h =>
          h.name.toLowerCase().includes(q) ||
          h.city?.toLowerCase().includes(q) ||
          h.country?.toLowerCase().includes(q))
      : hospitals;
    // Photos first, then custom-copy, then the rest — so the hospitals the team
    // has already themed float to the top.
    return [...base].sort((a, b) => rank(b) - rank(a));
  }, [hospitals, search]);

  function rank(h: Hospital) {
    return (h.image_url ? 2 : 0) + (h.template_key === ownKeyFor(h) ? 1 : 0);
  }

  const withPhoto = hospitals.filter(h => h.image_url).length;
  const withCopy  = hospitals.filter(h => h.template_key === ownKeyFor(h)).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-teal-600" /> Hospital email templates
            </CardTitle>
            <CardDescription className="mt-1 max-w-[680px]">
              Give any hospital its own Working-Opportunity photo and email copy. Edits here become that hospital's
              own template — every profile send to it uses this version, and the shared default is left untouched.
            </CardDescription>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant="outline" className="text-[10px]">{withPhoto} with photo</Badge>
            <Badge variant="outline" className="text-[10px]">{withCopy} custom copy</Badge>
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
            {filtered.map(h => {
              const custom = h.template_key === ownKeyFor(h);
              return (
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
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow">
                        <Pencil className="h-3 w-3" /> Edit
                      </span>
                    </div>
                    {custom && (
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
              );
            })}
          </div>
        )}
      </CardContent>

      {editing && (
        <HospitalTemplateEditor
          hospital={editing}
          templates={templates}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function HospitalTemplateEditor({ hospital, templates, onClose }: {
  hospital: Hospital;
  templates: EmailTemplate[];
  onClose: () => void;
}) {
  const updateH   = useUpdateHospital();
  const createTpl = useCreateEmailTemplate();
  const updateTpl = useUpdateEmailTemplate();
  const deleteTpl = useDeleteEmailTemplate();

  const ownKey = ownKeyFor(hospital);
  const ownTpl = templates.find(t => t.key === ownKey) ?? null;
  // Seed from the hospital's own copy if it exists, else whatever it currently
  // sends (its template_key override, if any), else the shared default.
  const base =
    ownTpl ??
    (hospital.template_key ? templates.find(t => t.key === hospital.template_key) : null) ??
    templates.find(t => t.key === DEFAULT_HOSPITAL_KEY) ??
    null;

  const [imageUrl, setImageUrl] = useState(hospital.image_url ?? "");
  const [subject,  setSubject]  = useState(base?.subject ?? "");
  const [bodyText, setBodyText] = useState(base?.body_text ?? "");
  const [bodyHtml, setBodyHtml] = useState(base?.body_html ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed if the base template arrives after mount (templates still loading).
  useEffect(() => {
    if (ownTpl || (!subject && !bodyText && !bodyHtml)) {
      setSubject(base?.subject ?? "");
      setBodyText(base?.body_text ?? "");
      setBodyHtml(base?.body_html ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  const hasOwn = !!ownTpl;
  const dirty =
    imageUrl !== (hospital.image_url ?? "") ||
    subject  !== (base?.subject ?? "") ||
    bodyText !== (base?.body_text ?? "") ||
    bodyHtml !== (base?.body_html ?? "");

  const uploadImg = async (file: File) => {
    setImgBusy(true);
    try {
      const att = await uploadEmailAttachment(file);
      setImageUrl(att.path);
      toast.success("Photo uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setImgBusy(false);
    }
  };

  const previewVars: Record<string, string> = {
    doctor_name:          "Dr. Heena Sharma",
    doctor_speciality:    "Pediatrics",
    doctor_specialty:     "Pediatrics",
    hospital_name:        hospital.name,
    hospital:             hospital.name,
    hospital_contact_name: hospital.primary_contact_name || "",
    city:                 hospital.city || "Dubai",
    country:              hospital.country || "UAE",
    profile_link:         "https://allocationassist.com/shared-profile/heena-sharma",
    signature:            PREVIEW_SIGNATURE_HTML,
    hospital_image:       imageUrl
      ? `<img src="${imageUrl}" alt="${hospital.name}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`
      : "",
    logo_header:          "",
    doctor_card_html:     stub("the doctor profile card"),
    doctor_row_table_html: stub("the doctor details table"),
    doctors_table_html:   stub("the multi-doctor table"),
  };
  const previewSubject = renderTemplate(subject, previewVars);
  const previewText    = renderTemplate(bodyText, previewVars);
  const previewHtml    = renderTemplate(
    bodyHtml || `<pre style="font-family:inherit;white-space:pre-wrap;">${bodyText}</pre>`,
    previewVars, { html: true },
  );

  const handleSave = async () => {
    if (!subject.trim()) { toast.error("Subject is required."); return; }
    setSaving(true);
    try {
      // 1) Photo → the hospital row (drives {{hospital_image}} everywhere).
      if (imageUrl !== (hospital.image_url ?? "")) {
        await updateH.mutateAsync({ id: hospital.id, name: hospital.name, image_url: imageUrl || null });
      }
      // 2) Copy → this hospital's OWN template (create-on-first-edit), then
      //    point the hospital at it so sends pick it up.
      if (hasOwn) {
        await updateTpl.mutateAsync({ id: ownTpl!.id, subject, body_text: bodyText, body_html: bodyHtml });
      } else {
        await createTpl.mutateAsync({
          key: ownKey,
          name: `Working Opportunity — ${hospital.name}`,
          flow_key: "profile_sent",
          subject, body_text: bodyText, body_html: bodyHtml,
          variables: base?.variables ?? [],
        });
      }
      if (hospital.template_key !== ownKey) {
        await updateH.mutateAsync({ id: hospital.id, name: hospital.name, template_key: ownKey });
      }
      toast.success(`Saved ${hospital.name}'s template.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const revertToDefault = async () => {
    if (!confirm(`Revert ${hospital.name} to the shared default copy? Its custom photo stays; its custom wording is removed.`)) return;
    setSaving(true);
    try {
      await updateH.mutateAsync({ id: hospital.id, name: hospital.name, template_key: null });
      if (ownTpl) await deleteTpl.mutateAsync(ownTpl.id);
      toast.success(`${hospital.name} now uses the shared default copy.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[920px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HospitalIcon className="h-4 w-4 text-teal-600" /> {hospital.name}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {hasOwn
              ? "Editing this hospital's own Working-Opportunity template."
              : "This hospital uses the shared default. Saving creates a dedicated copy just for it — other hospitals are unaffected."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: editor */}
          <div className="space-y-3">
            {/* Photo */}
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Working-opportunity photo</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="Paste an image URL, or upload →"
                  className="h-9 text-[12px] flex-1"
                />
                <label className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] cursor-pointer hover:bg-slate-50 ${imgBusy ? "opacity-60 pointer-events-none" : ""}`}>
                  {imgBusy ? "Uploading…" : "Upload"}
                  <input type="file" accept="image/png,image/jpeg" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {imageUrl.trim() && (
                <div className="flex items-center gap-2 pt-1">
                  <img src={imageUrl} alt={hospital.name} className="h-16 w-28 rounded object-cover border border-slate-200" />
                  <button type="button" onClick={() => setImageUrl("")} className="text-[11px] text-rose-600 hover:underline">Remove photo</button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</Label>
                <span className={`text-[10px] ${subject.length > 70 ? "text-rose-600 font-medium" : subject.length > 55 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {subject.length} chars
                </span>
              </div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 text-[12px]" />
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email body (HTML)</Label>
              <Textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                className="mt-1 text-[12px] min-h-[220px] font-mono"
                placeholder="<p>Hello {{hospital_name}} team,</p> {{hospital_image}} ..."
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Use <code className="bg-slate-100 px-1 rounded">{`{{hospital_image}}`}</code> where the photo should appear,
                and tokens like <code className="bg-slate-100 px-1 rounded">{`{{doctor_name}}`}</code>,
                <code className="bg-slate-100 px-1 rounded ml-1">{`{{hospital_name}}`}</code>. Leave blank to fall back to the plain-text body.
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Plain-text fallback</Label>
              <Textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                className="mt-1 text-[12px] min-h-[120px] font-mono"
                placeholder="Hello {{hospital_name}} team, ..."
              />
            </div>
          </div>

          {/* Right: live preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Live preview
              </Label>
              <div className="flex rounded-md border overflow-hidden lg:hidden">
                <button onClick={() => setMode("edit")} className={`px-2.5 py-1 text-[11px] ${mode === "edit" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Edit</button>
                <button onClick={() => setMode("preview")} className={`px-2.5 py-1 text-[11px] ${mode === "preview" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>Preview</button>
              </div>
            </div>
            <div className={`${mode === "edit" ? "hidden lg:block" : ""} rounded-lg border overflow-hidden`}>
              <EmailPreview
                subject={previewSubject}
                html={previewHtml}
                text={previewText}
                from="Hospital Intro <hospitalintro@allocationassist.com>"
                to={hospital.primary_recruiter_email || "[hospital recruiter]"}
                templateKey={hasOwn ? ownKey : DEFAULT_HOSPITAL_KEY}
                banner={<>Preview for <strong>{hospital.name}</strong> with sample doctor data — real sends use live data.</>}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {hasOwn && (
              <Button variant="ghost" onClick={revertToDefault} disabled={saving} className="text-rose-600 hover:text-rose-700">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Revert to default copy
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !dirty}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save template"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

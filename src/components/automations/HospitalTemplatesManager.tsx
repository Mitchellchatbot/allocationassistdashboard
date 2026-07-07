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

// The doctor "working opportunity" email — the one that carries the hospital
// photo ({{hospital_image}}). send-flow-email's email_doctor stage defaults to
// this and falls back to the hospital's own variant (hospitals.doctor_template_key).
const DEFAULT_DOCTOR_KEY = "profile_sent_doctor";
// A hospital's OWN working-opportunity copy (created only when it had no
// pre-built profile_sent_doctor_<hospital> template to start from). Keyed by id.
const ownKeyFor = (h: Hospital) => `${DEFAULT_DOCTOR_KEY}__${h.id}`;

// Put the photo just after the greeting when a template doesn't already have the
// slot — so a freshly-cloned generic template still shows the hospital photo.
function withImageSlot(html: string): string {
  if (!html || html.includes("{{hospital_image}}")) return html;
  const i = html.indexOf("</p>");
  return i === -1 ? `{{hospital_image}}\n${html}` : `${html.slice(0, i + 4)}\n{{hospital_image}}${html.slice(i + 4)}`;
}

const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const PREVIEW_SIGNATURE_HTML = `
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:20px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>`;
const PREVIEW_SIGNATURE_TEXT = `\n\nWarmest Regards,\nThe Allocation Assist team\n\nJumeirah Lakes Towers, Dubai, UAE\nwww.allocationassist.com\n`;

/** Profile Sent → per-hospital Working-Opportunity editor. Each hospital's photo
 *  and doctor "we have an opportunity" copy live here; send-flow-email uses them
 *  automatically (hospitals.image_url → {{hospital_image}}, hospitals
 *  .doctor_template_key → the email_doctor template) so edits reach real sends
 *  without anyone hand-picking a template. */
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
    return [...base].sort((a, b) => rank(b) - rank(a));
  }, [hospitals, search]);

  function rank(h: Hospital) {
    return (h.image_url ? 2 : 0) + (h.doctor_template_key ? 1 : 0);
  }

  const withPhoto = hospitals.filter(h => h.image_url).length;
  const withCopy  = hospitals.filter(h => h.doctor_template_key).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-teal-600" /> Hospital Working-Opportunity templates
            </CardTitle>
            <CardDescription className="mt-1 max-w-[720px]">
              Each hospital's photo and doctor "we have an opportunity" email copy. Whatever you set here is used
              automatically whenever a working-opportunity email goes out about that hospital — the photo appears in the
              email and the wording is that hospital's own. No template-picking needed.
            </CardDescription>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant="outline" className="text-[10px]">{withPhoto} with photo</Badge>
            <Badge variant="outline" className="text-[10px]">{withCopy} with copy</Badge>
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
  const ownTpl    = templates.find(t => t.key === ownKey) ?? null;
  const linkedTpl = hospital.doctor_template_key ? templates.find(t => t.key === hospital.doctor_template_key) ?? null : null;
  // Seed from the hospital's own copy, else its linked WO template, else generic.
  const base =
    ownTpl ??
    linkedTpl ??
    templates.find(t => t.key === DEFAULT_DOCTOR_KEY) ??
    null;
  // Editing an existing dedicated/linked template in place (vs the shared generic).
  const editTpl = ownTpl ?? (linkedTpl && linkedTpl.key !== DEFAULT_DOCTOR_KEY ? linkedTpl : null);
  const linked = !!editTpl;

  const seedHtml = withImageSlot(base?.body_html ?? "");
  const [imageUrl, setImageUrl] = useState(hospital.image_url ?? "");
  const [subject,  setSubject]  = useState(base?.subject ?? "");
  const [bodyText, setBodyText] = useState(base?.body_text ?? "");
  const [bodyHtml, setBodyHtml] = useState(seedHtml);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed once the base template resolves (templates still loading on open).
  useEffect(() => {
    setSubject(base?.subject ?? "");
    setBodyText(base?.body_text ?? "");
    setBodyHtml(withImageSlot(base?.body_html ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  const dirty =
    imageUrl !== (hospital.image_url ?? "") ||
    subject  !== (base?.subject ?? "") ||
    bodyText !== (base?.body_text ?? "") ||
    bodyHtml !== seedHtml;

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
    doctor_name:    "Dr. Heena Sharma",
    hospital_name:  hospital.name,
    hospital:       hospital.name,
    city:           hospital.city || "Dubai",
    country:        hospital.country || "UAE",
    signature:      PREVIEW_SIGNATURE_HTML,
    signature_text: PREVIEW_SIGNATURE_TEXT,
    hospital_image: imageUrl
      ? `<img src="${imageUrl}" alt="${hospital.name}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`
      : "",
  };
  const previewSubject = renderTemplate(subject, previewVars);
  const previewText    = renderTemplate(bodyText, previewVars);
  const previewHtml    = renderTemplate(
    withImageSlot(bodyHtml || `<pre style="font-family:inherit;white-space:pre-wrap;">${bodyText}</pre>`),
    previewVars, { html: true },
  );

  const handleSave = async () => {
    if (!subject.trim()) { toast.error("Subject is required."); return; }
    setSaving(true);
    try {
      // Photo → the hospital row (drives {{hospital_image}}).
      if (imageUrl !== (hospital.image_url ?? "")) {
        await updateH.mutateAsync({ id: hospital.id, name: hospital.name, image_url: imageUrl || null });
      }
      // Copy → the hospital's WO template. Edit its own/linked one in place, else
      // clone the generic into a dedicated per-hospital template.
      const bodyToSave = withImageSlot(bodyHtml);
      let key = editTpl?.key ?? "";
      if (editTpl) {
        await updateTpl.mutateAsync({ id: editTpl.id, subject, body_text: bodyText, body_html: bodyToSave });
      } else {
        key = ownKey;
        await createTpl.mutateAsync({
          key, name: `Working Opportunity — ${hospital.name}`,
          flow_key: "profile_sent",
          subject, body_text: bodyText, body_html: bodyToSave,
          variables: base?.variables ?? [],
        });
      }
      if (hospital.doctor_template_key !== key) {
        await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: key });
      }
      toast.success(`Saved ${hospital.name}'s working-opportunity template.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const revertToDefault = async () => {
    if (!confirm(`Revert ${hospital.name} to the generic working-opportunity copy? Its custom photo stays; its custom wording is unlinked.`)) return;
    setSaving(true);
    try {
      await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: null });
      // Only delete a dedicated clone — never the shared pre-built templates.
      if (ownTpl) await deleteTpl.mutateAsync(ownTpl.id);
      toast.success(`${hospital.name} now uses the generic working-opportunity copy.`);
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
            <span className="text-[11px] font-normal text-muted-foreground">· Working-Opportunity email</span>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {linked
              ? "Editing this hospital's own working-opportunity template — used automatically on every send about this hospital."
              : "This hospital uses the generic working-opportunity email. Saving creates a dedicated copy just for it (other hospitals unaffected)."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: editor */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hospital photo</Label>
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
                className="mt-1 text-[12px] min-h-[240px] font-mono"
                placeholder="<p>Hi {{doctor_name}}!</p> {{hospital_image}} <p>We have an opportunity with ...</p>"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                <code className="bg-slate-100 px-1 rounded">{`{{hospital_image}}`}</code> is where the photo appears
                (added automatically if you remove it), plus tokens like
                <code className="bg-slate-100 px-1 rounded ml-1">{`{{doctor_name}}`}</code>.
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Plain-text fallback</Label>
              <Textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                className="mt-1 text-[12px] min-h-[120px] font-mono"
                placeholder="Hi {{doctor_name}}! We have an opportunity with ..."
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
                from="Opportunities <opportunities@allocationassist.com>"
                to="[doctor]"
                templateKey={editTpl?.key ?? DEFAULT_DOCTOR_KEY}
                banner={<>Preview for <strong>{hospital.name}</strong> with a sample doctor — real sends use live data.</>}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {linked && (
              <Button variant="ghost" onClick={revertToDefault} disabled={saving} className="text-rose-600 hover:text-rose-700">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Revert to generic copy
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

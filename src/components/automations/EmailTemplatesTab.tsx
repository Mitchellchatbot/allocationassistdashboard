import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, Save, Eye, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useEmailTemplates, useUpdateEmailTemplate, renderTemplate,
  type EmailTemplate,
} from "@/hooks/use-email-templates";
import { FLOW_DEFINITIONS, FLOW_ORDER } from "@/lib/automation-flows";
import { EmailPreview } from "@/components/EmailPreview";
import { FullScreenEmailPreview } from "@/components/FullScreenEmailPreview";

// Preview tokens used to render templates in the editor. Use the
// production app origin so previews read like the real thing — not
// 'aa.example'. These are PREVIEW-ONLY; send-flow-email mints the
// real tokens at send time.

// Mirror of send-flow-email's signatureHtml() with the AA hands+heart
// icon embedded above the "Allocation Assist" line, in the AA sans-serif stack.
// Kept here so the template editor preview shows the same closing
// block recipients see — not a literal {{signature}} token.
const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const PREVIEW_SANS    = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const PREVIEW_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SANS};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SANS};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
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

const SAMPLE_VARS: Record<string, string> = {
  doctor_name:        "Dr. Heena Sharma",
  doctor_speciality:  "Pediatrics",
  hospital_name:      "American Hospital Dubai",
  hospital_contact_name: "Hassan",
  city:               "Dubai",
  country:            "UAE",
  form_link:          "https://allocationassist.com/forms/abc123",
  upload_link:        "https://allocationassist.com/upload-cv/abc123",
  profile_link:       "https://allocationassist.com/shared-profile/heena-sharma",
  guide_link:         "https://allocationassist.com/guides/dubai.pdf",
  payment_link:       "https://allocationassist.com/pay/xyz789",
  amount:             "AED 21,000",
  due_date:           "May 30, 2026",
  days_overdue:       "12",
  interview_datetime: "May 23, 2026 · 14:00 GST",
  interview_format:   "Microsoft Teams",
  signature:          PREVIEW_SIGNATURE_HTML,
  signature_text:     PREVIEW_SIGNATURE_TEXT,
};

export function EmailTemplatesTab() {
  const { data: templates = [], isLoading } = useEmailTemplates();
  const [search,     setSearch]     = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Default-select the first template once data loads.
    if (!selectedId && templates.length > 0) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.flow_key?.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, EmailTemplate[]>();
    for (const t of filtered) {
      const k = t.flow_key ?? "other";
      (m.get(k) ?? m.set(k, []).get(k))!.push(t);
    }
    return m;
  }, [filtered]);

  const selected = templates.find(t => t.id === selectedId) ?? null;

  const placeholderCount = templates.filter(t => t.body_text.startsWith("PLACEHOLDER")).length;

  return (
    <div className="space-y-3">
      {placeholderCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 flex items-start gap-2 text-[12px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-[2px]" />
            <div>
              <strong>{placeholderCount}</strong> of {templates.length} templates still hold placeholder copy. Replace as Saif sends real templates — saved copy goes live on the next send.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Card className="h-fit">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-[13px] flex items-center gap-1.5 font-medium">
                <Mail className="h-3.5 w-3.5 text-teal-600" />
                Templates
                <span className="text-muted-foreground font-normal text-[11px]">· {templates.length}</span>
              </CardTitle>
            </div>
            <div className="relative mt-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or subject..."
                className="pl-7 text-[11px] h-7"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[640px] overflow-y-auto">
              {isLoading && <div className="px-3 py-4 text-[11px] text-muted-foreground">Loading...</div>}
              {!isLoading && [...FLOW_ORDER, "other"].map(flowKey => {
                const items = grouped.get(flowKey);
                if (!items || items.length === 0) return null;
                const flowName = flowKey === "other" ? "Other" : FLOW_DEFINITIONS[flowKey as keyof typeof FLOW_DEFINITIONS].name;
                return (
                  <div key={flowKey}>
                    <div className="px-3 pt-3 pb-1 text-[9px] uppercase tracking-[0.12em] text-slate-400 font-medium">
                      {flowName}
                    </div>
                    {items.map(t => {
                      const isPlaceholder = t.body_text.startsWith("PLACEHOLDER");
                      const isSelected    = selectedId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors border-l-2 ${
                            isSelected ? "border-teal-500 bg-teal-50/40" : "border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[12px] font-medium truncate text-slate-800">{t.name}</div>
                            {isPlaceholder && (
                              <span className="text-[9px] uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0 rounded-sm shrink-0">
                                draft
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {t.subject || "No subject"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selected && <TemplateEditor key={selected.id} template={selected} />}
        {!selected && (
          <Card>
            <CardContent className="py-12 text-center text-[12px] text-muted-foreground">
              Select a template on the left to edit.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({ template }: { template: EmailTemplate }) {
  const [subject,  setSubject]  = useState(template.subject);
  const [bodyText, setBodyText] = useState(template.body_text);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [mode,     setMode]     = useState<"edit" | "preview">("edit");
  const [fs,       setFs]       = useState(false);
  const update = useUpdateEmailTemplate();

  // Reset local state when a different template is selected. The `key` prop
  // on the parent component handles full unmount/remount, so this only fires
  // if the same selected template is updated externally (e.g. realtime).
  useEffect(() => {
    setSubject(template.subject);
    setBodyText(template.body_text);
    setBodyHtml(template.body_html);
  }, [template.id, template.subject, template.body_text, template.body_html]);

  const dirty =
    subject  !== template.subject  ||
    bodyText !== template.body_text ||
    bodyHtml !== template.body_html;

  const handleSave = async () => {
    await update.mutateAsync({ id: template.id, subject, body_text: bodyText, body_html: bodyHtml });
    toast.success(`Saved ${template.name}`);
  };

  const previewSubject = renderTemplate(subject,  SAMPLE_VARS);
  const previewText    = renderTemplate(bodyText, SAMPLE_VARS);
  const previewHtml    = renderTemplate(
    bodyHtml || `<pre style="font-family: inherit; white-space: pre-wrap;">${bodyText}</pre>`,
    SAMPLE_VARS,
    { html: true },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              <code className="bg-slate-100 px-1 py-0.5 rounded">{template.key}</code>
              {template.flow_key && (<> · flow: <code className="bg-slate-100 px-1 py-0.5 rounded">{template.flow_key}</code></>)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setMode("edit")}
                className={`px-3 py-1 text-[11px] ${mode === "edit" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Edit
              </button>
              <button
                onClick={() => setMode("preview")}
                className={`px-3 py-1 text-[11px] flex items-center gap-1 ${mode === "preview" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
            <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {update.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {template.variables.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Available tokens</div>
            <div className="flex flex-wrap gap-1">
              {template.variables.map(v => (
                <Badge key={v} variant="outline" className="text-[10px] font-mono cursor-pointer hover:bg-slate-100"
                  onClick={() => {
                    navigator.clipboard.writeText(`{{${v}}}`);
                    toast.success(`Copied {{${v}}}`);
                  }}>
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Click a token to copy. Tokens render with sample values in Preview mode.
            </div>
          </div>
        )}

        {mode === "edit" ? (
          <>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</Label>
                <span className={`text-[10px] ${
                  // Gmail truncates around 70 chars on desktop, ~30 on mobile preview pane.
                  // Color-code so writers see when they're approaching the cliff. Token
                  // substitution generally adds length, so this is a conservative budget.
                  subject.length > 70 ? "text-rose-600 font-medium" :
                  subject.length > 55 ? "text-amber-600" :
                  "text-muted-foreground"
                }`}>
                  {subject.length} chars{subject.length > 70 && " · may truncate"}
                </span>
              </div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Plain-text body</Label>
              <Textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                className="mt-1 text-[12px] min-h-[200px] font-mono"
                placeholder="Hello {{doctor_name}}, ..."
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">HTML body (optional)</Label>
              <Textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                className="mt-1 text-[12px] min-h-[160px] font-mono"
                placeholder="<p>Hello {{doctor_name}},</p>"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Leave empty to use a basic wrapper around the plain-text body. Paste in Saif's HTML when available.
              </div>
            </div>
          </>
        ) : (
          <EmailPreview
            subject={previewSubject}
            html={previewHtml}
            text={previewText}
            from="Hospital Intro <hospitalintro@allocationassist.com>"
            to="[Recipient]"
            templateKey={template.key}
            banner={<>Rendered with <strong>sample values</strong> — real sends use the live doctor/hospital data.</>}
            onExpand={() => setFs(true)}
          />
        )}
        <FullScreenEmailPreview open={fs} onClose={() => setFs(false)} subject={previewSubject} html={previewHtml} text={previewText} from="Hospital Intro <hospitalintro@allocationassist.com>" to="[Recipient]" />
      </CardContent>
    </Card>
  );
}

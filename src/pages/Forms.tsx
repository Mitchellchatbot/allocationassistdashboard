/**
 * Forms page — manage external forms (Typeform now, others later)
 * and view their submissions inline.
 *
 * Left column: list of registered forms. Click one → right column
 * shows submission history with each answer rendered as a key/value
 * row.
 *
 * "Connect form" button opens a dialog that captures the Typeform
 * URL + display name, extracts the form_id from the URL, mints a
 * webhook secret, then shows the exact webhook URL + secret to paste
 * into Typeform's webhook settings.
 */
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Plus, ExternalLink, Copy, CheckCircle2, AlertCircle, Trash2, Inbox, ChevronRight } from "lucide-react";
import {
  useForms, useFormResponses, useCreateForm, useDeleteForm, generateWebhookSecret,
  type Form, type FormResponse,
} from "@/hooks/use-forms";
import { toast } from "sonner";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const WEBHOOK_URL = `${supabaseUrl}/functions/v1/typeform-webhook`;

/** Extract a Typeform form ID from a URL like:
 *    https://form.typeform.com/to/AbCdEfGh
 *    https://yourname.typeform.com/to/AbCdEfGh
 *  Returns null if the URL doesn't match. */
function extractTypeformId(url: string): string | null {
  const m = url.trim().match(/typeform\.com\/to\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export default function Forms() {
  const { data: forms = [], isLoading } = useForms();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = useMemo(() => forms.find(f => f.id === selectedId) ?? null, [forms, selectedId]);

  // Auto-select first form so the page never shows an empty right
  // pane after the initial load.
  if (!selectedId && forms.length > 0) {
    setSelectedId(forms[0].id);
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-teal-600" />
              Forms
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Typeform + future external forms wired into the dashboard. Each form submission lands here as a row; emails matched to a Zoho lead/DoB get linked automatically.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Connect a Typeform
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: list of forms */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] flex items-center justify-between">
                <span>Connected forms</span>
                <Badge variant="outline" className="text-[10px] bg-slate-50">{forms.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="px-4 py-6 text-[11px] text-muted-foreground">Loading…</div>
              ) : forms.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                  <ClipboardList className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                  <p>No forms connected yet.</p>
                  <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="mt-3">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Connect your first form
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {forms.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${selectedId === f.id ? "bg-teal-50/40 border-l-2 border-teal-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-slate-800 truncate">{f.name}</div>
                        <Badge variant="outline" className="text-[9px] bg-white shrink-0">
                          {f.response_count}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {f.description ?? `${f.provider} · ${f.form_type}`}
                      </div>
                      {f.last_response_at && (
                        <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                          Last submission · {relativeTime(f.last_response_at)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: selected form's responses */}
          <div className="lg:col-span-2">
            {selected ? (
              <FormDetail form={selected} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-[12px] text-muted-foreground">
                  Select a form on the left to see its submissions.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <ConnectFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </DashboardLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * FormDetail — header + response timeline.
 * ──────────────────────────────────────────────────────────────────── */
function FormDetail({ form }: { form: Form }) {
  const { data: responses = [], isLoading } = useFormResponses(form.id);
  const del = useDeleteForm();
  const [secretShown, setSecretShown] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${form.name}"? All ${form.response_count} response${form.response_count === 1 ? "" : "s"} will be lost.`)) return;
    try {
      await del.mutateAsync(form.id);
      toast.success(`Deleted ${form.name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-[14px] flex items-center gap-2">
              {form.name}
              {form.active ? null : <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">Inactive</Badge>}
            </CardTitle>
            <CardDescription className="text-[11px]">
              {form.description ?? "—"} · {form.provider} · form id <code className="text-[10px] bg-slate-100 px-1 rounded">{form.provider_form_id}</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {form.public_url && (
              <a href={form.public_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open form
                </Button>
              </a>
            )}
            <Button size="sm" variant="outline" onClick={handleDelete} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Webhook hint — surfaces the URL + secret on every form so
            the team can re-paste into Typeform if they ever recreate
            the webhook. */}
        <div className="rounded-md border bg-slate-50/50 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">Webhook details</span>
            <button onClick={() => setSecretShown(s => !s)} className="text-[10px] text-teal-700 hover:underline">
              {secretShown ? "Hide" : "Show"} secret
            </button>
          </div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-x-3 gap-y-1 items-center">
            <span className="text-muted-foreground">URL</span>
            <CopyableCode value={WEBHOOK_URL} />
            <span className="text-muted-foreground">Secret</span>
            <CopyableCode value={secretShown ? (form.webhook_secret ?? "(not set)") : "••••••••••••••••"} canCopy={secretShown && !!form.webhook_secret} />
          </div>
        </div>

        {/* Responses */}
        <div className="text-[11px] font-medium text-slate-700">
          Submissions · {responses.length}
        </div>
        {isLoading ? (
          <div className="text-[11px] text-muted-foreground py-3">Loading submissions…</div>
        ) : responses.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center">
            <Inbox className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-[12px] text-muted-foreground">No submissions yet.</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">When someone fills out the form, it'll land here within seconds.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {responses.map(r => <ResponseRow key={r.id} response={r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResponseRow({ response }: { response: FormResponse }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(response.answers ?? {});
  const summary = entries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ");
  return (
    <div className="rounded-md border bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-slate-800 truncate">
            {response.respondent_name ?? response.respondent_email ?? "Anonymous submission"}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{summary || "—"}</div>
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0">{relativeTime(response.submitted_at)}</div>
      </button>
      {open && (
        <div className="border-t bg-slate-50/30 px-3 py-2 space-y-1">
          {entries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No answers captured.</p>
          ) : (
            entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-slate-800 break-words">{v}</span>
              </div>
            ))
          )}
          {response.doctor_id && (
            <div className="text-[10px] text-teal-700 mt-2 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Linked to <code className="text-[10px] bg-teal-50 px-1 rounded">{response.doctor_id}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyableCode({ value, canCopy = true }: { value: string; canCopy?: boolean }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success("Copied.");
  };
  return (
    <div className="inline-flex items-center gap-1 bg-white border rounded px-2 py-1 text-[10px] font-mono">
      <span className="truncate max-w-[360px]">{value}</span>
      {canCopy && (
        <button type="button" onClick={handleCopy} className="text-slate-500 hover:text-slate-800">
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Connect form dialog.
 * ──────────────────────────────────────────────────────────────────── */
function ConnectFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateForm();
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl]                 = useState("");
  const [formType, setFormType]       = useState("custom");
  const [done, setDone]               = useState<Form | null>(null);

  const reset = () => {
    setName(""); setDescription(""); setUrl(""); setFormType("custom"); setDone(null);
  };
  const handleClose = () => { reset(); onClose(); };

  const formId = extractTypeformId(url);

  const handleCreate = async () => {
    if (!name.trim() || !formId) return;
    const secret = generateWebhookSecret();
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        form_type: formType.trim() || "custom",
        provider: "typeform",
        provider_form_id: formId,
        public_url: url.trim(),
        webhook_secret: secret,
      });
      setDone(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create form");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <ClipboardList className="h-4 w-4 text-teal-600" />
            {done ? "Form connected — finish setup in Typeform" : "Connect a Typeform"}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {done
              ? "Last step: open Typeform's webhook settings for this form, paste the URL + secret below, and you're done."
              : "Paste the Typeform URL — we extract the form ID, mint a webhook secret, and give you the exact URL to wire up."}
          </p>
        </DialogHeader>

        {!done ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Typeform URL</label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://form.typeform.com/to/AbCdEfGh" />
              {url && !formId && (
                <p className="text-[10px] text-rose-600">Couldn't find a Typeform form ID in that URL. It should look like <code>typeform.com/to/...</code>.</p>
              )}
              {formId && <p className="text-[10px] text-emerald-700">✓ Form ID: <code>{formId}</code></p>}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Display name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Doctor intake form" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description (optional)</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this form is for" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Type</label>
              <Input value={formType} onChange={e => setFormType(e.target.value)} placeholder="doctor_intake / hospital_feedback / custom" />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <ol className="text-[12px] text-slate-800 space-y-3 list-decimal pl-5">
              <li>
                Open your Typeform → click <strong>Connect</strong> → <strong>Webhooks</strong> → <strong>Add a webhook</strong>.
              </li>
              <li>
                Paste this URL as the endpoint:
                <CopyableCode value={WEBHOOK_URL} />
              </li>
              <li>
                Open <strong>View details</strong> → <strong>Secret</strong> and paste:
                <CopyableCode value={done.webhook_secret ?? ""} />
                <p className="text-[10px] text-muted-foreground mt-1">This validates every submission really came from Typeform.</p>
              </li>
              <li>
                Toggle the webhook <strong>on</strong>. Submit a test response on the form — it should appear in the dashboard within a few seconds.
              </li>
            </ol>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 mt-[2px] shrink-0" />
              <div className="text-[11px] text-emerald-900">
                Form registered as <strong>{done.name}</strong>. Submissions will appear under "Connected forms".
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!done ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || !formId || create.isPending}>
                {create.isPending ? "Connecting…" : "Connect form"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)      return `${secs}s ago`;
  if (secs < 3600)    return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400)  return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604_800) return `${Math.floor(secs / 86_400)}d ago`;
  return d.toLocaleDateString();
}

/** Unused export marker — keep TypeScript happy when nothing else imports
 *  AlertCircle from this file. */
export const _AlertCircle = AlertCircle;

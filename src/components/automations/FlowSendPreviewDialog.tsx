/**
 * FlowSendPreviewDialog — preview-before-send for ANY flow email.
 *
 * Until now only the profile-sent flow (SendProfileDialog) showed a preview;
 * every other manual approval step (shortlist, interview, relocation guide,
 * payment invoice/reminders, the generic "Send now") fired blind. This is the
 * single reusable gate: open it from any send action, it renders the exact
 * email via send-flow-email's `dry_run` (in a sandboxed iframe so the email's
 * own styles can't leak into the dashboard), and only on "Send" does it run
 * the caller's real send via `onConfirm`.
 *
 * For triggers that send a stage the run hasn't entered yet (e.g. a "Confirm
 * shortlist" button → send_shortlist_email), pass `previewStage` (+ optional
 * `previewMetadata` like the picked relocation city); send-flow-email renders
 * that stage WITHOUT mutating the run, then `onConfirm` does the real advance
 * + send.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { EmailPreviewStudio, type StudioEmail } from "@/components/EmailPreviewStudio";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import type { EmailAttachment } from "@/lib/email-attachments";

interface FlowPreview { from: string; to: string; subject: string; html: string; text?: string }

/** Edits captured from the preview, passed to onConfirm so the caller can
 *  forward them to send-flow-email (which ships them verbatim). Empty when the
 *  team sent the template version unchanged. `attachments` ride this one send —
 *  send-flow-email reads them from the invoke body (already-uploaded http URLs). */
export interface EmailOverrides {
  subject_override?: string;
  html_override?: string;
  attachments?: Array<{ filename: string; path: string }>;
}

/** dry-run preview with a hard timeout — supabase.functions.invoke can hang on
 *  a cold start / dropped connection, leaving the spinner forever. */
async function fetchPreview(
  runId: string,
  previewStage?: string,
  previewMetadata?: Record<string, unknown>,
): Promise<FlowPreview> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("The preview didn't build in time. Please try again.")), 60_000);
  });
  try {
    const call = supabase.functions.invoke("send-flow-email", {
      body: {
        run_id: runId,
        dry_run: true,
        ...(previewStage ? { preview_stage: previewStage } : {}),
        ...(previewMetadata ? { preview_metadata: previewMetadata } : {}),
      },
    }) as Promise<{ data: { ok?: boolean; preview?: FlowPreview; error?: string } | null; error: unknown }>;
    const { data, error } = await Promise.race([call, timeout]);
    if (error) throw new Error((error as { message?: string })?.message ?? "Couldn't build the preview.");
    if (!data?.ok || !data.preview) throw new Error(data?.error ?? "Couldn't build the preview.");
    return data.preview;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function FlowSendPreviewDialog({
  open, onClose, runId, previewStage, previewMetadata,
  title = "Email preview", confirmLabel = "Send now", onConfirm,
}: {
  open:             boolean;
  onClose:          () => void;
  runId:            string | null;
  previewStage?:    string;
  previewMetadata?: Record<string, unknown>;
  title?:           string;
  confirmLabel?:    string;
  onConfirm:        (overrides?: EmailOverrides) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<FlowPreview | null>(null);
  const [err,     setErr]     = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Editable-preview state — see EditableEmailPreview. editSubject/editHtml hold
  // the live (possibly edited) values; `preview` keeps the pristine render.
  const [editSubject, setEditSubject] = useState("");
  const [editHtml,    setEditHtml]    = useState("");
  const [resetTick,   setResetTick]   = useState(0);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  const edited = !!preview && (editSubject !== preview.subject || editHtml !== preview.html);

  // (Re)build the preview whenever the dialog opens for a run/stage.
  useEffect(() => {
    if (!open || !runId) { setPreview(null); setErr(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setPreview(null); setAttachments([]);
    fetchPreview(runId, previewStage, previewMetadata)
      .then(p => {
        if (cancelled) return;
        setPreview(p);
        setEditSubject(p.subject);
        setEditHtml(p.html);
        setResetTick(t => t + 1);
      })
      .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : "Couldn't build the preview."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // previewMetadata is an object literal at the call site; stringify so we
    // don't refetch every render on referential inequality.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId, previewStage, JSON.stringify(previewMetadata ?? null)]);

  const handleSend = async () => {
    setSending(true);
    try {
      const overrides: EmailOverrides = {
        ...(edited ? { subject_override: editSubject, html_override: editHtml } : {}),
        ...(attachments.length ? { attachments: attachments.map(a => ({ filename: a.filename, path: a.path })) } : {}),
      };
      await onConfirm(Object.keys(overrides).length ? overrides : undefined);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const ready = !!preview && !loading && !err;

  const headerExtra = (
    <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-2.5 text-[11px] text-slate-500 shadow-sm">
      {edited
        ? <span className="font-medium text-teal-700">Edited — your version sends, not the template.</span>
        : preview
          ? <>Review before sending{preview.to ? <> · To <span className="text-slate-700">{preview.to}</span></> : null} — edit the subject or body in the preview if needed.</>
          : "What goes out — review before sending."}
    </div>
  );

  const email: StudioEmail = {
    key: "email",
    label: title,
    subLabel: preview?.to ? `To ${preview.to}` : undefined,
    controls: ready ? (
      <AttachmentsPicker
        attachments={attachments}
        onChange={setAttachments}
        disabled={sending}
        hint="CV, logbook, etc. — rides on this email"
      />
    ) : null,
    preview: loading ? (
      <div className="grid min-h-0 w-full flex-1 place-items-center text-sm text-muted-foreground">
        <span><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" /> Building preview…</span>
      </div>
    ) : err ? (
      <div className="grid min-h-0 w-full flex-1 place-items-center px-6 text-center text-sm text-rose-600">
        <div><AlertTriangle className="mx-auto mb-2 h-5 w-5" />{err}</div>
      </div>
    ) : preview ? (
      <EditableEmailPreview
        subject={editSubject}
        html={preview.html}
        onSubjectChange={setEditSubject}
        onHtmlChange={setEditHtml}
        resetKey={resetTick}
        edited={edited}
        onReset={() => {
          if (!preview) return;
          setEditSubject(preview.subject);
          setEditHtml(preview.html);
          setResetTick(t => t + 1);
        }}
        from={preview.from}
        to={preview.to}
        text={preview.text}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        className="min-h-0 flex-1 border-0 rounded-none shadow-none"
      />
    ) : null,
  };

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
      <Button onClick={handleSend} disabled={sending || loading || !preview}>
        <Send className="h-3.5 w-3.5 mr-1.5" />
        {sending ? "Sending…" : confirmLabel}
      </Button>
    </>
  );

  return (
    <EmailPreviewStudio
      open={open}
      onClose={() => { if (!sending) onClose(); }}
      title={title}
      emails={[email]}
      headerExtra={headerExtra}
      footer={footer}
    />
  );
}

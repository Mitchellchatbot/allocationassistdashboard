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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface FlowPreview { from: string; to: string; subject: string; html: string; text?: string }

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
  onConfirm:        () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<FlowPreview | null>(null);
  const [err,     setErr]     = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // (Re)build the preview whenever the dialog opens for a run/stage.
  useEffect(() => {
    if (!open || !runId) { setPreview(null); setErr(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setPreview(null);
    fetchPreview(runId, previewStage, previewMetadata)
      .then(p => { if (!cancelled) setPreview(p); })
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
      await onConfirm();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="sm:max-w-[780px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {preview?.subject
              ? (<><span className="font-medium text-slate-700">Subject:</span> {preview.subject}{preview.to ? <> · To {preview.to}</> : null}</>)
              : "What goes out — review before sending."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex-1 min-h-[40vh] grid place-items-center text-sm text-muted-foreground">
            <span><RefreshCw className="h-4 w-4 mr-2 animate-spin inline" /> Building preview…</span>
          </div>
        )}
        {err && !loading && (
          <div className="flex-1 min-h-[40vh] grid place-items-center text-sm text-rose-600 px-6 text-center">
            <div><AlertTriangle className="h-5 w-5 mx-auto mb-2" />{err}</div>
          </div>
        )}
        {preview && !loading && !err && (
          <iframe
            title="Email preview"
            sandbox=""
            className="w-full flex-1 min-h-[62vh] rounded-md border border-slate-200 bg-white"
            srcDoc={preview.html}
          />
        )}

        <DialogFooter>
          <Button onClick={handleSend} disabled={sending || loading || !preview}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {sending ? "Sending…" : confirmLabel}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

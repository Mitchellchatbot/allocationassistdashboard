import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { uploadEmailAttachment, removeEmailAttachment, type EmailAttachment } from "@/lib/email-attachments";
import { cn } from "@/lib/utils";

/** Format bytes for an attachment chip, e.g. "248 KB" / "1.2 MB". */
function formatBytes(n?: number): string {
  if (!n || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Attach CVs / logbooks to an outgoing email. Files upload to the public
 * email-attachments bucket the moment they're picked, so the actual send just
 * forwards the resulting URLs (no large payloads through the edge function).
 * Removing a chip deletes the uploaded file best-effort.
 *
 * Shared by the Send Profile dialog (in-memory list) and the Batches dialog
 * (persisted onto the scheduled_batch_sends row). The caller owns the list and
 * decides where it's stored.
 */
export function AttachmentsPicker({
  attachments, onChange, disabled, hint,
}: {
  attachments: EmailAttachment[];
  onChange: (next: EmailAttachment[]) => void;
  disabled?: boolean;
  /** Override the default "sent to the hospital" caption. */
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: EmailAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await uploadEmailAttachment(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Couldn't attach ${file.name}`);
      }
    }
    if (added.length) {
      onChange([...attachments, ...added]);
      toast.success(`Attached ${added.length} file${added.length === 1 ? "" : "s"}`);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";  // allow re-picking same file
  };

  const remove = (att: EmailAttachment) => {
    onChange(attachments.filter(a => a.storage_path !== att.storage_path));
    removeEmailAttachment(att.storage_path);
  };

  // Paste (Ctrl+V) a copied file or screenshot anywhere in the dialog → attach.
  // Only acts when the clipboard carries FILES, so pasting text into the email
  // body is untouched. Re-bound when `attachments` changes so handleFiles closes
  // over the latest list.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) { e.preventDefault(); handleFiles(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, attachments]);

  return (
    <div
      onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) handleFiles(e.dataTransfer.files); }}
      className={cn(
        "rounded-md border bg-slate-50/40 p-2.5 space-y-2 transition-colors",
        dragging && "border-teal-400 border-dashed bg-teal-50",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" /> Attachments
          <span className="normal-case tracking-normal text-[10.5px] text-muted-foreground/80">
            — {hint ?? "CV, logbook, etc. — attached to the hospital email only"}
          </span>
        </div>
        <Button
          type="button" variant="outline" size="sm" className="h-7 text-[11px]"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…</>
            : <><Paperclip className="h-3 w-3 mr-1" /> Add file</>}
        </Button>
        <input
          ref={inputRef} type="file" multiple hidden
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">{dragging ? "Drop to attach…" : "Drag files here, paste (Ctrl+V), or click Add file. PDF, DOC, DOCX, PNG or JPG up to 25MB each."}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map(att => (
            <span
              key={att.storage_path}
              className="inline-flex items-center gap-1.5 rounded-full border bg-white pl-2 pr-1 py-0.5 text-[11px] text-slate-700"
            >
              <FileText className="h-3 w-3 text-teal-600 shrink-0" />
              <span className="max-w-[180px] truncate">{att.filename}</span>
              {att.size ? <span className="text-muted-foreground">· {formatBytes(att.size)}</span> : null}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-slate-100 disabled:opacity-50"
                disabled={disabled}
                onClick={() => remove(att)}
                aria-label={`Remove ${att.filename}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

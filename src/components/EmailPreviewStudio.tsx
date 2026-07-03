import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Mail, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EmailPreviewStudio — the shared "review before send" surface.
 *
 * A 90%×90% centered modal split 30 / 70: the LEFT rail holds all the
 * customization (an email switcher, per-email controls like the template
 * picker / attachments, and a global header slot for routing + warnings); the
 * RIGHT pane shows ONE email at a time. The right pane is caller-provided —
 * every call site passes its existing editable preview there, which keeps the
 * in-place editing + the true-100% "Full screen" expand working untouched.
 *
 * All emails stay MOUNTED (inactive ones hidden) so switching between them
 * never discards in-progress edits or resets the caret.
 *
 * Two exports:
 *   - EmailPreviewStudioLayout — the split content; drop it into any container
 *     (e.g. a DialogContent already sized to 90×90) that owns the modal frame.
 *   - EmailPreviewStudio       — the same layout wrapped in its own centered
 *     Radix dialog, for callers that don't already have a modal.
 */
export interface StudioEmail {
  key:       string;
  /** Switcher label, e.g. "Hospital intro". */
  label:     string;
  /** Small secondary line under the label (recipient, step, …). */
  subLabel?: string;
  /** Left-rail controls specific to this email (template picker, attachments…). */
  controls?: ReactNode;
  /** Right-pane content — the editable email preview. */
  preview:   ReactNode;
}

interface LayoutProps {
  emails:            StudioEmail[];
  activeKey?:        string;
  onActiveKeyChange?: (k: string) => void;
  title?:            ReactNode;
  subtitle?:         ReactNode;
  /** Global left-rail content shown above the per-email controls (routing,
   *  BCC, send-mode, warnings). Always visible regardless of active email. */
  headerExtra?:      ReactNode;
  /** Bottom action bar (Back / Confirm …). */
  footer?:           ReactNode;
  /** When set, a close button appears in the header. */
  onClose?:          () => void;
}

function Switcher({ emails, active, onChange }: { emails: StudioEmail[]; active: string; onChange: (k: string) => void }) {
  // Segmented pills for a handful of emails; a compact dropdown once there are
  // too many to fit (long chains).
  if (emails.length <= 4) {
    return (
      <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 gap-0.5">
        {emails.map(e => (
          <button
            key={e.key}
            type="button"
            onClick={() => onChange(e.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              e.key === active ? "bg-white shadow-sm text-teal-700" : "text-slate-500 hover:text-slate-700",
            )}
            title={e.subLabel ? `${e.label} — ${e.subLabel}` : e.label}
          >
            <span className="truncate max-w-[160px]">{e.label}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="relative inline-flex items-center">
      <select
        value={active}
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-[12px] font-medium text-slate-700 outline-none focus:border-teal-400"
      >
        {emails.map((e, i) => (
          <option key={e.key} value={e.key}>{i + 1}. {e.label}{e.subLabel ? ` — ${e.subLabel}` : ""}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}

export function EmailPreviewStudioLayout({
  emails, activeKey, onActiveKeyChange, title, subtitle, headerExtra, footer, onClose,
}: LayoutProps) {
  const [internal, setInternal] = useState(emails[0]?.key ?? "");
  const active = activeKey ?? internal;
  const setActive = (k: string) => { onActiveKeyChange?.(k); if (activeKey === undefined) setInternal(k); };

  // If the active key ever points at an email that no longer exists, snap back.
  useEffect(() => {
    if (emails.length && !emails.some(e => e.key === active)) setActive(emails[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, active]);

  const activeEmail = emails.find(e => e.key === active) ?? emails[0];
  const multi = emails.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header — title, email switcher, close. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Mail className="h-4 w-4 shrink-0 text-teal-600" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-800">{title ?? "Email preview"}</div>
            {subtitle && <div className="truncate text-[11px] text-slate-500">{subtitle}</div>}
          </div>
        </div>
        {multi && <div className="mx-auto"><Switcher emails={emails} active={active} onChange={setActive} /></div>}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={cn("inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-200", multi ? "" : "ml-auto")}
            title="Close (Esc)"
          >
            <X className="h-4 w-4" /> Close
          </button>
        )}
      </div>

      {/* Body — 30 / 70 split. */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail — controls. */}
        <div className="flex w-[30%] min-w-[300px] max-w-[460px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
          <div className="space-y-3 p-3">
            {headerExtra}
            {activeEmail?.subLabel && (
              <div className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">{activeEmail.label}</span> · {activeEmail.subLabel}
              </div>
            )}
            {/* Per-email controls: all mounted, only the active one shown, so
                each email's control state (template key, attachments) persists. */}
            {emails.map(e => (
              <div key={e.key} className={e.key === active ? "space-y-3" : "hidden"}>
                {e.controls}
              </div>
            ))}
          </div>
        </div>

        {/* Right pane — one email at a time. */}
        <div className="flex min-h-0 min-w-0 flex-1 bg-slate-100">
          {emails.map(e => (
            <div key={e.key} className={cn("min-h-0 min-w-0 flex-1 p-3", e.key === active ? "flex" : "hidden")}>
              {e.preview}
            </div>
          ))}
        </div>
      </div>

      {footer && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}

interface StudioProps extends LayoutProps {
  open:    boolean;
  onClose: () => void;
}

export function EmailPreviewStudio({ open, onClose, title, ...layout }: StudioProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[101] h-[90vh] w-[90vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
        >
          <DialogPrimitive.Title className="sr-only">{typeof title === "string" ? title : "Email preview"}</DialogPrimitive.Title>
          <EmailPreviewStudioLayout title={title} onClose={onClose} {...layout} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

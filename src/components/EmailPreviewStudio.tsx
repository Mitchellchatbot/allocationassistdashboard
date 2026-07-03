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
  /** Hide the built-in header switcher — use when the caller supplies its own
   *  navigation (e.g. a grouped list) in `headerExtra` and drives activeKey. */
  hideSwitcher?:     boolean;
  /** Render only the ACTIVE email (unmount the rest) instead of keeping all
   *  mounted-but-hidden. Use for read-only browsers with many emails (a chain)
   *  where there's no edit state to preserve and mounting every iframe is
   *  wasteful. Default false — editable previews keep everything mounted so
   *  switching never discards edits. */
  mountActiveOnly?:  boolean;
  /** Right-pane content shown when there are no emails yet (e.g. the wizard's
   *  doctor/hospital steps show the template with unfilled placeholders). */
  emptyState?:       ReactNode;
  /** Let the rail content fill the full height (one internal scroll area, e.g. a
   *  picker list) instead of the default scroll-the-whole-rail behaviour. The
   *  headerExtra's root should be `h-full flex flex-col` with a `flex-1` scroller. */
  railFill?:         boolean;
}

// Tabs live in the green rail: full-width segmented pills for a few emails, a
// dropdown once there are too many (long chains).
function Switcher({ emails, active, onChange }: { emails: StudioEmail[]; active: string; onChange: (k: string) => void }) {
  if (emails.length <= 4) {
    return (
      <div className="grid gap-0.5 rounded-lg bg-sidebar-accent/40 p-0.5" style={{ gridTemplateColumns: `repeat(${emails.length}, minmax(0, 1fr))` }}>
        {emails.map(e => (
          <button
            key={e.key}
            type="button"
            onClick={() => onChange(e.key)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              e.key === active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
            title={e.subLabel ? `${e.label} — ${e.subLabel}` : e.label}
          >
            <span className="truncate">{e.label}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="relative flex items-center">
      <select
        value={active}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-sidebar-border/50 bg-sidebar-accent/40 pl-3 pr-8 py-1.5 text-[12px] font-medium text-sidebar-foreground outline-none focus:border-sidebar-primary"
      >
        {emails.map((e, i) => (
          <option key={e.key} value={e.key} className="bg-white text-slate-800">{i + 1}. {e.label}{e.subLabel ? ` — ${e.subLabel}` : ""}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-sidebar-foreground/60" />
    </div>
  );
}

export function EmailPreviewStudioLayout({
  emails, activeKey, onActiveKeyChange, title, subtitle, headerExtra, footer, onClose, hideSwitcher, mountActiveOnly, emptyState, railFill,
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
  // Which emails to actually render: all (mounted, hidden when inactive) so edit
  // state survives switching, or just the active one for read-only browsers.
  const rendered = mountActiveOnly ? (activeEmail ? [activeEmail] : []) : emails;

  // No top/bottom chrome bars — the green rail carries the title, tabs, controls
  // AND the action buttons, so the right pane is all email, floor-to-ceiling.
  // The rail and the email each sit as their own rounded island on a light
  // canvas, dashboard-style, with a gap between.
  return (
    <div className="flex h-full min-h-0 gap-2.5">
      {/* LEFT RAIL — sidebar-green island. */}
      <aside className="flex w-[30%] min-w-[300px] max-w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
        {/* Title + close */}
        <div className="flex shrink-0 items-start gap-2 px-4 pt-3.5 pb-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/70" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-tight">{title ?? "Email preview"}</div>
            {subtitle && <div className="truncate text-[11px] text-sidebar-foreground/55">{subtitle}</div>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md bg-sidebar-accent/50 px-2 py-1 text-[11px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Close (Esc)"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          )}
        </div>

        {/* Tabs */}
        {multi && !hideSwitcher && (
          <div className="shrink-0 px-3 pb-2">
            <Switcher emails={emails} active={active} onChange={setActive} />
          </div>
        )}

        {/* Rail content — either a single fill-height area (a picker, one
            internal scroll) or the default scroll-the-whole-rail stack. */}
        {railFill ? (
          <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
            {headerExtra}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
            <div className="min-w-0 space-y-3">
              {headerExtra}
              {rendered.map(e => (
                <div key={e.key} className={e.key === active ? "space-y-3" : "hidden"}>
                  {e.controls}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons pinned to the bottom of the rail. text-slate-700 so
            white-bg outline buttons (Back / Cancel …) aren't white-on-white from
            the rail's light foreground; solid buttons set their own colour. */}
        {footer && (
          <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-border/40 bg-sidebar px-3 py-2.5 text-slate-700">
            {footer}
          </div>
        )}
      </aside>

      {/* RIGHT ISLAND — one solid white rounded rectangle; the preview fills it. */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {emails.length === 0
          ? (emptyState && <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-sm">{emptyState}</div>)
          : rendered.map(e => (
              <div key={e.key} className={cn("min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-sm", e.key === active ? "flex" : "hidden")}>
                {e.preview}
              </div>
            ))}
      </div>
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
        {/* z-50 mirrors shadcn's Dialog: Radix popovers (also z-50) portal
            later in the DOM so they still layer above this, and the full-screen
            expand (z-100) opened from the right pane sits cleanly on top. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 h-[92vh] w-[93vw] -translate-x-1/2 -translate-y-1/2 bg-transparent outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
        >
          <DialogPrimitive.Title className="sr-only">{typeof title === "string" ? title : "Email preview"}</DialogPrimitive.Title>
          <EmailPreviewStudioLayout title={title} onClose={onClose} {...layout} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

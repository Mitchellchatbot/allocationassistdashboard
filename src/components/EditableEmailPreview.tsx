import { useEffect, useRef } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EditableEmailPreview — the rendered email, editable in place. The subject is
 * an input and the body is a live contentEditable surface; there is no "enter
 * edit mode" step — you click the text and type. Edits are pushed up via
 * onSubjectChange / onHtmlChange and the caller ships THOSE (subject_override /
 * html_override) to the edge function, which sends them verbatim instead of
 * re-rendering from the template. A Reset chip appears once anything diverges
 * from the template render.
 *
 * Used by the preview-then-send gates:
 *   - Batch send  (src/pages/Batches.tsx)
 *   - Flow send   (src/components/automations/FlowSendPreviewDialog.tsx)
 *   - Profile send hospital + doctor emails (SendProfileDialog)
 *
 * The body is rendered via innerHTML (not a sandboxed iframe) because
 * contentEditable needs the nodes in the same document to read edits back. The
 * email's own inline styles drive its look; we only add a scroll viewport.
 * Source HTML is admin/template-authored + token values are escaped
 * server-side, so this is the same trust model as the old EmailPreview.
 *
 * The contentEditable div is intentionally UNcontrolled — React must not
 * re-render its children on every keystroke (that resets the caret). We seed
 * innerHTML imperatively whenever the upstream `html` or `resetKey` changes
 * (i.e. a fresh preview, or "Reset"), and read it back on input.
 */
interface EditableEmailPreviewProps {
  subject:         string;
  html:            string;
  onSubjectChange: (subject: string) => void;
  onHtmlChange:    (html: string) => void;
  /** Bump to force the body to re-seed from `html` (e.g. on "Reset"). */
  resetKey?:       string | number;
  /** When true, shows the Reset chip. */
  edited?:         boolean;
  onReset?:        () => void;
  from?:           string;
  to?:             string;
  className?:      string;
}

const BODY_CLASS =
  "bg-white rounded-md text-[13px] leading-relaxed text-slate-800 " +
  "[&_a]:text-teal-600 [&_a:hover]:underline [&_p]:my-3 [&_h2]:font-semibold [&_h2]:my-3 " +
  "[&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-1 [&_table]:text-[11px] [&_pre]:whitespace-pre-wrap [&_pre]:font-sans";

export function EditableEmailPreview({
  subject, html, onSubjectChange, onHtmlChange, resetKey, edited, onReset, from, to, className,
}: EditableEmailPreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Seed / re-seed the contentEditable body from the upstream HTML. Runs on the
  // first render, whenever a new preview arrives (`html`), and on an explicit
  // reset (`resetKey`) — but NOT on every keystroke, so the caret survives.
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML !== html) {
      bodyRef.current.innerHTML = html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, resetKey]);

  return (
    <div className={cn(
      "rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col min-h-0 w-full min-w-0 max-w-full",
      className,
    )}>
      {/* Editable hint + Reset — always visible at the top so editing is
          obvious and Reset is one click away (no scrolling to a toggle). */}
      <div className="px-4 py-1.5 bg-teal-50/70 border-b border-teal-100 text-[11px] text-teal-800 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <Pencil className="h-3 w-3 shrink-0" />
          <span className="truncate">Editable — click the subject or the email text to change the wording. This exact version is what sends.</span>
        </span>
        {edited && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-white px-2 py-0.5 text-[11px] font-medium text-teal-700 hover:bg-teal-50 transition-colors shrink-0"
            title="Discard edits and restore the template version"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      {/* Subject + recipient header */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 space-y-2">
        <label className="block">
          <span className="text-[9px] uppercase tracking-wider text-slate-400">Subject</span>
          <input
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Subject line"
            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[14px] font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
          />
        </label>
        {(from || to) && (
          <div className="space-y-0.5 text-[11px] text-slate-500">
            {from && (
              <div className="flex gap-3">
                <span className="font-medium text-slate-600 uppercase tracking-wider text-[9px] w-9 pt-[2px]">From</span>
                <span className="text-slate-700">{from}</span>
              </div>
            )}
            {to && (
              <div className="flex gap-3">
                <span className="font-medium text-slate-600 uppercase tracking-wider text-[9px] w-9 pt-[2px]">To</span>
                <span className="text-slate-700">{to}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body — always contentEditable. overflow-auto + min-w-0 keep a wide
          email (e.g. the ~600px doctor card) scrolling INSIDE this box instead
          of stretching the dialog. Text still wraps; only over-wide tables
          scroll. */}
      <div className="bg-slate-100/60 px-4 py-5 overflow-auto flex-1 min-h-0 min-w-0 w-full">
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onHtmlChange((e.target as HTMLDivElement).innerHTML)}
          className={cn(
            BODY_CLASS,
            "p-4 shadow-sm outline-none ring-1 ring-slate-200/70 focus:ring-2 focus:ring-teal-400 cursor-text",
          )}
        />
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EditableEmailPreview — the rendered email, but the team can tweak the
 * subject line and body wording in place before it goes out.
 *
 * Used by the two "preview, then send" gates:
 *   - Batch send  (src/pages/Batches.tsx)
 *   - Flow send   (src/components/automations/FlowSendPreviewDialog.tsx)
 *
 * Editing model:
 *   - `editing=false` → read-only render of `html` (what the template produced).
 *   - `editing=true`  → subject becomes an input; the body becomes a
 *     contentEditable surface. Edits are pushed up via onSubjectChange /
 *     onHtmlChange and the caller ships THOSE as subject_override / html_override
 *     to the edge function, which sends them verbatim instead of re-rendering.
 *
 * The body is rendered via dangerouslySetInnerHTML (not a sandboxed iframe)
 * because contentEditable needs the nodes in the same document to read edits
 * back. The email's own inline styles drive its look; we only add a light
 * scroll viewport. Source HTML is admin/template-authored + token values are
 * escaped server-side, so this is the same trust model as EmailPreview.
 *
 * The contentEditable div is intentionally UNcontrolled — React must not
 * re-render its children on every keystroke (that resets the caret). We seed
 * innerHTML imperatively whenever the upstream `html` or `resetKey` changes
 * (i.e. a fresh preview, or "Reset to template"), and read it back on input.
 */
interface EditableEmailPreviewProps {
  subject:         string;
  html:            string;
  editing:         boolean;
  onSubjectChange: (subject: string) => void;
  onHtmlChange:    (html: string) => void;
  /** Bump to force the body to re-seed from `html` (e.g. on "Reset to template"). */
  resetKey?:       string | number;
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
  subject, html, editing, onSubjectChange, onHtmlChange, resetKey, from, to, className,
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
      {/* Subject + recipient header */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 space-y-2">
        {editing ? (
          <label className="block">
            <span className="text-[9px] uppercase tracking-wider text-slate-400">Subject</span>
            <input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Subject line"
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[14px] font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
            />
          </label>
        ) : (
          <div className="text-[15px] font-semibold text-slate-900 leading-snug">
            {subject || <span className="text-muted-foreground italic">No subject</span>}
          </div>
        )}
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

      {editing && (
        <div className="px-5 py-1.5 bg-teal-50/70 border-b border-teal-100 text-[11px] text-teal-800 flex items-center gap-1.5">
          <Pencil className="h-3 w-3" />
          Editing — click anywhere in the email below to change the wording. This exact version is what sends.
        </div>
      )}

      {/* Body — read-only render or contentEditable, both fed by the same HTML.
          overflow-auto + min-w-0 keep a wide email (e.g. the ~600px doctor
          card) scrolling INSIDE this box instead of stretching the dialog and
          pushing the edit controls off-screen. */}
      <div className="bg-slate-100/60 px-4 py-5 overflow-auto flex-1 min-h-0 min-w-0 w-full">
        <div
          ref={bodyRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onInput={(e) => onHtmlChange((e.target as HTMLDivElement).innerHTML)}
          className={cn(
            BODY_CLASS,
            "p-4 shadow-sm outline-none",
            editing && "ring-2 ring-teal-300/60 focus:ring-teal-400 cursor-text",
          )}
        />
      </div>
    </div>
  );
}

/** Small inline control pair for the dialog footer: toggle edit on/off and
 *  reset edits back to the template-rendered version. Kept here so both send
 *  gates render an identical affordance. */
export function EmailEditControls({
  editing, edited, onToggle, onReset,
}: {
  editing: boolean;
  edited:  boolean;
  onToggle: () => void;
  onReset:  () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
          editing
            ? "border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        <Pencil className="h-3.5 w-3.5" />
        {editing ? "Done editing" : "Edit email"}
      </button>
      {edited && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
          title="Discard edits and restore the template version"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}

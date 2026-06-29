import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X, Monitor, Tablet, Smartphone, Mail as MailIcon, ZoomIn, ZoomOut,
  Code2, FileText, Copy, Check, Download, Image as ImageIcon, Sun, Moon,
  Bold, Italic, Underline, List, ListOrdered, Link2, Pencil, Table2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TableInsertDialog } from "@/components/TableInsertDialog";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import type { EmailAttachment } from "@/lib/email-attachments";

// Same email body styling as the inline EditableEmailPreview so the editable
// full-screen surface renders identically to what sends.
const FS_BODY_CLASS =
  "bg-white rounded-md text-[14px] leading-relaxed text-slate-800 " +
  "[&_a]:text-teal-600 [&_a:hover]:underline [&_p]:my-3 [&_h2]:font-semibold [&_h2]:my-3 " +
  "[&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-1 [&_pre]:whitespace-pre-wrap [&_pre]:font-sans " +
  // Display-only containment so a wide table/image can't push the editor wider
  // than the screen (the saved innerHTML keeps its real widths).
  "[&_table]:max-w-full [&_table]:!w-full [&_table]:table-fixed [&_td]:break-words [&_th]:break-words [&_img]:max-w-full [&_img]:h-auto";

/**
 * FullScreenEmailPreview — Amir #7. A true full-viewport review of an email
 * exactly as it sends, opened from any inline preview via an "expand" button.
 *
 * The body renders inside an <iframe srcDoc> so the email's own width + styles
 * are honoured independently of the dashboard CSS (the inline previews scope
 * styles with Tailwind, which can distort wide tables / the doctor card). That
 * makes the device-width toggles meaningful: the email reflows like it would in
 * a real client at 375 / 600 / 768 / full width.
 *
 * Pure frontend — no network, fully testable in `npm run dev`.
 */
export interface FullScreenEmailPreviewProps {
  open:        boolean;
  onClose:     () => void;
  subject:     string;
  html:        string;
  text?:       string;
  from?:       string;
  to?:         string;
  attachments?: string[];
  /** When BOTH are provided the full-screen view becomes a live editor: the
   *  subject is an input and the rendered pane is contentEditable. Edits flow
   *  straight back to the caller (same overrides the inline editor ships). */
  onSubjectChange?: (subject: string) => void;
  onHtmlChange?:    (html: string) => void;
  /** Shows a "Reset to template" chip when something diverges. */
  edited?:  boolean;
  onReset?: () => void;
  /** When provided (with the editor active) the full-screen view also manages
   *  the email's attachments inline — same list the parent dialog owns. */
  attachmentItems?:       EmailAttachment[];
  onAttachmentItemsChange?: (next: EmailAttachment[]) => void;
}

type DeviceKey = "desktop" | "tablet" | "outlook" | "mobile";
const DEVICES: { key: DeviceKey; label: string; width: number | null; icon: React.ElementType }[] = [
  { key: "desktop", label: "Desktop",       width: null, icon: Monitor },
  { key: "tablet",  label: "Tablet 768",    width: 768,  icon: Tablet },
  { key: "outlook", label: "Email 600",     width: 600,  icon: MailIcon },
  { key: "mobile",  label: "Mobile 375",    width: 375,  icon: Smartphone },
];

export function FullScreenEmailPreview(props: FullScreenEmailPreviewProps) {
  const { open, onClose, subject, html, text, from, to, attachments,
          onSubjectChange, onHtmlChange, edited, onReset,
          attachmentItems, onAttachmentItemsChange } = props;
  const editable = !!(onSubjectChange && onHtmlChange);
  const canAttach = editable && !!onAttachmentItemsChange;
  const [device, setDevice]   = useState<DeviceKey>("desktop");
  const [zoom, setZoom]       = useState(100);
  const [dark, setDark]       = useState(false);
  const [showImages, setShowImages] = useState(true);
  const [pane, setPane]       = useState<"rendered" | "html" | "text">("rendered");
  const [copied, setCopied]   = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  // Live edited HTML — drives the HTML pane + Copy while editing, separately
  // from the stable `html` snapshot that seeds the contentEditable (changing
  // the seed every keystroke would fight the caret).
  const [liveHtml, setLiveHtml] = useState(html);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const editRef      = useRef<HTMLDivElement | null>(null);
  const savedRange   = useRef<Range | null>(null);
  // The exact content the editor should currently hold. A FRESH snapshot (open
  // or Reset → the `html` prop changes) becomes the new seed target; typing
  // (html stable) leaves it on the live edit so a pane-switch remount restores
  // the edits. Tracked DURING render so it's correct before the callback ref or
  // any effect runs — no race with Radix mounting the dialog content.
  const latestHtmlRef = useRef(html);
  const prevHtmlRef   = useRef<string | null>(null);
  if (html !== prevHtmlRef.current) {
    prevHtmlRef.current = html;
    latestHtmlRef.current = html;
  }
  const effectiveHtml = editable ? liveHtml : html;

  // Keep the HTML/Copy panes in sync with fresh snapshots (open / reset).
  useLayoutEffect(() => { setLiveHtml(html); }, [html, open]);

  // Esc + scroll-lock + focus management are handled by Radix Dialog below.

  // Reset transient view state each time it opens.
  useEffect(() => { if (open) { setPane("rendered"); setZoom(100); } }, [open]);

  // Seed the editor the INSTANT its node mounts — a callback ref fires exactly
  // on attach, so it can't race the mount the way a layout effect can when
  // Radix mounts the dialog content (that race left the editor blank on first
  // open). Fires on every (re)mount: opening, and switching panes and back.
  const seedEditor = useCallback((el: HTMLDivElement | null) => {
    editRef.current = el;
    if (el && el.innerHTML !== latestHtmlRef.current) el.innerHTML = latestHtmlRef.current;
  }, []);

  // Reseed when a fresh snapshot arrives while the editor is ALREADY mounted
  // (e.g. Reset to template) — the callback ref won't refire without a remount.
  useLayoutEffect(() => {
    if (!editable || !open || pane !== "rendered") return;
    const el = editRef.current;
    if (el && el.innerHTML !== latestHtmlRef.current) el.innerHTML = latestHtmlRef.current;
  }, [editable, open, pane, html]);

  const width = DEVICES.find(d => d.key === device)?.width ?? null;

  // ── Inline rich-text editing (editable mode) ──────────────────────────────
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const flush = () => { if (editRef.current) onHtmlChange?.(editRef.current.innerHTML); };
  const exec = (command: string, value?: string) => {
    const body = editRef.current; if (!body) return;
    body.focus();
    if (savedRange.current && body.contains(savedRange.current.commonAncestorContainer)) {
      const sel = window.getSelection();
      sel?.removeAllRanges(); sel?.addRange(savedRange.current);
    }
    try { document.execCommand(command, false, value); } catch { /* unsupported — no-op */ }
    flush();
  };
  const makeLink = () => { const url = window.prompt("Link URL", "https://"); if (url) exec("createLink", url); };
  // Insert a built table (or any HTML) at the saved caret, or append to the end.
  const insertHtml = (snippet: string) => {
    const body = editRef.current; if (!body) return;
    body.focus();
    const sel = window.getSelection();
    let range = savedRange.current;
    if (!range || !body.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
    }
    sel?.removeAllRanges(); sel?.addRange(range);
    const holder = document.createElement("div");
    holder.innerHTML = snippet;
    const frag = document.createDocumentFragment();
    while (holder.firstChild) frag.appendChild(holder.firstChild);
    const r = sel?.getRangeAt(0);
    if (r) { r.deleteContents(); r.insertNode(frag); r.collapse(false); }
    else body.insertAdjacentHTML("beforeend", snippet);
    savedRange.current = null;
    const v = body.innerHTML;
    latestHtmlRef.current = v; setLiveHtml(v); onHtmlChange?.(v);
  };

  // Wrap the email HTML in a minimal document. Optionally strip <img> so the
  // team can review the text-only fallback view (how it looks with images off).
  const srcDoc = useMemo(() => {
    const body = showImages ? html : html.replace(/<img\b[^>]*>/gi, '<span style="color:#94a3b8;font-style:italic;">[image hidden]</span>');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>html,body{margin:0;padding:0;background:transparent;} body{padding:20px;} *{box-sizing:border-box;}</style></head>` +
      `<body>${body}</body></html>`;
  }, [html, showImages]);

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(effectiveHtml); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("HTML copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  const downloadPdf = async () => {
    try {
      const el = frameWrapRef.current?.querySelector("iframe");
      // Prefer printing the iframe's own document so the email paginates cleanly.
      // In editable mode there's no iframe — print the contentEditable instead.
      const doc = (el as HTMLIFrameElement | null)?.contentDocument;
      const target = doc?.body ?? editRef.current ?? frameWrapRef.current;
      if (!target) return;
      const mod = await import("html2pdf.js");
      const html2pdf = (mod as unknown as { default: (...a: unknown[]) => { set: (o: unknown) => { from: (e: unknown) => { save: () => Promise<void> } } } }).default;
      await html2pdf()
        .set({ margin: 8, filename: `${(subject || "email").slice(0, 40).replace(/[^a-z0-9]+/gi, "-")}.pdf`, image: { type: "jpeg", quality: 0.96 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } })
        .from(target)
        .save();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[101] flex flex-col bg-slate-900/95 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
        >
          <DialogPrimitive.Title className="sr-only">Full-screen email preview — {subject || "email"}</DialogPrimitive.Title>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-white/10 text-slate-200 flex-wrap">
        <div className="flex items-center gap-1.5 mr-2 min-w-0">
          <MailIcon className="h-4 w-4 text-teal-400 shrink-0" />
          <span className="text-[13px] font-medium truncate max-w-[280px]" title={subject}>{subject || "No subject"}</span>
        </div>

        {/* View pane */}
        <ToolGroup>
          <Seg active={pane === "rendered"} onClick={() => setPane("rendered")} icon={MailIcon} label="Rendered" />
          <Seg active={pane === "html"}     onClick={() => setPane("html")}     icon={Code2}    label="HTML" />
          {text && <Seg active={pane === "text"} onClick={() => setPane("text")} icon={FileText} label="Text" />}
        </ToolGroup>

        {pane === "rendered" && (
          <>
            {/* Device width */}
            <ToolGroup>
              {DEVICES.map(d => (
                <Seg key={d.key} active={device === d.key} onClick={() => setDevice(d.key)} icon={d.icon} label={d.label} compact />
              ))}
            </ToolGroup>

            {/* Zoom — preview only (a CSS scale would shift the editor caret). */}
            {!editable && (
              <ToolGroup>
                <IconBtn onClick={() => setZoom(z => Math.max(40, z - 10))} title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></IconBtn>
                <span className="px-1 text-[11px] tabular-nums w-10 text-center">{zoom}%</span>
                <IconBtn onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></IconBtn>
              </ToolGroup>
            )}

            {/* Canvas + images — image hiding is a preview-only review aid. */}
            <ToolGroup>
              <IconBtn onClick={() => setDark(d => !d)} title={dark ? "Light canvas" : "Dark canvas"}>{dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</IconBtn>
              {!editable && <IconBtn onClick={() => setShowImages(s => !s)} title={showImages ? "Hide images" : "Show images"} active={!showImages}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>}
            </ToolGroup>

            {/* Rich-text formatting — only when editing. */}
            {editable && (
              <ToolGroup>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => { saveSelection(); setTableOpen(true); }} title="Insert table"><Table2 className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}          title="Bold"><Bold className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}        title="Italic"><Italic className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}     title="Underline"><Underline className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")}   title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn onMouseDown={(e) => e.preventDefault()} onClick={makeLink}                    title="Insert link"><Link2 className="h-3.5 w-3.5" /></IconBtn>
              </ToolGroup>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <IconBtn onClick={copyHtml} title="Copy HTML">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</IconBtn>
          <IconBtn onClick={downloadPdf} title="Download PDF"><Download className="h-3.5 w-3.5" /></IconBtn>
          <button onClick={onClose} title="Close (Esc)" className="ml-1 inline-flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-[12px] font-medium transition-colors">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      {/* Recipient meta */}
      {(from || to || (attachments && attachments.length > 0)) && (
        <div className="px-4 py-1.5 bg-slate-800/80 text-slate-300 text-[11px] flex flex-wrap items-center gap-x-5 gap-y-0.5 border-b border-white/5">
          {from && <span><span className="text-slate-500 uppercase tracking-wider text-[9px] mr-1.5">From</span>{from}</span>}
          {to && <span><span className="text-slate-500 uppercase tracking-wider text-[9px] mr-1.5">To</span>{to}</span>}
          {attachments && attachments.length > 0 && (
            <span className="text-slate-400">📎 {attachments.length} attachment{attachments.length === 1 ? "" : "s"}: {attachments.join(", ")}</span>
          )}
        </div>
      )}

      {/* Editable subject row — only in edit mode. The rendered pane below
          becomes a live contentEditable surface; HTML/Text panes stay read-only. */}
      {editable && (
        <div className="px-4 py-2 bg-slate-800/60 border-b border-white/5 flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-teal-300 text-[10px] uppercase tracking-wider shrink-0">
            <Pencil className="h-3 w-3" /> Editing
          </span>
          <input
            value={subject}
            onChange={(e) => onSubjectChange?.(e.target.value)}
            placeholder="Subject line"
            className="flex-1 min-w-0 rounded-md border border-white/10 bg-slate-900/70 px-2.5 py-1.5 text-[13px] font-medium text-slate-100 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-500/40"
          />
          {edited && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/10 transition-colors shrink-0"
              title="Discard edits and restore the template version"
            >
              Reset to template
            </button>
          )}
        </div>
      )}

      {/* Canvas — light for the rendered email card; dark for the HTML/text
          source panes (whose font is light, so a light canvas = white-on-white). */}
      <div className={`flex-1 min-h-0 overflow-auto ${pane !== "rendered" ? "bg-slate-900" : dark ? "bg-slate-950" : "bg-slate-200"}`}>
        {pane === "rendered" && (
          editable ? (
            // Live editor. No zoom transform here — a CSS scale shifts the caret
            // hit-testing, so editing stays at 100% and the device toggles drive
            // width only. The email's own inline styles render as they send.
            <div className="min-h-full flex justify-center py-6 px-4">
              <div
                className="bg-white shadow-2xl rounded-md w-full transition-[max-width] duration-200"
                style={{ maxWidth: width ? `${width}px` : "1000px" }}
              >
                <div
                  ref={seedEditor}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => { const v = (e.target as HTMLDivElement).innerHTML; latestHtmlRef.current = v; setLiveHtml(v); onHtmlChange?.(v); }}
                  onKeyUp={saveSelection}
                  onMouseUp={saveSelection}
                  onBlur={saveSelection}
                  className={cn(FS_BODY_CLASS, "p-6 sm:p-8 outline-none min-h-[calc(100vh-220px)] cursor-text")}
                />
              </div>
            </div>
          ) : (
            <div ref={frameWrapRef} className="min-h-full flex justify-center py-6 px-4">
              <div
                className="bg-white shadow-2xl rounded-md overflow-hidden transition-[width] duration-200"
                style={{
                  width: width ? `${width}px` : "min(1100px, 100%)",
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                }}
              >
                <iframe
                  title="Email full preview"
                  srcDoc={srcDoc}
                  className="w-full border-0 bg-white"
                  style={{ height: "calc(100vh - 160px)" }}
                />
              </div>
            </div>
          )
        )}
        {pane === "html" && (
          <pre className="p-6 text-[12px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-words max-w-[1100px] mx-auto">{effectiveHtml}</pre>
        )}
        {pane === "text" && (
          <pre className="p-6 text-[12.5px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-words max-w-[800px] mx-auto">{text || "(no plain-text version)"}</pre>
        )}
      </div>

      {/* Attachments — manage right here in the editor (same list the parent
          dialog owns). Slim bar pinned under the canvas. */}
      {canAttach && pane === "rendered" && (
        <div className="shrink-0 border-t border-white/10 bg-slate-900 px-4 py-2 max-h-[30vh] overflow-y-auto">
          <div className="max-w-[1000px] mx-auto">
            <AttachmentsPicker
              attachments={attachmentItems ?? []}
              onChange={onAttachmentItemsChange!}
              hint="ride on this email"
            />
          </div>
        </div>
      )}

      <TableInsertDialog open={tableOpen} onOpenChange={setTableOpen} onInsert={insertHtml} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">{children}</div>;
}

function Seg({ active, onClick, icon: Icon, label, compact }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${active ? "bg-teal-500 text-white" : "text-slate-300 hover:bg-white/10"}`}
    >
      <Icon className="h-3.5 w-3.5" />{!compact && <span>{label}</span>}
    </button>
  );
}

function IconBtn({ children, onClick, onMouseDown, title, active }: { children: React.ReactNode; onClick: () => void; onMouseDown?: (e: React.MouseEvent) => void; title: string; active?: boolean }) {
  return (
    <button onClick={onClick} onMouseDown={onMouseDown} title={title} className={`inline-flex items-center justify-center rounded-md px-1.5 py-1 transition-colors ${active ? "bg-teal-500 text-white" : "text-slate-300 hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

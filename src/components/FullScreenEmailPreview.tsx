import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X, Monitor, Tablet, Smartphone, Mail as MailIcon, ZoomIn, ZoomOut,
  Code2, FileText, Copy, Check, Download, Image as ImageIcon, Sun, Moon,
} from "lucide-react";
import { toast } from "sonner";

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
}

type DeviceKey = "desktop" | "tablet" | "outlook" | "mobile";
const DEVICES: { key: DeviceKey; label: string; width: number | null; icon: React.ElementType }[] = [
  { key: "desktop", label: "Desktop",       width: null, icon: Monitor },
  { key: "tablet",  label: "Tablet 768",    width: 768,  icon: Tablet },
  { key: "outlook", label: "Email 600",     width: 600,  icon: MailIcon },
  { key: "mobile",  label: "Mobile 375",    width: 375,  icon: Smartphone },
];

export function FullScreenEmailPreview(props: FullScreenEmailPreviewProps) {
  const { open, onClose, subject, html, text, from, to, attachments } = props;
  const [device, setDevice]   = useState<DeviceKey>("desktop");
  const [zoom, setZoom]       = useState(100);
  const [dark, setDark]       = useState(false);
  const [showImages, setShowImages] = useState(true);
  const [pane, setPane]       = useState<"rendered" | "html" | "text">("rendered");
  const [copied, setCopied]   = useState(false);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  // Esc + scroll-lock + focus management are handled by Radix Dialog below.

  // Reset transient view state each time it opens.
  useEffect(() => { if (open) { setPane("rendered"); setZoom(100); } }, [open]);

  const width = DEVICES.find(d => d.key === device)?.width ?? null;

  // Wrap the email HTML in a minimal document. Optionally strip <img> so the
  // team can review the text-only fallback view (how it looks with images off).
  const srcDoc = useMemo(() => {
    const body = showImages ? html : html.replace(/<img\b[^>]*>/gi, '<span style="color:#94a3b8;font-style:italic;">[image hidden]</span>');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>html,body{margin:0;padding:0;background:transparent;} body{padding:20px;} *{box-sizing:border-box;}</style></head>` +
      `<body>${body}</body></html>`;
  }, [html, showImages]);

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("HTML copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  const downloadPdf = async () => {
    try {
      const el = frameWrapRef.current?.querySelector("iframe");
      // Prefer printing the iframe's own document so the email paginates cleanly.
      const doc = (el as HTMLIFrameElement | null)?.contentDocument;
      const target = doc?.body ?? frameWrapRef.current;
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

            {/* Zoom */}
            <ToolGroup>
              <IconBtn onClick={() => setZoom(z => Math.max(40, z - 10))} title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></IconBtn>
              <span className="px-1 text-[11px] tabular-nums w-10 text-center">{zoom}%</span>
              <IconBtn onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></IconBtn>
            </ToolGroup>

            {/* Canvas + images */}
            <ToolGroup>
              <IconBtn onClick={() => setDark(d => !d)} title={dark ? "Light canvas" : "Dark canvas"}>{dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</IconBtn>
              <IconBtn onClick={() => setShowImages(s => !s)} title={showImages ? "Hide images" : "Show images"} active={!showImages}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>
            </ToolGroup>
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

      {/* Canvas */}
      <div className={`flex-1 min-h-0 overflow-auto ${dark ? "bg-slate-950" : "bg-slate-200"}`}>
        {pane === "rendered" && (
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
        )}
        {pane === "html" && (
          <pre className="p-6 text-[12px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-words max-w-[1100px] mx-auto">{html}</pre>
        )}
        {pane === "text" && (
          <pre className="p-6 text-[12.5px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap break-words max-w-[800px] mx-auto">{text || "(no plain-text version)"}</pre>
        )}
      </div>
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

function IconBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`inline-flex items-center justify-center rounded-md px-1.5 py-1 transition-colors ${active ? "bg-teal-500 text-white" : "text-slate-300 hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

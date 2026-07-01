import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Mail, Paperclip, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailFrame } from "@/components/EmailFrame";

interface EmailPreviewProps {
  /** Pre-rendered subject (tokens already substituted). */
  subject: string;
  /** Pre-rendered HTML body (tokens already substituted + escaped). */
  html: string;
  /** Optional plain-text body, shown collapsed beneath the HTML preview. */
  text?: string;
  /** From address — display only. */
  from?: string;
  /** To recipient — display only. */
  to?: string;
  /** Template key for the small label at top, e.g. "profile_sent_hospital". */
  templateKey?: string;
  /** Optional extra slot rendered above the email body — e.g. a "this is a preview, not sent" warning. */
  banner?: ReactNode;
  /** Filenames to show as attachment chips (e.g. the relocation-guide PDFs). */
  attachments?: string[];
  className?: string;
  /** When set, shows an "expand" button that opens a full-screen review. */
  onExpand?: () => void;
}

/**
 * Shared inbox-style email preview. Wraps the rendered HTML in a Mac-style
 * window chrome + recipient header so it looks like an actual email rather
 * than raw HTML dumped on the page. Used by:
 *   - Doctor Profiles editor (preview of profile_sent_hospital)
 *   - Templates tab editor (preview of whatever template is selected)
 *
 * The HTML body is rendered via dangerouslySetInnerHTML — safe because:
 *   1. Template HTML is admin-authored only (no untrusted input)
 *   2. Token values inserted via renderTemplate({ html: true }) are escaped
 */
export function EmailPreview({
  subject, html, text, from, to, templateKey, banner, attachments, className, onExpand,
}: EmailPreviewProps) {
  const [showPlainText, setShowPlainText] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border border-slate-200 bg-white overflow-hidden",
      "shadow-[0_4px_24px_-8px_rgba(20,47,76,0.08)]",
      className,
    )}>
      {/* Window chrome — decorative traffic lights + template key label */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-300/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
          <Mail className="h-3 w-3" />
          Email preview
          {templateKey && <code className="bg-slate-200/60 text-slate-600 px-1 py-0.5 rounded text-[9px] font-mono">{templateKey}</code>}
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Full-screen preview"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:text-teal-700 hover:border-teal-300 transition-colors"
          >
            <Maximize2 className="h-3 w-3" /> Full screen
          </button>
        )}
      </div>

      {/* Recipient header */}
      <div className="px-6 py-4 bg-white border-b border-slate-100">
        <div className="text-[15px] font-semibold text-slate-900 leading-snug mb-2">{subject || <span className="text-muted-foreground italic">No subject</span>}</div>
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
          <div className="flex gap-3">
            <span className="font-medium text-slate-600 uppercase tracking-wider text-[9px] w-9 pt-[2px]">When</span>
            <span className="text-slate-700">Now (preview only — not sent)</span>
          </div>
        </div>
      </div>

      {/* Attachments — paperclip chips, like an inbox. Shown for emails that
          carry files (e.g. the relocation guide pack). */}
      {attachments && attachments.length > 0 && (
        <div className="px-6 py-3 bg-white border-b border-slate-100">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((name, i) => (
              <span
                key={i}
                title={name}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600 max-w-[230px]"
              >
                <span className="text-[9px] font-semibold text-rose-500 shrink-0">PDF</span>
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {banner && <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">{banner}</div>}

      {/* Body — rendered in a sandboxed iframe with the EXACT send shell
          (Garamond 17px #1a2332 …) so it matches what lands in Gmail, instead
          of being repainted by the dashboard's own CSS. */}
      <div className="bg-slate-100/60 px-4 py-5">
        <div className="bg-white rounded-md shadow-sm overflow-hidden">
          <EmailFrame html={html} minHeight={160} />
        </div>
      </div>

      {/* Plain text fallback (collapsed) */}
      {text && (
        <div className="border-t border-slate-200 bg-slate-50/40">
          <button
            type="button"
            onClick={() => setShowPlainText(s => !s)}
            className="w-full px-5 py-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-slate-50 transition-colors"
          >
            {showPlainText ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Plain-text fallback
          </button>
          {showPlainText && (
            <pre className="px-5 pb-4 text-[11px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">{text}</pre>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageSquarePlus, Bug, Lightbulb, Send, AlertTriangle, X,
  ChevronDown, ChevronRight, Loader2, ListChecks, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAIPageContext } from "@/lib/ai-page-context";
import { lookupRoute } from "@/lib/route-labels";
import { getRecentErrors } from "@/lib/client-errors";
import {
  useSubmitFeedback, useFeedbackList, useUpdateFeedbackStatus,
  type FeedbackType, type FeedbackStatus,
} from "@/hooks/use-feedback";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New", triaged: "Triaged", in_progress: "In progress", done: "Done", wont_fix: "Won't fix",
};
const STATUS_ORDER: FeedbackStatus[] = ["new", "triaged", "in_progress", "done", "wont_fix"];

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Floating, always-present bug-report / feature-suggestion widget. Sits on
 * every page (mounted in DashboardLayout) so you report a bug WHERE it happens.
 * It auto-captures the page (label + the AI page-context snapshot), the recent
 * client-side errors that just fired here ("likely bugs"), and browser/viewport
 * — so a report is one sentence + one click. Admins get an in-place triage list.
 */
export function FeedbackWidget() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const { pathname } = useLocation();
  const { pageData } = useAIPageContext();
  const routeInfo = lookupRoute(pathname);
  const pageLabel = routeInfo?.label ?? pageData?.page ?? pathname;

  const [open, setOpen]     = useState(false);
  const [view, setView]     = useState<"report" | "list">("report");
  const [type, setType]     = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [includeErrors, setIncludeErrors] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  // Errors that fired on THIS page in the last few minutes — the "likely bugs".
  const recentErrors = useMemo(() => (open ? getRecentErrors({ route: pathname }) : []), [open, pathname]);

  const submit = useSubmitFeedback();

  const reset = () => { setMessage(""); setType("bug"); setShowErrors(false); setIncludeErrors(true); };

  const handleSubmit = async () => {
    const text = message.trim();
    if (!text) { toast.error("Add a quick description first"); return; }
    const context = {
      url:        typeof location !== "undefined" ? location.href : pathname,
      route:      pathname,
      page:       pageData?.page ?? pageLabel,
      pageData:   pageData?.data ?? null,
      viewport:   `${window.innerWidth}×${window.innerHeight}`,
      userAgent:  navigator.userAgent,
      errors:     includeErrors ? recentErrors : [],
      reportedAt: new Date().toISOString(),
    };
    try {
      await submit.mutateAsync({
        type, message: text,
        page_label: pageLabel, route: pathname, section: routeInfo?.section ?? null,
        reporter_email: user?.email ?? null, context,
      });
      toast.success(type === "bug" ? "Bug reported — thank you! 🐞" : "Idea sent — thank you! 💡");
      reset(); setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send — please try again");
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setView("report"); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Report a bug or suggest a feature"
          data-tour="feedback-widget"
          className="fixed bottom-[4.75rem] right-5 z-[60] flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-lg hover:text-foreground hover:border-teal-300 active:scale-95 transition-all"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-teal-600" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end" side="top" sideOffset={10}
        className="w-[368px] p-0 z-[70] rounded-2xl border-border/60 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            {view === "report"
              ? <><MessageSquarePlus className="h-3.5 w-3.5 text-teal-600" /> Report or suggest</>
              : <><ListChecks className="h-3.5 w-3.5 text-teal-600" /> Recent reports</>}
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setView(v => (v === "report" ? "list" : "report"))}
                className="text-[10px] rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {view === "report" ? "View reports" : "New report"}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {view === "report" ? (
          <div className="p-4 space-y-3">
            {/* Type toggle */}
            <div className="inline-flex w-full rounded-lg border border-border/60 p-0.5 text-[12px] font-medium">
              {([
                { v: "bug",  label: "Bug",  Icon: Bug },
                { v: "idea", label: "Idea", Icon: Lightbulb },
              ] as const).map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setType(o.v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
                    type === o.v ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <o.Icon className="h-3.5 w-3.5" /> {o.label}
                </button>
              ))}
            </div>

            {/* Auto-detected page chip */}
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-100 px-2 py-0.5 text-teal-700 font-medium">
                📍 {pageLabel}
              </span>
              <span className="text-muted-foreground/60">auto-detected</span>
            </div>

            {/* Message */}
            <Textarea
              autoFocus
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(); }}
              placeholder={type === "bug"
                ? "What went wrong? What did you expect to happen?"
                : "What would make this better?"}
              className="min-h-[92px] text-[13px] resize-none"
            />

            {/* Likely bugs — recent errors on this page */}
            {recentErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeErrors}
                    onChange={e => setIncludeErrors(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-600"
                  />
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900">
                    <AlertTriangle className="h-3 w-3" />
                    Attach {recentErrors.length} error{recentErrors.length === 1 ? "" : "s"} we caught here
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowErrors(s => !s); }}
                    className="ml-auto text-amber-700/70 hover:text-amber-900"
                  >
                    {showErrors ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </label>
                {showErrors && (
                  <ul className="mt-1.5 space-y-1 max-h-[96px] overflow-y-auto">
                    {recentErrors.map((er, i) => (
                      <li key={i} className="text-[10px] font-mono text-amber-800/90 leading-snug truncate" title={er.message}>
                        • {er.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="text-[9.5px] text-muted-foreground/70 leading-snug">
              Auto-attached so you don't have to: this page, your screen size &amp; browser
              {recentErrors.length > 0 ? ", and the errors above" : ""}.
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submit.isPending || !message.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send {type === "bug" ? "bug report" : "suggestion"}
              <kbd className="ml-1 text-[9px] font-mono opacity-70 hidden sm:inline">⌘↵</kbd>
            </button>
          </div>
        ) : (
          <FeedbackList />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Admin-only in-widget triage list. */
function FeedbackList() {
  const { data: rows = [], isLoading } = useFeedbackList(true);
  const updateStatus = useUpdateFeedbackStatus();

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="py-10 text-center text-[12px] text-muted-foreground">No reports yet.</div>;
  }
  return (
    <div className="max-h-[420px] overflow-y-auto divide-y divide-border/40">
      {rows.map(r => (
        <div key={r.id} className="px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 ${r.type === "bug" ? "text-rose-500" : "text-amber-500"}`}>
              {r.type === "bug" ? <Bug className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-foreground leading-snug break-words">{r.message}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                {r.page_label && <span className="inline-flex items-center gap-0.5">📍 {r.page_label}</span>}
                <span>·</span>
                <span>{timeAgo(r.created_at)}</span>
                {r.reporter_email && <><span>·</span><span className="truncate max-w-[120px]">{r.reporter_email}</span></>}
                {Array.isArray((r.context as { errors?: unknown[] })?.errors) && ((r.context as { errors?: unknown[] }).errors!.length > 0) && (
                  <><span>·</span><span className="text-amber-600 inline-flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />{(r.context as { errors?: unknown[] }).errors!.length}</span></>
                )}
              </div>
            </div>
            <select
              value={r.status}
              onChange={e => updateStatus.mutate({ id: r.id, status: e.target.value as FeedbackStatus })}
              className="shrink-0 text-[10px] rounded-md border border-border/60 bg-card px-1 py-0.5 text-muted-foreground"
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {r.status === "done" && (
            <div className="mt-1 flex items-center gap-1 text-[9.5px] text-emerald-600"><Check className="h-2.5 w-2.5" /> resolved</div>
          )}
        </div>
      ))}
    </div>
  );
}

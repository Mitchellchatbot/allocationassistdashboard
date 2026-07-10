import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Inbox, Search, CheckCircle2, User, Building2, Mail, Reply as ReplyIcon, Forward, ChevronDown, ChevronUp, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { splitQuotedText } from "@/lib/email-quote";
import {
  useRepliesPage, useUnreadReplyCount, useRepliesRealtime, useMarkReplyRead, useMarkReplyHandled,
  type HospitalReply, type ReplyClassification, type ReplyFilter,
} from "@/hooks/use-replies";

const PAGE_SIZE = 25;

/**
 * Replies — inbox for replies to our profile sends. hello@ has no real mailbox,
 * so profile-send replies route to our Resend inbound address and land in
 * hospital_replies. Server-paginated + server-filtered for scale. Quoted
 * original text is collapsed by default; reply/forward go out via the send-reply
 * edge function (test-mode redirects to the test inbox).
 */
function classMeta(c: ReplyClassification): { label: string; cls: string } {
  switch (c) {
    case "shortlisted":         return { label: "Shortlisted",     cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "proposing_interview": return { label: "Wants interview", cls: "bg-sky-100 text-sky-700 border-sky-200" };
    case "declined":            return { label: "Declined",        cls: "bg-rose-100 text-rose-700 border-rose-200" };
    case "needs_more_info":     return { label: "Needs info",      cls: "bg-amber-100 text-amber-800 border-amber-200" };
    case "wrong_doctor":        return { label: "Wrong doctor",    cls: "bg-orange-100 text-orange-700 border-orange-200" };
    default:                    return { label: "Unclear",         cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}
function fromName(raw: string | null): string {
  const s = (raw ?? "").trim();
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m?.[1]?.trim() || s || "Unknown sender");
}
function fromAddr(raw: string | null): string {
  const s = (raw ?? "").trim();
  const m = s.match(/<([^>]+)>/);
  return (m?.[1] ?? s).trim();
}

export default function Replies() {
  const [page, setPage]         = useState(0);
  const [searchInput, setInput] = useState("");
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState<ReplyFilter>("all");
  const [selected, setSelected] = useState<HospitalReply | null>(null);
  const [compose, setCompose]   = useState<{ mode: "reply" | "forward"; reply: HospitalReply } | null>(null);

  // Debounce the search box; reset to page 0 whenever the query/filter changes.
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(t); }, [searchInput]);
  useEffect(() => { setPage(0); }, [search, filter]);

  useRepliesRealtime();
  const unread = useUnreadReplyCount();
  const { data, isLoading, isFetching } = useRepliesPage({ page, pageSize: PAGE_SIZE, search, filter });
  const markRead = useMarkReplyRead();
  const markHandled = useMarkReplyHandled();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Keep the open reply in sync with fresh list data (e.g. after mark-handled).
  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find(r => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (r: HospitalReply) => {
    setSelected(r);
    if (!r.is_read) markRead.mutate(r.id);
  };

  const FILTERS: { key: ReplyFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: `Unread${unread ? ` (${unread})` : ""}` },
    { key: "handled", label: "Handled" },
  ];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800 leading-tight">Replies</h1>
              <p className="text-[12px] text-muted-foreground">
                Replies to profile sends (via hello@allocationassist.com){unread > 0 && <> · <span className="text-teal-700 font-medium">{unread} unread</span></>}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchInput} onChange={e => setInput(e.target.value)} placeholder="Search replies…" className="pl-8 h-9 text-[13px]" />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1 rounded-full text-[12px] font-medium border transition-colors",
                filter === f.key ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >{f.label}</button>
          ))}
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 ml-1" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,380px)_1fr] gap-4 items-start">
          {/* List */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">Loading replies…</div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-muted-foreground">
                  {total === 0 && filter === "all" && !search ? (
                    <><Mail className="h-6 w-6 mx-auto mb-2 text-slate-300" />No replies yet. When a hospital or doctor replies to a profile send, it lands here.</>
                  ) : "Nothing matches."}
                </div>
              ) : rows.map(r => {
                const m = classMeta(r.classification);
                const active = r.id === selected?.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => open(r)}
                    className={cn("w-full text-left px-3.5 py-3 flex flex-col gap-1 hover:bg-slate-50 transition-colors", active && "bg-teal-50/70 hover:bg-teal-50")}
                  >
                    <div className="flex items-center gap-2">
                      {!r.is_read && <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />}
                      <span className={cn("text-[13px] truncate flex-1", r.is_read ? "text-slate-600" : "text-slate-900 font-semibold")}>{fromName(r.reply_from)}</span>
                      <span className="text-[10.5px] text-muted-foreground shrink-0">{fmtWhen(r.created_at)}</span>
                    </div>
                    <div className={cn("text-[12.5px] truncate", r.is_read ? "text-slate-500" : "text-slate-800 font-medium")}>{r.reply_subject || "(no subject)"}</div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{splitQuotedText(r.reply_text).main || r.reply_text}</div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium", m.cls)}>{m.label}</Badge>
                      {r.handled_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-200">Handled</Badge>}
                      {(r.doctor_name || r.hospital_name) && <span className="text-[10.5px] text-muted-foreground truncate">{[r.doctor_name, r.hospital_name].filter(Boolean).join(" · ")}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-[11.5px] text-muted-foreground">
                <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="rounded-xl border border-slate-200 bg-white min-h-[300px]">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 text-slate-300" /><p className="text-[13px]">Select a reply to read it.</p>
              </div>
            ) : (
              <ReplyDetail
                r={selected}
                onReply={() => setCompose({ mode: "reply", reply: selected })}
                onForward={() => setCompose({ mode: "forward", reply: selected })}
                onToggleHandled={() => markHandled.mutate({ id: selected.id, handled: !selected.handled_at })}
                handledBusy={markHandled.isPending}
              />
            )}
          </div>
        </div>
      </div>

      {compose && (
        <ReplyComposer
          mode={compose.mode}
          reply={compose.reply}
          onClose={() => setCompose(null)}
        />
      )}
    </DashboardLayout>
  );
}

function ReplyDetail({ r, onReply, onForward, onToggleHandled, handledBusy }: {
  r: HospitalReply; onReply: () => void; onForward: () => void; onToggleHandled: () => void; handledBusy: boolean;
}) {
  const m = classMeta(r.classification);
  const { main, quoted } = useMemo(() => splitQuotedText(r.reply_text), [r.reply_text]);
  const [showQuoted, setShowQuoted] = useState(false);
  useEffect(() => setShowQuoted(false), [r.id]);   // collapse again when switching replies

  return (
    <div className="flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 leading-snug">{r.reply_subject || "(no subject)"}</h2>
            <div className="text-[12.5px] text-slate-600 mt-0.5 break-all">{r.reply_from || "Unknown sender"}</div>
          </div>
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtWhen(r.created_at)}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10.5px] px-2 py-0.5 font-medium", m.cls)}>{m.label}</Badge>
          {r.doctor_name && <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-600"><User className="h-3.5 w-3.5 text-slate-400" />{r.doctor_name}</span>}
          {r.hospital_name && <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-600"><Building2 className="h-3.5 w-3.5 text-slate-400" />{r.hospital_name}</span>}
          {r.forwarded_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-sky-50 text-sky-600 border-sky-200">Forwarded</Badge>}
        </div>
        {r.ai_summary && (
          <div className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">
            <span className="font-medium text-slate-600">AI summary:</span> {r.ai_summary}
          </div>
        )}
      </div>

      {/* Body — quoted original collapsed by default */}
      <div className="px-5 py-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700 m-0">{main}</pre>
        {quoted && (
          <div className="mt-2">
            <button onClick={() => setShowQuoted(v => !v)} className="inline-flex items-center gap-1 text-[11.5px] text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2 py-0.5 bg-slate-50">
              {showQuoted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && (
              <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-slate-400 border-l-2 border-slate-200 pl-3 mt-2 m-0">{quoted}</pre>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onReply} className="h-8 text-[12px]"><ReplyIcon className="h-3.5 w-3.5 mr-1.5" />Reply</Button>
        <Button size="sm" variant="outline" onClick={onForward} className="h-8 text-[12px]"><Forward className="h-3.5 w-3.5 mr-1.5" />Forward</Button>
        <Button size="sm" variant="ghost" onClick={onToggleHandled} disabled={handledBusy} className="h-8 text-[12px] text-slate-600">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />{r.handled_at ? "Handled — undo" : "Mark handled"}
        </Button>
      </div>
    </div>
  );
}

/** Build the quoted-original block appended under a reply. */
function replyQuoteBlock(r: HospitalReply): string {
  const dateStr = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(r.created_at));
  const quoted = (r.reply_text ?? "").split(/\r?\n/).map(l => `> ${l}`).join("\n");
  return `\n\nOn ${dateStr}, ${r.reply_from ?? "the sender"} wrote:\n${quoted}`;
}
function forwardBlock(r: HospitalReply): string {
  return `\n\n---------- Forwarded message ----------\nFrom: ${r.reply_from ?? ""}\nSubject: ${r.reply_subject ?? ""}\n\n${r.reply_text ?? ""}`;
}
function withPrefix(subject: string | null, prefix: "Re" | "Fwd"): string {
  const s = (subject ?? "").trim() || "(no subject)";
  return new RegExp(`^${prefix}:`, "i").test(s) ? s : `${prefix}: ${s}`;
}

function ReplyComposer({ mode, reply, onClose }: { mode: "reply" | "forward"; reply: HospitalReply; onClose: () => void }) {
  const [to, setTo]           = useState(mode === "reply" ? fromAddr(reply.reply_from) : "");
  const [cc, setCc]           = useState("");
  const [subject, setSubject] = useState(withPrefix(reply.reply_subject, mode === "reply" ? "Re" : "Fwd"));
  const [body, setBody]       = useState(mode === "reply" ? replyQuoteBlock(reply) : forwardBlock(reply));
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!to.trim()) { toast.error("Add at least one recipient."); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reply", {
        body: { action: mode, reply_id: reply.id, to, cc: cc || undefined, subject, text: body },
      });
      if (error) throw error;
      const r = data as { ok?: boolean; error?: string; test_mode?: boolean };
      if (!r?.ok) throw new Error(r?.error ?? "send failed");
      toast.success(r.test_mode ? `${mode === "reply" ? "Reply" : "Forward"} sent (test inbox)` : `${mode === "reply" ? "Reply" : "Forward"} sent`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-[15px]">{mode === "reply" ? "Reply" : "Forward"}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-14 text-slate-500 shrink-0">To</span>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" className="h-8 text-[13px]" />
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-14 text-slate-500 shrink-0">Cc</span>
            <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="optional, comma-separated" className="h-8 text-[13px]" />
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-14 text-slate-500 shrink-0">Subject</span>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="h-8 text-[13px]" />
          </label>
          <Textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="text-[13px] leading-relaxed font-sans" placeholder="Write your message…" />
          <p className="text-[10.5px] text-muted-foreground">
            Sends from Allocation Assist Team &lt;hello@allocationassist.com&gt;. Replies come back to this inbox.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending} className="h-8 text-[12px]">Cancel</Button>
          <Button size="sm" onClick={send} disabled={sending} className="h-8 text-[12px]">
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : (mode === "reply" ? <ReplyIcon className="h-3.5 w-3.5 mr-1.5" /> : <Forward className="h-3.5 w-3.5 mr-1.5" />)}
            {mode === "reply" ? "Send reply" : "Send forward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Search, CheckCircle2, User, Building2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useReplies, useMarkReplyRead, useMarkReplyHandled,
  type HospitalReply, type ReplyClassification,
} from "@/hooks/use-replies";

/**
 * Replies — the inbox for replies to our profile-send emails. Profile sends go
 * out from hello@allocationassist.com (no real mailbox), so their Reply-To is
 * our Resend inbound address (reply-<run_id>@reply.allocationassist.com); the
 * inbound-hospital-reply edge fn captures them into hospital_replies, which this
 * page reads. Phase 1 = read + triage; reply/forward land in later phases.
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
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

/** Sender's display name from a "Name <addr>" string, else the raw address. */
function fromName(raw: string | null): string {
  const s = (raw ?? "").trim();
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m?.[1]?.trim() || s || "Unknown sender");
}

export default function Replies() {
  const { replies, unreadCount, isLoading } = useReplies();
  const markRead = useMarkReplyRead();
  const markHandled = useMarkReplyHandled();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return replies;
    return replies.filter(r =>
      [r.reply_from, r.reply_subject, r.reply_text, r.doctor_name, r.hospital_name]
        .some(v => (v ?? "").toLowerCase().includes(s)),
    );
  }, [replies, q]);

  const selected = useMemo(() => replies.find(r => r.id === selectedId) ?? null, [replies, selectedId]);

  const open = (r: HospitalReply) => {
    setSelectedId(r.id);
    if (!r.is_read) markRead.mutate(r.id);
  };

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
                Replies to profile sends (via hello@allocationassist.com)
                {unreadCount > 0 && <> · <span className="text-teal-700 font-medium">{unreadCount} unread</span></>}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search replies…" className="pl-8 h-9 text-[13px]" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,380px)_1fr] gap-4 items-start">
          {/* List */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <div className="p-6 text-center text-[13px] text-muted-foreground">Loading replies…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-muted-foreground">
                  {replies.length === 0 ? (
                    <>
                      <Mail className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                      No replies yet. When a hospital or doctor replies to a profile send, it lands here.
                    </>
                  ) : "No replies match your search."}
                </div>
              ) : filtered.map(r => {
                const m = classMeta(r.classification);
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    onClick={() => open(r)}
                    className={cn(
                      "w-full text-left px-3.5 py-3 flex flex-col gap-1 hover:bg-slate-50 transition-colors",
                      active && "bg-teal-50/70 hover:bg-teal-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {!r.is_read && <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />}
                      <span className={cn("text-[13px] truncate flex-1", r.is_read ? "text-slate-600" : "text-slate-900 font-semibold")}>
                        {fromName(r.reply_from)}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground shrink-0">{fmtWhen(r.created_at)}</span>
                    </div>
                    <div className={cn("text-[12.5px] truncate", r.is_read ? "text-slate-500" : "text-slate-800 font-medium")}>
                      {r.reply_subject || "(no subject)"}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">{r.reply_text}</div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium", m.cls)}>{m.label}</Badge>
                      {r.handled_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-200">Handled</Badge>}
                      {(r.doctor_name || r.hospital_name) && (
                        <span className="text-[10.5px] text-muted-foreground truncate">
                          {[r.doctor_name, r.hospital_name].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail */}
          <div className="rounded-xl border border-slate-200 bg-white min-h-[300px]">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 text-slate-300" />
                <p className="text-[13px]">Select a reply to read it.</p>
              </div>
            ) : (
              <ReplyDetail
                r={selected}
                onToggleHandled={() => markHandled.mutate({ id: selected.id, handled: !selected.handled_at })}
                handledBusy={markHandled.isPending}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReplyDetail({ r, onToggleHandled, handledBusy }: { r: HospitalReply; onToggleHandled: () => void; handledBusy: boolean }) {
  const m = classMeta(r.classification);
  return (
    <div className="flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 leading-snug">{r.reply_subject || "(no subject)"}</h2>
            <div className="text-[12.5px] text-slate-600 mt-0.5">{r.reply_from || "Unknown sender"}</div>
          </div>
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtWhen(r.created_at)}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10.5px] px-2 py-0.5 font-medium", m.cls)}>{m.label}</Badge>
          {r.doctor_name && <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-600"><User className="h-3.5 w-3.5 text-slate-400" />{r.doctor_name}</span>}
          {r.hospital_name && <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-600"><Building2 className="h-3.5 w-3.5 text-slate-400" />{r.hospital_name}</span>}
        </div>
        {r.ai_summary && (
          <div className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">
            <span className="font-medium text-slate-600">AI summary:</span> {r.ai_summary}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {r.reply_html ? (
          <iframe
            title="Reply body"
            sandbox=""
            srcDoc={r.reply_html}
            className="w-full min-h-[320px] border-0"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700">{r.reply_text}</pre>
        )}
      </div>

      {/* Actions — Reply / Forward arrive in the next phase */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant={r.handled_at ? "outline" : "default"} onClick={onToggleHandled} disabled={handledBusy} className="h-8 text-[12px]">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          {r.handled_at ? "Handled — undo" : "Mark handled"}
        </Button>
        <span className="text-[11px] text-muted-foreground">Reply &amp; Forward from the portal — coming next.</span>
      </div>
    </div>
  );
}

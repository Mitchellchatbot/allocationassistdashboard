import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox, Send, Clock, PenSquare, Mail, Building2, User, ChevronRight,
  ExternalLink, CheckCheck, Circle, CalendarClock, Layers, Users, X,
  Loader2, Image as ImageIcon, UserSquare, Trash2,
} from "lucide-react";
import { useSentHistory, SENT_KIND_LABEL, type SentRecord } from "@/hooks/use-sent-history";
import { useScheduledBatches, useBatchPreview, type ScheduledBatch, type BatchPreviewResult } from "@/hooks/use-scheduled-batches";
import { useScheduledProfileSends, useCancelScheduledProfileSend, type ScheduledProfileSend } from "@/hooks/use-scheduled-profile-sends";
import {
  useRepliesPage, useMarkReplyRead, useMarkReplyHandled,
  type HospitalReply,
} from "@/hooks/use-replies";
import { SendProfileDialog } from "@/components/automations/SendProfileDialog";
import { BatchComposeDialog } from "./Batches";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useWpCandidateForDoctor, type WpCandidate } from "@/hooks/use-wp-candidates";
import { buildDoctorProfileHtml, PROFILE_IMAGE_WIDTH } from "@/lib/doctor-profile-image";
import { captureCardPng } from "@/lib/card-screenshot";
import { useHospitals } from "@/hooks/use-hospitals";
import { buildWorkingOpBody, buildWorkingOpSubject, type WorkingOpHospital } from "@/lib/doctor-working-op";
import { previewSignatureHtmlFor } from "@/lib/email-signature";

/**
 * Mail — a Gmail-style, three-pane home for the outbound email workflow (team
 * feedback #14: "a Gmail-like sidebar/navigation — add emails, schedule, view
 * previous, send"). It doesn't re-implement the sends; it UNIFIES the data that
 * already powers the Replies / Past Sent / Batch Sends tabs into one familiar
 * layout:
 *
 *   ┌── folders ──┬──── message list ────┬──── reading pane ────┐
 *   │ Compose     │ Inbox rows (replies) │ selected message     │
 *   │ Inbox   (n) │ Sent rows (history)  │ full detail + deep-  │
 *   │ Sent        │ Scheduled rows       │ link into its tab    │
 *   │ Scheduled   │                      │                      │
 *   └─────────────┴──────────────────────┴──────────────────────┘
 *
 * The shared `?q=` search from the Sends header filters whichever folder is
 * open. "Compose" and each reading-pane "Open in…" button deep-link to the
 * existing tabs (?tab=send-profile / replies / past-sent / batch-sends) so the
 * heavy composers stay in one place — this is navigation, not duplication.
 */

type Folder = "inbox" | "sent" | "scheduled";

const FOLDERS: { key: Folder; label: string; icon: typeof Inbox }[] = [
  { key: "inbox",     label: "Inbox",     icon: Inbox },
  { key: "sent",      label: "Sent",      icon: Send },
  { key: "scheduled", label: "Scheduled", icon: Clock },
];

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const days = (Date.now() - d) / 86_400_000;
  if (days >= 0 && days < 1) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
  }
  if (days >= 1 && days < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function fmtFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return String(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d);
}

function initials(name: string | null | undefined): string {
  const n = (name ?? "").replace(/^\s*Dr\.?\s+/i, "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface MailItem {
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  when: string | null;
  unread: boolean;
  accent: string;         // avatar bg tint
}

/** Which composer the Mail page is currently showing, all inline. */
type ComposeMode = "personalized" | "batch" | "bulk";

export function MailPanel({ query }: { query: string }) {
  const navigate = useNavigate();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // The active in-page composer (null = none). Chosen from the Compose chooser;
  // rendered right here in the Mail page so the whole send flow stays in-tab.
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);

  const q = query.trim().toLowerCase();

  // ── Data (same sources as the Replies / Past Sent / Batch Sends tabs) ──────
  const repliesQ = useRepliesPage({ page: 0, pageSize: 100, search: query, filter: "all" });
  const { records: sentRecords } = useSentHistory();
  const batchesQ = useScheduledBatches();
  // Scheduled Send-Profile campaigns (Send Profile → "Schedule for later") live
  // in their own table. The Scheduled folder used to list only batch sends, so
  // these never showed up ("scheduled emails not appearing under Scheduled
  // Profiles" — team feedback #13). Merge them in here.
  const profileSendsQ = useScheduledProfileSends();
  const markRead = useMarkReplyRead();
  const markHandled = useMarkReplyHandled();

  const replies = repliesQ.data?.rows ?? [];
  const inboundReplies = useMemo(
    () => replies.filter(r => (r.direction ?? "inbound") === "inbound"),
    [replies],
  );
  const scheduled = useMemo(
    () => (batchesQ.data ?? []).filter(b => b.status === "draft"),
    [batchesQ.data],
  );
  // Pending profile sends (the hook already drops cancelled; keep the not-yet-
  // sent ones). These render alongside batch rows in the Scheduled folder.
  const scheduledProfiles = useMemo(
    () => (profileSendsQ.data ?? []).filter(s => s.status !== "sent"),
    [profileSendsQ.data],
  );

  // ── Client-side filter for the folders whose hooks don't take `q` ──────────
  const filteredSent = useMemo(() => {
    if (!q) return sentRecords;
    return sentRecords.filter(r =>
      [r.doctorName, r.specialty, r.hospital, r.country, r.template, ...(r.recipients ?? [])]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(q)),
    );
  }, [sentRecords, q]);

  const filteredScheduled = useMemo(() => {
    if (!q) return scheduled;
    return scheduled.filter(b =>
      [SENT_KIND_LABEL[b.kind], b.specialty, b.country, ...(b.recipient_emails ?? [])]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(q)),
    );
  }, [scheduled, q]);

  const filteredScheduledProfiles = useMemo(() => {
    if (!q) return scheduledProfiles;
    return scheduledProfiles.filter(s =>
      [s.doctor_name, s.doctor_speciality, s.doctor_email]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)),
    );
  }, [scheduledProfiles, q]);

  // Total in the Scheduled folder = batch drafts + pending profile sends.
  const scheduledCount = filteredScheduled.length + filteredScheduledProfiles.length;

  // ── Build the list items for the active folder ─────────────────────────────
  const items: MailItem[] = useMemo(() => {
    if (folder === "inbox") {
      return inboundReplies.map(r => ({
        id: r.id,
        title: (r.doctor_name ?? r.reply_from ?? "Unknown sender").replace(/^\s*Dr\.?\s+/i, ""),
        subtitle: r.hospital_name ?? r.reply_from ?? "",
        snippet: r.ai_summary || r.reply_subject || r.reply_text || "",
        when: r.created_at,
        unread: !r.is_read,
        accent: r.is_read ? "bg-slate-100 text-slate-500" : "bg-teal-100 text-teal-700",
      }));
    }
    if (folder === "sent") {
      return filteredSent.map(r => ({
        id: r.id,
        title: r.doctorName || "—",
        subtitle: r.hospital ? r.hospital : (r.country ? `${r.country} · all hospitals` : SENT_KIND_LABEL[r.sentKind as keyof typeof SENT_KIND_LABEL] ?? "Send"),
        snippet: [r.template, r.recipients?.length ? `${r.recipients.length} recipient${r.recipients.length === 1 ? "" : "s"}` : null, r.slot].filter(Boolean).join(" · "),
        when: r.sentAt,
        unread: false,
        accent: "bg-indigo-100 text-indigo-700",
      }));
    }
    const batchItems: MailItem[] = filteredScheduled.map(b => ({
      id: b.id,
      title: SENT_KIND_LABEL[b.kind] ?? "Scheduled send",
      subtitle: [b.specialty, b.country].filter(Boolean).join(" · ") || "All hospitals",
      snippet: `${b.doctor_ids?.length ?? 0} doctor${(b.doctor_ids?.length ?? 0) === 1 ? "" : "s"} queued`,
      when: b.next_run_at || b.scheduled_for,
      unread: false,
      accent: "bg-amber-100 text-amber-700",
    }));
    // Profile sends carry a `pss:` id prefix so selection can tell them apart
    // from batch rows (both are uuids).
    const profileItems: MailItem[] = filteredScheduledProfiles.map(s => ({
      id: `pss:${s.id}`,
      title: (s.doctor_name || "—").replace(/^\s*Dr\.?\s+/i, ""),
      subtitle: s.doctor_speciality || "Personalized send",
      snippet: `${s.hospital_ids?.length ?? 0} hospital${(s.hospital_ids?.length ?? 0) === 1 ? "" : "s"} · profile send`,
      when: scheduledProfileWhen(s),
      unread: false,
      accent: "bg-teal-100 text-teal-700",
    }));
    // Most-recent / furthest-out schedule first across both kinds, so a send you
    // just queued lands at the TOP of the list instead of buried under months of
    // older scheduled rows.
    return [...batchItems, ...profileItems].sort((a, b) => String(b.when ?? "").localeCompare(String(a.when ?? "")));
  }, [folder, inboundReplies, filteredSent, filteredScheduled, filteredScheduledProfiles]);

  // Keep a valid selection as the folder / list changes.
  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !items.some(i => i.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selectedReply  = folder === "inbox"     ? inboundReplies.find(r => r.id === selectedId) ?? null : null;
  const selectedSent   = folder === "sent"      ? filteredSent.find(r => r.id === selectedId) ?? null : null;
  const selectedBatch  = folder === "scheduled" && !selectedId?.startsWith("pss:")
    ? filteredScheduled.find(b => b.id === selectedId) ?? null : null;
  const selectedProfile = folder === "scheduled" && selectedId?.startsWith("pss:")
    ? filteredScheduledProfiles.find(s => `pss:${s.id}` === selectedId) ?? null : null;

  const openItem = (id: string) => {
    setSelectedId(id);
    if (folder === "inbox") {
      const r = inboundReplies.find(x => x.id === id);
      if (r && !r.is_read) markRead.mutate(r.id);
    }
  };

  // Mail is its own page (/mail), so deep-links navigate to the Sends hub with
  // the right tab rather than mutating this page's own query string.
  const goTab = (tab: string) => navigate(`/sends?tab=${tab}`);

  const unreadCount = inboundReplies.filter(r => !r.is_read).length;
  const loading =
    (folder === "inbox" && repliesQ.isLoading) ||
    (folder === "scheduled" && (batchesQ.isLoading || profileSendsQ.isLoading));

  return (
    <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[440px]">
      {/* ── Folder rail ─────────────────────────────────────────────────────── */}
      <div className="w-44 shrink-0 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="mb-2 inline-flex items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          <PenSquare className="h-4 w-4" /> Compose
        </button>
        {FOLDERS.map(f => {
          const Icon = f.icon;
          const isActive = folder === f.key;
          const badge = f.key === "inbox" ? unreadCount
            : f.key === "sent" ? filteredSent.length
            : scheduledCount;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFolder(f.key)}
              className={`flex items-center gap-2.5 rounded-r-full rounded-l-md px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-teal-600" : "text-slate-400"}`} />
              <span className="flex-1 text-left">{f.label}</span>
              {badge > 0 && (
                <span className={`text-[11px] font-semibold tabular-nums ${
                  f.key === "inbox" && unreadCount > 0 ? "text-rose-600" : "text-slate-400"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Message list ────────────────────────────────────────────────────── */}
      <div className="w-[340px] shrink-0 overflow-y-auto rounded-lg border border-border/60 bg-white">
        {loading ? (
          <div className="p-6 text-center text-[12px] text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Mail className="h-6 w-6 text-slate-300" />
            <div className="text-[12px] text-muted-foreground">
              {q ? "No messages match your search." : folder === "inbox" ? "No replies yet." : folder === "sent" ? "No sends yet." : "No scheduled sends."}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map(it => {
              const isSel = it.id === selectedId;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => openItem(it.id)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      isSel ? "bg-teal-50/70" : it.unread ? "bg-white hover:bg-slate-50" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${it.accent}`}>
                      {folder === "inbox" ? initials(it.title) : folder === "sent" ? <User className="h-4 w-4" /> : it.id.startsWith("pss:") ? <UserSquare className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {it.unread && <Circle className="h-2 w-2 shrink-0 fill-teal-500 text-teal-500" />}
                        <span className={`truncate text-[12.5px] ${it.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                          {it.title}
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">{fmtWhen(it.when)}</span>
                      </span>
                      {it.subtitle && <span className="block truncate text-[11px] text-slate-500">{it.subtitle}</span>}
                      {it.snippet && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{it.snippet}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Reading pane ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-white">
        {selectedReply ? (
          <ReplyReader reply={selectedReply} onOpenThread={() => goTab("replies")} onToggleHandled={(handled) => markHandled.mutate({ id: selectedReply.id, handled })} />
        ) : selectedSent ? (
          <SentReader rec={selectedSent} onOpen={() => goTab("past-sent")} />
        ) : selectedBatch ? (
          <ScheduledReader batch={selectedBatch} onOpen={() => goTab("batch-sends")} />
        ) : selectedProfile ? (
          <ScheduledProfileReader send={selectedProfile} onOpen={() => goTab("batch-sends")} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Mail className="h-8 w-8 text-slate-200" />
            <div className="text-[12px]">Select a message to read it.</div>
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeChooser
          onClose={() => setComposeOpen(false)}
          onPick={(mode) => { setComposeOpen(false); setComposeMode(mode); }}
        />
      )}

      {/* The composers render right here — the whole send flow stays inside the
          Mail page instead of navigating out to the Sends tabs. */}
      <SendProfileDialog open={composeMode === "personalized"} onClose={() => setComposeMode(null)} />
      <BatchComposeDialog open={composeMode === "batch"} onClose={() => setComposeMode(null)} initialKind="daily_duo" />
      <BatchComposeDialog open={composeMode === "bulk"} onClose={() => setComposeMode(null)} initialKind="one_off" />
    </div>
  );
}

// ── Compose: pick a send type ────────────────────────────────────────────────

/**
 * Compose doesn't own an editor — it routes into whichever existing composer
 * fits the send the user wants (team feedback #14: Compose should "take us
 * through the options of everything we have — batch, bulk, personalized").
 */
function ComposeChooser({ onClose, onPick }: { onClose: () => void; onPick: (mode: ComposeMode) => void }) {
  const OPTIONS: {
    key: ComposeMode; label: string; desc: string; icon: typeof User; accent: string;
  }[] = [
    {
      key: "personalized",
      label: "Personalized send",
      desc: "Pick one doctor and send a tailored Working Opportunity to matched hospitals.",
      icon: User, accent: "bg-teal-50 text-teal-700 group-hover:bg-teal-100",
    },
    {
      key: "batch",
      label: "Batch send",
      desc: "Send a specialty- / country-scoped run to many doctors and hospitals at once.",
      icon: Layers, accent: "bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100",
    },
    {
      key: "bulk",
      label: "Bulk / one-off send",
      desc: "Compose a single ad-hoc email to a custom list of recipients you paste in.",
      icon: Users, accent: "bg-amber-50 text-amber-700 group-hover:bg-amber-100",
    },
  ];
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
              <PenSquare className="h-4 w-4 text-teal-600" /> Compose
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Choose the kind of send you want to start.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(o => {
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onPick(o.key)}
                className="group flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${o.accent}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900">
                    {o.label}
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-500" />
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{o.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Reading-pane renderers ───────────────────────────────────────────────────

function ReaderShell({ title, meta, children }: { title: string; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-4">
        <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
        <div className="mt-1 text-[12px] text-muted-foreground">{meta}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </div>
  );
}

function OpenInButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-100"
    >
      <ExternalLink className="h-3 w-3" /> {label}
    </button>
  );
}

// ── Gmail-style message body ─────────────────────────────────────────────────

/**
 * Split a plaintext email into the NEW reply and the QUOTED thread beneath it,
 * so the quote can be tucked behind Gmail's "•••" toggle. The quote begins at
 * the first attribution line ("On <date>, <name> wrote:") or the first `>`
 * quoted line, whichever comes first. Leading `> ` markers are stripped from the
 * quoted block so it reads like Gmail's indented history rather than raw text.
 */
function splitTextQuote(raw: string): { main: string; quote: string } {
  const t = (raw ?? "").replace(/\r\n/g, "\n");
  let cut = -1;
  // Attribution line — `.+?wrote:` is lazy + the `s` flag lets it span the
  // line-wrapped "On …\n…> wrote:" form Gmail produces.
  const attr = t.match(/(^|\n)[ \t]*On .+?wrote:[ \t]*(?=\n|$)/s);
  if (attr && attr.index !== undefined) cut = attr.index + (attr[1]?.length ?? 0);
  // …or the first `>` quoted line, if it comes earlier.
  const gt = t.match(/(^|\n)[ \t]*>/);
  if (gt && gt.index !== undefined) {
    const gtCut = gt.index + (gt[1]?.length ?? 0);
    if (cut === -1 || gtCut < cut) cut = gtCut;
  }
  if (cut === -1) return { main: t.trim(), quote: "" };
  const main = t.slice(0, cut).trim();
  const quote = t.slice(cut).split("\n").map(l => l.replace(/^[ \t]*>[ \t]?/, "")).join("\n").trim();
  return { main, quote };
}

/** Same idea for HTML: cut at Gmail's quote wrapper / the first blockquote. */
function splitHtmlQuote(html: string): { main: string; quote: string } {
  const lower = html.toLowerCase();
  let idx = lower.indexOf('class="gmail_quote');
  if (idx === -1) idx = lower.indexOf("<blockquote");
  if (idx === -1) return { main: html, quote: "" };
  const tagStart = html.lastIndexOf("<", idx);
  return { main: html.slice(0, tagStart < 0 ? idx : tagStart), quote: html.slice(tagStart < 0 ? idx : tagStart) };
}

function EmailBody({ html, text }: { html: string | null | undefined; text: string | null | undefined }) {
  const [showQuote, setShowQuote] = useState(false);
  const useHtml = !!(html && html.trim());
  const { main, quote } = useHtml ? splitHtmlQuote(html!) : splitTextQuote(text ?? "");

  const Toggle = quote ? (
    <button
      type="button"
      onClick={() => setShowQuote(v => !v)}
      title={showQuote ? "Hide quoted text" : "Show quoted text"}
      className="my-2 inline-flex h-5 items-center gap-0.5 rounded bg-slate-100 px-2 leading-none text-slate-500 hover:bg-slate-200"
    >
      <span className="-mt-1.5 text-[15px] tracking-tight">•••</span>
    </button>
  ) : null;

  // Gmail renders the sender's rich HTML verbatim, then hides the thread history
  // behind the toggle. Plaintext gets the same treatment with pre-wrapped text.
  return (
    <div className="font-sans text-[13.5px] leading-relaxed text-slate-800">
      {useHtml ? (
        <div className="gmail-body max-w-none [&_a]:text-teal-700 [&_a]:underline [&_img]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500" dangerouslySetInnerHTML={{ __html: main }} />
      ) : (
        <div className="whitespace-pre-wrap">{main || "(no message body)"}</div>
      )}
      {Toggle}
      {quote && showQuote && (
        useHtml ? (
          <div className="mt-1 border-l-2 border-slate-200 pl-3 text-slate-500 [&_a]:text-teal-700 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: quote }} />
        ) : (
          <div className="mt-1 whitespace-pre-wrap border-l-2 border-slate-200 pl-3 text-[13px] text-slate-500">{quote}</div>
        )
      )}
    </div>
  );
}

function ReplyReader({ reply, onOpenThread, onToggleHandled }: {
  reply: HospitalReply;
  onOpenThread: () => void;
  onToggleHandled: (handled: boolean) => void;
}) {
  const handled = !!reply.handled_at;
  return (
    <ReaderShell
      title={reply.reply_subject || "(no subject)"}
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{reply.doctor_name || "—"}</span>
          {reply.hospital_name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{reply.hospital_name}</span>}
          {reply.reply_from && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{reply.reply_from}</span>}
          <span className="ml-auto">{fmtFull(reply.created_at)}</span>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {reply.classification && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium capitalize text-slate-600">
            {String(reply.classification).replace(/_/g, " ")}
          </span>
        )}
        <button
          type="button"
          onClick={() => onToggleHandled(!handled)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ${
            handled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <CheckCheck className="h-3 w-3" /> {handled ? "Handled" : "Mark handled"}
        </button>
        <OpenInButton label="Open thread" onClick={onOpenThread} />
      </div>
      {reply.ai_summary && (
        <div className="mb-3 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2 text-[12px] text-teal-900">
          <span className="font-semibold">AI summary: </span>{reply.ai_summary}
        </div>
      )}

      {/* Gmail-style message card: sender avatar + name/address on the left, the
          timestamp on the right, then the body with the quoted thread tucked
          behind a "•••" toggle. */}
      <div className="rounded-lg border border-border/60">
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[12px] font-bold text-teal-700">
            {initials(reply.doctor_name || reply.reply_from)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-[13px] font-semibold text-slate-900">{reply.doctor_name || reply.reply_from || "Unknown sender"}</span>
              {reply.reply_from && <span className="truncate text-[11.5px] text-slate-400">&lt;{reply.reply_from}&gt;</span>}
            </div>
            <div className="text-[11px] text-slate-400">to me</div>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400">{fmtFull(reply.created_at)}</span>
        </div>
        <div className="px-4 py-4">
          <EmailBody html={reply.reply_html} text={reply.reply_text} />
        </div>
      </div>
    </ReaderShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-800">{value}</span>
    </div>
  );
}

interface FlowPreview { from: string; to: string; subject: string; html: string; text: string }

/**
 * Render the doctor's profile the way the WEBSITE shows it — not the inline HTML
 * card the email falls back to. This is the same image-generation module the
 * "Generate Profile Image" tool uses: `buildDoctorProfileHtml` builds a faithful
 * replica of the site's profile layout, then `captureCardPng` rasterizes it to a
 * PNG. Derived purely from the WP record, so it works for BOTH profile/flow and
 * batch sends. Returned as a data URL so react-query can cache it indefinitely.
 */
async function generateProfileImage(candidate: WpCandidate): Promise<string> {
  const html = buildDoctorProfileHtml(candidate);
  const blob = await captureCardPng(html, { width: PROFILE_IMAGE_WIDTH });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't render the profile image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Re-render the exact email a profile send produced, on demand. The send itself
 * stores no HTML body, so we ask send-flow-email for a `dry_run` preview of the
 * run at its hospital-email stage — the same renderer that built the original,
 * fed the same run metadata, so it reproduces what actually went out. Cached per
 * run for 5 min so re-selecting a message is instant. (Only profile/flow sends
 * have a re-renderable run; batch sends fall back to their detail card.)
 */
async function fetchSentEmail(runId: string): Promise<FlowPreview> {
  const { data, error } = await supabase.functions.invoke("send-flow-email", {
    body: { run_id: runId, dry_run: true, preview_stage: "email_hospital" },
  }) as { data: { ok?: boolean; preview?: FlowPreview; error?: string } | null; error: unknown };
  if (error) throw new Error((error as { message?: string })?.message ?? "Couldn't load the email.");
  if (!data?.ok || !data.preview) throw new Error(data?.error ?? "Couldn't load the email.");
  return data.preview;
}

/**
 * Render the delivered email verbatim, but swap the doctor-profile portion for
 * the website-faithful generated image. The email carries the profile either as
 * an already-captured card `<img alt="Doctor profile">` OR, when no PNG was
 * grabbed at send time, as the inline teal HTML card (its inner table is the
 * only `max-width:1040px` table). We replace whichever is present with the
 * freshly generated profile image so the reader shows the WHOLE email — greeting,
 * hospital blurb, signature — with the profile looking exactly like the site.
 */
/** Fixed content width the sent email renders at — matches the profile card
 *  image's max-width (700px) plus the 16px side padding, so the message keeps a
 *  constant Gmail-style width and the frame scrolls horizontally instead of
 *  squishing the content when the reading pane is narrow. */
const EMAIL_CANVAS_WIDTH = 732;

function DeliveredEmail({ html, imageUrl }: { html: string; imageUrl?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !imageUrl) return;
    // If the email already embedded a captured card image (uploaded to the
    // email-card-images bucket), it IS exactly what was sent — leave it
    // untouched. We only step in for older sends that fell back to the inline
    // HTML teal card (its inner table is the only max-width:1040px table),
    // swapping it for the generated profile image at the SAME size a sent card
    // image uses (width:100%; max-width:700px; centered; 14px radius) so it
    // looks exactly like a real send.
    if (root.querySelector('img[src*="email-card-images"]')) return;
    const cardTable = root.querySelector('table[style*="max-width:1040px"]') as HTMLElement | null;
    if (cardTable) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Doctor profile";
      img.style.cssText =
        "display:block;width:100%;max-width:700px;height:auto;margin:20px auto 0;border:0;border-radius:14px;";
      const wrapper = cardTable.closest("div") ?? cardTable;
      wrapper.replaceWith(img);
    }
  }, [html, imageUrl]);

  return (
    <div
      ref={ref}
      className="email-html text-[15px] leading-relaxed text-slate-800 [&_a]:text-teal-700 [&_a]:underline [&_img]:max-w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SentReader({ rec, onOpen }: { rec: SentRecord; onOpen: () => void }) {
  const canRenderEmail = rec.source === "flow";
  const [showDetails, setShowDetails] = useState(false);

  // Resolve the doctor's WordPress record so we can regenerate their profile the
  // exact way the website renders it (includeDrafts: profiles may be unpublished).
  // Match on id → phone → email → name (the run's doctorId is often a
  // Zoho-prefixed id that never matches a WP doctor_id, so the phone/email
  // carried on the run metadata are what actually resolve the profile — without
  // them the image can't be generated and the email falls back to the inline
  // teal HTML card).
  const candidate = useWpCandidateForDoctor(
    rec.doctorId || rec.doctorEmail || rec.doctorPhone || rec.doctorName
      ? { id: rec.doctorId ?? "", name: rec.doctorName, email: rec.doctorEmail, phone: rec.doctorPhone }
      : null,
    { includeDrafts: true },
  );

  // Website-faithful profile image — swapped into the email body below. Cached
  // forever per doctor since it's derived from their (stable) WP record.
  const image = useQuery({
    queryKey: ["profile-image", candidate?.id],
    enabled: !!candidate,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: () => generateProfileImage(candidate!),
  });

  // The actual delivered email (flow sends only), re-rendered from the run.
  const preview = useQuery({
    queryKey: ["sent-email", rec.refId],
    enabled: canRenderEmail,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => fetchSentEmail(rec.refId),
  });

  const toLine = rec.recipients?.length
    ? rec.recipients.join(", ")
    : (rec.country ? `All hospitals in ${rec.country}` : "—");

  const details = (
    <div className="divide-y divide-border/40">
      <Row label="Doctor" value={rec.doctorName} />
      <Row label="Specialty" value={rec.specialty} />
      <Row label="Slot" value={rec.slot} />
      <Row label="Hospital" value={rec.hospital ?? (rec.country ? `${rec.country} · all hospitals` : null)} />
      <Row label="Country" value={rec.country} />
      <Row label="Template" value={rec.template} />
      <Row
        label="Recipients"
        value={rec.recipients?.length
          ? <span className="flex flex-col gap-0.5">{rec.recipients.map(e => <span key={e} className="truncate">{e}</span>)}</span>
          : (rec.country ? "Country-scoped broadcast (all hospitals)" : null)}
      />
      <Row label="Sent at" value={fmtFull(rec.sentAt)} />
    </div>
  );

  const profileFallback = !candidate ? (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-[12px] text-muted-foreground">
      <ImageIcon className="h-4 w-4" />
      No matching WordPress profile found for this doctor, so the profile image can't be regenerated.
    </div>
  ) : image.isLoading ? (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-10 text-[12px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
      Rendering {rec.doctorName || "the doctor"}'s profile image…
    </div>
  ) : image.isError ? (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
      Couldn't render the profile image ({image.error instanceof Error ? image.error.message : "unknown error"}).
    </div>
  ) : (
    <img
      src={image.data}
      alt={`${rec.doctorName || "Doctor"} profile`}
      className="w-full h-auto rounded-lg border border-border/60 bg-white shadow-sm"
    />
  );

  return (
    <ReaderShell
      title={preview.data?.subject || `${rec.doctorName || "—"} — ${SENT_KIND_LABEL[rec.sentKind as keyof typeof SENT_KIND_LABEL] ?? "Send"}`}
      meta={<span className="flex items-center gap-2"><ChevronRight className="h-3 w-3" />Sent {fmtFull(rec.sentAt)}</span>}
    >
      <div className="mb-3 flex items-center gap-2">
        <OpenInButton label="Open in Past Sent" onClick={onOpen} />
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      {/* From / To header — same as it went out. */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <Send className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="truncate"><span className="text-slate-400">From </span><span className="font-medium text-slate-700">{preview.data?.from || rec.template || "Allocation Assist"}</span></div>
          <div className="truncate"><span className="text-slate-400">To </span><span className="font-medium text-slate-700">{toLine}</span></div>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{fmtFull(rec.sentAt)}</span>
      </div>

      {/* Body: the whole email as delivered, with the profile shown as the
          website-faithful generated image swapped inline. Rendered at a CONSTANT
          width (like Gmail) inside a horizontally-scrollable frame — the message
          never shrinks to fit the pane; a scrollbar appears instead. We block
          only on the email itself; the profile image swaps in when it finishes
          rendering, so the message shows fast. Batch/broadcast sends have no
          re-renderable run, so they show the image + details only. */}
      {!canRenderEmail ? (
        <>{profileFallback}</>
      ) : preview.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          Rendering the email that was sent…
        </div>
      ) : preview.isError ? (
        <div className="space-y-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            Couldn't re-render this email ({preview.error instanceof Error ? preview.error.message : "unknown error"}). Showing the profile image instead.
          </div>
          {profileFallback}
        </div>
      ) : preview.data ? (
        <div className="aa-hscroll overflow-x-auto rounded-lg border border-border/60">
          <div style={{ width: EMAIL_CANVAS_WIDTH }} className="px-4 py-4">
            <DeliveredEmail html={preview.data.html} imageUrl={image.data ?? null} />
          </div>
        </div>
      ) : null}

      {showDetails && <div className="mt-4">{details}</div>}
    </ReaderShell>
  );
}

/** Sort/display key for a scheduled profile send — its calendar date joined
 *  with the wall-clock slot, so it orders correctly next to batch rows. */
function scheduledProfileWhen(s: ScheduledProfileSend): string {
  return `${s.scheduled_for}T${(s.scheduled_at_time ?? "09:00").slice(0, 5)}`;
}

function ScheduledProfileReader({ send, onOpen }: { send: ScheduledProfileSend; onOpen: () => void }) {
  const cancel = useCancelScheduledProfileSend();
  const [showDetails, setShowDetails] = useState(false);
  const hospitalsQ = useHospitals();

  // Reproduce the doctor-facing Working Opportunity email this scheduled send
  // will deliver — greeting, each matched hospital (photo + "About us" link +
  // description), and the sender's sign-off — using the SAME client builders the
  // personalized composer previews with, so the team can see the whole email
  // before it fires. Hospitals are resolved from the row's hospital_ids.
  const preview = useMemo(() => {
    const all = hospitalsQ.data;
    if (!all) return null;
    const byId = new Map(all.map(h => [h.id, h]));
    const wo: WorkingOpHospital[] = (send.hospital_ids ?? [])
      .map(id => byId.get(id))
      .filter((h): h is NonNullable<typeof h> => !!h)
      .map(h => ({
        name: h.name, city: h.city, country: h.country,
        image_url: h.image_url, link: h.website, description: h.description,
      }));
    if (!wo.length) return null;
    return {
      subject: buildWorkingOpSubject(wo, send.doctor_speciality),
      html: buildWorkingOpBody(send.doctor_name || "Doctor", wo, previewSignatureHtmlFor(send.assigned_to)),
    };
  }, [hospitalsQ.data, send.hospital_ids, send.doctor_name, send.doctor_speciality, send.assigned_to]);

  return (
    <ReaderShell
      title={preview?.subject || `${(send.doctor_name || "—").replace(/^\s*Dr\.?\s+/i, "")} — Personalized send`}
      meta={<span className="flex items-center gap-2"><CalendarClock className="h-3 w-3" />Scheduled for {fmtFull(scheduledProfileWhen(send))}</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OpenInButton label="Open in Batch Sends" onClick={onOpen} />
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={async () => {
            if (!confirm(`Cancel the scheduled send for ${send.doctor_name}?`)) return;
            try { await cancel.mutateAsync(send.id); } catch { /* surfaced elsewhere */ }
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> Cancel send
        </button>
      </div>

      {/* From / To header — the doctor is the recipient of this WO email. */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <UserSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="truncate"><span className="text-slate-400">From </span><span className="font-medium text-slate-700">{send.assigned_to || "Allocation Assist"}</span></div>
          <div className="truncate"><span className="text-slate-400">To </span><span className="font-medium text-slate-700">{send.doctor_email || send.doctor_name || "—"}</span></div>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">Scheduled</span>
      </div>

      {/* The whole doctor Working Opportunity email, rendered exactly as it will
          send. Batch/hospital-intro copy is server-templated and shown at fire
          time; this reproduces the doctor-facing WO email faithfully here. */}
      {hospitalsQ.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Rendering the email…
        </div>
      ) : preview ? (
        <div className="aa-hscroll overflow-x-auto rounded-lg border border-border/60">
          <div style={{ width: EMAIL_CANVAS_WIDTH }} className="px-4 py-4">
            <DeliveredEmail html={preview.html} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-[12px] text-muted-foreground">
          <ImageIcon className="h-4 w-4" /> Couldn't resolve this send's hospitals, so the email preview isn't available. Use “Show details” or open it in Batch Sends.
        </div>
      )}

      {showDetails && (
        <div className="mt-4 divide-y divide-border/40">
          <Row label="Doctor" value={send.doctor_name} />
          <Row label="Specialty" value={send.doctor_speciality} />
          <Row label="Doctor email" value={send.doctor_email} />
          <Row label="Hospitals" value={`${send.hospital_ids?.length ?? 0} hospital${(send.hospital_ids?.length ?? 0) === 1 ? "" : "s"}`} />
          <Row label="Scheduled for" value={fmtFull(send.scheduled_for)} />
          <Row label="Time" value={send.scheduled_at_time ? `${send.scheduled_at_time.slice(0, 5)} ${send.timezone ?? "Asia/Dubai"}` : null} />
          <Row label="Sender" value={send.assigned_to} />
          <Row label="Custom template" value={send.template_overrides ? "Yes" : "No"} />
          <Row label="Attachments" value={(send.attachments?.length ?? 0) > 0 ? `${send.attachments.length} file${send.attachments.length === 1 ? "" : "s"}` : null} />
          <Row label="Status" value={send.status} />
        </div>
      )}
    </ReaderShell>
  );
}

/** One viewable email inside a scheduled batch — the hospital-facing email(s)
 *  and each optional doctor working-opportunity email. Flattened from the batch
 *  dry-run preview so the reader can page through them with a single selector. */
interface BatchEmailView { group: "hospital" | "doctor"; label: string; subject: string; html: string }

/** Flatten a batch preview into the individual emails it will send. A simple
 *  one-off batch is a single hospital email; Daily Duo sends one hospital email
 *  per queued doctor; and when include_doctor_email is on, each doctor also gets
 *  a working-opportunity email. */
function flattenBatchPreview(p: BatchPreviewResult): BatchEmailView[] {
  const out: BatchEmailView[] = [];
  if (p.per_doctor && p.per_doctor.length) {
    p.per_doctor.forEach((d, i) => out.push({ group: "hospital", label: d.name || `Hospital email ${i + 1}`, subject: d.subject, html: d.html }));
  } else {
    out.push({ group: "hospital", label: "Hospital email", subject: p.subject, html: p.html });
  }
  (p.doctor_emails ?? []).forEach((d, i) => out.push({ group: "doctor", label: d.name || `Doctor email ${i + 1}`, subject: d.subject, html: d.html }));
  return out;
}

function ScheduledReader({ batch, onOpen }: { batch: ScheduledBatch; onOpen: () => void }) {
  const previewMut = useBatchPreview();
  const [emails, setEmails] = useState<BatchEmailView[] | null>(null);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { mutateAsync } = previewMut;

  // Render the ACTUAL email(s) this batch will send by asking send-batch for a
  // dry-run — the same server renderer that fires the real send, so the team
  // sees exactly what hospitals (and, if enabled, doctors) will receive rather
  // than a metadata card. Re-runs when a different batch is selected.
  useEffect(() => {
    let alive = true;
    setEmails(null); setErr(null); setActive(0);
    mutateAsync({ batchId: batch.id })
      .then(p => { if (alive) setEmails(flattenBatchPreview(p)); })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : "Couldn't render this batch's email."); });
    return () => { alive = false; };
  }, [batch.id, mutateAsync]);

  const current = emails?.[active] ?? null;

  return (
    <ReaderShell
      title={current?.subject || SENT_KIND_LABEL[batch.kind] || "Scheduled send"}
      meta={<span className="flex items-center gap-2"><CalendarClock className="h-3 w-3" />Next run {fmtFull(batch.next_run_at || batch.scheduled_for)}</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OpenInButton label="Open in Batch Sends" onClick={onOpen} />
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      {/* Email selector — a batch fans out into one hospital email (or one per
          doctor for Daily Duo) plus each optional doctor working-op email. */}
      {emails && emails.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {emails.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                i === active ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {e.group === "doctor" ? <UserSquare className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
              {e.label}
            </button>
          ))}
        </div>
      )}

      {/* The rendered email, exactly as it will send. */}
      {previewMut.isPending || (!emails && !err) ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> Rendering the email…
        </div>
      ) : current ? (
        <div className="aa-hscroll overflow-x-auto rounded-lg border border-border/60">
          <div style={{ width: EMAIL_CANVAS_WIDTH }} className="px-4 py-4">
            <DeliveredEmail html={current.html} />
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-[12px] text-muted-foreground">
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err ?? "The email preview isn't available for this batch."} Use “Show details” below or open it in Batch Sends.</span>
        </div>
      )}

      {showDetails && (
        <div className="mt-4 divide-y divide-border/40">
          <Row label="Kind" value={SENT_KIND_LABEL[batch.kind]} />
          <Row label="Specialty" value={batch.specialty} />
          <Row label="Country" value={batch.country ?? "All hospitals"} />
          <Row label="Doctors queued" value={String(batch.doctor_ids?.length ?? 0)} />
          <Row label="Scheduled for" value={fmtFull(batch.scheduled_for)} />
          <Row label="Time" value={batch.scheduled_at_time ? `${batch.scheduled_at_time} ${batch.timezone ?? "Asia/Dubai"}` : null} />
          <Row label="Recipients" value={batch.recipient_emails?.length ? batch.recipient_emails.join(", ") : null} />
          <Row label="Doctor email" value={batch.include_doctor_email ? "Yes — doctors also emailed" : "No"} />
          <Row label="Notes" value={batch.notes} />
        </div>
      )}
    </ReaderShell>
  );
}

/**
 * The bell popover — completely rebuilt around the v2 notifications
 * model. The old popover stitched together synthetic alerts from
 * various places; this one is the single surface for the real
 * `notifications` table data, grouped by severity, with one-click
 * actions that match what the corresponding Slack message offers.
 *
 * Layout:
 *   [Critical]   red strip + bold title + Open button
 *   [Action]     amber strip + bold title + Open button (+ owner @mention pill if non-self)
 *   [Info]       collapsed by default — "N quieter items" toggle
 *
 * Within each severity tier rows are grouped BY KIND: one header per
 * kind (label + count + "Clear all"), collapsed to the most-recent row
 * with "+N more" to expand the rest. vacancy_match gets a tighter
 * per-vacancy rollup so a hundred (doctor × vacancy) pairs read as a
 * handful of "N matches for …" rows instead of a hundred cards.
 *
 * Read-state: clicking a row / its CTA marks that one read; opening the
 * popover auto-marks every visible notification read so unreadCount stops
 * over-reporting. "Mark all read" stays as the explicit escape hatch.
 *
 * Slack badge: a small label on each row if the notification was
 * delivered to Slack ("via Slack"), so the team knows it's been
 * mirrored.
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Slack as SlackIcon, X, Trash2, ChevronRight, ChevronDown, Sparkles, CalendarCheck, UserCheck, UserX, FileSignature, MessageSquare, Mail, FileText, Archive, DollarSign, AlertOctagon, RefreshCw, Inbox } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useNotifications,
  useDismissNotification,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDismissAllOfKind,
  type AppNotification,
  type NotificationSeverity,
} from "@/hooks/use-notifications";

// How many kinds' worth of full rows we'll render before the quieter
// info tier is collapsed behind a toggle. The actionable tiers always
// render; info only when the user asks.
//
// Per kind we show the most-recent row and a "+N more" expander rather
// than dumping every row into a ~400px panel — the full list lives on
// the dashboard's Pending actions card / the linked page.
const COLLAPSED_PER_KIND = 1;

interface KindMeta {
  label:  string;
  icon:   typeof Sparkles;
  accent: string;       // text colour for the kind icon
}

// Display metadata for each notification kind tick-scheduler produces.
// Anything not listed falls through to a generic "Notification" group.
// Kept local to the popover — PendingActionsCard has its own copy tuned
// for the dashboard's wider layout.
const KIND_META: Record<string, KindMeta> = {
  // — escalations (critical tier) —
  placement_payment_overdue: { label: "Payment overdue",        icon: DollarSign,    accent: "text-rose-600" },
  sla_breach:                { label: "Data sync down",         icon: AlertOctagon,  accent: "text-rose-600" },
  // — actionable (action tier) —
  shortlist_suggested:  { label: "Shortlist suggestions",  icon: MessageSquare, accent: "text-violet-600" },
  interview_proposed:   { label: "Interview times proposed", icon: CalendarCheck, accent: "text-amber-600" },
  hospital_declined:    { label: "Hospital declined",       icon: UserX,         accent: "text-rose-600" },
  hospital_reply_overdue: { label: "Hospital reply overdue", icon: Mail,        accent: "text-blue-600" },
  interview_followup:   { label: "Interview follow-ups",   icon: CalendarCheck, accent: "text-amber-600" },
  availability_checkin: { label: "Availability check-ins", icon: UserCheck,     accent: "text-sky-600" },
  signed_not_joined:    { label: "Signed, not joined yet",  icon: FileSignature, accent: "text-emerald-600" },
  contract_signed:      { label: "Contracts signed",       icon: FileSignature, accent: "text-emerald-600" },
  cv_uploaded:          { label: "CVs uploaded",           icon: FileText,      accent: "text-indigo-600" },
  batch_send_failed:    { label: "Batch send failures",    icon: AlertTriangle, accent: "text-rose-600" },
  slack_archive_due:    { label: "Slack channels to archive", icon: Archive,    accent: "text-slate-600" },
  form_digest:          { label: "New form submissions",   icon: Inbox,         accent: "text-teal-600" },
  // — for awareness (info tier) —
  vacancy_match:        { label: "Vacancy matches",        icon: Sparkles,      accent: "text-violet-600" },
  new_form_submission:  { label: "New form submissions",   icon: Inbox,         accent: "text-teal-600" },
  wp_sync_summary:      { label: "WordPress sync",         icon: RefreshCw,     accent: "text-sky-600" },
};
const GENERIC_META: KindMeta = { label: "Notifications", icon: Bell, accent: "text-slate-500" };

// Within a tier, surface the most actionable kinds first. (indexOf is
// applied per-tier, so a single ordered list across all kinds is fine.)
const KIND_ORDER = [
  "placement_payment_overdue", "sla_breach",
  "shortlist_suggested", "interview_proposed", "hospital_reply_overdue", "interview_followup",
  "availability_checkin", "signed_not_joined", "contract_signed",
  "cv_uploaded", "batch_send_failed", "slack_archive_due", "form_digest",
  "hospital_declined", "vacancy_match", "new_form_submission", "wp_sync_summary",
];

function kindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? GENERIC_META;
}

export function NotificationsPopover() {
  const { notifications, unreadCount } = useNotifications();
  const dismiss        = useDismissNotification();
  const markRead       = useMarkNotificationRead();
  const markAllRead    = useMarkAllNotificationsRead();
  const dismissAllKind = useDismissAllOfKind();
  const navigate       = useNavigate();
  const [open, setOpen]         = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Bucket by severity. Within each bucket newest first (the query
  // already orders descending so we just split-keep-order).
  const buckets = useMemo(() => {
    const critical: AppNotification[] = [];
    const action:   AppNotification[] = [];
    const info:     AppNotification[] = [];
    for (const n of notifications) {
      const sev: NotificationSeverity = n.severity ?? "info";
      if (sev === "critical")    critical.push(n);
      else if (sev === "action") action.push(n);
      else                       info.push(n);
    }
    return { critical, action, info };
  }, [notifications]);

  const actionable = buckets.critical.length + buckets.action.length;
  const showEmpty  = notifications.length === 0;

  // Opening the popover means the user has seen what's there — mark the
  // visible unread ones read so the badge stops over-reporting. Fires
  // once per open (the ref guards against the effect re-running while the
  // list refetches under the open panel). Realtime/refetch keep working
  // because we only flip read_at, never touch dismissed_at.
  const markedOnOpen = useRef(false);
  useEffect(() => {
    if (!open) { markedOnOpen.current = false; return; }
    if (markedOnOpen.current) return;
    if (unreadCount === 0) return;
    markedOnOpen.current = true;
    markAllRead.mutate();
    // markAllRead is a stable mutation handle; unreadCount/open gate the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clicking a row or its CTA marks just that one read, then navigates.
  const act = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.link_path) navigate(n.link_path);
    setOpen(false);
  };

  const onClearKind = (kind: string, count: number) => {
    const label = kindMeta(kind).label;
    if (count <= 1 || confirm(`Clear all ${count} "${label}"?`)) {
      dismissAllKind.mutate(kind);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" data-tour="topbar-notifications" className="relative h-8 w-8 rounded-full">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          {unreadCount > 0 && (
            <Badge
              className={`absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] p-0 flex items-center justify-center text-[8px] ${
                actionable > 0 ? "bg-rose-500 hover:bg-rose-500 animate-pulse" : ""
              }`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold">Notifications</span>
            {actionable > 0 && (
              <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                {actionable} need action
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[10px] text-primary hover:underline font-medium"
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[480px] overflow-auto">
          {showEmpty && (
            <div className="flex items-center gap-2.5 px-3 py-6 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              All caught up — nothing needs you right now.
            </div>
          )}

          {buckets.critical.length > 0 && (
            <SeveritySection
              label="Critical"
              tone="rose"
              icon={AlertCircle}
              items={buckets.critical}
              onAct={act}
              onDismiss={(n) => dismiss.mutate(n.id)}
              onClearKind={onClearKind}
            />
          )}
          {buckets.action.length > 0 && (
            <SeveritySection
              label="Needs action"
              tone="amber"
              icon={AlertTriangle}
              items={buckets.action}
              onAct={act}
              onDismiss={(n) => dismiss.mutate(n.id)}
              onClearKind={onClearKind}
            />
          )}
          {buckets.info.length > 0 && (
            <div className="border-t border-border/40">
              <button
                onClick={() => setShowInfo(s => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <span>{showInfo ? "Hide" : "Show"} {buckets.info.length} quieter item{buckets.info.length === 1 ? "" : "s"}</span>
                <ArrowRight className={`h-3 w-3 transition-transform ${showInfo ? "rotate-90" : ""}`} />
              </button>
              {showInfo && (
                <SeveritySection
                  label=""
                  tone="slate"
                  icon={Bell}
                  items={buckets.info}
                  onAct={act}
                  onDismiss={(n) => dismiss.mutate(n.id)}
                  onClearKind={onClearKind}
                />
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SeveritySectionProps {
  label:       string;
  tone:        "rose" | "amber" | "slate";
  icon:        typeof AlertCircle;
  items:       AppNotification[];
  onAct:       (n: AppNotification) => void;
  onDismiss:   (n: AppNotification) => void;
  onClearKind: (kind: string, count: number) => void;
}

function SeveritySection({ label, tone, icon: Icon, items, onAct, onDismiss, onClearKind }: SeveritySectionProps) {
  const toneClass = {
    rose:  "bg-rose-50/50 text-rose-700",
    amber: "bg-amber-50/50 text-amber-800",
    slate: "bg-slate-50/50 text-slate-600",
  }[tone];
  const stripClass = {
    rose:  "border-l-rose-500",
    amber: "border-l-amber-500",
    slate: "border-l-slate-300",
  }[tone];

  // Group this tier's rows by kind, keeping created_at-desc within each
  // (the source list is already sorted descending). Kinds surface in
  // KIND_ORDER, with unknown kinds trailing alphabetically.
  const groups = useMemo(() => {
    const byKind = new Map<string, AppNotification[]>();
    for (const n of items) {
      const arr = byKind.get(n.kind) ?? [];
      arr.push(n);
      byKind.set(n.kind, arr);
    }
    const keys = Array.from(byKind.keys()).sort((a, b) => {
      const ai = KIND_ORDER.indexOf(a); const bi = KIND_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return keys.map(k => ({ kind: k, items: byKind.get(k)! }));
  }, [items]);

  return (
    <div>
      {label && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold ${toneClass}`}>
          <Icon className="h-3 w-3" />
          {label}
        </div>
      )}
      {groups.map(g => (
        <KindGroup
          key={g.kind}
          kind={g.kind}
          items={g.items}
          stripClass={stripClass}
          onAct={onAct}
          onDismiss={onDismiss}
          onClearKind={onClearKind}
        />
      ))}
    </div>
  );
}

interface KindGroupProps {
  kind:        string;
  items:       AppNotification[];
  stripClass:  string;
  onAct:       (n: AppNotification) => void;
  onDismiss:   (n: AppNotification) => void;
  onClearKind: (kind: string, count: number) => void;
}

function KindGroup({ kind, items, stripClass, onAct, onDismiss, onClearKind }: KindGroupProps) {
  const meta   = kindMeta(kind);
  const Icon   = meta.icon;
  const unread = items.filter(n => !n.read_at).length;
  // A single-row group needs no header — render it as a plain card so we
  // don't bury one notification under chrome. Multi-row groups collapse
  // under the header.
  const single = items.length === 1;
  const [expanded, setExpanded] = useState(false);

  if (single) {
    return (
      <div>
        <NotificationRow n={items[0]} stripClass={stripClass} onAct={onAct} onDismiss={onDismiss} />
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, COLLAPSED_PER_KIND);
  const hidden  = items.length - visible.length;
  const isRollup = kind === "vacancy_match";

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20">
        <Icon className={`h-3 w-3 shrink-0 ${meta.accent}`} />
        <span className="text-[11px] font-medium text-foreground truncate">{meta.label}</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{items.length}</Badge>
        {unread > 0 && (
          <span className="text-[9px] text-emerald-700 font-medium shrink-0">{unread} new</span>
        )}
        <button
          onClick={() => onClearKind(kind, items.length)}
          title={`Clear all ${items.length}`}
          className="ml-auto inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded transition-colors shrink-0"
        >
          <Trash2 className="h-2.5 w-2.5" />
          Clear all
        </button>
      </div>

      {isRollup ? (
        <VacancyMatchRollup items={visible} stripClass={stripClass} onAct={onAct} onDismiss={onDismiss} />
      ) : (
        visible.map(n => (
          <NotificationRow key={n.id} n={n} stripClass={stripClass} onAct={onAct} onDismiss={onDismiss} />
        ))
      )}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] text-primary hover:bg-muted/40 transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          +{hidden} more
        </button>
      )}
      {expanded && items.length > COLLAPSED_PER_KIND && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <ChevronRight className="h-3 w-3" />
          Show less
        </button>
      )}
    </div>
  );
}

/** vacancy_match rows roll up by the vacancy they're about so a flood of
 *  (doctor × vacancy) pairs reads as a handful of "N matches for …" rows.
 *  The recruiter cares that a vacancy has new matches, not about each pair;
 *  the row links straight into the vacancy. Falls back to grouping on the
 *  title when related_vacancy_id is missing. */
function VacancyMatchRollup({ items, stripClass, onAct, onDismiss }: {
  items:      AppNotification[];
  stripClass: string;
  onAct:      (n: AppNotification) => void;
  onDismiss:  (n: AppNotification) => void;
}) {
  const rollups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; specialty: string | null; items: AppNotification[]; latest: AppNotification }>();
    for (const n of items) {
      const key = n.related_vacancy_id ?? `t:${n.title}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(n);
        if (n.created_at > existing.latest.created_at) existing.latest = n;
      } else {
        map.set(key, {
          key,
          title:     n.title.replace(/^New match\s*·\s*/i, "").trim() || n.title,
          specialty: extractMatchSpecialty(n.body),
          items:     [n],
          latest:    n,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.latest.created_at < b.latest.created_at ? 1 : -1));
  }, [items]);

  return (
    <div>
      {rollups.map(r => {
        const unread = r.items.filter(n => !n.read_at).length;
        // Clicking the rollup acts on its most-recent member: marks read +
        // jumps into the (shared) vacancy link.
        return (
          <div
            key={r.key}
            className={`relative border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors border-l-2 ${stripClass}`}
          >
            <button
              onClick={() => onAct(r.latest)}
              className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 pr-8"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className={`text-[12px] leading-snug ${unread === 0 ? "font-medium text-muted-foreground" : "font-semibold text-foreground"}`}>
                  {r.items.length} new match{r.items.length === 1 ? "" : "es"}
                  {r.specialty ? <> · <span className="text-violet-700">{r.specialty}</span></> : null}
                  {" "}· {r.title}
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[9px] text-muted-foreground">Latest {formatTime(r.latest.created_at)}</span>
                  {unread > 0 && <span className="text-[9px] text-emerald-700 font-medium">{unread} new</span>}
                </div>
              </div>
            </button>
            <button
              onClick={() => r.items.forEach(n => onDismiss(n))}
              title={`Dismiss all ${r.items.length}`}
              className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** A single notification card — the original per-row markup, lifted out so
 *  both grouped and single-kind paths share it. */
function NotificationRow({ n, stripClass, onAct, onDismiss }: {
  n:          AppNotification;
  stripClass: string;
  onAct:      (n: AppNotification) => void;
  onDismiss:  (n: AppNotification) => void;
}) {
  return (
    <div
      className={`relative border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors border-l-2 ${stripClass}`}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5 pr-8">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className={`text-[12px] leading-snug ${n.read_at ? "font-medium text-muted-foreground" : "font-semibold text-foreground"}`}>
            {n.title}
          </p>
          {n.body && (
            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{n.body}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            {n.link_path && (
              <button
                onClick={() => onAct(n)}
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {n.cta_label ?? "Open"}
                <ArrowRight className="h-2.5 w-2.5" />
              </button>
            )}
            <span className="text-[9px] text-muted-foreground">{formatTime(n.created_at)}</span>
            {n.slack_delivered_at && (
              <span title="Also delivered to Slack" className="inline-flex items-center gap-1 text-[9px] text-emerald-700">
                <SlackIcon className="h-2.5 w-2.5" /> via Slack
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => onDismiss(n)}
        title="Dismiss"
        className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Pull the vacancy specialty out of the notification body. The body is
 *  generated by tick-scheduler as:
 *    "{name} ({doc-spec}) matches {VAC SPECIALTY} at {hospital}."
 *  We extract the VAC specialty since that's what the rollup is about. */
function extractMatchSpecialty(body: string | null): string | null {
  if (!body) return null;
  const m = body.match(/\bmatches\s+(.+?)\s+at\s+/i);
  return m ? m[1].trim() : null;
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "yesterday";
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

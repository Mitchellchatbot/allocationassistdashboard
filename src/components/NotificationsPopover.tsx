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
 * Slack badge: a small label on each row if the notification was
 * delivered to Slack ("via Slack"), so the team knows it's been
 * mirrored.
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Slack as SlackIcon, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications, useDismissNotification, useMarkAllNotificationsRead, type AppNotification, type NotificationSeverity } from "@/hooks/use-notifications";

export function NotificationsPopover() {
  const { notifications, unreadCount } = useNotifications();
  const dismiss        = useDismissNotification();
  const markAllRead    = useMarkAllNotificationsRead();
  const navigate       = useNavigate();
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

  return (
    <Popover>
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
              onAct={(n) => n.link_path && navigate(n.link_path)}
              onDismiss={(n) => dismiss.mutate(n.id)}
            />
          )}
          {buckets.action.length > 0 && (
            <SeveritySection
              label="Needs action"
              tone="amber"
              icon={AlertTriangle}
              items={buckets.action}
              onAct={(n) => n.link_path && navigate(n.link_path)}
              onDismiss={(n) => dismiss.mutate(n.id)}
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
                  onAct={(n) => n.link_path && navigate(n.link_path)}
                  onDismiss={(n) => dismiss.mutate(n.id)}
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
  label:     string;
  tone:      "rose" | "amber" | "slate";
  icon:      typeof AlertCircle;
  items:     AppNotification[];
  onAct:     (n: AppNotification) => void;
  onDismiss: (n: AppNotification) => void;
}

function SeveritySection({ label, tone, icon: Icon, items, onAct, onDismiss }: SeveritySectionProps) {
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

  return (
    <div>
      {label && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold ${toneClass}`}>
          <Icon className="h-3 w-3" />
          {label}
        </div>
      )}
      {items.map(n => (
        <div
          key={n.id}
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
      ))}
    </div>
  );
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

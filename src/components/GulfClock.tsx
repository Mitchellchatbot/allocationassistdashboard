import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * GulfClock — Amir #5. Renders a date/time in Gulf Standard Time (Asia/Dubai,
 * UTC+4, no DST) with a relative "due now / fires in 3h" label, computed
 * client-side so scheduled rows read correctly in npm run dev without any cron.
 */
export function GulfClock({ when, className, showRelative = true }: { when: string | Date | null; className?: string; showRelative?: boolean }) {
  // Re-render every minute so the "fires in N / overdue" label stays truthful.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!showRelative) return;
    const t = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, [showRelative]);

  if (!when) return null;
  const d = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return null;

  const gst = new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Dubai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-slate-500", className)} title={`${d.toISOString()} (shown in Gulf Standard Time)`}>
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">{gst} GST</span>
      {showRelative && <span className="text-slate-400">· {relativeLabel(d)}</span>}
    </span>
  );
}

/** "due now" / "fires in 3h 12m" / "2d ago". Pure; recomputed on render. */
export function relativeLabel(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);
  if (mins < 1) return "due now";
  const h = Math.floor(mins / 60), m = mins % 60, days = Math.floor(h / 24);
  let span: string;
  if (days >= 1) span = `${days}d ${h % 24}h`;
  else if (h >= 1) span = `${h}h ${m}m`;
  else span = `${m}m`;
  return past ? `${span} ago` : `in ${span}`;
}

/** Compose a date (YYYY-MM-DD) + time (HH:MM) in Gulf time into a UTC Date.
 *  GST is a fixed +04:00 with no DST, so we can append the offset directly. */
export function composeGulfDateTime(dateISO: string, timeHHMM: string): Date {
  const t = (timeHHMM && /^\d{2}:\d{2}$/.test(timeHHMM)) ? timeHHMM : "09:00";
  return new Date(`${dateISO}T${t}:00+04:00`);
}

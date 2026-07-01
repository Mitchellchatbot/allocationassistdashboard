import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Fixed-option formatters hoisted to module scope: their options never depend on
// props/state, so reusing one instance yields byte-identical output while avoiding
// a fresh Intl.DateTimeFormat construction on every render/tick.
// Local wall-clock for the viewer (no timeZone => browser local).
const LOCAL_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
});
// Gulf equivalent, surfaced in the tooltip so the Dubai desk can cross-check.
const GST_FMT = new Intl.DateTimeFormat(undefined, {
  timeZone: "Asia/Dubai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/**
 * GulfClock — Amir #5. Renders an absolute moment in the VIEWER's LOCAL time
 * (with the Gulf-time equivalent in the tooltip) plus a relative "due now /
 * fires in 3h" label, recomputed client-side so scheduled rows read correctly
 * in npm run dev without any cron. The scheduler still fires on Gulf-time slots
 * server-side; the times are merely stored as Gulf wall-clock and shown back in
 * whatever timezone the person looking at the dashboard is in.
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

  // Local wall-clock for the viewer (no timeZone => browser local).
  const local = LOCAL_FMT.format(d);
  // Gulf equivalent, surfaced in the tooltip so the Dubai desk can cross-check.
  const gst = GST_FMT.format(d);

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-slate-500", className)} title={`${local} your time  ·  ${gst} Gulf time  ·  ${d.toISOString()}`}>
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">{local}</span>
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

/** Compose a date + time the user typed in THEIR OWN local timezone into an
 *  absolute Date (no offset suffix => the browser parses it as local). */
export function composeLocalDateTime(dateISO: string, timeHHMM: string): Date {
  const t = (timeHHMM && /^\d{2}:\d{2}$/.test(timeHHMM)) ? timeHHMM : "09:00";
  return new Date(`${dateISO}T${t}`);
}

/** Convert a local date+time the user picked into the Gulf wall-clock strings
 *  the scheduler stores + fires on, preserving the absolute moment. e.g. a user
 *  in PST picking 11pm Jun 30 gets { date: "2026-07-01", time: "11:00" }. */
export function localToGulfParts(dateISO: string, timeHHMM: string): { date: string; time: string } {
  const d = composeLocalDateTime(dateISO, timeHHMM);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Today (or +N days) as a YYYY-MM-DD string in the viewer's LOCAL timezone —
 *  not UTC, so the default scheduled date isn't off-by-one near midnight. */
export function localDateInDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "Jump to" — every section of the Reports page, one click away.
 *
 * Grouped by view (Overview / Team / Hospitals / Detail) with the sidebar's
 * chevron-and-dot group headers. Clicking a section in another view switches
 * to that view first, then scrolls; the highlight follows the reader's scroll
 * position inside the current view.
 */
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight, Compass, Gauge, Flag, Stethoscope, Activity, Filter, MapPin, Clock, Trophy, Users,
  HeartPulse, Building2, Briefcase, AlertTriangle, BarChart3, ListChecks, User2,
} from "lucide-react";
import { Hint } from "@/components/reports/HoverHint";
import type { ReportView } from "@/components/reports/AttentionCard";

interface Section { id: string; label: string; icon: typeof Gauge; hint: string }

export const JUMP_GROUPS: Array<{ view: ReportView; label: string; accent: string; sections: Section[] }> = [
  { view: "overview", label: "Overview", accent: "#14b8a6", sections: [
    { id: "s-summary",     label: "Summary",          icon: Gauge,       hint: "The headline and the four-stage scoreboard" },
    { id: "s-attention",   label: "Worth a look",     icon: Flag,        hint: "Things to act on, each linked to its section" },
    { id: "s-specialties", label: "Specialties",      icon: Stethoscope, hint: "Who's getting jobs vs the open roles" },
    { id: "s-trend",       label: "Trend",            icon: Activity,    hint: "Each stage against a year earlier" },
    { id: "s-funnel",      label: "Shortlist → paid", icon: Filter,      hint: "How many make it through each stage" },
    { id: "s-region",      label: "By region",        icon: MapPin,      hint: "Placements by country and city" },
    { id: "s-lifecycle",   label: "Lifecycle",        icon: Clock,       hint: "Average days between stages" },
  ] },
  { view: "team", label: "Team", accent: "#8b5cf6", sections: [
    { id: "s-reps", label: "Leaderboard",      icon: Trophy, hint: "One card per rep, ranked by signings" },
    { id: "s-team", label: "Team performance", icon: Users,  hint: "Every rep's book and numbers" },
  ] },
  { view: "hospitals", label: "Hospitals", accent: "#0ea5e9", sections: [
    { id: "s-health",    label: "Account health", icon: HeartPulse,    hint: "Moving, slowing and idle accounts" },
    { id: "s-hospitals", label: "By hospital",    icon: Building2,     hint: "Each account, its rep and last move" },
    { id: "s-vacancies", label: "Open vacancies", icon: Briefcase,     hint: "Roles hospitals are hiring for" },
    { id: "s-quality",   label: "Data quality",   icon: AlertTriangle, hint: "Hospital names that still need a region" },
  ] },
  { view: "detail", label: "Detail", accent: "#f59e0b", sections: [
    { id: "s-metrics",    label: "All metrics", icon: BarChart3,  hint: "Six totals with per-tile drill-downs" },
    { id: "s-placements", label: "Placements",  icon: ListChecks, hint: "The ledger and the 45-day payment clock" },
    { id: "s-doctors",    label: "Per-doctor",  icon: User2,      hint: "One row per doctor" },
  ] },
];

/** Nearest scrolling ancestor — the Reports page scrolls inside the layout's <main>. */
export function scrollParent(el: HTMLElement | null): HTMLElement {
  let n = el?.parentElement ?? null;
  while (n) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}

export function JumpRail({ view, onJump }: { view: ReportView; onJump: (view: ReportView, id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // Scroll-spy: the last section whose top has passed the upper part of the viewport.
  useEffect(() => {
    const sc = scrollParent(root.current);
    const ids = JUMP_GROUPS.find(g => g.view === view)!.sections.map(s => s.id);
    const onScroll = () => {
      const top = (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + 110;
      let cur: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= top) cur = id;
      }
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) {
        const present = ids.filter(id => document.getElementById(id));
        cur = present[present.length - 1] ?? cur;
      }
      setActive(cur ?? ids.find(id => document.getElementById(id)) ?? null);
    };
    onScroll();
    const t = window.setTimeout(onScroll, 400);   // sections mount lazily
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => { sc.removeEventListener("scroll", onScroll); window.clearTimeout(t); };
  }, [view]);

  return (
    <div ref={root} className="rounded-lg border bg-card shadow-sm border-border/50 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
          <Compass className="h-3 w-3" />Jump to
        </span>
      </div>
      <div className="px-2 pb-3">
        {JUMP_GROUPS.map(g => {
          const here = g.view === view;
          return (
            <div key={g.view} className="mt-1">
              <button
                type="button"
                onClick={() => onJump(g.view, g.sections[0].id)}
                className={`w-full flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 transition-colors ${here ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <ChevronRight className="h-3 w-3 transition-transform" style={{ color: g.accent, transform: here ? "rotate(90deg)" : "none" }} />
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.accent }} />
                {g.label}
              </button>
              <ul className="space-y-0.5 mt-0.5">
                {g.sections.map(s => {
                  const on = here && active === s.id;
                  return (
                    <li key={s.id}>
                      <Hint content={s.hint} side="left">
                        <button
                          type="button"
                          onClick={() => onJump(g.view, s.id)}
                          className={`w-full flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-left transition-colors ${
                            on ? "bg-teal-50 text-teal-800 font-medium shadow-[inset_0_0_0_1px_rgba(20,184,166,0.25)]" : "text-slate-600 hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          <s.icon className={`h-3.5 w-3.5 shrink-0 ${on ? "text-teal-600" : "text-slate-400"}`} />
                          <span className="flex-1 truncate">{s.label}</span>
                        </button>
                      </Hint>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Worth a look" — the handful of things on the Reports page that need
 * someone to act, each one click from the section that explains it.
 *
 * Styled exactly like the Dashboard digest's "Worth a look" block
 * (PortalDigest) so the boss recognises it. Three live checks:
 *   1. Hospitals with open roles where nothing has moved in 30+ days.
 *   2. The 45-day payment clock: invoices overdue, and those due this week.
 *   3. Specialties with open roles but nobody placed in the selected period.
 *
 * 1 and 2 are "right now" signals (they don't change as you step back through
 * periods); 3 follows the selected period, like the specialty tiles.
 */
import { useMemo } from "react";
import { Flag } from "lucide-react";
import { usePlacementAttempts } from "@/hooks/use-placement-attempts";
import { useVacancies } from "@/hooks/use-vacancies";
import { groupSpecialty } from "@/lib/specialty-groups";
import { STAGES, stageAt, ts, inRange, type DateRange } from "@/lib/placement-reporting";
import { Hint, HintTitle, HintNote } from "@/components/reports/HoverHint";

export type ReportView = "overview" | "team" | "hospitals" | "detail";
type Jump = (view: ReportView, section: string) => void;

interface Item { key: string; dot: string; text: React.ReactNode; hint: React.ReactNode; to: [ReportView, string] }

const DAY = 86_400_000;
const specOf = (raw: string | null | undefined) => (raw ? groupSpecialty(raw) || raw.trim() : null);
// Literal class names so Tailwind's scanner keeps them.
const COLS: Record<number, string> = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

export function AttentionCard({ range, word, onJump }: { range: DateRange; word: string; onJump: Jump }) {
  const { data: rows = [], isLoading } = usePlacementAttempts();
  const { data: vacancies = [], isLoading: vl } = useVacancies();

  const items = useMemo((): Item[] => {
    const now = Date.now();
    const out: Item[] = [];

    // 1 — hiring but idle.
    const open = new Map<string, number>();
    const openSpec = new Map<string, number>();
    for (const v of vacancies) {
      if (v.status !== "open") continue;
      const h = v.hospital_name?.trim();
      if (h) open.set(h, (open.get(h) ?? 0) + 1);
      const s = specOf(v.specialty);
      if (s) openSpec.set(s, (openSpec.get(s) ?? 0) + 1);
    }
    const last = new Map<string, number>();
    for (const a of rows) {
      const h = a.hospital_name?.trim();
      if (!h || !open.has(h)) continue;
      for (const s of STAGES) {
        const t = stageAt(a, s);
        if (t != null && t <= now && t > (last.get(h) ?? 0)) last.set(h, t);
      }
    }
    const idle = [...open]
      .map(([h, n]) => ({ h, n, days: last.has(h) ? Math.floor((now - last.get(h)!) / DAY) : null }))
      .filter(x => x.days == null || x.days > 30)
      .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
    if (idle.length) {
      out.push({
        key: "idle", dot: "bg-rose-500",
        text: <><b>{idle.length} hospital{idle.length === 1 ? "" : "s"}</b> {idle.length === 1 ? "has" : "have"} open roles but nothing moved in 30+ days</>,
        hint: (
          <>
            <HintTitle>Hiring, but idle</HintTitle>
            {idle.slice(0, 5).map(x => (
              <p key={x.h} className="truncate">• {x.h} — {x.days == null ? "no placement activity yet" : `${x.days} days`} · {x.n} role{x.n === 1 ? "" : "s"}</p>
            ))}
            {idle.length > 5 && <HintNote>+{idle.length - 5} more</HintNote>}
            <HintNote>Open roles from the vacancy list; last movement from placements.</HintNote>
          </>
        ),
        to: ["hospitals", "s-hospitals"],
      });
    }

    // 2 — the 45-day payment clock (starts on joined_at, closed by paid_at).
    const overdue: Array<{ name: string; days: number }> = [], dueSoon: Array<{ name: string; days: number }> = [];
    for (const a of rows) {
      if (a.paid_at) continue;
      const j = ts(a.joined_at);
      if (j == null) continue;
      const remaining = 45 - Math.floor((now - j) / DAY);
      if (remaining < 0) overdue.push({ name: a.doctor_name, days: -remaining });
      else if (remaining <= 7) dueSoon.push({ name: a.doctor_name, days: remaining });
    }
    if (overdue.length || dueSoon.length) {
      overdue.sort((a, b) => b.days - a.days);
      dueSoon.sort((a, b) => a.days - b.days);
      out.push({
        key: "pay", dot: "bg-amber-500",
        text: overdue.length
          ? <><b>{overdue.length} payment{overdue.length === 1 ? "" : "s"}</b> past the 45-day mark{dueSoon.length ? `, ${dueSoon.length} more due this week` : ""}</>
          : <><b>{dueSoon.length} payment{dueSoon.length === 1 ? "" : "s"}</b> hit the 45-day mark this week</>,
        hint: (
          <>
            <HintTitle>45-day payment clock</HintTitle>
            {overdue.slice(0, 4).map((x, i) => <p key={`o${i}`} className="truncate">• {x.name} — {x.days} day{x.days === 1 ? "" : "s"} overdue</p>)}
            {dueSoon.slice(0, 3).map((x, i) => <p key={`d${i}`} className="truncate">• {x.name} — due in {x.days} day{x.days === 1 ? "" : "s"}</p>)}
            <HintNote>From the Placements ledger: the clock starts on Joined and stops when the invoice is marked paid.</HintNote>
          </>
        ),
        to: ["detail", "s-placements"],
      });
    }

    // 3 — demand with no delivery in the selected period.
    const placed = new Set<string>();
    for (const a of rows) {
      if (!inRange(ts(a.signed_at), range) && !inRange(ts(a.relocated_at ?? a.joined_at), range)) continue;
      const s = specOf(a.doctor_specialty);
      if (s) placed.add(s);
    }
    const unmet = [...openSpec].filter(([s]) => !placed.has(s)).sort((a, b) => b[1] - a[1]);
    if (unmet.length) {
      const roles = unmet.reduce((n, [, c]) => n + c, 0);
      const names = unmet.slice(0, 2).map(([s]) => s);
      out.push({
        key: "spec", dot: "bg-teal-500",
        text: <><b>{names.join(" & ")}</b>{unmet.length > 2 ? ` +${unmet.length - 2} more` : ""} {unmet.length === 1 ? "has" : "have"} {roles} open role{roles === 1 ? "" : "s"} and no placements this {word}</>,
        hint: (
          <>
            <HintTitle>Demand with no delivery</HintTitle>
            {unmet.slice(0, 6).map(([s, n]) => <p key={s}>• {s} — {n} open</p>)}
            <HintNote>Open roles on the vacancy list, nobody signed or relocated in this {word}.</HintNote>
          </>
        ),
        to: ["overview", "s-specialties"],
      });
    }
    return out;
  }, [rows, vacancies, range, word]);

  if (isLoading || vl) return null;

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3.5" id="s-attention">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-teal-100"><Flag className="h-3.5 w-3.5" /></span>
          Worth a look
        </div>
        {items.length > 0 && <span className="text-[10px] text-teal-700/70">Hover for why · click to jump</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-[11.5px] text-foreground/80">Nothing needs attention right now — no idle hiring accounts, no late payments, and every specialty with open roles is placing.</p>
      ) : (
        <ul className={`grid gap-x-4 gap-y-1.5 ${COLS[items.length] ?? ""}`}>
          {items.map(it => (
            <li key={it.key}>
              <Hint content={it.hint} align="start">
                <button
                  type="button"
                  onClick={() => onJump(...it.to)}
                  className="w-full text-left flex items-start gap-1.5 text-[11.5px] text-foreground/90 leading-snug rounded-md px-1.5 py-1 -mx-1.5 hover:bg-teal-100/60 transition-colors"
                >
                  <span className={`mt-1.5 h-1 w-1 rounded-full ${it.dot} shrink-0`} />
                  <span className="flex-1">{it.text} <span className="text-teal-700 font-medium whitespace-nowrap">→</span></span>
                </button>
              </Hint>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Follow-up ranking — orders the callback queue by a transparent priority score
 * instead of just "least-recently-touched". Blends how overdue a callback is
 * with how valuable the lead is (open-vacancy demand, freshness, source warmth).
 *
 * Also defines the hard age cap: leads not touched in FOLLOWUP_STALE_CAP_DAYS
 * are treated as cold and dropped from the queue (so years-old leads don't show).
 */
import { rollupSpecialty } from "@/lib/specialty-groups";
import { noteSignal, type ContactStatus } from "@/lib/lead-contact";

/** A contact attempt this recent (days) counts as "handled" — same as reached —
 *  so only genuinely un-worked leads surface at the top. */
export const ATTEMPT_FRESH_DAYS = 28;

/** Leads with no activity for this many days are cold → hidden from the queue. */
export const FOLLOWUP_STALE_CAP_DAYS = 180;

/** Days within which a callback is expected, per tab. Beyond it = overdue. */
export const FOLLOWUP_SLA_DAYS: Record<string, number> = { high: 2, future: 14 };

export interface RankInput {
  daysSinceTouched: number | null;   // recency (Modified_Time → Created_Time)
  specialty:        string | null;
  demandCounts:     Map<string, number>; // OPEN vacancies per rollup-specialty group
  licenseCount:     number;           // Gulf licenses the doctor already holds (DHA/DOH/…)
  note?:            string | null;    // latest Zoho note — its intent nudges priority
  contactStatus?:   ContactStatus;    // reached / attempted / none (from the note)
  noteAgeDays?:     number | null;    // days since the latest note (for attempt freshness)
}

/**
 * Time-since-contact curve (0..1), peaking at the ~2-month sweet spot when a
 * callback matters most (full score), ~90% sooner, then decaying:
 *   0d → .90 · 60d(2mo) → 1.0 · 90d(3mo) → .85 · 120d(4mo) → .70 · 150d(5mo) → .50 · 180d → .20.
 * Piecewise-linear through those anchors. Affects ONLY the time portion.
 */
function timeCurve(days: number): number {
  const pts: [number, number][] = [
    [0, 0.90], [60, 1.00], [90, 0.85], [120, 0.70], [150, 0.50], [180, 0.20],
  ];
  if (days <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (days <= pts[k][0]) {
      const [x0, y0] = pts[k - 1];
      const [x1, y1] = pts[k];
      return y0 + (y1 - y0) * (days - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

const TIME_MAX     = 45;                 // max points from the time curve
const LICENSE_PTS  = [0, 12, 16, 18];    // points for 0 / 1 / 2 / 3+ Gulf licenses held

export interface RankFactor { label: string; points: number; }

export interface RankResult {
  score:    number;                     // ~0..100
  tier:     "high" | "medium" | "normal";
  headline: string;                     // the dominant factor (badge label)
  factors:  RankFactor[];               // each contributing factor + its points
}

export function scoreFollowUp(i: RankInput): RankResult {
  const days = Math.max(0, i.daysSinceTouched ?? 0);

  // 1) Time — bell-ish curve, peaks at the 2-month sweet spot (full score),
  //    ~90% sooner, decaying after. ONLY this part is time-shaped.
  const timing = TIME_MAX * timeCurve(days);

  // 2) Open-vacancy demand — graded by HOW MANY open vacancies exist for this
  //    specialty (independent of time).
  const grp = rollupSpecialty(i.specialty);
  const vacCount = grp ? (i.demandCounts.get(grp) ?? 0) : 0;
  const vacancyDemand = vacCount > 0 ? Math.min(35, 15 + 6 * vacCount) : 0;

  // 3) License — already holds Gulf license(s) → far easier to place (independent
  //    of time). Graded by how many.
  const lc = Math.max(0, Math.min(3, Math.round(i.licenseCount)));
  const license = LICENSE_PTS[lc];

  // 4) Contact recency — the whole point of the merged queue: leads we haven't
  //    actually worked float to the top. A note logged in the last 4 weeks
  //    counts as "handled" (same as reached), so only never-contacted leads and
  //    stale failed attempts surface. Dominant factor by design.
  const cs = i.contactStatus ?? "none";
  const attemptFresh = i.noteAgeDays != null && i.noteAgeDays <= ATTEMPT_FRESH_DAYS;
  let contact = 0, contactLabel = "";
  if (cs === "none")                         { contact = 40; contactLabel = "Never contacted"; }
  else if (cs === "attempted" && !attemptFresh) { contact = 30; contactLabel = "Stale attempt — retry"; }
  // reached, or an attempt within the last 4 weeks → handled, no boost.

  // 5) Note intent (once reached) — warm lifts, cold deprioritises.
  const ns = noteSignal(i.note);

  const score = timing + vacancyDemand + license + contact + ns.points;

  // Factor breakdown (no day counts — the recency chip already shows the age).
  const timeLabel = days >= 30 && days <= 90 ? "Prime window" : days < 30 ? "Recent" : "Cooling";
  const factors: RankFactor[] = [
    { label: timeLabel, points: Math.round(timing) },
  ];
  if (contact > 0)       factors.push({ label: contactLabel, points: contact });
  if (vacancyDemand > 0) factors.push({ label: vacCount > 1 ? `Open vacancies ×${vacCount}` : "Open vacancy", points: Math.round(vacancyDemand) });
  if (license > 0)       factors.push({ label: i.licenseCount > 1 ? `Gulf-licensed ×${i.licenseCount}` : "Gulf-licensed", points: license });
  if (ns.points !== 0)   factors.push({ label: ns.label, points: Math.round(ns.points) });

  const headline =
    contact >= 40     ? "Never contacted"
    : contact >= 30   ? "Retry — stale attempt"
    : ns.points >= 16 ? "Warm note"
    : vacancyDemand > 0 ? (vacCount > 1 ? `${vacCount} open vacancies` : "Open vacancy")
    : license > 0     ? "Gulf-licensed"
    : ns.points < 0   ? "Cold note"
    :                   timeLabel;

  const tier: RankResult["tier"] = score >= 60 ? "high" : score >= 38 ? "medium" : "normal";
  return { score: Math.round(score), tier, headline, factors };
}

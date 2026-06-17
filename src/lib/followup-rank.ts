/**
 * Follow-up ranking — orders the callback queue by a transparent priority score
 * instead of just "least-recently-touched". Blends how overdue a callback is
 * with how valuable the lead is (open-vacancy demand, freshness, source warmth).
 *
 * Also defines the hard age cap: leads not touched in FOLLOWUP_STALE_CAP_DAYS
 * are treated as cold and dropped from the queue (so years-old leads don't show).
 */
import { rollupSpecialty } from "@/lib/specialty-groups";
import { normalizeChannelKey } from "@/lib/channel-mapping";

/** Leads with no activity for this many days are cold → hidden from the queue. */
export const FOLLOWUP_STALE_CAP_DAYS = 180;

/** Days within which a callback is expected, per tab. Beyond it = overdue. */
export const FOLLOWUP_SLA_DAYS: Record<string, number> = { high: 2, future: 14 };

export interface RankInput {
  daysSinceTouched: number | null;   // recency (Modified_Time → Created_Time)
  leadAgeDays:      number | null;    // age since Created_Time
  specialty:        string | null;
  source:           string | null;
  slaDays:          number;           // SLA for the current tab
  demandCounts:     Map<string, number>; // OPEN vacancies per rollup-specialty group
}

export interface RankFactor { label: string; points: number; }

export interface RankResult {
  score:    number;                     // ~0..100
  tier:     "high" | "medium" | "normal";
  headline: string;                     // the dominant factor (badge label)
  factors:  RankFactor[];               // each contributing factor + its points
}

export function scoreFollowUp(i: RankInput): RankResult {
  const days    = Math.max(0, i.daysSinceTouched ?? 0);
  const overdue = Math.max(0, days - i.slaDays);

  // 1) Urgency — rises continuously with how overdue, with diminishing returns,
  //    so a pile of very-overdue leads still SEPARATES (177d > 150d > 100d)
  //    instead of all pinning to a flat cap.
  const urgency = 45 * (1 - Math.exp(-overdue / 40));

  // 2) Open-vacancy demand — graded by HOW MANY open vacancies exist for this
  //    specialty, so a high-demand specialty outranks a one-slot one (instead of
  //    every vacancy-match being a flat boost).
  const grp = rollupSpecialty(i.specialty);
  const vacCount = grp ? (i.demandCounts.get(grp) ?? 0) : 0;
  const vacancyDemand = vacCount > 0 ? Math.min(35, 15 + 6 * vacCount) : 0;

  // 3) Freshness — newer leads engage better; small decaying boost for <3 weeks.
  const age = i.leadAgeDays ?? 999;
  const freshness = age <= 21 ? Math.max(0, 12 - age * 0.55) : 0;

  // 4) Source warmth — referrals / word-of-mouth are warmer than cold channels.
  const ch = normalizeChannelKey(i.source);
  const source = ch === "Referrals" ? 8 : ch === "Other" ? 0 : 4;

  const score = urgency + vacancyDemand + freshness + source;

  // Factor breakdown — what actually drove the score (no day counts here; the
  // recency chip already shows the age, so we don't duplicate / appear off-by-SLA).
  const factors: RankFactor[] = [
    { label: overdue > 0 ? "Overdue" : "Due now", points: Math.round(urgency) },
  ];
  if (vacancyDemand > 0)  factors.push({ label: vacCount > 1 ? `Open vacancies ×${vacCount}` : "Open vacancy", points: Math.round(vacancyDemand) });
  if (freshness >= 4)     factors.push({ label: "New lead", points: Math.round(freshness) });
  if (ch === "Referrals") factors.push({ label: "Referral", points: source });

  const headline =
    vacancyDemand > 0 ? (vacCount > 1 ? `${vacCount} open vacancies` : "Open vacancy")
    : freshness >= 8 ? "New lead"
    : overdue > 0    ? "Overdue"
    :                  "Due now";

  const tier: RankResult["tier"] = score >= 65 ? "high" : score >= 40 ? "medium" : "normal";
  return { score: Math.round(score), tier, headline, factors };
}

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
  demandGroups:     Set<string>;      // rollup-specialty groups with an OPEN vacancy
}

export interface RankResult {
  score:  number;                     // ~0..100
  tier:   "high" | "medium" | "normal";
  reason: string;                     // short label of the dominant factor
}

export function scoreFollowUp(i: RankInput): RankResult {
  const days    = Math.max(0, i.daysSinceTouched ?? 0);
  const overdue = Math.max(0, days - i.slaDays);

  // 1) Urgency — the longer a callback is overdue, the more urgent (capped at 50
  //    so it never fully drowns out lead value).
  const urgency = Math.min(50, 10 + overdue * 1.2);

  // 2) Open-vacancy demand — there's a slot for this specialty right now, so
  //    these are the highest-value people to reach. Biggest single boost.
  const grp = rollupSpecialty(i.specialty);
  const vacancyMatch = grp && i.demandGroups.has(grp) ? 30 : 0;

  // 3) Freshness — newer leads engage better; small decaying boost for <3 weeks.
  const age = i.leadAgeDays ?? 999;
  const freshness = age <= 21 ? Math.max(0, 12 - age * 0.55) : 0;

  // 4) Source warmth — referrals / word-of-mouth are warmer than cold channels.
  const ch = normalizeChannelKey(i.source);
  const source = ch === "Referrals" ? 8 : ch === "Other" ? 0 : 4;

  const score = urgency + vacancyMatch + freshness + source;

  const reason =
    vacancyMatch > 0 ? (overdue > 7 ? `Open vacancy · ${overdue}d overdue` : "Open vacancy match")
    : freshness >= 8 ? "Hot new lead"
    : overdue > 0    ? `Overdue ${overdue}d`
    :                  "Due now";

  const tier: RankResult["tier"] = score >= 65 ? "high" : score >= 40 ? "medium" : "normal";
  return { score: Math.round(score), tier, reason };
}

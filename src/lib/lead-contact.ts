/**
 * Shared "has this lead been contacted?" rule for the Sales tracker.
 *
 * Zoho's Lead_Status often lags reality: a rep calls, gets no answer, and logs a
 * NOTE ("no answer", "voicemail", "called back") without moving the status off
 * "Not Contacted". So a lead counts as contacted when EITHER the status is past
 * "Not Contacted" OR its latest Zoho note reads like a call outcome. zoho-sync
 * attaches the latest note per lead as `latest_note`; when notes haven't synced
 * the rule degrades to status-only (the previous behaviour).
 */

// Call-outcome / contact-attempt phrasing seen in the team's Zoho notes. Kept
// deliberately broad — any of these means a rep reached out at least once.
// Includes the "phone is off / powered off / unavailable / couldn't reach"
// family (Hasan: those were landing in the "No note" bucket even though the rep
// clearly tried).
const CONTACT_NOTE_RE =
  /(no\s*answer|did\s*n'?o?t?\s*(answer|pick)|not\s*(answer(ed|ing)?|reachable|available|picking)|no\s*(response|reply|pick\s*up)|voice\s*-?\s*mail|voicemail|\bvm\b|left\s*(a\s*)?(message|voicemail|vm|text)|call(ed|ing|\s*back)?|\brang\b|ringing|\bbusy\b|switch(ed)?\s*off|power(ed)?\s*(off|down)|(phone|cell|mobile|number|line|handset)\s*(is|was|'?s)?\s*off|unavailable|unreachable|couldn'?t?\s*reach|can'?t?\s*reach|unable\s*to\s*reach|out\s*of\s*(service|reach|coverage)|reached(\s*out)?|spoke(n)?|talk(ed|ing)?|answered|contacted|whats?app(ed)?|texted|messaged|emailed|\bsms\b|follow[\s-]*up|interested|declin(e|ed)|hung\s*up|wrong\s*number|number\s*(not|in)valid)/i;

// Warm intent — the lead wants to move forward / asked for a callback / to be
// sent details. Lifts follow-up priority.
const NOTE_WARM_RE =
  /(interested|keen\b|call\s*back|callback|will\s*call|get\s*back|send\s*(the\s*|me\s*|him\s*|her\s*|them\s*)?(cv|profile|details|jd|job|documents?|info|offer)|share\s*(cv|profile|details)|reschedul|book\s*(a\s*)?(call|meeting|slot)|schedul|discuss|wants?\s*to|looking\s*(for|to)|available\s*for)/i;
// Cold / do-not-pursue — deprioritise even if the age says "due".
const NOTE_COLD_RE =
  /(not\s*interested|no\s*longer\s*interested|not\s*keen|declin|wrong\s*number|do\s*(not|n'?t)\s*(call|contact|want)|remove\s*(from|me)|unsubscrib|already\s*(placed|working|found|accepted)|not\s*looking|no\s*longer\s*(available|looking))/i;

/** True when a note's text reads like a contact attempt / call outcome. */
export function noteIndicatesContact(note: string | null | undefined): boolean {
  return !!note && CONTACT_NOTE_RE.test(note);
}

/** Ranking weight from the latest note's intent. Warm (interested / callback)
 *  lifts priority; a logged attempt that didn't connect (phone off, no answer)
 *  gets a smaller nudge to retry; an explicit cold/declined note deprioritises.
 *  Cold is checked before warm so "not interested" isn't read as "interested". */
export function noteSignal(note: string | null | undefined): { points: number; label: string } {
  const t = (note ?? "").trim();
  if (!t)                      return { points: 0,   label: "" };
  if (NOTE_COLD_RE.test(t))    return { points: -14, label: "Cold note" };
  if (NOTE_WARM_RE.test(t))    return { points: 16,  label: "Warm note" };
  if (CONTACT_NOTE_RE.test(t)) return { points: 8,   label: "Retry — no answer" };
  return { points: 0, label: "" };
}

export interface ContactableLead {
  Lead_Status?: string | null;
  latest_note?: string | null;
}

/** Has the lead been reached at least once — by status OR by a call-outcome
 *  note even when Zoho still shows "Not Contacted"? */
export function isLeadContacted(lead: ContactableLead): boolean {
  if (lead.Lead_Status && lead.Lead_Status !== "Not Contacted") return true;
  return noteIndicatesContact(lead.latest_note);
}

/** Inverse: a genuinely-untouched lead (status "Not Contacted" AND no
 *  contact-attempt note). Used for "uncontacted" alerts/counts. */
export function isLeadUncontacted(lead: ContactableLead): boolean {
  return lead.Lead_Status === "Not Contacted" && !noteIndicatesContact(lead.latest_note);
}

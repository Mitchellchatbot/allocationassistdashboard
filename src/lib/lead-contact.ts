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
const CONTACT_NOTE_RE =
  /(no\s*answer|did\s*n'?o?t?\s*(answer|pick)|not\s*(answer(ed|ing)?|reachable|available|picking)|no\s*(response|reply|pick\s*up)|voice\s*-?\s*mail|voicemail|\bvm\b|left\s*(a\s*)?(message|voicemail|vm|text)|call(ed|ing|\s*back)?|\brang\b|ringing|\bbusy\b|switch(ed)?\s*off|unreachable|out\s*of\s*(service|reach|coverage)|reached(\s*out)?|spoke(n)?|talk(ed|ing)?|answered|contacted|follow[\s-]*up|interested|declin(e|ed)|hung\s*up|wrong\s*number|number\s*(not|in)valid)/i;

/** True when a note's text reads like a contact attempt / call outcome. */
export function noteIndicatesContact(note: string | null | undefined): boolean {
  return !!note && CONTACT_NOTE_RE.test(note);
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

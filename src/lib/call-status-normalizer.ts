/**
 * Call Log Status Normalizer
 *
 * Maps any free-text call status/outcome to a standard category so that
 * metrics like contact-rate can be computed consistently regardless of
 * how individual sales reps phrased the outcome.
 */

export type StandardStatus =
  | "Contacted"      // spoke with doctor, call completed
  | "Voicemail"      // left a voicemail / message
  | "Attempted"      // called but no answer / couldn't reach
  | "Follow Up"      // needs follow-up, scheduled callback
  | "High Potential" // very interested, high priority
  | "Declined"       // not interested, rejected
  | "Converted"      // agreed to proceed, placed
  | "In Progress"    // actively being processed
  | "Unknown";       // can't determine from text

/** Statuses that count as "contacted" for the contact-rate metric */
export const CONTACTED_STATUSES = new Set<StandardStatus>([
  "Contacted",
  "Follow Up",
  "High Potential",
  "Converted",
]);

/** Color class per category (Tailwind) */
export const STATUS_COLORS: Record<StandardStatus, string> = {
  "Contacted":      "bg-success/10 text-success border-success/20",
  "Voicemail":      "bg-info/10 text-info border-info/20",
  "Attempted":      "bg-warning/10 text-warning border-warning/20",
  "Follow Up":      "bg-primary/10 text-primary border-primary/20",
  "High Potential": "bg-success/20 text-success border-success/30",
  "Declined":       "bg-destructive/10 text-destructive border-destructive/20",
  "Converted":      "bg-success/20 text-success border-success/40",
  "In Progress":    "bg-muted text-muted-foreground border-border/50",
  "Unknown":        "bg-muted/50 text-muted-foreground border-border/30",
};

// ── Exact-match overrides (checked before pattern matching) ──────────────────
const EXACT_MAP: Record<string, StandardStatus> = {
  "high potential":                "High Potential",
  "follow up in the future":       "Follow Up",
  "minimal follow up":             "Follow Up",
  "declined":                      "Declined",
  "converted":                     "Converted",
  "unsure":                        "Unknown",
  "not interested":                "Declined",
  "in progress":                   "In Progress",
  "not contacted":                 "Attempted",
  "attempted to contact":          "Attempted",
  "initial sales call completed":  "Contacted",
  "contact in future":             "Follow Up",
  "high priority follow up":       "High Potential",
  "voicemail":                     "Voicemail",
  "vm":                            "Voicemail",
  "no answer":                     "Attempted",
  "na":                            "Attempted",
  "n/a":                           "Unknown",
  "contacted":                     "Contacted",
  "called":                        "Contacted",
  "reached":                       "Contacted",
  "spoke":                         "Contacted",
  "left message":                  "Voicemail",
};

// ── Pattern matching (in priority order) ─────────────────────────────────────
const PATTERNS: [RegExp, StandardStatus][] = [
  // Converted / placed
  [/\b(convert|placed|hired|signed|contract\s+done|deal\s+done|success|agreed\s+to\s+proceed)\b/i, "Converted"],

  // High potential
  [/\b(high\s+potential|very\s+interest|highly\s+interest|great\s+fit|strong\s+candidate|top\s+lead|hot\s+lead)\b/i, "High Potential"],

  // Contacted — actually spoke to the person
  [/\b(spoke\s+(to|with)|spoke\b|answered|call\s+completed|initial\s+call|call\s+done|connected|in\s+touch|had\s+a\s+call|on\s+the\s+phone|discussed|conversation)\b/i, "Contacted"],

  // Voicemail
  [/\b(voicemail|voice\s*mail|left\s+(a\s+)?(message|vm|voicemail)|message\s+left|vm\s+left|sent\s+vm)\b/i, "Voicemail"],

  // Follow up
  [/\b(follow.?up|call\s+back|callback|ring\s+back|will\s+call|call\s+again|reschedul|set\s+up\s+a\s+call|arranged|booked|meeting\s+set)\b/i, "Follow Up"],

  // Declined / not interested
  [/\b(declin|not\s+interest|rejected|reject|not\s+looking|no\s+thanks|pass(ed)?|opted?\s+out|unsubscri|removed|do\s+not\s+contact|dnc)\b/i, "Declined"],

  // Attempted — tried but couldn't reach
  [/\b(no\s+answer|didn.?t\s+answer|not\s+answer|unanswered|unavailable|busy|engaged|couldn.?t\s+reach|not\s+reach|tried|attempt|call\s+attempt|unreachable|not\s+in|out\s+of\s+office|no\s+resp|ring.?out)\b/i, "Attempted"],

  // In progress
  [/\b(in\s+progress|ongoing|processing|pending|working\s+on|active\s+case|under\s+review)\b/i, "In Progress"],
];

// ── Main export ───────────────────────────────────────────────────────────────

export function normalizeCallStatus(raw: string): StandardStatus {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Unknown";

  // Exact match (case-insensitive)
  const exact = EXACT_MAP[trimmed.toLowerCase()];
  if (exact) return exact;

  // Pattern match
  for (const [re, status] of PATTERNS) {
    if (re.test(trimmed)) return status;
  }

  return "Unknown";
}

/** Returns true if the status counts toward the "contacted" metric */
export function countsAsContacted(raw: string): boolean {
  return CONTACTED_STATUSES.has(normalizeCallStatus(raw));
}

/** Summarize a list of raw statuses into counts per standard category */
export function summarizeStatuses(rawStatuses: string[]): Record<StandardStatus, number> {
  const counts: Record<StandardStatus, number> = {
    Contacted: 0, Voicemail: 0, Attempted: 0, "Follow Up": 0,
    "High Potential": 0, Declined: 0, Converted: 0, "In Progress": 0, Unknown: 0,
  };
  for (const raw of rawStatuses) {
    counts[normalizeCallStatus(raw)]++;
  }
  return counts;
}

/**
 * Match a free-text doctor name (from a Google Sheet, CSV, email, etc.) to
 * a prefixed Zoho ID (`lead:<id>` or `dob:<id>`).
 *
 * Used by the Unavailable Doctors importer (and anything else that has to
 * resolve "Dr. Hamzah Awad" into the actual record). Handles:
 *
 *   - Leading "Dr." / "Dr " / "Professor" / "Prof." titles
 *   - Trailing whitespace + extra spaces
 *   - Punctuation
 *   - First-name + last-name in any order
 *   - Strips diacritics so "AdriÃ " (mojibake from Ammar's exports) matches "Adria"
 *
 * Match priority:
 *   1. Exact normalized match (best)
 *   2. All tokens of input present in candidate name (good)
 *   3. All tokens of candidate present in input (sheet was missing first name)
 *   4. No match (caller should report this row to the user)
 */

interface Candidate {
  prefixedId: string;
  name:       string;
}

export interface MatchResult {
  prefixedId: string | null;
  matchedTo:  string | null;
  confidence: "exact" | "all-input-tokens" | "all-candidate-tokens" | "none";
}

/** Build a one-shot matcher closure over the candidate set. Run name lookups
 *  through the returned function. Cheaper than rebuilding tokens per call. */
export function buildDoctorMatcher(candidates: Candidate[]): (rawName: string) => MatchResult {
  const indexed = candidates.map(c => ({
    ...c,
    normalized: normaliseName(c.name),
    tokens:     new Set(tokenise(c.name)),
  }));
  const byExact = new Map<string, typeof indexed[number]>();
  for (const c of indexed) {
    if (!byExact.has(c.normalized)) byExact.set(c.normalized, c);
  }

  return (rawName: string): MatchResult => {
    const norm = normaliseName(rawName);
    if (!norm) return { prefixedId: null, matchedTo: null, confidence: "none" };

    const exact = byExact.get(norm);
    if (exact) return { prefixedId: exact.prefixedId, matchedTo: exact.name, confidence: "exact" };

    const inputTokens = tokenise(rawName);
    if (inputTokens.length === 0) return { prefixedId: null, matchedTo: null, confidence: "none" };

    // 2. All input tokens contained in candidate (e.g. "Hamzah Awad" → "Dr. Hamzah Awad")
    for (const c of indexed) {
      if (inputTokens.every(t => c.tokens.has(t))) {
        return { prefixedId: c.prefixedId, matchedTo: c.name, confidence: "all-input-tokens" };
      }
    }
    // 3. All candidate tokens contained in input (handles "Dr. Hamzah Awad Consultant" → "Hamzah Awad")
    for (const c of indexed) {
      if (c.tokens.size > 0 && Array.from(c.tokens).every(t => inputTokens.includes(t))) {
        return { prefixedId: c.prefixedId, matchedTo: c.name, confidence: "all-candidate-tokens" };
      }
    }
    return { prefixedId: null, matchedTo: null, confidence: "none" };
  };
}

function normaliseName(s: string): string {
  if (!s) return "";
  return s
    // Mojibake from Latin-1 → UTF-8 corruption ("AdriÃ ") → strip the
    // synthesised characters before applying NFD.
    .replace(/Ã /g, "a")
    .replace(/Ã©/g, "e")
    .replace(/Ã¶/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip combining diacritics
    .toLowerCase()
    .replace(/^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?)\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(s: string): string[] {
  return normaliseName(s).split(" ").filter(t => t.length >= 2);
}

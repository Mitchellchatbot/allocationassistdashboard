/**
 * Format a raw "areas of interest" value into a short, human list —
 * comma-separated with the LAST item joined by " & ", capped to ~maxWords words
 * so it stays one glanceable line. e.g.
 *   "Liver disease; bone surgery, brain tumor and epilepsy"
 *   → "Liver disease, bone surgery, brain tumor & epilepsy"
 *
 * Idempotent: formatting an already-formatted value returns the same string, so
 * it's safe to apply at multiple layers (token builders, card renderers).
 *
 * NOTE: mirrored verbatim in supabase/functions/send-flow-email so the
 * {{doctor_area_of_interest}} token renders identically server-side. Keep the
 * two in lockstep.
 */
export function formatAreasOfInterest(raw: string | null | undefined, maxWords = 30): string {
  if (!raw) return "";
  // Split on commas / semicolons / slashes / newlines / bullets, and the words
  // "and" / "&" used as separators.
  const parts = String(raw)
    .split(/\s*(?:[,;/\n·•]|\band\b|&)\s*/i)
    .map(s => s.trim().replace(/[.\s]+$/, "")) // drop trailing periods / whitespace
    .filter(Boolean);

  // De-dupe case-insensitively, preserve order.
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); terms.push(p); }
  }
  if (!terms.length) return "";

  // Keep whole terms until we'd exceed ~maxWords total words.
  const kept: string[] = [];
  let words = 0;
  for (const t of terms) {
    const w = t.split(/\s+/).length;
    if (kept.length && words + w > maxWords) break;
    kept.push(t);
    words += w;
  }

  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(", ")} & ${kept[kept.length - 1]}`;
}

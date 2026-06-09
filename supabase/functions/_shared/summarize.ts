/**
 * summarize.ts — tiny Claude-backed text condenser for email rendering.
 *
 * Ammar 2026-06-09: the profile-introduction table is a wide 15-column
 * layout, and a long "Area of Interest" value stretches that column and
 * blows the table out. Rather than fight it with CSS, condense the value
 * with Claude to a short phrase before it goes into the cell.
 *
 * Matches the rewrite-bio edge function's pattern (raw fetch, x-api-key,
 * claude-sonnet-4-6). Designed to NEVER fail the email: returns the
 * original text unchanged when it's already short, when the key is unset,
 * or on any API/parse error.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

/** Condense a long "area of interest" into a short comma-separated phrase
 *  (≤ ~8 words) for a table cell. Returns `raw` untouched when it's short
 *  enough, the key is missing, or anything goes wrong. */
export async function summarizeAreaOfInterest(text: string | null | undefined): Promise<string> {
  const raw = (text ?? "").trim();
  if (!raw) return "";
  // Already compact — a short phrase doesn't need condensing.
  if (raw.length <= 80) return raw;
  if (!ANTHROPIC_API_KEY) return raw;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 60,
        messages: [{
          role: "user",
          content:
            `Condense this doctor's "area of interest" into a short comma-separated phrase of AT MOST 8 words, for a single table cell. Keep the key clinical sub-specialties / procedures; drop filler, soft phrasing, and full sentences. Return ONLY the phrase — no preamble, no "Here is…", no quotes.\n\nArea of interest:\n${raw}`,
        }],
      }),
    });
    if (!res.ok) return raw;
    const j = await res.json() as { content?: { type: string; text?: string }[] };
    const out = (j.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
    const cleaned = out.replace(/^["“'']+|["”'']+$/g, "").trim();
    return cleaned || raw;
  } catch {
    return raw;
  }
}

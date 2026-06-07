/**
 * rewrite-bio — Claude-backed bio rewriter for the staging-area preview.
 *
 * Body: { text: string, instruction: "shorten_100" | "shorten_60" | "tighten" | "professional" }
 * Returns: { ok, rewritten }
 *
 * The team writes long CV-extracted bios; before publishing they
 * often want a tighter version — under 100 words for the hospital
 * intro PDF, or shorter for the candidate card. Lean on Claude
 * instead of giving the team a Word-doc round-trip.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Instruction = "shorten_100" | "shorten_60" | "tighten" | "professional";

const PROMPTS: Record<Instruction, string> = {
  shorten_100:
    "Rewrite the bio below to STRICTLY UNDER 100 WORDS. Keep every concrete factual detail (institutions, role titles, certifications, years if mentioned). Drop padding, soft adjectives, and any reference to soft skills. Third person, professional tone.",
  shorten_60:
    "Rewrite the bio below to STRICTLY UNDER 60 WORDS — a one-paragraph elevator pitch for a hospital intro card. Keep current role, headline specialty, primary training institution. Drop everything else.",
  tighten:
    "Tighten the bio below: cut filler words and redundant phrases without removing any factual content. Aim for ~70% of the original length. Third person, professional tone.",
  professional:
    "Rewrite the bio below in a more professional, hospital-intro style. Keep ALL facts. Use third person and consultant-recruiter tone. Remove first-person voice, casual phrasing, marketing language.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY)        return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { text?: string; instruction?: Instruction };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Bad JSON" }, 400); }

  const text = (body.text ?? "").trim();
  if (!text) return json({ ok: false, error: "text required" }, 400);
  if (text.length > 8000) return json({ ok: false, error: "text too long (>8000 chars)" }, 413);

  const instr = body.instruction ?? "shorten_100";
  const prompt = PROMPTS[instr];
  if (!prompt) return json({ ok: false, error: `Unknown instruction: ${instr}` }, 400);

  const claudeReq = {
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `${prompt}\n\nReturn ONLY the rewritten bio. No preamble, no "Here is…", no quotes around the result.\n\nBio:\n${text}`,
    }],
  };

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify(claudeReq),
    });
  } catch (e) {
    return json({ ok: false, error: `Claude fetch threw: ${String(e)}` }, 502);
  }

  const claudeText = await claudeRes.text();
  if (!claudeRes.ok) {
    return json({ ok: false, error: `Claude HTTP ${claudeRes.status}: ${claudeText.slice(0, 300)}` }, 502);
  }

  let claudeJson: { content?: { type: string; text?: string }[] };
  try { claudeJson = JSON.parse(claudeText); }
  catch { return json({ ok: false, error: "Claude returned non-JSON" }, 502); }

  const out = (claudeJson.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
  if (!out) return json({ ok: false, error: "Empty rewrite" }, 502);

  // Strip any wrapping quotes Claude might have added despite the prompt.
  const cleaned = out.replace(/^["“'']|["”'']$/g, "").trim();

  return json({ ok: true, rewritten: cleaned }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

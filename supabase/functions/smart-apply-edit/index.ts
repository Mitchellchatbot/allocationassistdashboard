/**
 * smart-apply-edit — propagate a MANUAL email edit across near-identical emails
 * using Claude, so a wording change is applied to everyone WITHOUT copying the
 * first recipient's specific details (name / description / hospital) onto them.
 *
 * Body: {
 *   original: string,            // the source email BEFORE the user's edit (HTML)
 *   edited:   string,            // the source email AFTER the user's edit (HTML)
 *   targets:  { id: string, html: string }[]   // the OTHER emails (their own HTML)
 * }
 * Returns: { ok, results: { id, html }[] , failures?: {id,error}[] }
 *
 * One Claude call per target (in parallel) — each is told to apply ONLY the
 * change the user made and to preserve the target's own recipient-specific
 * content and HTML structure exactly.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";
const MAX_HTML = 60_000;     // per email
const MAX_TARGETS = 30;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You propagate a hand-made edit across near-identical outreach emails.
A user edited ONE email (you get its ORIGINAL and EDITED HTML). Work out ONLY the change they made — reworded/added/removed wording, a greeting or closing tweak, layout change, etc.
Then apply that SAME change to the TARGET email, which is the same template rendered for a DIFFERENT doctor and/or hospital.

HARD RULES:
- Keep EVERY piece of the TARGET's own content exactly as-is: the doctor's name, specialty, description/bio, the hospital name, city, contact details, links, and any <img>, <table>, or profile-card blocks. NEVER copy the first email's specific details onto the target.
- Preserve the HTML structure and tags. Return valid HTML.
- Apply ONLY the user's change. If the change is specific to the first doctor/hospital and does not sensibly apply to the target, return the target UNCHANGED.
- Output ONLY the resulting HTML for the target — no preamble, no explanation, no markdown fences.`;

async function applyOne(original: string, edited: string, target: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `ORIGINAL (before edit):\n${original}\n\nEDITED (after the user's change):\n${edited}\n\nTARGET (apply the SAME change; keep its own details):\n${target}`,
      }],
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${txt.slice(0, 200)}`);
  const parsed = JSON.parse(txt) as { content?: { type: string; text?: string }[] };
  let out = (parsed.content ?? []).find(c => c.type === "text")?.text?.trim() ?? "";
  // Strip an accidental ```html … ``` fence if the model added one.
  out = out.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!out) throw new Error("empty result");
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY)       return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { original?: string; edited?: string; targets?: { id: string; html: string }[] };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }

  const original = (body.original ?? "").trim();
  const edited   = (body.edited ?? "").trim();
  const targets  = Array.isArray(body.targets) ? body.targets : [];
  if (!original || !edited) return json({ ok: false, error: "original and edited are required" }, 400);
  if (!targets.length)      return json({ ok: false, error: "no targets" }, 400);
  if (targets.length > MAX_TARGETS) return json({ ok: false, error: `too many targets (>${MAX_TARGETS})` }, 413);
  if (original.length > MAX_HTML || edited.length > MAX_HTML || targets.some(t => (t.html ?? "").length > MAX_HTML))
    return json({ ok: false, error: "an email is too large for AI apply — use the instant apply instead" }, 413);
  if (original === edited) return json({ ok: true, results: targets.map(t => ({ id: t.id, html: t.html })) });

  const settled = await Promise.allSettled(targets.map(t => applyOne(original, edited, t.html ?? "")));
  const results: { id: string; html: string }[] = [];
  const failures: { id: string; error: string }[] = [];
  settled.forEach((s, i) => {
    const id = targets[i].id;
    if (s.status === "fulfilled") results.push({ id, html: s.value });
    else failures.push({ id, error: String(s.reason).slice(0, 200) });
  });

  return json({ ok: true, results, ...(failures.length ? { failures } : {}) });
});

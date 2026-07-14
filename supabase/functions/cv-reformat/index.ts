/**
 * cv-reformat — parse an arbitrary incoming doctor CV (PDF / .docx / pasted
 * text) into Allocation Assist's house CV structure (AaCvData), which the client
 * renders into the branded template + PDF (Convert CV tab). Uses Claude:
 *   • PDF  → native document block (best fidelity)
 *   • DOCX → unzip word/document.xml → text
 *   • text → sent as-is
 *
 * Request:  { cv_url?: string, text?: string, photo_url?: string }
 * Response: { ok: true, data: AaCvData } | { ok: false, error }
 * Secret:   ANTHROPIC_API_KEY
 */
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s: number) => new Response(JSON.stringify(p), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = `You are reformatting a doctor's CV into Allocation Assist's house format. Read the CV and return ONLY a JSON object (no prose, no markdown code fences) with EXACTLY this shape:
{
  "name": "",            // the doctor's name WITHOUT any "Dr." prefix, e.g. "Ashraf Mahmood"
  "title": "",           // their consultant title / specialty, e.g. "Consultant ENT and Head & Neck Surgeon"
  "qualifications": "",  // a single comma-separated credentials line, e.g. "MBChB, DOHNS, MRCS (ENT), FRCS (ENT)", or ""
  "email": "",           // or ""
  "phone": "",           // or ""
  "linkedin": "",        // full URL or ""
  "summary": [],         // 2-3 polished paragraphs (strings) for the "Doctor's Profile": a professional, flowing third-person narrative summarising training, credentials, subspecialty expertise, clinical practice, and academic/leadership contributions. Base it ONLY on the CV — never invent facts.
  "personal": {},        // include only keys present: "Name", "Address", "Date of Birth", "Nationality", "Languages"
  "sections": []         // array of { "heading": "", "items": [""], "subsections": [ { "heading": "", "items": [""] } ] }
}

For "sections", use ONLY these standard headings when the CV has matching content, in this order (omit any that don't apply):
"Professional Qualifications", "Certifications", "Specialist Interests and Clinical Expertise" (put sub-areas like "Rhinology and Nasal Surgery" / "Paediatric ENT" in "subsections"), "Current Appointment", "Previous Posts", "Teaching and Education Experience", "Leadership and Management", "Distinctions and Awards", "Research", "Publications", "Presentations", "Professional Licenses & Memberships".

Rules:
- Preserve EVERY dated entry (qualifications, certifications, appointments, posts, teaching, leadership, awards, research, publications, presentations, licenses). Each becomes one string in "items", starting with its date exactly as written (e.g. "09/2024 – ...", "Nov 2019: ...", "2015 – 2016 | ...").
- Keep entries factual and close to the source; lightly tidy formatting but do not fabricate or drop content. Do not truncate long publication/presentation lists.
- If a section is prose in the CV (e.g. a Teaching narrative), split it into sensible bullet "items".
- Omit "subsections" when a section has none; omit "items" when a section only has subsections.
- Output ONLY the JSON object, nothing else.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY)       return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { cv_url?: string; text?: string; photo_url?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const cvUrl = (body.cv_url ?? "").trim();
  const text  = (body.text ?? "").trim();
  if (!cvUrl && !text) return json({ ok: false, error: "Provide a cv_url or text." }, 400);

  let content: unknown[];
  if (text) {
    content = [
      { type: "text", text: `The following is the plain text of a doctor's CV:\n\n${text}` },
      { type: "text", text: PROMPT },
    ];
  } else {
    let bytes: Uint8Array;
    try {
      const res = await fetch(cvUrl);
      if (!res.ok) return json({ ok: false, error: `Couldn't fetch the CV (HTTP ${res.status}).` }, 502);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (e) { return json({ ok: false, error: `Couldn't fetch the CV: ${String(e)}` }, 502); }

    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;                                           // PK (docx)
    if (isPdf) {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(bytes) } },
        { type: "text", text: PROMPT },
      ];
    } else if (isZip) {
      let cvText: string;
      try { cvText = extractDocxText(bytes); } catch (e) { return json({ ok: false, error: `Couldn't read the .docx CV: ${String(e)}` }, 422); }
      if (!cvText.trim()) return json({ ok: false, error: "The .docx CV had no extractable text." }, 422);
      content = [
        { type: "text", text: `The following is the plain text of a doctor's CV (from a Word .docx):\n\n${cvText}` },
        { type: "text", text: PROMPT },
      ];
    } else {
      return json({ ok: false, error: "Unsupported CV format — use a PDF or .docx (or paste the text)." }, 422);
    }
  }

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
    });
  } catch (e) { return json({ ok: false, error: `Claude request failed: ${String(e)}` }, 502); }

  const claudeText = await claudeRes.text();
  if (!claudeRes.ok) return json({ ok: false, error: `Claude HTTP ${claudeRes.status}: ${claudeText.slice(0, 300)}` }, 502);

  let claudeJson: { content?: { type: string; text?: string }[] };
  try { claudeJson = JSON.parse(claudeText); } catch { return json({ ok: false, error: "Claude returned non-JSON." }, 502); }
  const textBlock = (claudeJson.content ?? []).find(c => c.type === "text");
  if (!textBlock?.text) return json({ ok: false, error: "Claude response had no content." }, 502);

  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let data: Record<string, unknown>;
  try { data = JSON.parse(cleaned); } catch { return json({ ok: false, error: `Couldn't parse the reformatted CV: ${cleaned.slice(0, 200)}` }, 502); }

  if (body.photo_url) (data as { photo_url?: string }).photo_url = body.photo_url;
  return json({ ok: true, data }, 200);
});

/** Pull readable text out of a .docx. Mirrors cv-analyze-url. */
function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) throw new Error("no word/document.xml in archive");
  let xml = new TextDecoder().decode(xmlBytes);
  xml = xml
    .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/?>/g, "\t").replace(/<w:br\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return xml.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

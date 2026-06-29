/**
 * cv-analyze-url — Supabase Edge Function
 *
 * On-demand CV analysis from a URL (the doctor's website CV/résumé PDF, i.e.
 * the WP candidate's `cv_url`). Unlike cv-extract (which reads an uploaded file
 * from Storage keyed by an upload_id), this fetches the PDF straight from its
 * public URL, runs the SAME structured Claude extraction, persists the result
 * as a cv_uploads row (so the Doctors → Overview tab shows it next time), fills
 * any empty doctor_profiles fields, and returns the parsed data to the caller.
 *
 * Called on demand from the Overview's "Analyze CV" button — we deliberately do
 * NOT batch-analyze every doctor (Claude cost), only the one the user asks for.
 *
 * Secrets: ANTHROPIC_API_KEY
 *
 * Request:  { cv_url: string, doctor_id: string, doctor_name?: string }
 * Response: { ok: true, extracted: {...}, upload_id: string }
 *           { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

// Keep this prompt in sync with cv-extract/index.ts — same fields, same rules.
const EXTRACTION_PROMPT = `You are extracting structured profile data from a CV. The data feeds an introduction email AA sends to UAE / GCC hospitals — so we're primarily looking for medical doctor information, but extract what IS there even if the CV is non-medical.

General rule: prefer extracting what the CV actually says over leaving fields null. Only return null when the information genuinely isn't present and can't be reasonably inferred from context.

Return a JSON object with these exact keys:
{
  "title": string | null,
  "bio": string | null,                 // 3-5 sentence third-person summary, STRICTLY UNDER 150 WORDS, facts only.
  "specialty": string | null,           // One canonical specialty, not a list.
  "subspecialty": string | null,
  "current_location": string | null,
  "area_of_interest": string | null,    // Comma-separated fine-grained interests.
  "country_training": string | null,
  "years_experience": number | null,    // Integer, computable from work history.
  "nationality": string | null,         // Only when explicit/strongly implied by passport/citizenship — NOT inferred from training country.
  "date_of_birth": string | null,       // ISO "YYYY-MM-DD" when the CV states a birth date ("DOB: 15/04/1982", "April 15, 1982"). Ambiguous numeric dates → D/M/Y unless clearly US-style. Null if absent.
  "age": number | null,                 // From the date of birth only.
  "marital_status": string | null,
  "family_status": string | null,
  "license": string | null,             // UAE/GCC medical license only; null for non-medical.
  "salary_expectation": string | null,
  "notice_period": string | null,
  "languages": string | null,           // Comma-separated.
  "english_level": string | null        // One of: Native, Fluent, Professional, Intermediate, Basic.
}
Output ONLY the JSON object. No markdown fences, no commentary.`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY)       return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { cv_url?: string; doctor_id?: string; doctor_name?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const cvUrl     = (body.cv_url ?? "").trim();
  const doctorId  = (body.doctor_id ?? "").trim();
  const doctorName = (body.doctor_name ?? "").trim() || "Unknown";
  if (!cvUrl)    return json({ ok: false, error: "cv_url is required" }, 400);
  if (!doctorId) return json({ ok: false, error: "doctor_id is required" }, 400);

  // ── Fetch the CV file ──────────────────────────────────────────────────────
  let bytes: Uint8Array;
  try {
    const res = await fetch(cvUrl);
    if (!res.ok) return json({ ok: false, error: `Couldn't fetch the CV (HTTP ${res.status}).` }, 502);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return json({ ok: false, error: `Couldn't fetch the CV: ${String(e)}` }, 502);
  }

  // Detect the real format by magic bytes (more reliable than the URL suffix):
  //   • PDF  ("%PDF")      → native document block (best fidelity).
  //   • DOCX ("PK", a zip) → unzip word/document.xml and send the text, since
  //     Claude can't take a .docx as a document block.
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;                                           // PK… (docx)

  let content: unknown[];
  let mime = "application/pdf";
  if (isPdf) {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(bytes) } },
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else if (isZip) {
    let cvText: string;
    try { cvText = extractDocxText(bytes); }
    catch (e) { return json({ ok: false, error: `Couldn't read the .docx CV: ${String(e)}` }, 422); }
    if (!cvText.trim()) return json({ ok: false, error: "The .docx CV had no extractable text." }, 422);
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    content = [
      { type: "text", text: `The following is the plain text of a doctor's CV (extracted from a Word .docx file):\n\n${cvText}` },
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else {
    return json({ ok: false, error: "Unsupported CV format — on-demand analysis supports PDF and .docx CVs." }, 422);
  }

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2048, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return json({ ok: false, error: `Claude request failed: ${String(e)}` }, 502);
  }
  const claudeText = await claudeRes.text();
  if (!claudeRes.ok) return json({ ok: false, error: `Claude HTTP ${claudeRes.status}: ${claudeText.slice(0, 300)}` }, 502);

  let claudeJson: { content?: { type: string; text?: string }[] };
  try { claudeJson = JSON.parse(claudeText); } catch { return json({ ok: false, error: "Claude returned non-JSON." }, 502); }
  const textBlock = (claudeJson.content ?? []).find(c => c.type === "text");
  if (!textBlock?.text) return json({ ok: false, error: "Claude response had no content." }, 502);

  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let extracted: Record<string, unknown>;
  try { extracted = JSON.parse(cleaned); } catch { return json({ ok: false, error: `Couldn't parse extraction JSON: ${cleaned.slice(0, 200)}` }, 502); }

  // ── Persist: a cv_uploads row (so the Overview shows it) ───────────────────
  const fileName = decodeURIComponent(cvUrl.split("/").pop()?.split("?")[0] ?? (isPdf ? "cv.pdf" : "cv.docx"));
  const { data: inserted, error: insErr } = await supabase
    .from("cv_uploads")
    .insert({
      doctor_id:      doctorId,
      doctor_name:    doctorName,
      token:          crypto.randomUUID(),
      file_name:      fileName,
      file_mime:      mime,
      status:         "extracted",
      extracted_data: extracted,
      extracted_at:   new Date().toISOString(),
      created_by:     "cv-analyze-url",
    })
    .select("id")
    .single();
  if (insErr) console.error("[cv-analyze-url] cv_uploads insert failed:", insErr.message);

  // ── Fill any EMPTY doctor_profiles fields (never clobber human edits) ──────
  const { data: existing } = await supabase
    .from("doctor_profiles").select("*").eq("doctor_id", doctorId).maybeSingle();
  const COPY = ["title", "bio", "specialty", "subspecialty", "current_location", "area_of_interest",
    "country_training", "years_experience", "nationality", "age", "marital_status", "family_status",
    "license", "salary_expectation", "notice_period", "languages", "english_level"];
  const patch: Record<string, unknown> = { doctor_id: doctorId, doctor_name: doctorName };
  for (const k of COPY) {
    const incoming = extracted[k];
    if (incoming === null || incoming === undefined || incoming === "") continue;
    const cur = existing?.[k];
    if (cur === null || cur === undefined || cur === "") patch[k] = incoming;
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = "cv-analyze-url";
  const { error: upErr } = await supabase.from("doctor_profiles").upsert(patch, { onConflict: "doctor_id" });
  if (upErr) console.error("[cv-analyze-url] doctor_profiles upsert failed:", upErr.message);

  return json({ ok: true, extracted, upload_id: inserted?.id ?? null });
});

/** Pull readable text out of a .docx (a zip whose body is word/document.xml).
 *  Claude can't take a .docx as a document block, so we send this text instead.
 *  Mirrors extractDocxText() in cv-extract. */
function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) throw new Error("no word/document.xml in archive");
  let xml = new TextDecoder().decode(xmlBytes);
  xml = xml
    .replace(/<\/w:p>/g, "\n")        // paragraph end → newline
    .replace(/<w:tab\/?>/g, "\t")     // tab
    .replace(/<w:br\/?>/g, "\n")      // line break
    .replace(/<[^>]+>/g, "")          // drop every remaining tag
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return xml.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

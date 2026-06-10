/**
 * cv-extract — Supabase Edge Function
 *
 * Reads a CV from the doctor-cvs Storage bucket, sends it to Claude with a
 * structured prompt that pulls out the fields Saif's profile_sent_hospital
 * template needs (title, bio, area of interest, years experience, license,
 * etc.), then upserts the result into doctor_profiles.
 *
 * Triggered by cv-upload-public after a successful upload. Can also be
 * invoked manually for a retry (POST {upload_id}).
 *
 * Secrets required:
 *   ANTHROPIC_API_KEY — for Claude PDF document API
 *
 * Request: { upload_id: string }
 * Response:
 *   { ok: true,  extracted: {...} }
 *   { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrichProfile } from "../_shared/enrich-profile.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
// Sonnet 4.6 is plenty for structured extraction and ~4x cheaper than Opus.
// Bump to claude-opus-4-7 if accuracy on edge cases needs more headroom.
const ANTHROPIC_MODEL   = "claude-sonnet-4-6";

console.log("[cv-extract] booted. Has key:", !!ANTHROPIC_API_KEY);

const EXTRACTION_PROMPT = `You are extracting structured profile data from a CV. The data feeds an introduction email AA sends to UAE / GCC hospitals — so we're primarily looking for medical doctor information, but extract what IS there even if the CV is non-medical (e.g. someone uploads a non-doctor CV for testing, or a doctor with an atypical background).

General rule: prefer extracting what the CV actually says over leaving fields null. Only return null when the information genuinely isn't present and can't be reasonably inferred from context.

Return a JSON object with these exact keys:

{
  "title":              string | null,   // Their stated professional title. Medical CV: UAE-style like "Consultant Pediatrician", "Specialist Urologist". Non-medical: whatever title they hold, e.g. "SEO & Email Marketing Specialist".
  "bio":                string | null,   // 3-5 sentence prose paragraph summarising their professional background. Third person, professional tone. Use ONLY facts in the CV.
  "specialty":          string | null,   // Broad medical specialty inferred from title/training (e.g. "Rheumatology", "Internal Medicine", "Cardiology", "General Surgery"). One canonical specialty name — not a list. Non-medical: their primary domain (e.g. "Marketing", "Software Engineering").
  "subspecialty":       string | null,   // More specific area inside the specialty (e.g. "Pediatric Rheumatology", "Interventional Cardiology", "Hepatobiliary Surgery"). Null if the CV doesn't go deeper than the specialty.
  "current_location":   string | null,   // City + country of current residence / workplace if stated (e.g. "Dubai, UAE", "London, UK").
  "area_of_interest":   string | null,   // Comma-separated specific procedures / interests beyond the subspecialty (e.g. "Endourology, Robotic Surgery, Stone Disease"). Different from specialty/subspecialty — this is the very fine-grained "areas of interest" within the field.
  "country_training":   string | null,   // Where they trained / studied. Medical: board (e.g. "German Board", "UK Trained"). Non-medical: country of education or career base (e.g. "Pakistan", "USA").
  "years_experience":   number | null,   // Integer total years of professional experience, stated or computable from work history dates. Compute from the first listed job to present.
  "nationality":        string | null,   // Extract when stated explicitly (e.g. "Nationality: Egyptian", "Passport: UK", "American citizen", "I am a Sudanese national") OR strongly implied by an explicit passport/citizenship/national-ID line. DO NOT infer from training country, work location, or medical school country alone — those are not nationality.
  "age":                number | null,   // Compute from DOB if the CV lists one ("DOB: 12/04/1985"). Don't infer from graduation year alone.
  "marital_status":     string | null,   // "Married" / "Single" / "Divorced" / "Widowed". Extract from a Personal Information section, an explicit "Marital Status: …" line, or phrasing like "married with two children".
  "family_status":      string | null,   // e.g. "Married, 2 children", "Single", "Spouse and children". Extract from explicit Personal Information lines (Marital Status, Dependents, Family). Combine related lines into one phrase when present.
  "license":            string | null,   // UAE/GCC MEDICAL license info ONLY (e.g. "DHA Registration", "SCFHS in process"). For non-medical CVs, this is null — don't pretend they have a medical license.
  "salary_expectation": string | null,   // Free text — extract when stated. Capture both numbers if the CV lists "Current Salary" and "Expected Salary" separately (return the expected one here).
  "notice_period":      string | null,   // Free text — extract when stated, e.g. "1 month", "Immediate".
  "languages":          string | null,   // Comma-separated languages they speak (e.g. "English, Arabic, Urdu"). Reasonable to infer from explicit language certifications (e.g. "IELTS 6 Bands" → English) or stated language proficiency.
  "education":          [                 // Up to 3 entries, most recent first. Omit the array entirely if not present.
    {
      "institution": string | null,       // e.g. "Cairo University"
      "degree":      string | null,       // e.g. "MBBCh", "MD Internal Medicine"
      "start":       string | null,       // Year as a string ("2008") or "YYYY-MM"
      "end":         string | null,       // Year, "Present", or null
      "description": string | null        // Optional one-line gloss
    }
  ] | null,
  "experience":         [                 // Up to 3 entries, most recent first. Omit the array entirely if not present.
    {
      "company":     string | null,       // e.g. "Sheikh Khalifa Medical City"
      "title":       string | null,       // Role at that company
      "start":       string | null,       // Year as a string ("2018") or "YYYY-MM"
      "end":         string | null,       // Year, "Present", or null
      "description": string | null        // 1-2 sentence summary of responsibilities / scope
    }
  ] | null
}

Output ONLY the JSON object. No markdown fences, no commentary, no preamble.`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY)        return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { upload_id?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const uploadId = body.upload_id;
  if (!uploadId) return json({ ok: false, error: "upload_id required" }, 400);

  const { data: row, error: lookupErr } = await supabase
    .from("cv_uploads")
    .select("*")
    .eq("id", uploadId)
    .single();
  if (lookupErr || !row) return json({ ok: false, error: "Upload not found", detail: lookupErr?.message }, 404);
  if (!row.file_path)    return json({ ok: false, error: "No file uploaded yet" }, 400);

  console.log("[cv-extract] starting for upload", uploadId, "file", row.file_path);

  await supabase.from("cv_uploads").update({ status: "extracting" }).eq("id", uploadId);

  // Download the file from storage
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("doctor-cvs")
    .download(row.file_path);
  if (dlErr || !fileBlob) {
    return failExtraction(uploadId, `Download failed: ${dlErr?.message ?? "unknown"}`);
  }
  const buf = await fileBlob.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Claude's document content block accepts ONLY application/pdf (and
  // text/plain) as a base64 source — NOT Word .docx/.doc (that returns a 400
  // on document.source). So detect the REAL format by magic bytes (more
  // reliable than the stored mime) and route accordingly:
  //   • PDF  ("%PDF")      → native document block (best fidelity).
  //   • DOCX ("PK", a zip) → unzip word/document.xml, send the text.
  //   • else (.doc etc.)   → fail clearly; ask for a PDF/DOCX.
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;                                           // PK… (docx)

  let content: unknown[];
  if (isPdf) {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Encode(bytes) } },
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else if (isZip) {
    let cvText: string;
    try { cvText = extractDocxText(bytes); }
    catch (e) { return failExtraction(uploadId, `DOCX text extraction failed: ${String(e)}`); }
    if (!cvText.trim()) return failExtraction(uploadId, "DOCX had no extractable text");
    content = [
      { type: "text", text: `The following is the plain text of a doctor's CV (extracted from a Word .docx file):\n\n${cvText}` },
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else {
    return failExtraction(uploadId, `Unsupported CV format (mime=${row.file_mime ?? "?"}). Please upload a PDF or .docx.`);
  }

  const claudeReq = {
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content }],
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
    return failExtraction(uploadId, `Claude fetch threw: ${String(e)}`);
  }

  const claudeText = await claudeRes.text();
  if (!claudeRes.ok) {
    return failExtraction(uploadId, `Claude HTTP ${claudeRes.status}: ${claudeText.slice(0, 400)}`);
  }

  let claudeJson: { content?: { type: string; text?: string }[] };
  try { claudeJson = JSON.parse(claudeText); }
  catch { return failExtraction(uploadId, `Claude returned non-JSON: ${claudeText.slice(0, 200)}`); }

  const textBlock = (claudeJson.content ?? []).find(c => c.type === "text");
  if (!textBlock?.text) {
    return failExtraction(uploadId, "Claude response had no text content");
  }

  // Strip markdown fences if Claude wrapped its JSON (rare with our prompt
  // but cheap to handle).
  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let extracted: Record<string, unknown>;
  try { extracted = JSON.parse(cleaned); }
  catch { return failExtraction(uploadId, `Could not parse extraction JSON: ${cleaned.slice(0, 200)}`); }

  console.log("[cv-extract] extracted fields:", Object.keys(extracted).join(", "));

  // Upsert into doctor_profiles. Doesn't overwrite existing fields the team
  // may have hand-edited — only fills nulls/empties. This is the safest
  // default because once a human has reviewed, we don't want a re-extraction
  // to clobber their work.
  const { data: existing } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("doctor_id", row.doctor_id)
    .maybeSingle();

  const fieldsToCopy: Array<keyof typeof extracted> = [
    "title", "bio", "specialty", "subspecialty", "current_location",
    "area_of_interest", "country_training",
    "years_experience", "nationality", "age", "marital_status",
    "family_status", "license", "salary_expectation", "notice_period",
    "languages",
  ];
  const profilePatch: Record<string, unknown> = {
    doctor_id:   row.doctor_id,
    doctor_name: row.doctor_name,
  };
  for (const k of fieldsToCopy) {
    const incoming = extracted[k];
    if (incoming === null || incoming === undefined || incoming === "") continue;
    const current = existing?.[k as string];
    // Only fill if currently empty — preserve human edits.
    if (current === null || current === undefined || current === "") {
      profilePatch[k as string] = incoming;
    }
  }
  profilePatch.updated_at = new Date().toISOString();
  profilePatch.updated_by = "cv-extract";

  const { error: upsertErr } = await supabase
    .from("doctor_profiles")
    .upsert(profilePatch, { onConflict: "doctor_id" });
  if (upsertErr) {
    console.error("[cv-extract] doctor_profiles upsert failed:", upsertErr.message);
    // Still mark extraction as complete — the raw data is in cv_uploads
    // so the team can manually port it across.
  }

  await supabase.from("cv_uploads").update({
    status:           "extracted",
    extracted_data:   extracted,
    extracted_at:     new Date().toISOString(),
    extraction_error: null,
  }).eq("id", uploadId);

  // ── Route 1: STAGED profile path. Fold the CV-extracted fields
  //    into the staged row's `acf` AND flat fields, so the staging-area
  //    list + detail dialog reflect the full picture without waiting
  //    for the Publish click. Doctors should see the CV's specialty /
  //    education / experience / license / languages / nationality /
  //    country of training / job_title / bio / years_experience etc.
  //    appear on the staging row as soon as extraction lands.
  const did = String(row.doctor_id ?? "");
  if (did.startsWith("staged:")) {
    const stagedId = did.slice(7);

    // Fetch the current staged row so we can re-merge: form ACF +
    // Zoho lookups + the just-extracted CV data.
    const { data: staged } = await supabase
      .from("staged_doctor_profiles")
      .select("id, email, acf, source_response_id")
      .eq("id", stagedId)
      .single();

    let responseRow: { raw_payload: Record<string, unknown> | null; answers: Record<string, string> | null } | null = null;
    if (staged?.source_response_id) {
      const { data: resp } = await supabase
        .from("form_responses")
        .select("raw_payload, answers")
        .eq("id", staged.source_response_id)
        .single();
      responseRow = (resp as typeof responseRow) ?? null;
    }

    const enrichResult = await enrichProfile({
      supabase,
      email:       (staged?.email as string | null) ?? null,
      formAcf:     ((staged?.acf as Record<string, unknown>) ?? {}),
      responseRow,
      cvExtracted: extracted,
    });

    // Pull flat fields off the merged ACF so the staging-list row
    // shows the CV-enriched view (specialty, job_title, country, etc.).
    const mergedAcf = enrichResult.mergedAcf;
    const flatPatch: Record<string, unknown> = {
      extracted_cv_data:   extracted,
      acf:                 mergedAcf,
      full_name:           (mergedAcf.full_name as string | undefined)                                                     ?? (staged?.acf as Record<string, unknown> | undefined)?.full_name ?? null,
      specialty:           (mergedAcf.specialty as string | undefined)                                                     ?? null,
      subspecialty:        (mergedAcf.subspecialty as string | undefined)                                                  ?? null,
      nationality:         (mergedAcf.nationality as string | undefined)                                                   ?? null,
      job_title:           (mergedAcf.job_title as string | undefined)                                                     ?? null,
      country_of_training: (mergedAcf.country_of_training as string | undefined)                                           ?? null,
      current_location:    (mergedAcf.current_location as string | undefined)                                              ?? null,
      years_experience:    String((mergedAcf.years_of_experience_post_specialization as string | number | undefined) ?? ""),
      phone:               (mergedAcf.phone_number as string | undefined)                                                  ?? null,
    };
    // Strip empties so we don't blank out fields with "" / null.
    for (const k of Object.keys(flatPatch)) {
      const v = flatPatch[k];
      if (k === "extracted_cv_data" || k === "acf") continue;
      if (v === null || v === undefined || v === "") delete flatPatch[k];
    }

    const { error: stagedErr } = await supabase
      .from("staged_doctor_profiles")
      .update(flatPatch)
      .eq("id", stagedId);
    if (stagedErr) console.error(`[cv-extract] staged ${stagedId} merge failed:`, stagedErr.message);
    else           console.log(`[cv-extract] enriched staged ${stagedId} — ${Object.keys(mergedAcf).length} ACF fields, photo=${enrichResult.pictureUrl ? "yes" : "no"}`);
  }

  // ── Route 2 was a legacy direct-WP write that fired on `wp:<id>`
  //    prefixed cv_uploads rows. REMOVED on purpose. Hard rule from
  //    the team: NOTHING lands on WordPress until a human clicks
  //    Publish on the staging row. cv-extract now only writes back
  //    onto staged_doctor_profiles.extracted_cv_data above — the
  //    Publish click in the dashboard is the only WP-create path.
  if (did.startsWith("wp:")) {
    console.warn(`[cv-extract] legacy wp:<id> prefix seen on ${row.id}; ignoring — staged-only policy in effect.`);
  }

  return json({ ok: true, extracted, profile_updated: !upsertErr }, 200);
});

async function failExtraction(uploadId: string, error: string): Promise<Response> {
  console.error("[cv-extract] failing upload", uploadId, ":", error);
  await supabase.from("cv_uploads").update({
    status:           "failed",
    extraction_error: error.slice(0, 1000),
  }).eq("id", uploadId);
  return json({ ok: false, error }, 500);
}

/** Pull readable text out of a .docx (a zip whose body is word/document.xml).
 *  Claude can't take a .docx as a document block, so we send this text
 *  instead. Paragraph / break / tab tags become whitespace; all other XML
 *  tags are stripped; XML entities are decoded. */
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

function base64Encode(bytes: Uint8Array): string {
  // Standard chunked base64 — atob/btoa choke on large buffers, so encode
  // in 32KB blocks then concatenate. ~5MB CV → ~7MB base64, well within
  // Deno's heap.
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(s);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

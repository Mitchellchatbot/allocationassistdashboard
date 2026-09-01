/**
 * backfill-hospital-images — team feedback #9 / #2 ("Hospital image AND
 * description should actually appear in each Working Opportunity email").
 *
 * The WO email renders `hospitals.image_url` (hero <img>) and
 * `hospitals.description` ("About Us" blurb) under each opportunity (see
 * _shared/doctor-working-op.ts). The whole send pipeline — SendProfileDialog
 * preview, send-flow-email and send-batch — already passes both through, so the
 * ONLY reason they don't appear is that the columns are blank: the original
 * hospital photos live in an M365 mailbox nobody has migrated. This backfill
 * fills the gap WITHOUT that mailbox by scraping each hospital website's
 * Open-Graph tags in ONE fetch:
 *   image_url   ← og:image → twitter:image → <link rel="image_src">
 *   description ← og:description → <meta name="description">
 * (`hospitals.website` is populated first by the sibling
 * `backfill-hospital-websites` function.)
 *
 * SAFE BY DEFAULT — a plain call is a DRY RUN: it reports what it WOULD write
 * and touches nothing. Send { "apply": true } to actually write.
 *   POST /functions/v1/backfill-hospital-images
 *   body: { apply?, overwrite?, limit?, only?: string[], fields?: ("image"|"description")[] }
 *     apply     — false (default) = dry run; true = perform the updates.
 *     overwrite — false (default) = only fill BLANK columns; true = also
 *                 replace existing values.
 *     limit     — cap how many websites to fetch this run (default 100).
 *     only      — optional list of hospital ids to restrict the run to.
 *     fields    — which columns to backfill (default both). A hospital is a
 *                 candidate if ANY requested field is blank (or overwrite).
 *
 * Non-destructive, idempotent (re-running skips already-filled columns unless
 * overwrite), and fetches only public hospital websites.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Normalise a raw website value into a fetchable https URL, or "" if unusable. */
function normWebsite(raw: string): string {
  let w = (raw || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
  if (!w || /\s/.test(w) || !/\./.test(w)) return "";
  if (!/^https?:\/\//i.test(w)) w = "https://" + w.replace(/^\/+/, "");
  return w;
}

/** Pull the content="" of the FIRST matching <meta> for any of the given
 *  property/name keys. Order of `keys` = priority. Handles either attribute
 *  order (property before content or vice-versa) and single/double quotes. */
function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // property="og:image" ... content="X"   OR   content="X" ... property="og:image"
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = re.exec(html);
      if (m && m[1]) return m[1].trim();
    }
  }
  return "";
}

/** `<link rel="image_src" href="X">` fallback (either attribute order). */
function linkImageSrc(html: string): string {
  const patterns = [
    /<link[^>]+rel\s*=\s*["']image_src["'][^>]*?href\s*=\s*["']([^"']+)["']/i,
    /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*?rel\s*=\s*["']image_src["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

/** Decode the handful of HTML entities that show up in URL attributes. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&#38;/g, "&")
    .replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Resolve a possibly-relative image URL against the page it came from. */
function absolutize(imageUrl: string, pageUrl: string): string {
  const u = decodeEntities(imageUrl.trim());
  if (!u) return "";
  try {
    // Protocol-relative, absolute, or relative — the URL constructor handles all.
    return new URL(u, pageUrl).toString();
  } catch {
    return "";
  }
}

/** Fetch a page's HTML with a timeout; returns "" on any failure. `finalUrl`
 *  is written back so relative image URLs resolve against the redirected page. */
async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // Some sites 403 an empty UA; present as a normal browser.
        "User-Agent": "Mozilla/5.0 (compatible; AllocationAssistBot/1.0; +https://allocationassist.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { html: "", finalUrl: url };
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return { html: "", finalUrl: res.url || url };
    // Cap the read — og tags live in <head>, so 512KB is plenty and bounds cost.
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.slice(0, 512 * 1024));
    return { html, finalUrl: res.url || url };
  } catch {
    return { html: "", finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

/** Best hero image for a page: og:image → twitter:image → link[rel=image_src]. */
function extractImage(html: string, pageUrl: string): string {
  const raw =
    metaContent(html, ["og:image:secure_url", "og:image:url", "og:image"]) ||
    metaContent(html, ["twitter:image:src", "twitter:image"]) ||
    linkImageSrc(html);
  if (!raw) return "";
  const abs = absolutize(raw, pageUrl);
  // Only accept http(s) images; reject data:/blob: and obvious non-images.
  if (!/^https?:\/\//i.test(abs)) return "";
  return abs;
}

/** Best "About Us" blurb for a page: og:description → twitter:description →
 *  <meta name="description">. Whitespace-collapsed and length-capped so a
 *  runaway meta tag can't bloat the email. Empty = nothing usable found. */
function extractDescription(html: string): string {
  const raw =
    metaContent(html, ["og:description"]) ||
    metaContent(html, ["twitter:description"]) ||
    metaContent(html, ["description"]);
  const clean = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (clean.length < 20) return ""; // skip stubs like "Home" / a bare name
  return clean.length > 400 ? clean.slice(0, 397).trimEnd() + "…" : clean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Record<string, unknown> = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { /* empty body → dry run */ }
  const apply = body.apply === true;
  const overwrite = body.overwrite === true;
  const limit = Math.max(1, Math.min(500, Number(body.limit) || 100));
  const only = Array.isArray(body.only) ? body.only.map(String) : null;
  const fieldsReq = Array.isArray(body.fields) ? body.fields.map(String) : ["image", "description"];
  const doImage = fieldsReq.includes("image");
  const doDesc  = fieldsReq.includes("description");

  // Hospitals that have a website to scrape.
  const { data: hospitals, error: hErr } = await supabase
    .from("hospitals").select("id, name, website, image_url, description");
  if (hErr) return json({ ok: false, error: `hospitals read failed: ${hErr.message}` }, 500);

  const hasImg  = (h: Record<string, unknown>) => String(h.image_url ?? "").trim().length > 0;
  const hasDesc = (h: Record<string, unknown>) => String(h.description ?? "").trim().length > 0;
  // A hospital needs a fetch if any REQUESTED field is fillable.
  const needsFill = (h: Record<string, unknown>) =>
    (doImage && (overwrite || !hasImg(h))) || (doDesc && (overwrite || !hasDesc(h)));

  // Candidates: website present, at least one requested field fillable,
  // optionally restricted to `only` ids.
  const candidates = (hospitals ?? []).filter((h) => {
    if (only && !only.includes(String(h.id))) return false;
    if (!normWebsite(String(h.website ?? ""))) return false;
    return needsFill(h);
  });

  const toUpdate: Array<{
    id: string; name: string; website: string;
    image?: { from: string | null; to: string };
    description?: { from: string | null; to: string };
  }> = [];
  const nothingFound: Array<{ name: string; website: string }> = [];
  const skippedNoWebsite = (hospitals ?? []).filter(h => !normWebsite(String(h.website ?? ""))).length;

  let fetched = 0;
  for (const h of candidates) {
    if (fetched >= limit) break;
    fetched++;
    const website = normWebsite(String(h.website ?? ""));
    const { html, finalUrl } = await fetchHtml(website, 8000);
    if (!html) { nothingFound.push({ name: String(h.name ?? ""), website }); continue; }

    const patch: { image?: { from: string | null; to: string }; description?: { from: string | null; to: string } } = {};

    if (doImage && (overwrite || !hasImg(h))) {
      const image = extractImage(html, finalUrl);
      const cur = String(h.image_url ?? "").trim();
      if (image && image !== cur) patch.image = { from: cur || null, to: image };
    }
    if (doDesc && (overwrite || !hasDesc(h))) {
      const desc = extractDescription(html);
      const cur = String(h.description ?? "").trim();
      if (desc && desc !== cur) patch.description = { from: cur || null, to: desc };
    }

    if (!patch.image && !patch.description) { nothingFound.push({ name: String(h.name ?? ""), website }); continue; }
    toUpdate.push({ id: String(h.id), name: String(h.name ?? ""), website, ...patch });
  }

  let updatedImages = 0, updatedDescriptions = 0;
  const failures: Array<{ name: string; error: string }> = [];
  if (apply) {
    for (const u of toUpdate) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (u.image)       patch.image_url  = u.image.to;
      if (u.description) patch.description = u.description.to;
      const { error } = await supabase.from("hospitals").update(patch).eq("id", u.id);
      if (error) { failures.push({ name: u.name, error: error.message }); continue; }
      if (u.image)       updatedImages++;
      if (u.description) updatedDescriptions++;
    }
  }

  return json({
    ok: true,
    dry_run: !apply,
    fields: { image: doImage, description: doDesc },
    summary: {
      hospitals_total: hospitals?.length ?? 0,
      candidates: candidates.length,
      fetched,
      would_set_image:       toUpdate.filter(u => u.image).length,
      would_set_description: toUpdate.filter(u => u.description).length,
      nothing_found: nothingFound.length,
      skipped_no_website: skippedNoWebsite,
      already_have_image:       (hospitals ?? []).filter(hasImg).length,
      already_have_description: (hospitals ?? []).filter(hasDesc).length,
      capped_by_limit: candidates.length > limit,
      ...(apply ? { updated_images: updatedImages, updated_descriptions: updatedDescriptions, failed: failures.length } : {}),
    },
    to_update: toUpdate,
    nothing_found: nothingFound,
    ...(apply && failures.length ? { failures } : {}),
  });
});

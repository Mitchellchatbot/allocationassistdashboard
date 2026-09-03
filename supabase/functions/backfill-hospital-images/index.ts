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
 *     image_source — "website" (default, scrape og:image → often a LOGO) or
 *                 "wikipedia" (the hospital's Wikipedia article lead image, a
 *                 real BUILDING photo; no website needed, left untouched when
 *                 the hospital has no article).
 *
 * Extra modes (each dry-run by default, apply:true to write):
 *   set_images — apply curated PHOTOS by hospital-name match:
 *     body.set_images = [{ match, image_url?, data_base64?, filename? }]. A
 *     data_base64 payload is uploaded to the public email-card-images bucket and
 *     its public URL stored; match must hit exactly one hospital.
 *   list_images — READ-ONLY: list every hospital that has an image_url, as
 *     { id, name, image_url, city, country }. For reviewing the current photo
 *     set to spot logos/placeholders/non-photos to remove.
 *   clear_images — NULL out image_url on hospitals by id (dry-run by default):
 *     body.clear_images = [id, ...]. Removes logo/placeholder images so the WO
 *     email omits the hero photo rather than showing a logo.
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

/** Decode HTML entities that show up in URL attributes and meta text: the
 *  common named ones, plus ALL numeric character references — decimal (&#39;)
 *  and hex (&#x27;) — so nothing like "King&#x27;s" leaks into the email. */
function decodeEntities(s: string): string {
  return s
    // Numeric refs first (covers &#38; &#39; &#x2F; &#x27; …).
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCode(parseInt(d, 10)))
    // Named refs (do &amp; last so it can't re-introduce an entity).
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function safeFromCode(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  try { return String.fromCodePoint(cp); } catch { return ""; }
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

/** Normalise a name/title for token comparison: lowercase, strip punctuation. */
function normName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
/** Facility words — a Wikipedia article we accept as "a hospital photo" must be
 *  ABOUT a facility, not a person/place that merely shares a name (the reason a
 *  naive search returned businessmen, founders, even a bombing photo). */
const FACILITY_RE = /\b(hospital|clinic|medical|medicine|centre|center|healthcare|health|institute|city|university|college|polyclinic|infirmary|sanatorium)\b/;
const NAME_STOP = new Set(["hospital","clinic","medical","medicine","centre","center","healthcare","health","care","group","city","the","and","of","for","llc","ltd","dubai","abu","dhabi","uae","emirates","ksa","saudi","arabia","qatar","doha","riyadh","jeddah"]);
/** Does a candidate article title plausibly denote THIS hospital? Requires the
 *  title to be facility-typed AND to contain the hospital's distinctive tokens
 *  (brand words like "cleveland", "zulekha", "burjeel"), so "Naif Al-Rajhi"
 *  (a person) is rejected for "AlRajhi Hospital" while "Cleveland Clinic Abu
 *  Dhabi" is accepted for "Cleveland Clinic Abu Dhabi". */
function titleMatchesHospital(hospitalName: string, title: string): boolean {
  const t = normName(title);
  if (!FACILITY_RE.test(t)) return false;
  const h = normName(hospitalName);
  if (t.includes(h) || h.includes(t)) return true;
  const distinctive = h.split(" ").filter(w => w.length > 2 && !NAME_STOP.has(w));
  if (!distinctive.length) return false;
  const hits = distinctive.filter(w => t.includes(w)).length;
  // Need the brand tokens present: at least 2 (or all, if fewer) and ≥60%.
  return hits >= Math.min(distinctive.length, 2) && hits / distinctive.length >= 0.6;
}

/** A real hospital BUILDING photo from Wikipedia, not a scraped og:image logo.
 *  We search Wikipedia for the hospital, then accept the lead image ONLY of a
 *  candidate article whose TITLE actually denotes this hospital (see
 *  titleMatchesHospital) — iterating past higher-ranked but irrelevant hits
 *  (people/places with a similar name). Returns "" when nothing verifies, so
 *  the caller leaves the existing image untouched rather than risking a wrong
 *  or offensive photo. origin=* keeps the API CORS-happy. */
async function wikipediaImage(name: string, city: string, country: string, timeoutMs: number): Promise<string> {
  const base = (name || "").trim();
  if (!base) return "";
  const api = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", prop: "pageimages", piprop: "thumbnail",
    pithumbsize: "900", generator: "search",
    gsrsearch: [base, city, country].filter(Boolean).join(" ").trim(), gsrlimit: "8", origin: "*",
  }).toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(api, { signal: ctrl.signal, headers: { "User-Agent": "AllocationAssistBot/1.0 (+https://allocationassist.com)" } });
    if (!res.ok) return "";
    const data = await res.json();
    const pages: Array<Record<string, unknown>> = Object.values(data?.query?.pages ?? {});
    if (!pages.length) return "";
    pages.sort((a, b) => Number(a.index ?? 999) - Number(b.index ?? 999));
    for (const p of pages) {
      const title = String(p.title ?? "");
      if (!titleMatchesHospital(base, title)) continue;
      const thumb = (p.thumbnail as Record<string, unknown> | undefined)?.source;
      if (typeof thumb !== "string" || !/^https?:\/\//i.test(thumb)) continue;
      if (/[/_-]logo[._-]/i.test(thumb)) continue; // a logo is no better than what we have
      return thumb;
    }
    return "";
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
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
  // Where hero images come from: "website" = scrape og:image (fast, but often a
  // LOGO); "wikipedia" = the hospital's Wikipedia article lead image (a real
  // BUILDING photo when the hospital is notable enough to have an article).
  const imageSource = String(body.image_source ?? "website").toLowerCase() === "wikipedia" ? "wikipedia" : "website";

  // Hospitals that have a website to scrape.
  const { data: hospitals, error: hErr } = await supabase
    .from("hospitals").select("id, name, website, image_url, description, city, country");
  if (hErr) return json({ ok: false, error: `hospitals read failed: ${hErr.message}` }, 500);

  // ── list_missing_website mode: return the hospitals with no website, with
  //    city/country so an operator (or the agent) can search for their site.
  if (body.list_missing_website === true) {
    const missing = (hospitals ?? [])
      .filter(h => !normWebsite(String(h.website ?? "")))
      .map(h => ({ id: String(h.id), name: String(h.name ?? ""), city: h.city ?? null, country: h.country ?? null }));
    return json({ ok: true, mode: "list_missing_website", count: missing.length, hospitals: missing });
  }

  // ── list_images mode: return every hospital that currently has an image_url,
  //    as { id, name, image_url, city, country }. Read-only — used to review the
  //    current photo set so an operator (or the agent) can spot which images are
  //    logos / placeholders / non-photos to remove (see clear_images below).
  if (body.list_images === true) {
    const withImg = (hospitals ?? [])
      .filter(h => String(h.image_url ?? "").trim().length > 0)
      .map(h => ({
        id: String(h.id), name: String(h.name ?? ""),
        image_url: String(h.image_url), city: h.city ?? null, country: h.country ?? null,
      }));
    return json({ ok: true, mode: "list_images", count: withImg.length, hospitals: withImg });
  }

  // ── clear_images mode: NULL out image_url on specific hospitals by id — used to
  //    remove logo / placeholder / non-photo images so the WO email simply omits
  //    the hero <img> rather than showing a logo. Dry-run by default; apply:true
  //    to write. Only clears the DB column (the storage object, if any, is left
  //    as a harmless orphan). body.clear_images = [id, ...] (array of hospital ids)
  if (Array.isArray(body.clear_images)) {
    const byId = new Map((hospitals ?? []).map(h => [String(h.id), h]));
    const toClear: Array<{ id: string; name: string; from: string }> = [];
    const rejected: Array<{ id: string; reason: string }> = [];
    for (const raw of body.clear_images as unknown[]) {
      const id = String(raw ?? "");
      const h = byId.get(id);
      if (!h) { rejected.push({ id, reason: "unknown id" }); continue; }
      const cur = String(h.image_url ?? "").trim();
      if (!cur) { rejected.push({ id, reason: `already blank (${h.name})` }); continue; }
      toClear.push({ id, name: String(h.name ?? ""), from: cur });
    }
    let cleared = 0;
    const failures: Array<{ name: string; error: string }> = [];
    if (apply) {
      for (const c of toClear) {
        const { error } = await supabase.from("hospitals")
          .update({ image_url: null, updated_at: new Date().toISOString() }).eq("id", c.id);
        if (error) failures.push({ name: c.name, error: error.message });
        else cleared++;
      }
    }
    return json({
      ok: true, dry_run: !apply, mode: "clear_images",
      summary: { would_clear: toClear.length, rejected: rejected.length, ...(apply ? { cleared, failed: failures.length } : {}) },
      to_clear: toClear, rejected, ...(apply && failures.length ? { failures } : {}),
    });
  }

  // ── set_websites mode: write website onto specific hospitals by id. Used to
  //    persist websites found by external search. Dry-run by default; validates
  //    each URL through normWebsite and only fills BLANK rows unless overwrite.
  //    body.set = [{ id, website }, ...]
  if (Array.isArray(body.set)) {
    const byId = new Map((hospitals ?? []).map(h => [String(h.id), h]));
    const toSet: Array<{ id: string; name: string; to: string }> = [];
    const rejected: Array<{ id: string; website: string; reason: string }> = [];
    for (const item of body.set as Array<Record<string, unknown>>) {
      const id = String(item.id ?? "");
      const h = byId.get(id);
      if (!h) { rejected.push({ id, website: String(item.website ?? ""), reason: "unknown id" }); continue; }
      if (!overwrite && normWebsite(String(h.website ?? ""))) { rejected.push({ id, website: String(item.website ?? ""), reason: "already has website" }); continue; }
      const w = normWebsite(String(item.website ?? ""));
      if (!w) { rejected.push({ id, website: String(item.website ?? ""), reason: "invalid url" }); continue; }
      toSet.push({ id, name: String(h.name ?? ""), to: w });
    }
    let updated = 0;
    const failures: Array<{ name: string; error: string }> = [];
    if (apply) {
      for (const u of toSet) {
        const { error } = await supabase.from("hospitals")
          .update({ website: u.to, updated_at: new Date().toISOString() }).eq("id", u.id);
        if (error) failures.push({ name: u.name, error: error.message });
        else updated++;
      }
    }
    return json({
      ok: true, dry_run: !apply, mode: "set_websites",
      summary: { would_set: toSet.length, rejected: rejected.length, ...(apply ? { updated, failed: failures.length } : {}) },
      to_set: toSet, rejected, ...(apply && failures.length ? { failures } : {}),
    });
  }

  // ── set_images mode: apply curated hospital PHOTOS by name match. This is how
  //    real building photos (recovered from the delegation-doer "out" folder or
  //    supplied by hand) get onto hospitals whose scraped og:image was just a
  //    logo. Each item:
  //      { match: "name substring", image_url?, data_base64?, filename? }
  //    • data_base64 (a PNG/JPG) → uploaded to the PUBLIC email-card-images
  //      bucket under hospital-photos/, and its public URL is stored. Otherwise
  //      image_url is used verbatim (must already be a public URL).
  //    • match is case-insensitive name-contains and MUST hit exactly ONE
  //      hospital, else the item is rejected (never guess between two).
  //    Dry-run by default; only fills a BLANK image_url unless overwrite. The
  //    public URL is deterministic, so the dry run shows exactly what it will be.
  if (Array.isArray(body.set_images)) {
    const IMG_BUCKET = "email-card-images";
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "hospital";
    const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${path}`;

    const toSet: Array<{ id: string; name: string; to: string; upload?: { path: string; bytes: number; contentType: string; b64: string } }> = [];
    const rejected: Array<{ match: string; reason: string }> = [];
    for (const item of body.set_images as Array<Record<string, unknown>>) {
      const rawMatch = String(item.match ?? "");
      const match = norm(rawMatch);
      if (!match) { rejected.push({ match: rawMatch, reason: "empty match" }); continue; }
      const hits = (hospitals ?? []).filter(h => norm(String(h.name ?? "")).includes(match));
      if (hits.length === 0) { rejected.push({ match: rawMatch, reason: "no hospital matched" }); continue; }
      if (hits.length > 1) { rejected.push({ match: rawMatch, reason: `ambiguous — ${hits.length} matched: ${hits.map(h => h.name).join(", ")}` }); continue; }
      const h = hits[0];
      if (!overwrite && String(h.image_url ?? "").trim()) { rejected.push({ match: rawMatch, reason: `already has image (${h.name})` }); continue; }

      const b64 = typeof item.data_base64 === "string" ? item.data_base64.replace(/^data:[^,]+,/, "") : "";
      if (b64) {
        const filename = String(item.filename ?? "photo.png");
        const ext = (filename.split(".").pop() || "png").toLowerCase();
        const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
        const path = `hospital-photos/${slug(String(h.name ?? "hospital"))}-${crypto.randomUUID().slice(0, 8)}.${ext === "jpeg" ? "jpg" : ext}`;
        let bytes = 0;
        try { bytes = atob(b64).length; } catch { rejected.push({ match: rawMatch, reason: "invalid base64" }); continue; }
        toSet.push({ id: String(h.id), name: String(h.name ?? ""), to: publicUrl(path), upload: { path, bytes, contentType, b64 } });
      } else {
        const url = String(item.image_url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) { rejected.push({ match: rawMatch, reason: "no data_base64 and image_url is not a public http(s) URL" }); continue; }
        toSet.push({ id: String(h.id), name: String(h.name ?? ""), to: url });
      }
    }

    let updated = 0;
    const failures: Array<{ name: string; error: string }> = [];
    if (apply) {
      for (const u of toSet) {
        if (u.upload) {
          const raw = atob(u.upload.b64);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          const { error: upErr } = await supabase.storage.from(IMG_BUCKET)
            .upload(u.upload.path, arr, { contentType: u.upload.contentType, upsert: true });
          if (upErr) { failures.push({ name: u.name, error: `upload: ${upErr.message}` }); continue; }
        }
        const { error } = await supabase.from("hospitals")
          .update({ image_url: u.to, updated_at: new Date().toISOString() }).eq("id", u.id);
        if (error) failures.push({ name: u.name, error: error.message });
        else updated++;
      }
    }
    return json({
      ok: true, dry_run: !apply, mode: "set_images",
      summary: { would_set: toSet.length, rejected: rejected.length, ...(apply ? { updated, failed: failures.length } : {}) },
      to_set: toSet.map(u => ({ id: u.id, name: u.name, image_url: u.to, ...(u.upload ? { uploads: `${(u.upload.bytes / 1024).toFixed(0)}KB → ${u.upload.path}` } : {}) })),
      rejected, ...(apply && failures.length ? { failures } : {}),
    });
  }

  // ── fix_encoded mode: repair descriptions that carry a leaked HTML entity
  //    (e.g. "King&#x27;s") by re-decoding IN PLACE. No website fetch, and it
  //    only touches rows whose stored description actually changes when decoded
  //    — so manually-curated blurbs without entities are left untouched. This
  //    corrects rows written before decodeEntities handled hex/numeric refs.
  if (body.fix_encoded === true) {
    const fixes: Array<{ id: string; name: string; from: string; to: string }> = [];
    for (const h of hospitals ?? []) {
      const cur = String(h.description ?? "");
      if (!cur.includes("&#") && !/&(amp|quot|apos|lt|gt|nbsp);/i.test(cur)) continue;
      const decoded = decodeEntities(cur).replace(/\s+/g, " ").trim();
      if (decoded && decoded !== cur) fixes.push({ id: String(h.id), name: String(h.name ?? ""), from: cur, to: decoded });
    }
    let fixed = 0;
    const failures: Array<{ name: string; error: string }> = [];
    if (apply) {
      for (const f of fixes) {
        const { error } = await supabase.from("hospitals")
          .update({ description: f.to, updated_at: new Date().toISOString() }).eq("id", f.id);
        if (error) failures.push({ name: f.name, error: error.message });
        else fixed++;
      }
    }
    return json({
      ok: true, dry_run: !apply, mode: "fix_encoded",
      summary: { would_fix: fixes.length, ...(apply ? { fixed, failed: failures.length } : {}) },
      fixes, ...(apply && failures.length ? { failures } : {}),
    });
  }

  const hasImg  = (h: Record<string, unknown>) => String(h.image_url ?? "").trim().length > 0;
  const hasDesc = (h: Record<string, unknown>) => String(h.description ?? "").trim().length > 0;
  // Fillable = requested AND (blank or overwrite). Image via Wikipedia needs no
  // website; image via website scrape and ALL description work need a website.
  const wantImg  = (h: Record<string, unknown>) => doImage && (overwrite || !hasImg(h));
  const wantDesc = (h: Record<string, unknown>) => doDesc  && (overwrite || !hasDesc(h));

  // Candidates: at least one requested field is actually obtainable for this
  // hospital, optionally restricted to `only` ids. In wikipedia mode an image
  // is obtainable without a website; description always needs one.
  const candidates = (hospitals ?? []).filter((h) => {
    if (only && !only.includes(String(h.id))) return false;
    const hasWeb = !!normWebsite(String(h.website ?? ""));
    const canImg  = wantImg(h)  && (imageSource === "wikipedia" || hasWeb);
    const canDesc = wantDesc(h) && hasWeb;
    return canImg || canDesc;
  });

  const toUpdate: Array<{
    id: string; name: string; website: string;
    image?: { from: string | null; to: string };
    description?: { from: string | null; to: string };
  }> = [];
  const nothingFound: Array<{ name: string; website: string }> = [];
  const skippedNoWebsite = imageSource === "website"
    ? (hospitals ?? []).filter(h => !normWebsite(String(h.website ?? ""))).length
    : 0;

  let fetched = 0;
  for (const h of candidates) {
    if (fetched >= limit) break;
    fetched++;
    const website = normWebsite(String(h.website ?? ""));
    // Only fetch the website when we actually need it: for descriptions, or for
    // image scraping in "website" mode. Wikipedia-only image runs skip it.
    const needHtml = (wantDesc(h) && !!website) || (imageSource === "website" && wantImg(h) && !!website);
    let html = "", finalUrl = website;
    if (needHtml) { const r = await fetchHtml(website, 8000); html = r.html; finalUrl = r.finalUrl; }

    const patch: { image?: { from: string | null; to: string }; description?: { from: string | null; to: string } } = {};

    if (wantImg(h)) {
      const image = imageSource === "wikipedia"
        ? await wikipediaImage(String(h.name ?? ""), String(h.city ?? ""), String(h.country ?? ""), 8000)
        : (html ? extractImage(html, finalUrl) : "");
      const cur = String(h.image_url ?? "").trim();
      if (image && image !== cur) patch.image = { from: cur || null, to: image };
    }
    if (wantDesc(h) && html) {
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
